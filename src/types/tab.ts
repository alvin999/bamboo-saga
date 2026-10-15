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

export interface RecentFolderRecord {
  path: string;
  name: string;
  lastOpened: number;
  isPinned?: boolean;
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

export interface AlchemyCardConfig {
  id: string; // 'organize' | 'action_items' | 'code_refactor'
  tag: string; // '[ 01 // 凝練 ]'
  title: string; // '結構化結論'
  desc: string; // '自動提煉會議要點、脈絡綱領與決策結論'
  systemPrompt: string; // 心法指導語 / prompt template
  colorTag: 'cinnabar' | 'ochre' | 'olive';
}

export interface OneDriveAccountInfo {
  account_type: 'personal' | 'business';
  display_name: string;
  folder_path: string;
  tenant_name?: string;
  is_available: boolean;
}

export interface BackupResult {
  success: boolean;
  backup_dir: string;
  timestamp: number;
  exported_files_count: number;
  message: string;
}

export interface PeriodicBackupEntry {
  category: 'daily' | 'weekly' | 'monthly';
  file_name: string;
  file_path: string;
  timestamp: number;
  size: number;
}

export interface OneDriveBackupOverview {
  has_backup: boolean;
  backup_dir: string;
  latest_timestamp?: number;
  latest_json_size?: number;
  markdown_files: string[];
  periodic_backups: PeriodicBackupEntry[];
}

export interface LayoutConfig {
  workbenchWidth: 'zen' | 'full'; // 工作台寬度：禪風居中 (960px) 或全螢幕滿版
  autoDiffOnAi: boolean;          // AI 提煉完成後是否自動展開對照
  scrollSync: boolean;            // 雙欄對照同步捲動
  smearCursor: boolean;           // 流光殘影游標動畫開關
  fontSize: '13px' | '14px' | '16px' | '18px'; // 編輯器文字大小
}

export interface AppState {
  activeTabId: string;
  tabs: TabItem[];
  vimMode: boolean;
  vimOverrides: VimKeyOverrides;
  alchemyCards?: Record<string, AlchemyCardConfig>;
  layoutConfig?: LayoutConfig;
  groqApiKey: string;
  geminiApiKey: string;
  selectedAiModel: 'groq' | 'gemini';
  selectedAiModelId?: string; // 熱重載選定的具體模型 ID (如 gemini-2.5-flash, llama-3.3-70b-versatile)
  securityMode?: 'scheme_3_os_native' | 'scheme_2_web_crypto'; // 金鑰加密方案選擇
  vaultFolderPath?: string;
  recentFiles?: RecentFileRecord[];
  recentFolders?: RecentFolderRecord[];
  selectedOneDrivePath?: string;
  autoOneDriveBackup?: boolean;
  oneDriveBackupIntervalMinutes?: number; // 背景備份間隔（分鐘）
  enablePeriodicBackup?: boolean; // 是否開啟長週期備份（日・週・月）
}

export interface NativeRoutePayload {
  path: string;
  is_directory: boolean;
}

export interface SystemIntegrationInfo {
  os: string; // 'windows' | 'macos' | 'linux'
  supports_context_menu: boolean;
  is_context_menu_enabled: boolean;
}
