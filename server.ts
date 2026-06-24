import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { fallbackEnrichCommits, fallbackGenerateReleaseNotes } from './server-fallbacks';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Helper to get or throw Gemini SDK client
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set. Please set it in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// 2. Endpoint to parse raw pasted Git logs into structured objects
app.post('/api/parse-commits', async (req, res) => {
  const { rawLog } = req.body;
  if (!rawLog || typeof rawLog !== 'string' || !rawLog.trim()) {
    return res.status(400).json({ error: 'Raw log text is required' });
  }

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          text: `Parse the following raw Git log (or list of changes/commits) into a structured JSON array of commits. 
Identify the author, date, and hash if available. Extract the core commit message, categorize the changes (feat, fix, docs, refactor, perf, test, chore), determine the scope (like ui, core, config, auth, db) if possible, and check if it represents a breaking change.
If you cannot find a hash or author, generate realistic placeholders or leave them blank.

Raw Git Log:
"""
${rawLog}
"""`
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              hash: { type: Type.STRING },
              author: { type: Type.STRING },
              date: { type: Type.STRING },
              message: { type: Type.STRING },
              category: { type: Type.STRING },
              scope: { type: Type.STRING },
              isBreaking: { type: Type.BOOLEAN }
            },
            required: ['hash', 'author', 'date', 'message', 'category', 'isBreaking']
          }
        }
      }
    });

    const text = response.text || '[]';
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.warn('AI parse raw commits busy. Falling back to rule-based parser.');
    try {
      const lines = rawLog.split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
      const mockMapped = lines.map((line: string, idx: number) => {
        let hash = `raw-${idx}`;
        let message = line;
        const hashMatch = line.match(/^([a-f0-9]{7,40})\s+(.*)/i);
        if (hashMatch) {
          hash = hashMatch[1].substring(0, 7);
          message = hashMatch[2];
        }
        return {
          hash,
          author: 'Developer',
          date: new Date().toISOString().split('T')[0],
          message
        };
      });
      const fallbackResult = fallbackEnrichCommits(mockMapped);
      res.json(fallbackResult);
    } catch (fallbackError: any) {
      res.status(500).json({ error: 'Failed to parse raw commits and local parser also failed.' });
    }
  }
});

