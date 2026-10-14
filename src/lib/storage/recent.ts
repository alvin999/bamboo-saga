import type { RecentFileRecord, SupportedLanguage } from '../../types/tab';

const RECENT_STORAGE_KEY = 'bamboo_saga_recent_v1';
const MAX_RECENT_ITEMS = 20;

export function loadRecentFiles(): RecentFileRecord[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[Recent] Failed to load recent files:', e);
    return [];
  }
}

export function saveRecentFiles(records: RecentFileRecord[]): void {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECENT_ITEMS)));
  } catch (e) {
    console.error('[Recent] Failed to save recent files:', e);
  }
}

/**
 * 記錄或更新檔案存取歷史（移至最前）
 */
export function recordFileOpened(item: {
  path: string;
  title: string;
  preview: string;
  language: SupportedLanguage;
  isLocalFile: boolean;
}): RecentFileRecord[] {
  const current = loadRecentFiles();
  // 移除已存在的同一筆路徑
  const filtered = current.filter((r) => r.path !== item.path);
  const newRecord: RecentFileRecord = {
    path: item.path,
    title: item.title,
    lastOpened: Date.now(),
    preview: item.preview.slice(0, 150),
    language: item.language,
    isLocalFile: item.isLocalFile,
  };

  const updated = [newRecord, ...filtered].slice(0, MAX_RECENT_ITEMS);
  saveRecentFiles(updated);
  return updated;
}

export function clearRecentFiles(): void {
  try {
    localStorage.removeItem(RECENT_STORAGE_KEY);
  } catch (e) {
    console.error('[Recent] Failed to clear recent files:', e);
  }
}
