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
