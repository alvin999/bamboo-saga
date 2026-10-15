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
  return { has_backup: false, backup_dir: '', markdown_files: [] };
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
