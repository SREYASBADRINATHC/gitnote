import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { 
  Sparkles, 
  GitBranch, 
  FileText, 
  Check, 
  Trash2, 
  Plus, 
  RefreshCw, 
  Download, 
  Copy, 
  Send, 
  Sliders, 
  Users, 
  AlertTriangle, 
  Code, 
  Eye, 
  BookOpen, 
  Heart, 
  Terminal, 
  Calendar, 
  Zap,
  Info,
  Layers,
  ArrowRight,
  MessageSquare,
  Sparkle,
  Github,
  Cloud,
  History,
  LogOut,
  User as UserIcon,
  Key,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Settings,
  Search,
  List
} from 'lucide-react';
import { Commit, ReleaseMetadata, ReleaseOptions, ChatMessage } from './types';
import {
  auth,
  db,
  githubProvider,
  GithubAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
  browserPopupRedirectResolver,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  orderBy
} from './firebase';
import type { User } from './firebase';

export default function App() {
  // App core states
  const [commits, setCommits] = useState<Commit[]>([]);
  const [metadata, setMetadata] = useState<ReleaseMetadata>({
    projectName: '',
    version: '',
    releaseDate: new Date().toISOString().split('T')[0],
    milestoneGoals: '',
    customNotes: ''
  });
  const [options, setOptions] = useState<ReleaseOptions>({
    audience: 'General Customers & Support Teams',
    tone: 'Warm, professional, and exciting',
    language: 'English',
    sections: ['feat', 'fix', 'perf', 'docs', 'breaking'],
    format: 'HTML'
  });

  // UI state
  const [rawGitLog, setRawGitLog] = useState<string>('');
  const [githubRepoInput, setGithubRepoInput] = useState<string>('');
  const [generatedNotes, setGeneratedNotes] = useState<string>('');
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isFetchingGithub, setIsFetchingGithub] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Single commit manual input states
  const [newCommitMsg, setNewCommitMsg] = useState('');
  const [newCommitCategory, setNewCommitCategory] = useState<'feat'|'fix'|'docs'|'refactor'|'perf'|'test'|'chore'>('feat');
  const [newCommitScope, setNewCommitScope] = useState('');
  const [newCommitIsBreaking, setNewCommitIsBreaking] = useState(false);
  const [newCommitAuthor, setNewCommitAuthor] = useState('');

  // AI Chat Refinement states
  const [chatMessage, setChatMessage] = useState<string>('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: 'initial',
      role: 'assistant',
      content: 'Hi! I am your AI Release Notes Assistant. Connect a repository, paste raw git logs, or manually add changes to get started! Once commits are loaded, click **Generate Release Notes** to draft your release notes.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [isChatting, setIsChatting] = useState<boolean>(false);

  // Firebase Auth & Cloud States
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isMetadataExpanded, setIsMetadataExpanded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'github' | 'paste' | 'simulate'>('github');
  const [isTokenHelpOpen, setIsTokenHelpOpen] = useState<boolean>(false);
  const [user, setUser] = useState<any | null>(null);
  const [githubToken, setGithubToken] = useState<string | null>(null);
  const [savedReleases, setSavedReleases] = useState<any[]>([]);
  const [isSavingToCloud, setIsSavingToCloud] = useState<boolean>(false);
  const [isFetchingSaved, setIsFetchingSaved] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [activeMainTab, setActiveMainTab] = useState<'intro' | 'setup' | 'commits' | 'changelog'>('intro');

  // Listen for Auth changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Fetch user's saved release history from Firestore
        fetchSavedReleases(currentUser.uid);
      } else {
        // Only reset if we aren't currently using a simulated guest user
        setUser((prevUser: any) => {
          if (prevUser?.uid === 'local-guest') return prevUser;
          setSavedReleases([]);
          return null;
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch from Firestore or LocalStorage
  const fetchSavedReleases = async (userId: string) => {
    setIsFetchingSaved(true);
    try {
      if (userId === 'local-guest') {
        const stored = localStorage.getItem('local_releases');
        const docs = stored ? JSON.parse(stored) : [];
        setSavedReleases(docs);
        return;
      }
      const q = query(
        collection(db, 'releases'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const docs: any[] = [];
      querySnapshot.forEach((docSnapshot) => {
        docs.push({
          id: docSnapshot.id,
          ...docSnapshot.data()
        });
      });
      setSavedReleases(docs);
    } catch (err: any) {
      console.error("Error fetching saved releases:", err);
    } finally {
      setIsFetchingSaved(false);
    }
  };

  // Sign In with GitHub using Firebase popup
  const handleGithubSignIn = async () => {
    if (isSigningIn) return;
    setErrorMessage(null);
    setIsSigningIn(true);
    try {
      const result = await signInWithPopup(auth, githubProvider, browserPopupRedirectResolver);
      // Access the GitHub OAuth credential to get the token
      const credential = GithubAuthProvider.credentialFromResult(result);
      if (credential) {
        const token = credential.accessToken;
        if (token) {
          setGithubToken(token);
        }
      }
      
      const loggedUser = result.user;
      setUser(loggedUser);
      setIsProfileOpen(false);
      setChatHistory(prev => [
        ...prev,
        {
          id: `auth-${Date.now()}`,
          role: 'assistant',
          content: `👋 **Welcome, ${loggedUser.displayName || 'Developer'}!** You have successfully authenticated via GitHub. 
          
I have integrated your personal GitHub session token into the workspace. You can now fetch and structure commits from both public and private repositories!`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err: any) {
      console.warn("GitHub Auth uncompleted:", err.code);
      if (err.code === 'auth/cancelled-popup-request') {
        // User closed the popup, ignore gracefully
        setErrorMessage(null);
      } else if (err.code === 'auth/operation-not-allowed') {
        setErrorMessage(`GitHub Auth is not enabled in your Firebase project. Please go to your Firebase Console -> Authentication -> Sign-in method -> Add new provider -> GitHub to enable it. Alternatively, use Anonymous Sign In.`);
      } else {
        // Suggest signing in anonymously or entering token manually
        setErrorMessage(`GitHub Auth failed: ${err.message}. If popups are blocked inside the preview iframe, you can sign in with the Anonymous option below and paste your Personal Access Token directly.`);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // Sign In Anonymously with elegant local fallback on restrictions
  const handleAnonymousSignIn = async () => {
    if (isSigningIn) return;
    setErrorMessage(null);
    setIsSigningIn(true);
    try {
      const result = await signInAnonymously(auth);
      const loggedUser = result.user;
      setUser(loggedUser);
      setIsProfileOpen(false);
      setChatHistory(prev => [
        ...prev,
        {
          id: `auth-anon-${Date.now()}`,
          role: 'assistant',
          content: `🔑 **Signed in anonymously!** Your workspace has been initialized. You can now save your project release notes drafts and configurations securely to the Firebase Cloud database.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err: any) {
      console.warn("Firebase Anonymous Sign In is restricted. Falling back to Local Guest Session:", err);
      const mockUser = {
        uid: 'local-guest',
        displayName: 'Local Developer',
        email: 'local-workspace@storage.internal',
        isAnonymous: true,
        photoURL: null,
        isLocalGuest: true
      };
      setUser(mockUser);
      setIsProfileOpen(false);
      fetchSavedReleases('local-guest');
      setChatHistory(prev => [
        ...prev,
        {
          id: `auth-anon-fallback-${Date.now()}`,
          role: 'assistant',
          content: `🔑 **Local Guest Mode activated!** 

Anonymous Sign-in is restricted in this environment. No problem! I've automatically launched a seamless **Local Guest Session** for you. All your release notes drafts, configs, and timeline history will be stored safely in your browser's **Local Storage**!`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsSigningIn(false);
    }
  };

  // Sign Out
  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn("Sign out from Firebase failed/ignored:", err);
    } finally {
      setUser(null);
      setGithubToken(null);
      setSavedReleases([]);
      setChatHistory(prev => [
        ...prev,
        {
          id: `logout-${Date.now()}`,
          role: 'assistant',
          content: `🔒 **Signed out.** Your session has been safely closed. Note history and GitHub tokens have been cleared from memory.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  };

  // Save current Release Draft to Firestore or LocalStorage
  const handleSaveReleaseToCloud = async () => {
    if (!user) {
      setErrorMessage("Please sign in first to save your release history to the cloud.");
      return;
    }
    if (!generatedNotes) {
      setErrorMessage("There are no release notes to save. Please generate draft notes first.");
      return;
    }
    setIsSavingToCloud(true);
    setErrorMessage(null);
    try {
      const releaseData = {
        projectName: metadata.projectName,
        version: metadata.version,
        releaseDate: metadata.releaseDate,
        milestoneGoals: metadata.milestoneGoals,
        customNotes: metadata.customNotes,
        markdown: generatedNotes,
        commitsCount: commits.filter(c => c.selected).length,
        createdAt: new Date().toISOString()
      };

      if (user.uid === 'local-guest') {
        const stored = localStorage.getItem('local_releases');
        const list = stored ? JSON.parse(stored) : [];
        const newDoc = {
          id: `local-${Date.now()}`,
          userId: 'local-guest',
          ...releaseData
        };
        const newList = [newDoc, ...list];
        localStorage.setItem('local_releases', JSON.stringify(newList));
        setSavedReleases(newList);
      } else {
        await addDoc(collection(db, 'releases'), {
          userId: user.uid,
          ...releaseData
        });
        // Refresh list
        await fetchSavedReleases(user.uid);
      }

      setChatHistory(prev => [
        ...prev,
        {
          id: `save-${Date.now()}`,
          role: 'assistant',
          content: `💾 **Successfully saved version ${metadata.version}** of "**${metadata.projectName}**" to ${user.uid === 'local-guest' ? 'Local Storage' : 'Firestore Cloud'}! It is now stored securely in your release history vault.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err: any) {
      setErrorMessage(`Failed to save: ${err.message}`);
    } finally {
      setIsSavingToCloud(false);
    }
  };

  // Delete release from Firestore or LocalStorage
  const handleDeleteRelease = async (releaseId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent loading the deleted item
    setErrorMessage(null);
    try {
      if (user && user.uid === 'local-guest') {
        const stored = localStorage.getItem('local_releases');
        const list = stored ? JSON.parse(stored) : [];
        const newList = list.filter((r: any) => r.id !== releaseId);
        localStorage.setItem('local_releases', JSON.stringify(newList));
        setSavedReleases(newList);
      } else {
        await deleteDoc(doc(db, 'releases', releaseId));
        if (user) {
          await fetchSavedReleases(user.uid);
        }
      }
    } catch (err: any) {
      setErrorMessage(`Failed to delete release draft: ${err.message}`);
    }
  };

  // Load a saved release draft from Firestore back into the active workspace
  const handleLoadSavedRelease = (release: any) => {
    setMetadata({
      projectName: release.projectName || '',
      version: release.version || '',
      releaseDate: release.releaseDate || '',
      milestoneGoals: release.milestoneGoals || '',
      customNotes: release.customNotes || ''
    });
    setGeneratedNotes(release.markdown || '');
    setActiveMainTab('changelog');
    setChatHistory(prev => [
      ...prev,
      {
        id: `load-${Date.now()}`,
        role: 'assistant',
        content: `📖 **Loaded saved release notes** for "**${release.projectName}**" (${release.version}) into the active workspace! Feel free to edit, refine, or regenerate as needed.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  // Handler to parse a raw pasted git log
  const handleParseGitLog = async () => {
    if (!rawGitLog.trim()) {
      setErrorMessage("Please paste some text first.");
      return;
    }
    setIsParsing(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/parse-commits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawLog: rawGitLog })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to parse commits');
      }
      const parsed: Commit[] = await res.json();
      const updated = parsed.map((c, i) => ({
        ...c,
        id: `parsed-${Date.now()}-${i}`,
        selected: true
      }));
      setCommits((prev) => [...updated, ...prev]);
      setRawGitLog('');
      setActiveMainTab('commits');
    } catch (err: any) {
      setErrorMessage(`Error parsing commits: ${err.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  // Handler to fetch real live commits from any public or private GitHub repository
  const handleFetchGithubCommits = async () => {
    if (!githubRepoInput.trim()) {
      setErrorMessage("Please enter a GitHub repository name (e.g., owner/repo).");
      return;
    }
    setIsFetchingGithub(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/fetch-github-commits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          repoPath: githubRepoInput,
          githubToken: githubToken || undefined
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to fetch commits from GitHub');
      }
      
      const responseData = await res.json();
      let fetchedCommits: Commit[] = [];
      let fetchedMeta: any = null;

      if (responseData && typeof responseData === 'object' && !Array.isArray(responseData)) {
        fetchedCommits = responseData.commits || [];
        fetchedMeta = responseData.metadata || null;
      } else if (Array.isArray(responseData)) {
        fetchedCommits = responseData;
      }

      const updated = fetchedCommits.map((c, i) => ({
        ...c,
        id: `github-${Date.now()}-${i}`,
        selected: true
      }));
      setCommits((prev) => [...updated, ...prev]);
      setActiveMainTab('commits');

      // Dynamically update metadata form values with auto-discovered repo info
      const repoNamePart = githubRepoInput.split('/').pop() || 'GitHub Project';
      const cleanName = repoNamePart.replace(/-/g, ' ');
      const capitalizedProjectName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      
      setMetadata(prev => {
        const nextMeta = { ...prev };
        if (fetchedMeta) {
          if (fetchedMeta.projectName) nextMeta.projectName = fetchedMeta.projectName;
          if (fetchedMeta.latestVersion) nextMeta.version = fetchedMeta.latestVersion;
          if (fetchedMeta.releaseDate) nextMeta.releaseDate = fetchedMeta.releaseDate;
          if (fetchedMeta.milestoneGoals) nextMeta.milestoneGoals = fetchedMeta.milestoneGoals;
          if (fetchedMeta.customNotes) nextMeta.customNotes = fetchedMeta.customNotes;
        } else {
          nextMeta.projectName = capitalizedProjectName;
        }
        return nextMeta;
      });

      const hasMetaInfo = fetchedMeta && fetchedMeta.latestVersion;
      const metaReport = hasMetaInfo 
        ? `\n\n🔍 **Auto-Discovered Repository Info:**\n- **Project Name:** ${fetchedMeta.projectName}\n- **Latest Tag / Release:** \`${fetchedMeta.latestVersion}\`\n- **Last Release / Commit Date:** \`${fetchedMeta.releaseDate}\`\n- **Milestone Goals:** _${fetchedMeta.milestoneGoals}_`
        : ``;

      // Notify user via AI Chat history
      setChatHistory(prev => [
        ...prev,
        {
          id: `git-fetch-${Date.now()}`,
          role: 'assistant',
          content: `📥 **Successfully imported ${fetchedCommits.length} commits** from GitHub repository: **${githubRepoInput}**! 

I processed these commits with our **AI Model** to analyze their changes, categorize them (as features, fixes, docs, refactoring, performance, etc.), identify sub-scopes, and check for breaking changes.${metaReport}

The release settings (Project Name, Version, Date, and Milestones) on the left have been auto-filled with these values! Ready to generate your custom release notes.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err: any) {
      setErrorMessage(`Error importing GitHub commits: ${err.message}`);
    } finally {
      setIsFetchingGithub(false);
    }
  };

  // Add individual custom commit manually
  const handleAddManualCommit = () => {
    if (!newCommitMsg.trim()) {
      setErrorMessage("Please enter a commit message.");
      return;
    }
    const newCommit: Commit = {
      id: `manual-${Date.now()}`,
      hash: Math.random().toString(16).substring(2, 9),
      author: newCommitAuthor.trim() || 'You',
      date: new Date().toISOString().split('T')[0],
      message: newCommitMsg,
      category: newCommitCategory,
      scope: newCommitScope.trim() || undefined,
      isBreaking: newCommitIsBreaking,
      selected: true
    };
    setCommits((prev) => [newCommit, ...prev]);
    setNewCommitMsg('');
    setNewCommitScope('');
    setNewCommitIsBreaking(false);
    setErrorMessage(null);
  };

  // Delete a commit
  const handleDeleteCommit = (id: string) => {
    setCommits((prev) => prev.filter(c => c.id !== id));
  };

  // Toggle selection
  const handleToggleSelectCommit = (id: string) => {
    setCommits((prev) => prev.map(c => c.id === id ? { ...c, selected: !c.selected } : c));
  };

  // Toggle isBreaking
  const handleToggleBreakingCommit = (id: string) => {
    setCommits((prev) => prev.map(c => c.id === id ? { ...c, isBreaking: !c.isBreaking } : c));
  };

  // Update Category
  const handleUpdateCategory = (id: string, cat: Commit['category']) => {
    setCommits((prev) => prev.map(c => c.id === id ? { ...c, category: cat } : c));
  };

  // Clear all commits
  const handleClearCommits = () => {
    setCommits([]);
  };

  // Generate release notes
  const handleGenerateReleaseNotes = async () => {
    const selectedCommits = commits.filter(c => c.selected);
    if (selectedCommits.length === 0) {
      setErrorMessage("No commits are selected or available. Please add or generate commits first.");
      return;
    }
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/generate-release-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commits: selectedCommits,
          options,
          metadata
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to generate release notes');
      }
      const data = await res.json();
      setGeneratedNotes(data.markdown);
      setActiveMainTab('changelog');

      // Add assistant notification in the chat
      setChatHistory(prev => [
        ...prev,
        {
          id: `gen-${Date.now()}`,
          role: 'assistant',
          content: `✨ **Release notes generated!** I analyzed the ${selectedCommits.length} selected commits and formatted them into a beautiful **${options.tone}** document tailored for **${options.audience}**.
          
Feel free to type any instructions in the chat box on the right to edit or modify this draft!`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err: any) {
      setErrorMessage(`Error generating release notes: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Interactive Agent Refine Chat
  const handleChatRefine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    if (!generatedNotes) {
      setErrorMessage("Please generate release notes first before attempting to refine them.");
      return;
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: chatMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatHistory(prev => [...prev, userMsg]);
    const promptToSend = chatMessage;
    setChatMessage('');
    setIsChatting(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/chat-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentReleaseNotes: generatedNotes,
          chatMessage: promptToSend,
          commits: commits.filter(c => c.selected)
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Refinement failed');
      }

      const data = await res.json();
      setGeneratedNotes(data.updatedMarkdown);

      const assistantMsg: ChatMessage = {
        id: `agent-${Date.now()}`,
        role: 'assistant',
        content: data.agentCommentary || "I have updated the release notes draft according to your instructions.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        agentCommentary: data.agentCommentary
      };

      setChatHistory(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setErrorMessage(`Refinement Error: ${err.message}`);
      setChatHistory(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Failed to apply that change: ${err.message}. Please try rephrasing your request!`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsChatting(false);
    }
  };

  // Quick action prompt suggestions for user chat
  const handleQuickAction = (instruction: string) => {
    setChatMessage(instruction);
  };

  // Copy to Clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(generatedNotes);
    alert("Copied to clipboard!");
  };

  // Download Markdown file
  const handleDownload = () => {
    const blob = new Blob([generatedNotes], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `RELEASE_NOTES_${metadata.version || 'v1.0.0'}.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const breakingCommitsCount = commits.filter(c => c.selected && c.isBreaking).length;
  const totalSelectedCount = commits.filter(c => c.selected).length;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans flex flex-col antialiased">
      {/* Banner info when GEMINI_API_KEY could be missing */}
      <div className="bg-slate-900 text-white text-[11px] py-1.5 px-6 flex items-center justify-between shadow-xs border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-medium text-slate-300">AI Release Notes Assistant</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">Enterprise Edition powered by AI Engine</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span>System: <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-300 font-mono">UTC 2026</code></span>
        </div>
      </div>

      {/* Main Header with App Brand */}
      <header className="bg-white border-b border-slate-200/80 px-6 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 text-white p-2 rounded-xl shadow-sm">
            <Sparkles className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 font-display">
                Release <span className="text-indigo-600">Notes</span> Agent
              </h1>
              <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">PRO</span>
            </div>
            <p className="text-xs text-slate-400">
              Transform raw git commits into polished, multi-tier release notes instantly.
            </p>
          </div>
        </div>

        {/* Right Header Navigation & Actions */}
        <div className="flex items-center flex-wrap gap-3">
          

          {/* User Vault & Authentication Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer select-none ${
                user 
                  ? 'bg-indigo-50/50 border-indigo-200/80 text-indigo-700 hover:bg-indigo-50' 
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Cloud className={`h-4 w-4 ${user ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span>{user ? (user.displayName || 'Developer Account') : 'Connect Cloud & Repo'}</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
            </button>

            {isProfileOpen && (
              <>
                {/* Backdrop overlay for closing */}
                <div className="fixed inset-0 z-40" onClick={() => setIsProfileOpen(false)}></div>
                
                {/* Profile Card Popover */}
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-4 animate-fade-in text-left">
                  <div className="pb-3 mb-3 border-b border-slate-100">
                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block mb-1">Developer Cloud Workspace</span>
                    {user ? (
                      <div className="flex items-center gap-2.5">
                        {user.photoURL ? (
                          <img 
                            src={user.photoURL} 
                            alt={user.displayName || 'User'} 
                            referrerPolicy="no-referrer"
                            className="h-8 w-8 rounded-full border border-indigo-200"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                            {(user.displayName || user.email || 'D').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{user.displayName || 'Anonymous Developer'}</p>
                          <p className="text-[10px] text-slate-400 truncate font-mono">{user.email || 'Cloud Session Active'}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 leading-normal">
                        Unlock automatic sync, saved Release Draft history, and pull private GitHub repositories with a secure session.
                      </p>
                    )}
                  </div>

                  {/* Auth Action triggers */}
                  {!user ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={handleGithubSignIn}
                        disabled={isSigningIn}
                        className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        {isSigningIn ? (
                           <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                           <Github className="h-3.5 w-3.5" />
                        )}
                        {isSigningIn ? 'Connecting...' : 'Sign In with GitHub'}
                      </button>
                      <button
                        type="button"
                        onClick={handleAnonymousSignIn}
                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all border border-slate-200 cursor-pointer"
                      >
                        <UserIcon className="h-3.5 w-3.5" />
                        Try Local Guest Mode
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      
                      {/* GitHub token form inside profile dropdown */}
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 flex items-center gap-1">
                          <Key className="h-3 w-3 text-indigo-500" /> Personal Repo Token (PAT)
                        </span>
                        <input
                          type="password"
                          placeholder="Paste ghp_... for private repos"
                          value={githubToken || ''}
                          onChange={(e) => setGithubToken(e.target.value)}
                          className="w-full text-[11px] bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                      </div>

                      {/* Cloud saved drafts history inside profile dropdown */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                          <span>Cloud Release History ({savedReleases.length})</span>
                          {isFetchingSaved && <RefreshCw className="h-2.5 w-2.5 animate-spin text-indigo-500" />}
                        </span>

                        {savedReleases.length === 0 ? (
                          <div className="text-center py-4 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-[10px] text-slate-400">
                            No cloud drafts saved yet.
                          </div>
                        ) : (
                          <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100 bg-slate-50">
                            {savedReleases.map((rel) => (
                              <div
                                key={rel.id}
                                onClick={() => {
                                  handleLoadSavedRelease(rel);
                                  setIsProfileOpen(false);
                                }}
                                className="p-2 hover:bg-indigo-50/40 cursor-pointer transition-colors flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px] font-bold text-slate-800 truncate">{rel.projectName || 'Unnamed Project'}</span>
                                    <span className="text-[9px] bg-indigo-50 text-indigo-700 font-mono px-1 rounded font-bold">{rel.version || 'v1.0'}</span>
                                  </div>
                                  <p className="text-[9px] text-slate-400">📅 {rel.releaseDate || 'Unknown'}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteRelease(rel.id, e)}
                                  className="p-1 rounded hover:bg-rose-50 text-slate-300 hover:text-rose-600 transition-colors"
                                  title="Delete draft"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                          <Check className="h-3 w-3 text-emerald-500" /> Synced
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            handleSignOut();
                            setIsProfileOpen(false);
                          }}
                          className="text-[11px] font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <LogOut className="h-3 w-3" />
                          Sign Out
                        </button>
                      </div>

                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Work Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        
        {/* Error Alert Bar */}
        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-3 shadow-sm animate-fade-in">
            <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-sm">Action Required</h4>
              <p className="text-xs text-rose-700/90 mt-0.5">{errorMessage}</p>
            </div>
            <button 
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-800 text-xs font-medium px-2 py-1 rounded hover:bg-rose-100/50"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Tabs Navigation */}
        <div className="flex bg-white p-1 rounded-xl border border-slate-200/80 shadow-xs max-w-full overflow-x-auto mx-auto lg:mx-0 w-full lg:w-auto self-start">
          <button
            onClick={() => setActiveMainTab('intro')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${
              activeMainTab === 'intro' 
                ? 'bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100/50' 
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            Introduction
          </button>
          <button
            onClick={() => setActiveMainTab('setup')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${
              activeMainTab === 'setup' 
                ? 'bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100/50' 
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Sliders className="h-4 w-4" />
            Setup & Data
          </button>
          <button
            onClick={() => setActiveMainTab('commits')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${
              activeMainTab === 'commits' 
                ? 'bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100/50' 
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <List className="h-4 w-4" />
            Manage Commits
            {commits.length > 0 && (
              <span className="ml-1.5 bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full text-[10px]">
                {commits.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveMainTab('changelog')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${
              activeMainTab === 'changelog' 
                ? 'bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100/50' 
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <FileText className="h-4 w-4" />
            Draft & Refine
          </button>
        </div>

        {/* Content Container */}
        <div className="w-full flex flex-col gap-6">
          
          {/* Intro Tab */}
          {activeMainTab === 'intro' && (
            <section className="bg-white rounded-2xl border border-slate-200/80 p-8 shadow-xs animate-fade-in flex flex-col items-center justify-center text-center min-h-[400px]">
              <div className="bg-indigo-50 text-indigo-600 p-4 rounded-full mb-6">
                <Sparkles className="h-10 w-10 animate-pulse" />
              </div>
              <h1 className="text-3xl font-bold text-slate-800 mb-4 font-display">Welcome to AI Release Notes Assistant</h1>
              <p className="text-slate-600 max-w-2xl text-sm leading-relaxed mb-8">
                Transform your raw Git commits into beautifully styled, professional HTML release notes in seconds. 
                Configure your project details, connect your GitHub repository to fetch data, or paste your commit logs manually.
                Then, let our advanced AI engine draft, format, and refine your changelog for any audience.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-8">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-left">
                  <Sliders className="h-5 w-5 text-indigo-500 mb-2" />
                  <h3 className="font-bold text-slate-800 text-sm mb-1">1. Setup Project</h3>
                  <p className="text-xs text-slate-500">Define your project name, version, and the target audience tone.</p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-left">
                  <Github className="h-5 w-5 text-indigo-500 mb-2" />
                  <h3 className="font-bold text-slate-800 text-sm mb-1">2. Import Data</h3>
                  <p className="text-xs text-slate-500">Connect to GitHub or paste your git logs to capture commits.</p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-left">
                  <FileText className="h-5 w-5 text-indigo-500 mb-2" />
                  <h3 className="font-bold text-slate-800 text-sm mb-1">3. Generate & Refine</h3>
                  <p className="text-xs text-slate-500">Draft the notes and chat with the AI to refine the output.</p>
                </div>
              </div>
              
              <button
                onClick={() => setActiveMainTab('setup')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-sm transition-all flex items-center gap-2"
              >
                Get Started <ChevronDown className="h-4 w-4 -rotate-90" />
              </button>
            </section>
          )}

          {/* Section 1: Release & Project Metadata */}
          {activeMainTab === 'setup' && (
          <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs animate-fade-in">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sliders className="h-4.5 w-4.5 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-800 font-display">Project & Release Details</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsMetadataExpanded(!isMetadataExpanded)}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100/60 px-2.5 py-1 rounded-lg"
              >
                <Settings className="h-3 w-3" />
                <span>{isMetadataExpanded ? 'Hide Advanced Options' : 'Tune Options'}</span>
                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${isMetadataExpanded ? 'rotate-180' : ''}`} />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Project Name</label>
                <input 
                  type="text" 
                  value={metadata.projectName}
                  onChange={(e) => setMetadata({...metadata, projectName: e.target.value})}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-semibold"
                  placeholder="e.g. Acme Dashboard"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Release Version</label>
                <input 
                  type="text" 
                  value={metadata.version}
                  onChange={(e) => setMetadata({...metadata, version: e.target.value})}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono font-semibold"
                  placeholder="e.g. v1.2.0"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Release Date</label>
                <input 
                  type="date" 
                  value={metadata.releaseDate}
                  onChange={(e) => setMetadata({...metadata, releaseDate: e.target.value})}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                />
              </div>
            </div>

            {/* Collapsible Advanced Customizations block */}
            {isMetadataExpanded && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-3.5 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target Audience</label>
                    <select
                      value={options.audience}
                      onChange={(e) => setOptions({...options, audience: e.target.value})}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                    >
                      <option value="General Customers & Support Teams">General Customers & Support Teams</option>
                      <option value="Product Managers & Business Stakeholders">Product Managers & Business Stakeholders</option>
                      <option value="Software Engineers & DevOps Administrators">Software Engineers & DevOps Administrators</option>
                      <option value="Security Auditors & Compliance Inspectors">Security Auditors & Compliance Inspectors</option>
                      <option value="Executive Board Summary">Executive Board Summary (High Level Only)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tone Profile</label>
                    <select
                      value={options.tone}
                      onChange={(e) => setOptions({...options, tone: e.target.value})}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                    >
                      <option value="Warm, professional, and exciting">Warm, professional, and exciting 🎉</option>
                      <option value="Serious, technical, and executive-concise">Serious, technical, and executive-concise 💼</option>
                      <option value="Energetic, cutting-edge, and highly detailed">Energetic, cutting-edge, and highly detailed 🚀</option>
                      <option value="Humble, casual, and friendly developer-speak">Humble, casual, and friendly developer-speak ☕</option>
                      <option value="Humorous, light-hearted, and community-driven">Humorous, light-hearted, and community-driven 🍕</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Milestone Goals</label>
                  <input 
                    type="text" 
                    value={metadata.milestoneGoals}
                    onChange={(e) => setMetadata({...metadata, milestoneGoals: e.target.value})}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                    placeholder="Primary objective of this sprint..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Internal Notes & Custom Guidance</label>
                  <textarea 
                    value={metadata.customNotes}
                    onChange={(e) => setMetadata({...metadata, customNotes: e.target.value})}
                    rows={2}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
                    placeholder="Include special callouts, deprecation details, or team appreciation instructions here..."
                  />
                </div>
              </div>
            )}
          </section>
          )}

          {/* Section 2: Commit Pool Sources */}
          {activeMainTab === 'setup' && (
          <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex-1 flex flex-col animate-fade-in">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4.5 w-4.5 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-800 font-display">Data Capture Sources</h2>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                  {commits.length} commits total
                </span>
                {breakingCommitsCount > 0 && (
                  <span className="bg-amber-50 text-amber-700 font-semibold border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {breakingCommitsCount} breaking
                  </span>
                )}
              </div>
            </div>

            {/* Modern Tabbed Interface for visual simplicity */}
            <div className="flex border-b border-slate-100 mb-4 bg-slate-50/50 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('github')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'github'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/20'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Github className="h-3.5 w-3.5" />
                GitHub Repository
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'paste'
                    ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/20'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Paste Git Logs
              </button>
            </div>

            {/* Tab content renders */}
            <div className="mb-4">
              {activeTab === 'github' && (
                <div className="bg-white border border-slate-200/60 rounded-xl p-3.5 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Import Public or Private Repository</span>
                  <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                    Import commits from <strong>any public or private</strong> GitHub project to automatically parse commits and fetch releases, tags, dates, and milestone data.
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={githubRepoInput}
                        onChange={(e) => setGithubRepoInput(e.target.value)}
                        placeholder="e.g. facebook/react, owner/private-repo"
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-semibold"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleFetchGithubCommits}
                      disabled={isFetchingGithub || !githubRepoInput.trim()}
                      className="px-4 bg-slate-900 text-white text-xs font-semibold py-2 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm cursor-pointer"
                    >
                      {isFetchingGithub ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <GitBranch className="h-3.5 w-3.5" />
                      )}
                      <span>{isFetchingGithub ? 'Importing...' : 'Fetch & Analyze'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1 font-mono">
                    <Info className="h-3 w-3 text-indigo-500" />
                    Loads latest commits, tags, & releases; then auto-fills release details!
                  </p>

                  {/* Private Repository Support & Token Guide */}
                  <div className="mt-4 pt-3.5 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Key className="h-3 w-3 text-indigo-500" /> Private Repo Access Token (PAT)
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsTokenHelpOpen(!isTokenHelpOpen)}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded cursor-pointer"
                      >
                        {isTokenHelpOpen ? 'Hide Steps' : 'How to get token?'}
                      </button>
                    </div>

                    <div className="mt-2">
                      <input
                        type="password"
                        placeholder="Paste your GitHub Personal Access Token (ghp_...)"
                        value={githubToken || ''}
                        onChange={(e) => setGithubToken(e.target.value || null)}
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                      />
                    </div>

                    {isTokenHelpOpen && (
                      <div className="mt-2.5 p-3 bg-slate-50 border border-slate-200/50 rounded-lg text-[11px] text-slate-600 leading-relaxed space-y-1.5 animate-fade-in">
                        <p className="font-bold text-slate-800 flex items-center gap-1">🔑 4 Steps to Generate your GitHub Access Code:</p>
                        <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                          <li>Go to GitHub → Click your avatar (top-right) → <strong>Settings</strong>.</li>
                          <li>On the left sidebar, click <strong>Developer settings</strong> (at the very bottom).</li>
                          <li>Click <strong>Personal access tokens</strong> → select <strong>Tokens (classic)</strong>.</li>
                          <li>Click <strong>Generate new token</strong> → <strong>Generate new token (classic)</strong>.</li>
                        </ol>
                        <p className="text-slate-600 mt-1">
                          Give it a description (e.g., <span className="bg-slate-200 px-1 rounded">Changelog Assistant</span>), check the <strong className="text-indigo-600">repo</strong> scope box (Full control of private repositories), and click <strong>Generate token</strong> at the bottom.
                        </p>
                        <p className="text-[10px] text-indigo-500 font-semibold bg-indigo-50/50 p-1.5 rounded border border-indigo-100/50">
                          💡 Paste the generated token above. We use this token securely only on your behalf to fetch the private repository commits, releases, and tags!
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'paste' && (
                <div className="bg-white border border-slate-200/60 rounded-xl p-3.5 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Paste Git Log Output</span>
                  <p className="text-xs text-slate-500 mb-3.5 leading-relaxed">
                    Paste the output of <code className="bg-slate-50 px-1 py-0.5 rounded font-mono text-[10px] text-slate-600">git log --oneline</code> directly to parse with AI.
                  </p>
                  <textarea
                    rows={3}
                    value={rawGitLog}
                    onChange={(e) => setRawGitLog(e.target.value)}
                    placeholder={`feat(auth): login with Google (#211)\nfix(db): resolve idle connection timeouts\ndocs: update readme.md`}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleParseGitLog}
                    disabled={isParsing || !rawGitLog.trim()}
                    className="w-full mt-2.5 text-xs font-semibold bg-slate-900 text-white py-2 rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm cursor-pointer"
                  >
                    {isParsing ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5 text-indigo-300 animate-pulse" />
                    )}
                    <span>{isParsing ? 'Parsing Git Logs with AI...' : 'Parse & Categorize with AI'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Quick manual add input form (Collapse styled) */}
            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 mb-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Or Add Single Change Manually:</span>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                <div className="md:col-span-3">
                  <select
                    value={newCommitCategory}
                    onChange={(e) => setNewCommitCategory(e.target.value as any)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="feat">✨ feat (New Feature)</option>
                    <option value="fix">🐛 fix (Bug Fix)</option>
                    <option value="docs">📝 docs (Documentation)</option>
                    <option value="refactor">🛠️ refactor (Refactoring)</option>
                    <option value="perf">⚡ perf (Performance)</option>
                    <option value="test">🧪 test (Testing)</option>
                    <option value="chore">⚙️ chore (Build/Config)</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <input
                    type="text"
                    value={newCommitScope}
                    onChange={(e) => setNewCommitScope(e.target.value)}
                    placeholder="Scope (ui)"
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="md:col-span-5">
                  <input
                    type="text"
                    value={newCommitMsg}
                    onChange={(e) => setNewCommitMsg(e.target.value)}
                    placeholder="Commit message (e.g., integrate OAuth popup)"
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="md:col-span-2 flex items-center justify-between gap-1">
                  <label className="flex items-center gap-1 cursor-pointer select-none text-[10px] font-semibold text-amber-700">
                    <input
                      type="checkbox"
                      checked={newCommitIsBreaking}
                      onChange={(e) => setNewCommitIsBreaking(e.target.checked)}
                      className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                    />
                    BC?
                  </label>
                  <button
                    type="button"
                    onClick={handleAddManualCommit}
                    className="bg-slate-800 hover:bg-slate-900 text-white text-xs p-1.5 rounded-lg font-medium flex items-center justify-center transition-colors shadow-sm"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>
          )}

          {/* Commits List Manager */}
          {activeMainTab === 'commits' && (
          <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex-1 flex flex-col animate-fade-in">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <List className="h-4.5 w-4.5 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-800 font-display">Manage Captured Commits</h2>
              </div>
            </div>
            
            <div className="flex-1 min-h-[250px] border border-slate-200/70 rounded-xl overflow-hidden flex flex-col bg-slate-50/20">
              <div className="bg-slate-100/80 px-4 py-2 border-b border-slate-200/80 flex items-center justify-between text-xs text-slate-500 font-semibold">
                <div className="flex items-center gap-2">
                  <span>List of Captured Commits ({commits.length})</span>
                </div>
                <button
                  type="button"
                  onClick={handleClearCommits}
                  className="text-slate-500 hover:text-rose-600 transition-colors text-xs font-semibold flex items-center gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear All
                </button>
              </div>

              {commits.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white">
                  <GitBranch className="h-10 w-10 text-slate-300 stroke-1 mb-2" />
                  <p className="text-sm font-semibold text-slate-500">Your commit pool is currently empty</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    Simulate a realistic history, paste raw git logs, or manually add individual commits to kick off notes drafting.
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto max-h-[360px] divide-y divide-slate-100 bg-white">
                  {commits.map((commit) => (
                    <div 
                      key={commit.id} 
                      className={`px-4 py-2.5 flex items-center gap-3 transition-colors hover:bg-slate-50/50 ${
                        commit.selected ? 'bg-indigo-50/10' : 'opacity-60'
                      }`}
                    >
                      <input 
                        type="checkbox"
                        checked={!!commit.selected}
                        onChange={() => handleToggleSelectCommit(commit.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 shrink-0 cursor-pointer"
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Category Badge dropdown selector */}
                          <select
                            value={commit.category}
                            onChange={(e) => handleUpdateCategory(commit.id, e.target.value as any)}
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 cursor-pointer transition-all ${
                              commit.category === 'feat' ? 'bg-emerald-50 text-emerald-700' :
                              commit.category === 'fix' ? 'bg-rose-50 text-rose-700' :
                              commit.category === 'refactor' ? 'bg-purple-50 text-purple-700' :
                              commit.category === 'perf' ? 'bg-amber-50 text-amber-700' :
                              commit.category === 'docs' ? 'bg-cyan-50 text-cyan-700' :
                              'bg-slate-100 text-slate-700'
                            }`}
                          >
                            <option value="feat">feat</option>
                            <option value="fix">fix</option>
                            <option value="docs">docs</option>
                            <option value="refactor">refactor</option>
                            <option value="perf">perf</option>
                            <option value="test">test</option>
                            <option value="chore">chore</option>
                          </select>

                          {/* Scope indicator */}
                          {commit.scope && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 font-mono font-bold px-1.5 py-0.5 rounded">
                              {commit.scope}
                            </span>
                          )}

                          {/* Hash */}
                          {commit.hash && (
                            <span className="text-[10px] font-mono text-slate-400">
                              {commit.hash}
                            </span>
                          )}

                          {/* Author */}
                          <span className="text-[10px] text-slate-400">
                            by {commit.author || 'unknown'}
                          </span>

                          {/* Breaking alert badge */}
                          {commit.isBreaking && (
                            <span className="text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-1 py-0.2 rounded flex items-center gap-0.5 uppercase tracking-wide">
                              <AlertTriangle className="h-2 w-2" /> Breaking
                            </span>
                          )}
                        </div>

                        {/* Message editable placeholder */}
                        <input
                          type="text"
                          value={commit.message}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCommits(prev => prev.map(c => c.id === commit.id ? { ...c, message: val } : c));
                          }}
                          className="w-full text-xs font-medium text-slate-700 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none mt-1 py-0.5"
                        />
                      </div>

                      {/* Interactive Controls */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Toggle Breaking Change button */}
                        <button
                          type="button"
                          onClick={() => handleToggleBreakingCommit(commit.id)}
                          title="Toggle Breaking Change Alert Status"
                          className={`p-1.5 rounded-lg border text-xs transition-all ${
                            commit.isBreaking 
                              ? 'bg-amber-50 border-amber-300 text-amber-700 font-bold' 
                              : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
                          }`}
                        >
                          BC
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteCommit(commit.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Commit Categories Analytics Dashboard */}
            {commits.length > 0 && (
              <div className="mt-5 bg-slate-50/50 border border-slate-200/60 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-700 font-display">Commit Category Distribution</span>
                  </div>
                  <span className="text-[10px] text-slate-500 bg-white border border-slate-200/50 px-2 py-0.5 rounded font-mono">
                    {commits.filter(c => c.selected).length} / {commits.length} Selected
                  </span>
                </div>

                {commits.filter(c => c.selected).length === 0 ? (
                  <div className="h-[140px] flex items-center justify-center border border-dashed border-slate-200 rounded-lg bg-white/50 text-center p-4">
                    <p className="text-[11px] text-slate-400">Select at least one commit from the pool to visualize the category distribution.</p>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-100 rounded-lg p-2 shadow-xs">
                    <div className="w-full h-[150px] text-[10px] font-mono">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { name: 'feat', label: 'feat (Features)', count: commits.filter(c => c.selected && c.category === 'feat').length, color: '#10b981' },
                            { name: 'fix', label: 'fix (Bug Fixes)', count: commits.filter(c => c.selected && c.category === 'fix').length, color: '#f43f5e' },
                            { name: 'docs', label: 'docs (Documentation)', count: commits.filter(c => c.selected && c.category === 'docs').length, color: '#06b6d4' },
                            { name: 'refactor', label: 'refactor (Code Refactoring)', count: commits.filter(c => c.selected && c.category === 'refactor').length, color: '#a855f7' },
                            { name: 'perf', label: 'perf (Performance)', count: commits.filter(c => c.selected && c.category === 'perf').length, color: '#f59e0b' },
                            { name: 'test', label: 'test (Testing)', count: commits.filter(c => c.selected && c.category === 'test').length, color: '#6366f1' },
                            { name: 'chore', label: 'chore (Build/Config)', count: commits.filter(c => c.selected && c.category === 'chore').length, color: '#64748b' }
                          ]}
                          margin={{ top: 10, right: 5, left: -25, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="name" 
                            stroke="#94a3b8" 
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis 
                            stroke="#94a3b8" 
                            fontSize={10}
                            allowDecimals={false}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            cursor={{ fill: '#f8fafc' }}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-slate-900 text-white text-[11px] px-2.5 py-1.5 rounded shadow-lg border border-slate-800 font-sans">
                                    <p className="font-bold">{data.label}</p>
                                    <p className="text-slate-300 mt-0.5">
                                      Commits count: <span className="font-mono text-emerald-400 font-bold">{data.count}</span>
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar 
                            dataKey="count" 
                            radius={[4, 4, 0, 0]}
                            maxBarSize={32}
                          >
                            {[
                              { color: '#10b981' },
                              { color: '#f43f5e' },
                              { color: '#06b6d4' },
                              { color: '#a855f7' },
                              { color: '#f59e0b' },
                              { color: '#6366f1' },
                              { color: '#64748b' }
                            ].map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Quick Legend Stat Badges */}
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-2 pt-2 border-t border-slate-50">
                      {[
                        { name: 'feat', count: commits.filter(c => c.selected && c.category === 'feat').length, color: '#10b981' },
                        { name: 'fix', count: commits.filter(c => c.selected && c.category === 'fix').length, color: '#f43f5e' },
                        { name: 'docs', count: commits.filter(c => c.selected && c.category === 'docs').length, color: '#06b6d4' },
                        { name: 'refactor', count: commits.filter(c => c.selected && c.category === 'refactor').length, color: '#a855f7' },
                        { name: 'perf', count: commits.filter(c => c.selected && c.category === 'perf').length, color: '#f59e0b' },
                        { name: 'test', count: commits.filter(c => c.selected && c.category === 'test').length, color: '#6366f1' },
                        { name: 'chore', count: commits.filter(c => c.selected && c.category === 'chore').length, color: '#64748b' }
                      ].map((item) => (
                        <div 
                          key={item.name} 
                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium transition-all duration-200 ${
                            item.count > 0 ? 'bg-slate-50 text-slate-700 border border-slate-100' : 'bg-transparent text-slate-300 border border-transparent'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="font-bold">{item.name}</span>
                          <span className="font-mono bg-white px-1 py-0.1 border border-slate-200/40 rounded text-[9px] font-bold">
                            {item.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Core Generate Button */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleGenerateReleaseNotes}
                disabled={isGenerating || commits.filter(c => c.selected).length === 0}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2 transition-all duration-300 transform active:scale-[0.98] disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Analyzing & Authoring with AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    <span>Generate Draft Release Notes ({totalSelectedCount} Commits)</span>
                  </>
                )}
              </button>
            </div>
          </section>
          )}

          {/* Section 3: Live Output Console & AI Chat Refiner Workspace */}
          {activeMainTab === 'changelog' && (
          <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex-1 flex flex-col min-h-[600px] animate-fade-in">
            
            {/* Header / Tabs */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="h-4.5 w-4.5 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-800 font-display">Generated Changelog</h2>
              </div>
              
              {generatedNotes && (
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                  <button
                    onClick={() => setIsPreviewMode(true)}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-all cursor-pointer ${
                      isPreviewMode 
                        ? 'bg-white text-slate-800 shadow-xs' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Preview</span>
                  </button>
                  <button
                    onClick={() => setIsPreviewMode(false)}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-all cursor-pointer ${
                      !isPreviewMode 
                        ? 'bg-white text-slate-800 shadow-xs' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span className="flex items-center gap-1"><Code className="h-3 w-3" /> Raw MD</span>
                  </button>
                </div>
              )}
            </div>

            {/* Document Content Display */}
            <div className="flex-1 flex flex-col">
              {!generatedNotes ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  <div className="bg-slate-100 p-3 rounded-full mb-3 text-slate-400">
                    <Sparkles className="h-6 w-6 text-indigo-500 animate-pulse" />
                  </div>
                  <p className="text-xs font-bold text-slate-600">Draft notes not generated yet</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-xs leading-relaxed">
                    Choose commits and configure options on the left, then click "Generate Draft" to ignite the AI engine!
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  {/* Tool bar: Copy, Download */}
                  <div className="flex items-center justify-between mb-3 bg-slate-50 border border-slate-100 p-1.5 rounded-xl">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Draft Ready</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleCopy}
                        className="bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1 transition-all cursor-pointer"
                        title="Copy HTML to clipboard"
                      >
                        <Copy className="h-3 w-3 text-slate-500" /> Copy
                      </button>
                      <button
                        onClick={handleDownload}
                        className="bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                        title="Download HTML file"
                      >
                        <Download className="h-3 w-3 text-indigo-300" /> Save .html
                      </button>
                      {user ? (
                        <button
                          onClick={handleSaveReleaseToCloud}
                          disabled={isSavingToCloud}
                          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Cloud className={`h-3 w-3 ${isSavingToCloud ? 'animate-pulse' : ''}`} />
                          {isSavingToCloud ? 'Saving...' : 'Cloud Save'}
                        </button>
                      ) : (
                        <button
                          onClick={() => setErrorMessage("Please sign in or try anonymously in the Cloud Hub panel to save to cloud!")}
                          className="bg-slate-100 text-slate-400 text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 transition-all cursor-not-allowed border border-slate-200/50"
                          title="Sign in to save release notes to the cloud"
                        >
                          <Cloud className="h-3 w-3" />
                          Cloud Save
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Document Box */}
                  <div className="flex-1 overflow-y-auto max-h-[350px] p-4 bg-slate-50 rounded-xl border border-slate-200/80 mb-4 text-left shadow-inner">
                    {isPreviewMode ? (
                      <div className="html-body text-xs prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: generatedNotes }} />
                    ) : (
                      <pre className="text-xs font-mono text-slate-700 bg-transparent p-0 m-0 overflow-x-auto whitespace-pre-wrap select-text leading-relaxed">
                        {generatedNotes}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* AGENT INTERACTIVE WORKSPACE CHAT SIDEBAR (Always integrated for high accessibility) */}
            <div className="border-t border-slate-100 pt-4 mt-auto">
              <div className="flex items-center gap-1.5 mb-2.5">
                <MessageSquare className="h-4 w-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-700 font-display">Refine & Customize with AI Assistant</span>
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping"></span>
              </div>

              {/* Mini conversational memory list */}
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 max-h-[160px] overflow-y-auto flex flex-col gap-2 mb-3">
                {chatHistory.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center italic py-2">No chat changes applied yet. Ask the assistant below to tune sections.</p>
                ) : (
                  chatHistory.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={`p-2 rounded-lg text-xs leading-relaxed max-w-[90%] ${
                        msg.role === 'user' 
                          ? 'bg-slate-200 text-slate-800 self-end ml-auto' 
                          : 'bg-white text-slate-700 self-start mr-auto shadow-xs border border-slate-100'
                      }`}
                    >
                      {msg.role === 'assistant' && (
                        <span className="font-bold text-[9px] text-indigo-600 uppercase tracking-wider block mb-0.5">Release Assistant</span>
                      )}
                      <div className="whitespace-pre-line">{msg.content}</div>
                      <span className="block text-[8px] text-slate-400 text-right mt-1 font-mono">{msg.timestamp}</span>
                    </div>
                  ))
                )}

                {isChatting && (
                  <div className="bg-white text-slate-700 self-start mr-auto shadow-xs border border-slate-100 p-2.5 rounded-lg text-xs max-w-[90%] flex items-center gap-2">
                    <RefreshCw className="h-3 w-3 animate-spin text-indigo-600" />
                    <span className="text-slate-500 italic text-[11px]">AI Assistant is adjusting the notes draft...</span>
                  </div>
                )}
              </div>

              {/* Dynamic instruction pills for easy access */}
              {generatedNotes && (
                <div className="mb-3">
                  <span className="text-[10px] font-semibold text-slate-400 block mb-1 uppercase tracking-wider">Quick Directives:</span>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { label: "Make tone warmer", prompt: "Make the overall tone warmer, friendlier, and more collaborative." },
                      { label: "Translate to Japanese", prompt: "Translate the entire release notes into natural, elegant professional Japanese." },
                      { label: "Highlight Breaking changes", prompt: "Add a prominent warning banner alert block at the top specifically detailing the breaking changes." },
                      { label: "Make shorter", prompt: "Condense this release notes version to be extremely brief, direct, and executive-ready." }
                    ].map((pill, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleQuickAction(pill.prompt)}
                        className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold px-2 py-0.5 rounded transition-all cursor-pointer"
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat Input Field */}
              <form onSubmit={handleChatRefine} className="flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  disabled={isChatting || !generatedNotes}
                  placeholder={generatedNotes ? "Ask AI Assistant to customize (e.g., Make it look bulleted, Translate)..." : "Generate notes draft first to enable the AI refiner..."}
                  className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={isChatting || !chatMessage.trim() || !generatedNotes}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white p-1.5 rounded-lg transition-all flex items-center justify-center shrink-0 disabled:opacity-50 shadow-sm cursor-pointer"
                >
                  <Send className="h-4.5 w-4.5" />
                </button>
              </form>
            </div>

          </section>
          )}

        </div>

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-6 px-6 mt-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 AI Release Notes Agent — Auto-authoring clean changelogs using AI.</p>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-indigo-600 flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" /> High Precision Generation
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
