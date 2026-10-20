import type { VaultCave, VaultTreeNode, VaultFileEntry } from '../../types/tab';
import { loadRecentFolders } from './recent';

export const VAULT_CAVES_STORAGE_KEY = 'bamboo-saga-vault-caves';

/**
 * 跨平台標準化路徑（將反斜線統一轉為標準正斜線，去除末尾重複斜線）
 */
export function normalizePath(pathStr: string): string {
  if (!pathStr) return '';
  return pathStr.replace(/\\+/g, '/').replace(/\/+$/, '');
}

/**
 * 跨平台安全拼接路徑與檔名
 */
export function joinPaths(dir: string, file: string): string {
  const cleanDir = normalizePath(dir);
  const cleanFile = file.replace(/^[/\\]+/, '');
  return `${cleanDir}/${cleanFile}`;
}

/**
 * 檢查 child 是否為 parent 本身或是其子目錄路徑（具備大小寫與邊界斜線防護）
 */
export function isSubOrSamePath(parent: string, child: string): boolean {
  if (!parent || !child) return false;
  const p = normalizePath(parent).toLowerCase();
  const c = normalizePath(child).toLowerCase();
  if (p === c) return true;
  if (c.startsWith(p)) {
    const rem = c.slice(p.length);
    return rem.startsWith('/');
  }
  return false;
}

/**
 * 從目前已掃描的檔案與洞天清單中，高度精煉出本機已存在的「目錄骨架」（嚴格限制 Token 預算）
 * 1. 排除檔案，僅保留相異的資料夾路徑
 * 2. 依包含檔案數量排序，優先保留核心目錄（最多 25~35 個）
 * 3. 總文字量控制在約 150 Tokens 內
 */
export function extractDirectorySkeleton(
  files: VaultFileEntry[],
  caves: VaultCave[],
  maxCount = 35
): string[] {
  const dirSet = new Set<string>();
  const folderFrequency = new Map<string, number>();

  // 1. 從所有掃描到的實體檔案絕對路徑提取各層目錄
  for (const file of files) {
    if (!file.path) continue;
    const norm = normalizePath(file.path);
    const lastSlash = norm.lastIndexOf('/');
    if (lastSlash > 0) {
      const parentDir = norm.slice(0, lastSlash);
      folderFrequency.set(parentDir, (folderFrequency.get(parentDir) || 0) + 1);

      // 同步向上記錄一級父資料夾，確保專案或主題分類結構完整
      const secondLastSlash = parentDir.lastIndexOf('/');
      if (secondLastSlash > 2) {
        const grandParent = parentDir.slice(0, secondLastSlash);
        folderFrequency.set(grandParent, (folderFrequency.get(grandParent) || 0) + 1);
      }
    }
  }

  // 2. 優先選取真實包含檔案最多的深度子資料夾（最精準）
  const sortedDirs = Array.from(folderFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([dir]) => dir);

  for (const dir of sortedDirs) {
    if (dirSet.size >= maxCount - caves.length) break;
    dirSet.add(dir);
  }

  // 3. 納入所有洞天根目錄作為基準保底
  for (const cave of caves) {
    if (cave.path) {
      dirSet.add(normalizePath(cave.path));
    }
  }

  return Array.from(dirSet).slice(0, maxCount);
}

/**
 * 載入所有已授權的藏卷洞天
 * 若已存在設定（即使為空陣列），嚴格尊重使用者決定；僅在首度啟動且無資料時嘗試從舊版歷史遷移
 */
