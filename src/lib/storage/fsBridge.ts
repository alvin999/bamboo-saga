import { invoke } from '@tauri-apps/api/core';
import type { VaultFileEntry } from '../../types/tab';

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

/**
 * 呼叫原生資料夾選取對話盒
 */
export async function pickVaultFolder(): Promise<string | null> {
  if (isTauriEnvironment()) {
    try {
      const selected = await invoke<string | null>('pick_vault_folder');
      return selected;
    } catch (err) {
      console.error('[fsBridge] pick_vault_folder failed:', err);
      throw err;
    }
  }

  // 瀏覽器環境 Fallback: 使用 File System Access API (若支援)
  if ('showDirectoryPicker' in window) {
    try {
      const handle = await (window as any).showDirectoryPicker();
      return handle.name || 'Web 資料夾';
    } catch (err: any) {
      if (err.name === 'AbortError') return null;
      console.warn('[fsBridge] Web showDirectoryPicker error:', err);
    }
  }

  alert('目前瀏覽器環境不支援原生路徑讀取，請在桌面應用程式版中體驗完整功能。');
  return null;
}

/**
 * 高效掃描資料夾內的所有支援文字檔案與前 250 字摘要
 */
export async function scanVaultFolder(folderPath: string): Promise<VaultFileEntry[]> {
  if (isTauriEnvironment()) {
    try {
      const list = await invoke<VaultFileEntry[]>('scan_vault_folder', { folderPath });
      return list;
    } catch (err) {
      console.error('[fsBridge] scan_vault_folder failed:', err);
      throw err;
    }
  }

  return [];
}

/**
 * 跨洞天背景批次掃描本機實體檔案清單（具備母子資料夾去重優化與非同步並行執行）
 */
export async function scanMultipleVaultFolders(
  folderPaths: string[]
): Promise<Record<string, VaultFileEntry[]>> {
  if (isTauriEnvironment() && folderPaths.length > 0) {
    try {
      const map = await invoke<Record<string, VaultFileEntry[]>>(
        'scan_multiple_vault_folders',
        { folderPaths }
      );
      return map;
    } catch (err) {
      console.error('[fsBridge] scan_multiple_vault_folders failed:', err);
      throw err;
    }
  }

  return {};
}

export interface CavesCachePayload {
  timestamp: number;
  cache: Record<string, VaultFileEntry[]>;
}

/**
 * 載入原生磁碟持久化洞天快取（突破 LocalStorage 5MB 配額限制，支援數十萬卷秒級冷啟動）
 */
export async function loadCavesCache(): Promise<CavesCachePayload> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<CavesCachePayload>('load_caves_cache');
    } catch (err) {
      console.warn('[fsBridge] load_caves_cache failed:', err);
    }
  }
  return { timestamp: 0, cache: {} };
}

/**
 * 儲存原生磁碟持久化洞天快取
 */
export async function saveCavesCache(cache: Record<string, VaultFileEntry[]>): Promise<number> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<number>('save_caves_cache', { cache });
    } catch (err) {
      console.warn('[fsBridge] save_caves_cache failed:', err);
    }
  }
  return Date.now();
}

/**
 * 讀取本機實體檔案文字
 */
export async function readVaultFile(filePath: string): Promise<string> {
  if (isTauriEnvironment()) {
    return await invoke<string>('read_vault_file', { filePath });
  }
  throw new Error('Web 預覽環境不支援讀取本機實體路徑檔案');
}

/**
 * 寫入本機實體檔案文字
 */
export async function writeVaultFile(filePath: string, content: string): Promise<void> {
  if (isTauriEnvironment()) {
    await invoke<void>('write_vault_file', { filePath, content });
    return;
  }
  console.warn('[fsBridge] 瀏覽器環境無法直接寫入本機檔案:', filePath);
}

export interface ExternalFileChangePayload {
  path: string;
  content: string;
}

/**
 * 更新 Rust 後端目前需即時監聽的外部檔案路徑清單
 */
export async function setWatchedFiles(files: string[]): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      await invoke<void>('set_watched_files', { files });
    } catch (err) {
      console.warn('[fsBridge] set_watched_files failed:', err);
    }
  }
}

/**
 * 自動探測 Windows 系統環境變數中的 OneDrive 個人版與企業/組織版帳號
 */
