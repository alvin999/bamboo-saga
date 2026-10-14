export type SnapshotReason = 'typing' | 'save' | 'pre-ai' | 'post-ai' | 'label' | 'external' | 'initial';

export interface HistorySnapshot {
  id: string; // 唯一識別碼 (UUID 或 timestamp-random)
  fileKey: string; // 分頁 ID 或 實體檔案路徑 (用於跨工作階段聚合同一筆記)
  title: string; // 筆記/檔案標題
  timestamp: number; // 建立時間戳記
  content: string; // 完整文字內容
  charCount: number; // 字元數
  lineCount: number; // 行數
  reason: SnapshotReason; // 觸發原因
  label?: string; // 使用者手動自訂標籤 (如 "Put Label...")
  summary?: string; // 變更摘要 (如 "+12 -4 行")
}

export type DiffChangeType = 'unchanged' | 'added' | 'removed' | 'modified';

export interface DiffLine {
  type: DiffChangeType;
  oldLineNumber?: number;
  newLineNumber?: number;
  text: string;
}

export interface DiffComparisonResult {
  lines: DiffLine[];
  additions: number;
  deletions: number;
  hasChanges: boolean;
}
