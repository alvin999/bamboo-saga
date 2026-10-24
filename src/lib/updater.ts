/**
 * 廣零散 (bamboo-saga) 輕量化版本更新檢查服務 (階段 1)
 * 透過 GitHub Releases API 直接查詢最新發佈版本
 */

export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
}

export const CURRENT_VERSION = 'v0.1.0';
export const GITHUB_REPO = 'alvin999/bamboo-saga';

/**
 * 比較兩組 SemVer 版本號 (例如 0.1.0 與 0.1.1)
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
 * 檢查 GitHub 上是否有新版本
 */
export async function checkForAppUpdates(): Promise<VersionCheckResult> {
  const current = CURRENT_VERSION.replace(/^v/, '');
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        // 尚未有任何 Release 時
        return {
          currentVersion: CURRENT_VERSION,
          latestVersion: CURRENT_VERSION,
          hasUpdate: false,
          releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
          releaseNotes: '目前已是最新版本',
          publishedAt: '',
        };
      }
      throw new Error(`GitHub API 回應代碼: ${res.status}`);
    }

    const data = await res.json();
    const latestTag: string = data.tag_name || '';
    const latest = latestTag.replace(/^v/, '');

    const hasUpdate = compareSemver(latest, current) > 0;

    return {
      currentVersion: CURRENT_VERSION,
      latestVersion: latestTag.startsWith('v') ? latestTag : `v${latestTag}`,
      hasUpdate,
      releaseUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases`,
      releaseNotes: data.body || '',
      publishedAt: data.published_at ? new Date(data.published_at).toLocaleDateString() : '',
    };
  } catch (err: any) {
    console.warn('[Updater] 版本檢查失敗:', err);
    throw err;
  }
}