export async function detectOneDriveAccounts(): Promise<import('../../types/tab').OneDriveAccountInfo[]> {
  if (isTauriEnvironment()) {
    try {
      const accounts = await invoke<import('../../types/tab').OneDriveAccountInfo[]>('detect_onedrive_accounts');
      return accounts;
    } catch (err) {
      console.error('[fsBridge] detect_onedrive_accounts failed:', err);
      return [];
    }
  }
  return [];
}

/**
 * 執行一鍵備份至選定的 OneDrive 目錄
 */
export async function backupVaultToOneDrive(params: {
  onedriveFolderPath: string;
  vaultJson: string;
  markdownFiles: Array<{ file_name: string; content: string }>;
  enablePeriodic?: boolean;
}): Promise<import('../../types/tab').BackupResult> {
  if (isTauriEnvironment()) {
    return await invoke<import('../../types/tab').BackupResult>('backup_vault_to_onedrive', {
      onedriveFolderPath: params.onedriveFolderPath,
      vaultJson: params.vaultJson,
      markdownFiles: params.markdownFiles,
      enablePeriodic: params.enablePeriodic ?? true,
    });
  }
  throw new Error('瀏覽器預覽環境不支援原生 OneDrive 備份寫入');
}

/**
 * 檢查 OneDrive 目錄下的備份概況（是否有 latest_vault_state.json 與 Markdown 檔案清單）
 */
export async function checkOneDriveBackup(onedriveFolderPath: string): Promise<import('../../types/tab').OneDriveBackupOverview> {
  if (isTauriEnvironment()) {
    return await invoke<import('../../types/tab').OneDriveBackupOverview>('check_onedrive_backup', {
      onedriveFolderPath,
    });
  }
  return { has_backup: false, backup_dir: '', markdown_files: [], periodic_backups: [] };
}

/**
 * 讀取 OneDrive 目錄下 latest_vault_state.json 或指定日/週/月週期性備份檔案內容
 */
export async function readOneDriveBackupJson(onedriveFolderPath: string, customFilePath?: string): Promise<string> {
  if (isTauriEnvironment()) {
    return await invoke<string>('read_onedrive_backup_json', {
      onedriveFolderPath,
      customFilePath: customFilePath || null,
    });
  }
  throw new Error('非桌面環境無法讀取本機備份');
}

/**
 * 在作業系統檔案總管 (Windows Explorer / macOS Finder) 中開啟特定目錄
 */
export async function openInSystemExplorer(folderPath: string): Promise<void> {
  if (isTauriEnvironment()) {
    await invoke<void>('open_in_system_explorer', { folderPath });
  }
}

/**
 * 取得冷啟動時由 Windows / macOS / Linux 傳入的啟動目標（檔案或目錄）
 */
export async function getInitialRouteTarget(): Promise<import('../../types/tab').NativeRoutePayload | null> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<import('../../types/tab').NativeRoutePayload | null>('get_initial_route_target');
    } catch (err) {
      console.warn('[fsBridge] get_initial_route_target failed:', err);
      return null;
    }
  }
  return null;
}

/**
 * 查詢當前作業系統平台與系統整合相容性（Windows 右鍵登錄檔狀態等）
 */
export async function getSystemIntegrationInfo(): Promise<import('../../types/tab').SystemIntegrationInfo> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<import('../../types/tab').SystemIntegrationInfo>('get_system_integration_info');
    } catch (err) {
      console.warn('[fsBridge] get_system_integration_info failed:', err);
    }
  }
  return {
    os: 'web',
    supports_context_menu: false,
    is_context_menu_enabled: false,
  };
}

/**
 * 切換 Windows 滑鼠右鍵選單「用 廣零散 收入藥帖」整合（操作 HKCU 登錄檔，免 UAC 權限）
 */
export async function toggleWindowsContextMenu(enable: boolean): Promise<boolean> {
  if (isTauriEnvironment()) {
    return await invoke<boolean>('toggle_windows_context_menu', { enable });
  }
  throw new Error('此功能僅限桌面應用程式環境執行');
}

/**
 * 3.6 軟刪除：將檔案安全移至系統資源回收桶 (Recycle Bin / Trash)
 */
export async function trashVaultFile(filePath: string): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      await invoke('trash_vault_file', { filePath });
      return true;
    } catch (err) {
      console.error('[fsBridge] trash_vault_file failed:', err);
      throw err;
    }
  }
  throw new Error('瀏覽器預覽環境不支援原生資源回收桶操作');
}

