export interface Commit {
  hash: string;
  author: string;
  date: string;
  message: string;
  category: string;
  scope: string;
  isBreaking: boolean;
}

// 2. Local regex-based enricher as fallback for GitHub imports
export function fallbackEnrichCommits(commits: any[]): Commit[] {
  return commits.map((item, i) => {
    const rawMsg = item.message || '';
    let category = 'chore';
    let scope = '';
    let isBreaking = false;

    // Check breaking change status
    if (rawMsg.includes('BREAKING CHANGE') || rawMsg.includes('!') || rawMsg.toLowerCase().includes('breaking')) {
      isBreaking = true;
    }

    // Try conventional commits scope extract: e.g. "feat(auth): add google signin"
    const conventionalMatch = rawMsg.match(/^([a-zA-Z0-9_-]+)\(([^)]+)\):/);
    if (conventionalMatch) {
      const type = conventionalMatch[1].toLowerCase();
      scope = conventionalMatch[2];
      
      if (['feat', 'feature'].includes(type)) category = 'feat';
      else if (['fix', 'bug', 'patch'].includes(type)) category = 'fix';
      else if (['docs', 'document', 'readme'].includes(type)) category = 'docs';
      else if (['refactor', 'clean'].includes(type)) category = 'refactor';
      else if (['perf', 'optimize', 'performance'].includes(type)) category = 'perf';
      else if (['test', 'spec'].includes(type)) category = 'test';
      else if (['chore', 'build', 'ci', 'deps'].includes(type)) category = 'chore';
    } else {
      // General regex search
      const lowercaseMsg = rawMsg.toLowerCase();
      if (/^(feat|add|implement|new|create|introduce)/i.test(lowercaseMsg)) {
        category = 'feat';
      } else if (/^(fix|bug|crash|error|resolve|patch|prevent|handle)/i.test(lowercaseMsg)) {
        category = 'fix';
      } else if (/^(docs|readme|comment|document)/i.test(lowercaseMsg)) {
        category = 'docs';
      } else if (/^(refactor|clean|rewrite|restructure)/i.test(lowercaseMsg)) {
        category = 'refactor';
      } else if (/^(perf|performance|optimize|speed|fast)/i.test(lowercaseMsg)) {
        category = 'perf';
      } else if (/^(test|spec|jest|cypress|unit|e2e)/i.test(lowercaseMsg)) {
        category = 'test';
      } else {
        category = 'chore';
      }

      // Try extract any standard prefix: e.g. "feat: add google signin"
      const prefixMatch = rawMsg.match(/^([a-zA-Z0-9_-]+):/);
      if (prefixMatch) {
        const type = prefixMatch[1].toLowerCase();
        if (['feat', 'feature'].includes(type)) category = 'feat';
        else if (['fix', 'bug'].includes(type)) category = 'fix';
        else if (['docs', 'readme'].includes(type)) category = 'docs';
        else if (['refactor'].includes(type)) category = 'refactor';
        else if (['perf'].includes(type)) category = 'perf';
        else if (['test'].includes(type)) category = 'test';
      }
    }

    return {
      hash: item.hash || `fallback-${i}`,
      author: item.author || 'Author',
      date: item.date || new Date().toISOString().split('T')[0],
      message: rawMsg,
      category,
      scope,
      isBreaking
    };
  });
}