// 2b. Endpoint to fetch real GitHub commits and use AI to categorize and structure them
app.post('/api/fetch-github-commits', async (req, res) => {
  try {
    const { repoPath, githubToken } = req.body; // e.g., "facebook/react" or "google/zx"
    if (!repoPath || typeof repoPath !== 'string' || !repoPath.trim()) {
      return res.status(400).json({ error: 'GitHub repository path (owner/repo) is required' });
    }

    // Clean up repo input if a full URL was pasted
    let cleanRepo = repoPath.trim()
      .replace(/^https?:\/\/github\.com\//i, '')
      .replace(/\/$/, '');

    const parts = cleanRepo.split('/');
    if (parts.length < 2) {
      return res.status(400).json({ error: 'Please specify repo in "owner/repo" format (e.g., "facebook/react")' });
    }

    const owner = parts[0];
    const repo = parts[1];

    const githubUrl = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=15`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'AI-Release-Notes-Agent-Applet'
    };

    if (githubToken && typeof githubToken === 'string' && githubToken.trim()) {
      headers['Authorization'] = `token ${githubToken.trim()}`;
    }

    const githubRes = await fetch(githubUrl, { headers });

    if (!githubRes.ok) {
      const rateLimitLeft = githubRes.headers.get('x-ratelimit-remaining');
      if (githubRes.status === 403 || githubRes.status === 429) {
        throw new Error('GitHub API rate limit exceeded or access denied. Please supply a GitHub Personal Access Token or try again later.');
      }
      if (githubRes.status === 404) {
        throw new Error(`GitHub repository "${owner}/${repo}" was not found, or requires authentication/pasted Access Token if it is private.`);
      }
      throw new Error(`GitHub API error: ${githubRes.statusText} (${githubRes.status})`);
    }

    const rawCommits: any = await githubRes.json();
    if (!Array.isArray(rawCommits)) {
      throw new Error('Unexpected response format from GitHub API');
    }

    if (rawCommits.length === 0) {
      return res.json({ commits: [], metadata: {} });
    }

    // Map GitHub commits to temporary simpler structures to feed Gemini
    const mappedForAi = rawCommits.map((item: any) => ({
      hash: item.sha ? item.sha.substring(0, 7) : '',
      author: item.commit?.author?.name || 'unknown',
      date: item.commit?.author?.date ? item.commit.author.date.split('T')[0] : '',
      message: item.commit?.message || ''
    }));

    // Fetch latest release and tags to auto-discover version, date, and other details
    let latestReleaseInfo: any = null;
    try {
      const releaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
      const releaseRes = await fetch(releaseUrl, { headers });
      if (releaseRes.ok) {
        const releaseData: any = await releaseRes.json();
        latestReleaseInfo = {
          version: releaseData.tag_name || releaseData.name || '',
          releaseDate: releaseData.published_at ? releaseData.published_at.split('T')[0] : '',
          description: releaseData.body || '',
          name: releaseData.name || ''
        };
      } else {
        // Fallback to tags if no official release found
        const tagsUrl = `https://api.github.com/repos/${owner}/${repo}/tags?per_page=1`;
        const tagsRes = await fetch(tagsUrl, { headers });
        if (tagsRes.ok) {
          const tagsData: any = await tagsRes.json();
          if (Array.isArray(tagsData) && tagsData.length > 0) {
            latestReleaseInfo = {
              version: tagsData[0].name || '',
              releaseDate: '',
              description: '',
              name: tagsData[0].name || ''
            };
          }
        }
      }
    } catch (err) {
      console.log('Could not fetch releases/tags from GitHub:', err);
    }

    const latestCommitDate = mappedForAi.length > 0 ? mappedForAi[0].date : '';
    const repoNamePart = repo.replace(/-/g, ' ');
    const capitalizedProjectName = repoNamePart.charAt(0).toUpperCase() + repoNamePart.slice(1);

    const metadataPayload = {
      projectName: capitalizedProjectName,
      latestVersion: latestReleaseInfo?.version || '',
      releaseDate: latestReleaseInfo?.releaseDate || latestCommitDate || new Date().toISOString().split('T')[0],
      milestoneGoals: latestReleaseInfo?.name ? `Incorporate updates from ${latestReleaseInfo.name}` : 'General enhancements & stability improvements',
      customNotes: latestReleaseInfo?.description ? `Based on GitHub release logs:\n${latestReleaseInfo.description.substring(0, 300)}...` : ''
    };

    // Use Gemini to categorize these commits
    let enrichedCommits: any[] = [];
    try {
      const ai = getGeminiClient();
      const prompt = `You are a professional software release coordinator. Analyze the following 15 commits fetched from the repository "${owner}/${repo}".
Your job is to categorize each of them into one of: "feat", "fix", "docs", "refactor", "perf", "test", or "chore", extract the semantic scope (e.g. auth, build, UI, core, etc.) from the message, and check if it represents a breaking change.
Keep the original commit messages, hashes, authors, and dates perfectly mapped.

Commits List:
${JSON.stringify(mappedForAi, null, 2)}

Return the output as a valid structured JSON array.`;

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                hash: { type: Type.STRING },
                author: { type: Type.STRING },
                date: { type: Type.STRING },
                message: { type: Type.STRING },
                category: { type: Type.STRING, description: 'Must be one of: feat, fix, docs, refactor, perf, test, chore' },
                scope: { type: Type.STRING, description: 'Short scope of change, or empty string' },
                isBreaking: { type: Type.BOOLEAN, description: 'True if message indicates a breaking change, major rewrite, or API removal' }
              },
              required: ['hash', 'author', 'date', 'message', 'category', 'isBreaking']
            }
          }
        }
      });

      const enrichedText = aiResponse.text || '[]';
      enrichedCommits = JSON.parse(enrichedText);
    } catch (geminiError: any) {
      console.warn('AI categorization busy for GitHub commits. Falling back to local rule-based parsing.');
      enrichedCommits = fallbackEnrichCommits(mappedForAi);
    }
    
    // Return structured payload containing both commits and fetched metadata
    res.json({
      commits: enrichedCommits,
      metadata: metadataPayload
    });

  } catch (error: any) {
    console.error('Error fetching or enriching GitHub commits:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch GitHub commits' });
  }
});

