/**
 * exportHelper.ts
 * 廣零散單一藥帖快速匯出與剪貼簿複製輔助工具 (Single Note Fast Export)
 */

import type { TabItem } from '../../types/tab';

/**
 * 清除檔名中的非法字元，確保跨平台下載相容
 */
function sanitizeFilename(title: string): string {
  const clean = (title || '未命名藥帖')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  return clean || '未命名藥帖';
}

/**
 * 觸發瀏覽器下載 Blob 物件
 */
function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 一鍵匯出當前藥帖為 Markdown (.md)
 */
export function exportTabAsMarkdown(tab: TabItem): void {
  const baseName = sanitizeFilename(tab.title);
  const filename = baseName.toLowerCase().endsWith('.md') ? baseName : `${baseName}.md`;
  triggerDownload(tab.content || '', filename, 'text/markdown');
}

/**
 * 一鍵匯出當前藥帖為純文字檔案 (.txt)
 */
export function exportTabAsText(tab: TabItem): void {
  const baseName = sanitizeFilename(tab.title).replace(/\.md$/i, '');
  const filename = `${baseName}.txt`;
  triggerDownload(tab.content || '', filename, 'text/plain');
}

/**
 * 一鍵複製藥帖乾淨 Markdown 內容至系統剪貼簿
 */
export async function copyTabMarkdown(tab: TabItem): Promise<boolean> {
  const text = tab.content || '';
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // 備援剪貼簿方案
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (err) {
    console.warn('複製藥帖 Markdown 失敗:', err);
    return false;
  }
}
