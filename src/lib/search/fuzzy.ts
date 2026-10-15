import Fuse from 'fuse.js';
import type { TabItem, VaultFileEntry, RecentFileRecord } from '../../types/tab';

export interface UnifiedSearchItem {
  id: string;
  type: 'tab' | 'vault_file' | 'recent' | 'action';
  title: string;
  subtitle: string;
  path?: string;
  preview: string;
  language?: string;
  lastModified?: number;
  actionId?: string;
  // 原始參照
  tabRef?: TabItem;
  vaultRef?: VaultFileEntry;
  recentRef?: RecentFileRecord;
}

export const DEMO_ACTION_ITEM: UnifiedSearchItem = {
  id: 'action-create-demo-tab',
  type: 'action',
  title: '[示範] 建立煉丹渲染展示手稿',
  subtitle: '⚡ 動作命令 · 建立包含 42ms/42s、火候度量衡與完整智慧染色的展示藥帖',
  preview: '鼎爐時辰、淬火微秒與靈氣計量，包含 42ms、42s、警示膠囊、引文口訣、百子櫃標籤與程式碼高亮等全功能渲染展示',
  actionId: 'create-demo-tab',
};

export function buildSearchIndex(
  tabs: TabItem[],
  vaultFiles: VaultFileEntry[],
  recentFiles: RecentFileRecord[]
): Fuse<UnifiedSearchItem> {
  const items: UnifiedSearchItem[] = [DEMO_ACTION_ITEM];

  // 1. 現有開啟中的分頁
  for (const t of tabs) {
    items.push({
      id: `tab-${t.id}`,
      type: 'tab',
      title: t.title,
      subtitle: t.filePath ? `[已綁定] ${t.filePath}` : '百子櫃分頁',
      path: t.filePath,
      preview: t.content.slice(0, 300),
      language: t.language,
      lastModified: t.lastModified,
      tabRef: t,
    });
  }

  // 2. 本機資料夾中的實體檔案
  for (const vf of vaultFiles) {
    // 若該檔案已經在開啟分頁中，標記避免混淆
    const isOpened = tabs.some((t) => t.filePath === vf.path);
    items.push({
      id: `vault-${vf.path}`,
      type: 'vault_file',
      title: vf.name,
      subtitle: vf.rel_path + (isOpened ? ' (已開啟)' : ''),
      path: vf.path,
      preview: vf.preview,
      language: vf.extension,
      lastModified: vf.modified * 1000,
      vaultRef: vf,
    });
  }

  // 3. 最近開啟（不在前面重覆路徑者）
  for (const rf of recentFiles) {
    if (!items.some((i) => i.path === rf.path)) {
      items.push({
        id: `recent-${rf.path}`,
        type: 'recent',
        title: rf.title,
        subtitle: `🕒 最近開啟 · ${rf.path}`,
        path: rf.path,
        preview: rf.preview,
        language: rf.language,
        lastModified: rf.lastOpened,
        recentRef: rf,
      });
    }
  }

  const fuse = new Fuse(items, {
    keys: [
      { name: 'title', weight: 0.6 },
      { name: 'subtitle', weight: 0.2 },
      { name: 'preview', weight: 0.2 },
    ],
    threshold: 0.45,
    includeMatches: true,
    minMatchCharLength: 1,
    shouldSort: true,
  });

  return fuse;
}
