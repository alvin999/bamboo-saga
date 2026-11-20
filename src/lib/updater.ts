/**
 * 廣零散 (bamboo-saga) 自動更新服務
 * 整合 Tauri v2 官方 Updater 插件，支援最新版本檢查、簽章驗證、進度回報與重啟安裝
 */

import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
  updateHandle?: Update | null;
}

export const GITHUB_REPO = 'alvin999/bamboo-saga';
const AUTO_CHECK_UPDATE_STORAGE_KEY = 'bamboo_auto_check_update';

/**
 * 取得使用者是否允許啟動時自動檢查更新（預設 true）
 */
export function getAutoCheckUpdatePref(): boolean {
  try {
    const val = localStorage.getItem(AUTO_CHECK_UPDATE_STORAGE_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

/**
 * 設定使用者是否允許啟動時自動檢查更新
 */
export function setAutoCheckUpdatePref(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_CHECK_UPDATE_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('[Updater] 無法寫入更新設定到 localStorage:', err);
  }
}

/**
 * 比較兩組 SemVer 版本號 (例如 0.1.1 與 0.1.2)
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareSemver(v1: string, v2: string): number {
  const p1 = v1.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const p2 = v2.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * 取得目前應用程式版本號
 */
export async function getAppCurrentVersion(): Promise<string> {
  try {
    const v = await getVersion();
    return v.startsWith('v') ? v : `v${v}`;
  } catch {
    return 'v0.1.6';
  }
}

/**
 * 檢查是否有新版本：優先透過 Tauri 原生 Updater 檢查 latest.json，若在 Web/測試環境則備援使用 GitHub API
 */
export async function checkForAppUpdates(): Promise<VersionCheckResult> {
  const currentVer = await getAppCurrentVersion();

  // 1. 嘗試使用 Tauri v2 原生 updater
  try {
    const update = await check();
    if (update) {
      const latestTag = update.version.startsWith('v') ? update.version : `v${update.version}`;
      return {
        currentVersion: currentVer,
        latestVersion: latestTag,
        hasUpdate: true,
        releaseUrl: `https://github.com/${GITHUB_REPO}/releases/tag/${latestTag}`,
        releaseNotes: update.body || '發現新版本，包含性能改善與問題修正。',
        publishedAt: update.date ? new Date(update.date).toLocaleDateString() : '',
        updateHandle: update,
      };
    } else {
      return {
        currentVersion: currentVer,
        latestVersion: currentVer,
        hasUpdate: false,
        releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
        releaseNotes: '目前已是最新版本',
        publishedAt: '',
        updateHandle: null,
      };
    }
  } catch (tauriErr) {
    console.warn('[Updater] Tauri 原生更新檢查異常，降級至 GitHub API 備援:', tauriErr);
  }

  // 2. 備援方案：直接查詢 GitHub Releases API
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return {
          currentVersion: currentVer,
          latestVersion: currentVer,
          hasUpdate: false,
          releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
          releaseNotes: '目前已是最新版本',
          publishedAt: '',
          updateHandle: null,
        };
      }
      throw new Error(`GitHub API 回應代碼: ${res.status}`);
    }

    const data = await res.json();
    const latestTag: string = data.tag_name || '';
    const latest = latestTag.replace(/^v/, '');
    const current = currentVer.replace(/^v/, '');
    const hasUpdate = compareSemver(latest, current) > 0;

    return {
      currentVersion: currentVer,
      latestVersion: latestTag.startsWith('v') ? latestTag : `v${latestTag}`,
      hasUpdate,
      releaseUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases`,
      releaseNotes: data.body || '',
      publishedAt: data.published_at ? new Date(data.published_at).toLocaleDateString() : '',
      updateHandle: null,
    };
  } catch (fallbackErr) {
    console.error('[Updater] 版本檢查全數失敗:', fallbackErr);
    throw fallbackErr;
  }
}

export type DownloadProgressCallback = (downloaded: number, total: number | null) => void;

/**
 * 下載並安裝更新檔，支援即時進度監聽
 */
export async function downloadAndInstallUpdate(
  updateHandle: Update,
  onProgress?: DownloadProgressCallback,
): Promise<void> {
  let downloadedBytes = 0;
  let totalBytes: number | null = null;

  await updateHandle.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        totalBytes = event.data.contentLength ?? null;
        if (onProgress) onProgress(0, totalBytes);
        break;
      case 'Progress':
        downloadedBytes += event.data.chunkLength;
        if (onProgress) onProgress(downloadedBytes, totalBytes);
        break;
      case 'Finished':
        if (onProgress && totalBytes) onProgress(totalBytes, totalBytes);
        break;
    }
  });
}

/**
 * 重新啟動應用程式以完成更新
 */
export async function restartApp(): Promise<void> {
  await relaunch();
}
