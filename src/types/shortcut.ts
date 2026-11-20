import type { VimKeyOverrides } from './tab';

export type ShortcutCategory = 'global' | 'vim' | 'editor' | 'navigation';

export type VimKeyOverrideToggle = Exclude<keyof VimKeyOverrides, 'imeAutoSwitch'>;

export interface ShortcutVimFallback {
  label: string;
  description: string;
  badge?: string;
}

export interface ShortcutItem {
  id: string;
  category: ShortcutCategory;
  label: string;
  description: string;
  keys: string[]; // 組合鍵分解陣列，例如 ['Ctrl', 'P']
  badge?: string; // 標籤，例如 '全域'、'編輯'、'Vim 原生'
  vimOverrideKey?: VimKeyOverrideToggle; // 對應 VimKeyOverrides 的衝突覆蓋開關
  vimActiveDescription?: string; // Vim 模式且啟用覆蓋時的補充說明
  vimNativeFallback?: ShortcutVimFallback; // Vim 模式且取消覆蓋時，移至 Vim 分組顯示的原生功能
}

export interface ShortcutGroup {
  category: ShortcutCategory;
  title: string;
  subtitle?: string;
  items: ShortcutItem[];
}
