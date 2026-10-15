export type ShortcutCategory = 'global' | 'editor' | 'navigation';

export interface ShortcutItem {
  id: string;
  category: ShortcutCategory;
  label: string;
  description: string;
  keys: string[]; // 組合鍵分解陣列，例如 ['Ctrl', 'P']
  badge?: string; // 標籤，例如 '全域'、'編輯'、'模態'
}

export interface ShortcutGroup {
  category: ShortcutCategory;
  title: string;
  items: ShortcutItem[];
}
