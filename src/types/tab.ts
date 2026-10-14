export type SupportedLanguage = 'plaintext' | 'markdown' | 'javascript' | 'python' | 'json' | 'sql';

export interface CursorPosition {
  line: number;
  ch: number;
}

export interface TabSnapshot {
  content: string;
  timestamp: number;
  reason: string;
}

export interface TabItem {
  id: string;
  title: string;
  content: string;
  language: SupportedLanguage;
  cursor: CursorPosition;
  lastModified: number;
  // AI 煉丹前快照與狀態
  preAiSnapshot: TabSnapshot | null;
  isAiDraft: boolean;
  aiPromptSummary?: string;
  // 停靠層級：主頂欄 (primary) 或是次頂 AI 煉丹欄 (secondary)
  deck?: 'primary' | 'secondary';
  // 連接實體檔案系統路徑（選填）
  filePath?: string;
  isDirty?: boolean;
}

export interface RecentFileRecord {
  path: string;
  title: string;
  lastOpened: number;
  preview: string;
  language: SupportedLanguage;
  isLocalFile: boolean;
}

export interface VaultFileEntry {
  path: string;
  name: string;
  rel_path: string;
  size: number;
  modified: number;
  preview: string;
  extension: string;
}

export interface VimKeyOverrides {
  ctrlS: boolean;
  ctrlC: boolean;
  ctrlV: boolean;
  ctrlA: boolean;
  ctrlF: boolean;
  imeWarning: boolean;
}

export interface AppState {
  activeTabId: string;
  tabs: TabItem[];
  vimMode: boolean;
  vimOverrides: VimKeyOverrides;
  groqApiKey: string;
  geminiApiKey: string;
  selectedAiModel: 'groq' | 'gemini';
  vaultFolderPath?: string;
  recentFiles?: RecentFileRecord[];
}
