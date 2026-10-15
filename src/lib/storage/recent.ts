import type { RecentFileRecord, RecentFolderRecord, SupportedLanguage } from '../../types/tab';

const RECENT_STORAGE_KEY = 'bamboo_saga_recent_v1';
const RECENT_FOLDERS_STORAGE_KEY = 'bamboo_saga_recent_folders_v1';
const MAX_RECENT_ITEMS = 20;
const MAX_RECENT_FOLDERS = 15;

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

// -------------------------------------------------------------
// 常用與歷史資料夾 (Recent & Pinned Folders) 管理
// -------------------------------------------------------------

function sortFolders(list: RecentFolderRecord[]): RecentFolderRecord[] {
  return list.sort((a, b) => {
    // 釘選的優先排在最前面
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    // 依最後開啟時間由新到舊
    return b.lastOpened - a.lastOpened;
  });
}

export function loadRecentFolders(): RecentFolderRecord[] {
  try {
    const raw = localStorage.getItem(RECENT_FOLDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sortFolders(parsed) : [];
  } catch (e) {
    console.error('[Recent] Failed to load recent folders:', e);
    return [];
  }
}

export function saveRecentFolders(folders: RecentFolderRecord[]): void {
  try {
    localStorage.setItem(
      RECENT_FOLDERS_STORAGE_KEY,
      JSON.stringify(folders.slice(0, MAX_RECENT_FOLDERS))
    );
  } catch (e) {
    console.error('[Recent] Failed to save recent folders:', e);
  }
}

/**
 * 記錄或更新開啟過的資料夾
 */
export function recordFolderOpened(folderPath: string): RecentFolderRecord[] {
  if (!folderPath) return loadRecentFolders();
  const current = loadRecentFolders();
  const existing = current.find((f) => f.path === folderPath);
  const isPinned = existing ? existing.isPinned : false;
  const filtered = current.filter((f) => f.path !== folderPath);

  // 提取資料夾名稱
  const folderName = folderPath.split(/[/|\\]/).filter(Boolean).pop() || folderPath;

  const newRecord: RecentFolderRecord = {
    path: folderPath,
    name: folderName,
    lastOpened: Date.now(),
    isPinned,
  };

  const updated = sortFolders([newRecord, ...filtered]).slice(0, MAX_RECENT_FOLDERS);
  saveRecentFolders(updated);
  return updated;
}

/**
 * 切換釘選/常用狀態
 */
export function togglePinFolder(folderPath: string): RecentFolderRecord[] {
  const current = loadRecentFolders();
  const target = current.find((f) => f.path === folderPath);
  if (!target) return current;

  target.isPinned = !target.isPinned;
  const sorted = sortFolders(current);
  saveRecentFolders(sorted);
  return sorted;
}

/**
 * 移除指定的歷史資料夾
 */
export function removeRecentFolder(folderPath: string): RecentFolderRecord[] {
  const current = loadRecentFolders();
  const filtered = current.filter((f) => f.path !== folderPath);
  saveRecentFolders(filtered);
  return filtered;
}

export function clearRecentFolders(): void {
  try {
    localStorage.removeItem(RECENT_FOLDERS_STORAGE_KEY);
  } catch (e) {
    console.error('[Recent] Failed to clear recent folders:', e);
  }
}