// 3. Endpoint to generate a fully customized release notes draft
app.post('/api/generate-release-notes', async (req, res) => {
  const { commits, options, metadata } = req.body;
  try {
    const ai = getGeminiClient();

    const formattedCommits = commits.map((c: any) => 
      `- [${c.category}]${c.scope ? `(${c.scope})` : ''}: ${c.message} ${c.isBreaking ? '(BREAKING CHANGE)' : ''} (by ${c.author || 'unknown'} on ${c.date || 'unknown'} - ${c.hash || 'no-hash'})`
    ).join('\n');

    const prompt = `You are a professional frontend web developer and product manager. 
Draft polished release notes based on the following project metadata, target configuration, and Git commits.

### Project & Release Metadata
- Project Name: ${metadata.projectName || 'My Project'}
- Release Version: ${metadata.version || 'v1.0.0'}
- Release Date: ${metadata.releaseDate || 'June 24, 2026'}
- Milestone Goals: ${metadata.milestoneGoals || 'General improvements and stability'}
- Custom Focus/Notes: ${metadata.customNotes || 'None'}

### Configuration Options
- Target Audience: ${options.audience || 'General public / End Users'} (Tailor technical detail level to this audience)
- Tone: ${options.tone || 'Professional and informative'} (E.g., exciting, tech-centric, warm, casual, executive-concise)
- Included Sections: ${options.sections ? options.sections.join(', ') : 'All applicable sections'}
- Output Format: ${options.format || 'Website (HTML)'}

### Commits to process:
${formattedCommits}

### Output Instructions:
1. Provide a beautiful title and an engaging, high-level executive summary / introduction of what this release represents.
2. Group the changes logically into sections based on the selected tone/audience. E.g., Features (🚀 New Features), Fixes (🐛 Bug Fixes), Breaking Changes (⚠️ Breaking Changes), performance improvements, or contributor spotlights.
3. If there are breaking changes, call them out clearly with an warnings block.
4. Translate commit messages from dry, raw phrases into readable, user-friendly, descriptive bullet points. Avoid repeating hashes or author names inside bullet points unless it's a "Contributor Spotlight" section.
5. End with a summary of stats (total commits, breaking changes, developer efforts, etc.) or a small encouraging word.
6. Provide output in a fully styled, standalone HTML format only. Include inline CSS styling (or Tailwind via CDN) to make it look like a beautiful, standalone website. Do not output Markdown.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are a senior product manager and frontend web developer. You excel at turning technical commits into highly readable, beautiful, standalone HTML website release notes.",
      }
    });

    // Make sure we strip any markdown wrappers around HTML code blocks if present
    let text = response.text || '';
    if (text.startsWith('\`\`\`html')) text = text.replace(/^\`\`\`html/, '');
    if (text.startsWith('\`\`\`')) text = text.replace(/^\`\`\`/, '');
    text = text.replace(/\`\`\`$/, '');

    res.json({ markdown: text });
  } catch (error: any) {
    console.warn('AI generate release notes busy. Falling back to local template generator.');
    try {
      const fallbackMarkdown = fallbackGenerateReleaseNotes(commits, options, metadata);
      res.json({ markdown: fallbackMarkdown });
    } catch (fallbackError: any) {
      res.status(500).json({ error: 'Failed to generate release notes and fallback also failed.' });
    }
  }
});

// 4. Endpoint to refine release notes using direct chat instruction (Agent Workspace)
app.post('/api/chat-refine', async (req, res) => {
  const { currentReleaseNotes, chatMessage, commits, chatHistory = [] } = req.body;
  try {
    const ai = getGeminiClient();

    const formattedCommits = commits && Array.isArray(commits) 
      ? commits.map((c: any) => `- [${c.category}]: ${c.message} ${c.isBreaking ? '(BREAKING)' : ''}`).join('\n')
      : '';

    // Prepare message history formatted for Gemini
    const systemPrompt = `You are an AI Release Notes Assistant. Your job is to modify, refine, or supplement the provided Release Notes HTML website code based on the user's specific instructions.
Maintain the overall structure and styling, but edit the content exactly as requested (e.g. translate, add details, format sections, add sections, make it shorter/longer, or spotlight contributors).
Return your response in JSON format containing two properties:
- "updatedMarkdown": The full, modified HTML release notes code (we keep the property name as 'updatedMarkdown' for legacy reasons, but it must be HTML).
- "agentCommentary": A short, friendly, concise message explaining what you did.

Always reference the original commits if needed:
${formattedCommits}`;

    const promptText = `Here is the current release notes HTML:
"""
${currentReleaseNotes}
"""

The user wants you to perform this task/edit:
"${chatMessage}"

Please update the release notes accordingly and output the valid JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: promptText,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            updatedMarkdown: { type: Type.STRING, description: 'The modified and updated markdown text of the release notes' },
            agentCommentary: { type: Type.STRING, description: 'A short explanation of what modifications were done' }
          },
          required: ['updatedMarkdown', 'agentCommentary']
        }
      }
    });

    const text = response.text || '{}';
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.warn('AI refine chat busy. Falling back gracefully.');
    res.json({
      updatedMarkdown: currentReleaseNotes + `\n\n_Refinement request: "${chatMessage}" (Unable to process in real-time due to high AI service demand)_`,
      agentCommentary: `⚠️ The AI model is currently experiencing very high demand. I've preserved your current draft. Please wait a moment and try your instruction again!`
    });
  }
});

// 5. Connect Vite middleware in development or serve static in production
const startServer = async () => {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
};

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