export function loadVaultCaves(fallbackDefaultPath?: string): VaultCave[] {
  try {
    const raw = localStorage.getItem(VAULT_CAVES_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[vaultCaves] 讀取藏卷洞天失敗：', err);
  }

  // 首度啟動若有既有歷史，溫和遷移一次
  const existingFolders = loadRecentFolders();
  const caves: VaultCave[] = existingFolders.map((f, idx) => ({
    id: `cave-${idx}-${Date.now()}`,
    name: f.name || f.path.split(/[/|\\]/).filter(Boolean).pop() || `洞天 ${idx + 1}`,
    path: f.path,
    lastOpened: f.lastOpened || Date.now(),
    isPinned: f.isPinned ?? (idx === 0),
  }));

  if (caves.length > 0) {
    saveVaultCaves(caves);
  }

  return caves;
}

/**
 * 儲存藏卷洞天清單
 */
export function saveVaultCaves(caves: VaultCave[]): void {
  try {
    localStorage.setItem(VAULT_CAVES_STORAGE_KEY, JSON.stringify(caves));
  } catch (err) {
    console.error('[vaultCaves] 儲存藏卷洞天失敗：', err);
  }
}

/**
 * 新增或更新藏卷洞天
 */
export function addVaultCave(folderPath: string, customName?: string): VaultCave[] {
  if (!folderPath) return loadVaultCaves();
  const current = loadVaultCaves();
  const existingIdx = current.findIndex((c) => c.path === folderPath);

  const defaultName = customName?.trim() || folderPath.split(/[/|\\]/).filter(Boolean).pop() || '新洞天';

  if (existingIdx >= 0) {
    current[existingIdx].lastOpened = Date.now();
    if (customName) current[existingIdx].name = customName.trim();
    saveVaultCaves(current);
    return current;
  }

  const newCave: VaultCave = {
    id: `cave-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: defaultName,
    path: folderPath,
    lastOpened: Date.now(),
    isPinned: current.length === 0, // 第一個預設釘選
  };

  const updated = [newCave, ...current];
  saveVaultCaves(updated);
  return updated;
}

/**
 * 切換洞天釘選狀態
 */
export function togglePinCave(folderPath: string): VaultCave[] {
  const current = loadVaultCaves();
  const target = current.find((c) => c.path === folderPath);
  if (!target) return current;

  target.isPinned = !target.isPinned;
  saveVaultCaves(current);
  return current;
}

/**
 * 重命名藏卷洞天
 */
export function renameCave(folderPath: string, newName: string): VaultCave[] {
  if (!newName.trim()) return loadVaultCaves();
  const current = loadVaultCaves();
  const target = current.find((c) => c.path === folderPath);
  if (!target) return current;

  target.name = newName.trim();
  saveVaultCaves(current);
  return current;
}

/**
 * 移除藏卷洞天
 */
export function removeVaultCave(folderPath: string): VaultCave[] {
  const current = loadVaultCaves();
  const filtered = current.filter((c) => c.path !== folderPath);
  saveVaultCaves(filtered);
  return filtered;
}

/**
 * 將掃描取得的扁平檔案清單構建成目錄樹狀結構
 */
export function buildCaveTree(files: VaultFileEntry[], cave: VaultCave): VaultTreeNode {
  const rootNode: VaultTreeNode = {
    id: cave.path,
    name: cave.name,
    path: cave.path,
    rel_path: '',
    isFolder: true,
    children: [],
    caveName: cave.name,
    cavePath: cave.path,
  };

  for (const file of files) {
    // 根據 rel_path (例如 "Frontend/Svelte/note.md" 或 "note.md") 切割層級
    const normalizedRel = file.rel_path.replace(/\\/g, '/');
    const segments = normalizedRel.split('/').filter(Boolean);

    let current = rootNode;
    let accumulatedPath = cave.path;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      accumulatedPath = `${accumulatedPath}/${seg}`.replace(/\/+/g, '/');

      if (isLast) {
        // 檔案節點
        current.children = current.children || [];
        current.children.push({
          id: file.path,
          name: file.name,
          path: file.path,
          rel_path: file.rel_path,
          isFolder: false,
          extension: file.extension,
          size: file.size,
          modified: file.modified,
          preview: file.preview,
          caveName: cave.name,
          cavePath: cave.path,
        });
      } else {
        // 中間目錄節點
        current.children = current.children || [];
        let folderNode = current.children.find((c) => c.isFolder && c.name === seg);
        if (!folderNode) {
          folderNode = {
            id: accumulatedPath,
            name: seg,
            path: accumulatedPath,
            rel_path: segments.slice(0, i + 1).join('/'),
            isFolder: true,
            children: [],
            caveName: cave.name,
            cavePath: cave.path,
          };
          current.children.push(folderNode);
        }
        current = folderNode;
      }
    }
  }

  // 排序：資料夾排前面，檔案排後面，依名稱自然排序
  sortTreeNodeChildren(rootNode);

  return rootNode;
}

function sortTreeNodeChildren(node: VaultTreeNode) {
  if (!node.children || node.children.length === 0) return;

  node.children.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  for (const child of node.children) {
    if (child.isFolder) {
      sortTreeNodeChildren(child);
    }
  }
}

export interface FilterTreeResult {
  node: VaultTreeNode | null;
  matchCount: number;
}

/**
 * 樹狀搜尋過濾 (Tree Search)
 * 遞迴匹配節點名稱或預覽；若子孫節點有匹配，父層節點自動保留並返回
 */
export function filterTreeNode(node: VaultTreeNode, query: string): FilterTreeResult {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) {
    return { node, matchCount: countLeaves(node) };
  }

  const isSelfMatch =
    node.name.toLowerCase().includes(cleanQ) ||
    (!node.isFolder && !!node.preview && node.preview.toLowerCase().includes(cleanQ));

  if (!node.isFolder) {
    return isSelfMatch ? { node: { ...node }, matchCount: 1 } : { node: null, matchCount: 0 };
  }

  // 目錄節點：過濾子節點
  let totalMatches = isSelfMatch ? 1 : 0;
  const filteredChildren: VaultTreeNode[] = [];

  if (node.children) {
    for (const child of node.children) {
      const res = filterTreeNode(child, cleanQ);
      if (res.node) {
        filteredChildren.push(res.node);
        totalMatches += res.matchCount;
      }
    }
  }

  if (isSelfMatch || filteredChildren.length > 0) {
    return {
      node: {
        ...node,
        children: filteredChildren,
      },
      matchCount: totalMatches,
    };
  }

  return { node: null, matchCount: 0 };
}

function countLeaves(node: VaultTreeNode): number {
  if (!node.isFolder) return 1;
  if (!node.children || node.children.length === 0) return 0;
  return node.children.reduce((acc, c) => acc + countLeaves(c), 0);
}
