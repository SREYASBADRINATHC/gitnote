/**
 * Custom Types for the AI Release Notes Agent
 */

export interface Commit {
  id: string; // Unique UI ID
  hash: string;
  author: string;
  date: string;
  message: string;
  category: 'feat' | 'fix' | 'docs' | 'refactor' | 'perf' | 'test' | 'chore';
  scope?: string;
  isBreaking: boolean;
  selected?: boolean; // If selected to be included in release generation
}

export interface ReleaseOptions {
  audience: string;
  tone: string;
  language: string;
  sections: string[];
  format: 'Markdown' | 'HTML' | 'JSON';
}

export interface ReleaseMetadata {
  projectName: string;
  version: string;
  releaseDate: string;
  milestoneGoals: string;
  customNotes: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  agentCommentary?: string; // Commentary returned alongside updated markdown
}

export interface PresetTemplate {
  name: string;
  description: string;
  metadata: ReleaseMetadata;
  options: ReleaseOptions;
  commits: Omit<Commit, 'id'>[];
}