// 3. Beautiful Local HTML Release Notes generator
export function fallbackGenerateReleaseNotes(commits: Commit[], options: any, metadata: any): string {
  const projName = metadata.projectName || 'My Project';
  const version = metadata.version || 'v1.0.0';
  const relDate = metadata.releaseDate || new Date().toISOString().split('T')[0];
  const goals = metadata.milestoneGoals || 'General stability and polish.';
  const notes = metadata.customNotes || '';

  const feats = commits.filter(c => c.category === 'feat');
  const fixes = commits.filter(c => c.category === 'fix');
  const breakings = commits.filter(c => c.isBreaking);
  const perfs = commits.filter(c => c.category === 'perf');
  const rest = commits.filter(c => !['feat', 'fix', 'perf'].includes(c.category));

  let html = `<div style="font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; color: #333;">`;
  html += `<h1 style="border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">📦 Release Notes: ${projName} - ${version}</h1>`;
  html += `<p><strong>Release Date:</strong> ${relDate}<br/>`;
  html += `<strong>Target Audience:</strong> <code>${options.audience || 'General Users'}</code><br/>`;
  html += `<strong>Tone Style:</strong> <code>${options.tone || 'Friendly & Professional'}</code></p>`;
  
  html += `<div style="background-color: #fffbeb; color: #b45309; padding: 12px; border-radius: 6px; margin: 16px 0; border: 1px solid #fde68a;">`;
  html += `<strong>💡 System Notice:</strong> Our primary AI services are experiencing very high traffic right now. To prevent any disruption to your workflow, we have generated these notes using our robust local parsing and templates engine!`;
  html += `</div>`;

  html += `<h2>🎯 Release Goals & Overview</h2>`;
  html += `<p>${goals}</p>`;
  if (notes) {
    html += `<h3>💡 Extra Notes & Context</h3>`;
    html += `<p>${notes}</p>`;
  }

  if (breakings.length > 0) {
    html += `<h2 style="color: #dc2626;">⚠️ CRITICAL: Breaking Changes</h2>`;
    html += `<div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 16px 0;">`;
    html += `<p><strong>WARNING:</strong> This release contains breaking architectural upgrades. Review these carefully before installing:</p>`;
    html += `<ul>`;
    breakings.forEach(c => {
      html += `<li><strong>[${c.scope || 'core'}]</strong>: ${c.message} (<code>${c.hash}</code>)</li>`;
    });
    html += `</ul></div>`;
  }

  if (feats.length > 0) {
    html += `<h2 style="color: #059669;">🚀 New Features & Enhancements</h2><ul>`;
    feats.forEach(c => {
      const displayMsg = c.message.replace(/^feat(\([^)]+\))?:\s*/i, '');
      html += `<li><strong>[${c.scope || 'UI'}]</strong>: ${displayMsg} <span style="color: #6b7280; font-size: 0.9em;">(by ${c.author} on ${c.date})</span></li>`;
    });
    html += `</ul>`;
  }

  if (fixes.length > 0) {
    html += `<h2 style="color: #2563eb;">🐛 Bug Fixes & Stability</h2><ul>`;
    fixes.forEach(c => {
      const displayMsg = c.message.replace(/^fix(\([^)]+\))?:\s*/i, '');
      html += `<li><strong>[${c.scope || 'stability'}]</strong>: ${displayMsg} <span style="color: #6b7280; font-size: 0.9em;">(by ${c.author} on ${c.date})</span></li>`;
    });
    html += `</ul>`;
  }

  if (perfs.length > 0) {
    html += `<h2 style="color: #d97706;">⚡ Performance Improvements</h2><ul>`;
    perfs.forEach(c => {
      const displayMsg = c.message.replace(/^perf(\([^)]+\))?:\s*/i, '');
      html += `<li><strong>[${c.scope || 'performance'}]</strong>: ${displayMsg}</li>`;
    });
    html += `</ul>`;
  }

  if (rest.length > 0) {
    html += `<h2 style="color: #6b7280;">🛠️ Refactorings, Tests & Maintenance</h2><ul>`;
    rest.forEach(c => {
      html += `<li><strong>[${c.category}]</strong> ${c.scope ? `[${c.scope}] ` : ''}${c.message} (<code>${c.hash}</code>)</li>`;
    });
    html += `</ul>`;
  }

  html += `<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />`;
  html += `<h3>📊 Release Statistics</h3><ul>`;
  html += `<li><strong>Total Commits Parsed:</strong> ${commits.length}</li>`;
  html += `<li><strong>New Features:</strong> ${feats.length}</li>`;
  html += `<li><strong>Bugs Exterminated:</strong> ${fixes.length}</li>`;
  html += `<li><strong>Breaking Updates:</strong> ${breakings.length}</li></ul>`;
  html += `<p style="text-align: center; font-style: italic; color: #6b7280;">Thank you to all contributors who pushed changes for this iteration! 💖</p>`;
  html += `</div>`;

  return html;
}
