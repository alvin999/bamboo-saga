import type { ShortcutGroup, ShortcutItem } from '../../types/shortcut';
import type { VimKeyOverrides } from '../../types/tab';
import { getDefaultVimOverrides } from '../storage/vault';

/**
 * 竹語系統快捷鍵總表（Single Source of Truth）
 * 與全域鍵盤監聽、Vim 覆蓋設定及設定視窗（按鍵偏好）保持雙向映射
 */
export const DEFAULT_SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'global',
    title: '全域控制與跳轉',
    items: [
      {
        id: 'fuzzy_find',
        category: 'global',
        label: '全域模糊跳轉 / 助查',
        description: '快速搜尋藥帖筆記標題、檔案內容或調用 AI 意圖檢索',
        keys: ['Ctrl', 'P'],
        badge: '全域',
      },
      {
        id: 'ai_alchemy',
        category: 'global',
        label: 'AI 煉丹樞紐',
        description: '開啟 AI 意圖煉丹爐，執行心法生成與內容昇華',
        keys: ['Ctrl', 'K'],
        badge: '全域',
      },
      {
        id: 'inline_ai_prompt',
        category: 'global',
        label: '行內 AI 修煉指令',
        description: '呼叫浮動指令列，以自然語言快速改寫手稿並進入逐段對照審核',
        keys: ['Ctrl', 'I'],
        badge: '全域',
      },
      {
        id: 'ai_chat_drawer',
        category: 'global',
        label: 'AI 參謀問道抽屜',
        description: '拉開右側參謀抽屜進行多輪對話問答，可一鍵將成果送入對照審核 (支援 Alt+I 或 Ctrl+J)',
        keys: ['Alt', 'I'],
        badge: '全域',
      },
      {
        id: 'file_browser',
        category: 'global',
        label: '檔案總管抽屜',
        description: '展開或收合專案工作目錄與隨手藥帖資料庫',
        keys: ['Ctrl', 'B'],
        badge: '全域',
      },
      {
        id: 'local_history',
        category: 'global',
        label: '在地時光機 (歷史快照)',
        description: '檢視歷次修改快照，支援差分比對與時光回溯',
        keys: ['Alt', 'H'],
        badge: '全域',
      },
      {
        id: 'put_label',
        category: 'global',
        label: '標籤標註樞紐',
        description: '為當前隨手筆記打上分類與屬性標籤',
        keys: ['Alt', 'L'],
        badge: '全域',
      },
    ],
  },
  {
    category: 'editor',
    title: '編輯器與檔案操作',
    items: [
      {
        id: 'new_tab',
        category: 'editor',
        label: '添新簡 (新增分頁)',
        description: '建立一紙全新空白素簡分頁',
        keys: ['Ctrl', 'T'],
        badge: '分頁',
      },
      {
        id: 'close_tab',
        category: 'editor',
        label: '收合新簡 (關閉分頁)',
        description: '關閉當前素簡分頁（保留最少一張分頁）',
        keys: ['Ctrl', 'W'],
        badge: '分頁',
        vimOverrideKey: 'ctrlW',
        vimNativeFallback: {
          label: 'Vim 刪詞 / 視窗指令',
          description: 'Insert 模式刪除前一個單詞，Normal 模式為視窗前導鍵 (<C-w>)',
          badge: 'Vim 原生',
        },
      },
      {
        id: 'save_file',
        category: 'editor',
        label: '立即儲存 / 快照',
        description: '將更動寫入磁碟並自動壓製本地防重開機快照',
        keys: ['Ctrl', 'S'],
        badge: '編輯器',
        vimOverrideKey: 'ctrlS',
        vimNativeFallback: {
          label: 'Vim 原生保留鍵 (<C-s>)',
          description: '已保留給 Vim 原生行為，請改用 :w 指令進行存檔',
          badge: 'Vim 原生',
        },
      },
      {
        id: 'export_tab',
        category: 'editor',
        label: '藥帖快速匯出 (.md / .txt)',
        description: '快速下載當前藥帖為 Markdown 或純文字檔，或一鍵複製內容',
        keys: ['Ctrl', 'Shift', 'E'],
        badge: '匯出',
      },
      {
        id: 'search_editor',
        category: 'editor',
        label: '內容搜尋',
        description: '於當前編輯檔案中全文比對搜尋關鍵字',
        keys: ['Ctrl', 'F'],
        badge: '編輯器',
        vimOverrideKey: 'ctrlF',
        vimNativeFallback: {
          label: 'Vim 向下翻頁 (<C-f>)',
          description: '向下捲動一整頁，內容搜尋請改用 / 關鍵字',
          badge: 'Vim 原生',
        },
      },
      {
        id: 'replace_editor',
        category: 'editor',
        label: '內容搜尋與取代',
        description: '開啟編輯器尋卷取代列進行批次替換',
        keys: ['Ctrl', 'H'],
        badge: '編輯器',
        vimOverrideKey: 'ctrlH',
        vimNativeFallback: {
          label: 'Vim 退格刪字 (<C-h>)',
          description: 'Insert 模式向左刪除字元，Normal 模式向左移動游標',
          badge: 'Vim 原生',
        },
      },
      {
        id: 'select_all',
        category: 'editor',
        label: '全選內容',
        description: '選取當前素簡的所有文字內容',
        keys: ['Ctrl', 'A'],
        badge: '編輯器',
        vimOverrideKey: 'ctrlA',
        vimActiveDescription: 'Normal/Visual 模式自動轉為 ggVG 行選取，Insert 模式執行全選',
        vimNativeFallback: {
          label: 'Vim 游標數字遞增 (<C-a>)',
          description: '將游標所在位置或後方最近的數字加 1',
          badge: 'Vim 原生',
        },
      },
      {
        id: 'clipboard_copy',
        category: 'editor',
        label: '系統剪貼簿複製',
        description: '複製選取文字至系統剪貼簿',
        keys: ['Ctrl', 'C'],
        badge: '系統',
        vimOverrideKey: 'ctrlC',
        vimActiveDescription: '有選取文字時複製至系統剪貼簿（無選取時放行）',
        vimNativeFallback: {
          label: 'Vim 中斷指令 (<C-c>)',
          description: '中斷當前操作或退出 Insert 模式',
          badge: 'Vim 原生',
        },
      },
      {
        id: 'clipboard_paste',
        category: 'editor',
        label: '系統剪貼簿貼上',
        description: '貼上系統剪貼簿文字內容',
        keys: ['Ctrl', 'V'],
        badge: '系統',
        vimOverrideKey: 'ctrlV',
        vimNativeFallback: {
          label: 'Vim 區塊選取 (<C-v>)',
          description: '進入 Visual Block 垂直矩形選取模式',
          badge: 'Vim 原生',
        },
      },
      {
        id: 'clipboard_cut',
        category: 'editor',
        label: '系統剪貼簿剪下',
        description: '剪下選取文字至系統剪貼簿',
        keys: ['Ctrl', 'X'],
        badge: '系統',
        vimOverrideKey: 'ctrlX',
        vimActiveDescription: '有選取文字時剪下至系統剪貼簿（無選取時放行）',
        vimNativeFallback: {
          label: 'Vim 游標數字遞減 (<C-x>)',
          description: '將游標所在位置或後方最近的數字減 1',
          badge: 'Vim 原生',
        },
      },
    ],
  },
  {
    category: 'navigation',
    title: '彈窗與模態控制',
    items: [
      {
        id: 'close_modal',
        category: 'navigation',
        label: '關閉浮窗 / 退出',
        description: '關閉當前開啟的任何彈跳視窗、側抽屜或離開選取',
        keys: ['ESC'],
        badge: '模態',
      },
    ],
  },
];

/**
 * Vim 模式專屬指令與竹語客製操作清單
 */
export const VIM_CORE_SHORTCUTS: ShortcutItem[] = [
  {
    id: 'vim_mode_switch',
    category: 'vim',
    label: '進入編輯 / 返回 Normal',
    description: '於游標處或下一行進入 Insert 輸入模式，按 ESC 返回 Normal 模式',
    keys: ['i', 'a', 'o', 'ESC'],
    badge: '模態',
  },
  {
    id: 'vim_move_hjkl',
    category: 'vim',
    label: '基礎方向移動',
    description: 'Normal 模式下左 / 下 / 上 / 右移動游標',
    keys: ['h', 'j', 'k', 'l'],
    badge: '導覽',
  },
  {
    id: 'vim_word_line_nav',
    category: 'vim',
    label: '單詞與行首尾跳轉',
    description: '依序為下一單詞、上一單詞、跳至行首、跳至行尾',
    keys: ['w', 'b', '0', '$'],
    badge: '導覽',
  },
  {
    id: 'vim_file_nav',
    category: 'vim',
    label: '檔案首尾跳轉',
    description: 'gg 跳至檔案開頭，G 跳至檔案結尾',
    keys: ['gg', 'G'],
    badge: '導覽',
  },
  {
    id: 'vim_half_page_scroll',
    category: 'vim',
    label: '半頁捲動（竹語保留）',
    description: 'Normal 向上 / 下捲動半頁；Insert 模式為刪至行首 / 減少縮排',
    keys: ['Ctrl', 'U / D'],
    badge: '竹語保留',
  },
  {
    id: 'vim_visual_select',
    category: 'vim',
    label: 'Visual 選取模式',
    description: 'v 進入字元選取，V 進入整行選取',
    keys: ['v', 'V'],
    badge: '選取',
  },
  {
    id: 'vim_edit_yank_paste',
    category: 'vim',
    label: '刪行 / 複製 / 貼上',
    description: 'dd 刪除整行、yy 複製整行、p 於游標後方貼上',
    keys: ['dd', 'yy', 'p'],
    badge: '編輯',
  },
  {
    id: 'vim_undo_redo',
    category: 'vim',
    label: '復原與重做',
    description: 'u 復原上一步變更，Ctrl+R 重做已復原的操作',
    keys: ['u', 'Ctrl+R'],
    badge: '編輯',
  },
  {
    id: 'vim_search',
    category: 'vim',
    label: 'Vim 原生搜尋',
    description: '/ 輸入關鍵字向下搜尋，n / N 跳至下一個或上一個符合項',
    keys: ['/', 'n', 'N'],
    badge: '搜尋',
  },
  {
    id: 'vim_cmd_save',
    category: 'vim',
    label: 'Vim 命令列存檔',
    description: '於 Normal 模式輸入 :w 立即寫入磁碟並壓製快照',
    keys: [':w'],
    badge: '指令',
  },
  {
    id: 'vim_normal_backspace_del',
    category: 'vim',
    label: 'Normal 防誤刪保護',
    description: 'Normal 模式下 Backspace / Delete 僅左右移動一格，不刪除文字',
    keys: ['Backspace', 'Del'],
    badge: '竹語客製',
  },
];

/**
 * 依據目前編輯器模式與 VimKeyOverrides 設定動態組裝快捷鍵指南分組
 * - STD 模式：顯示標準預設分組
 * - VIM 模式：取消覆蓋的衝突鍵從「編輯器與檔案操作」隱藏，統一移至「Vim 模態與編輯指令」分組
 */
export function buildShortcutGroups(
  vimMode: boolean,
  vimOverrides?: VimKeyOverrides
): ShortcutGroup[] {
  const overrides = { ...getDefaultVimOverrides(), ...vimOverrides };

  if (!vimMode) {
    return DEFAULT_SHORTCUT_GROUPS.map((group) => ({
      ...group,
      items: [...group.items],
    }));
  }

  const vimNativeOverrides: ShortcutItem[] = [];
  const resultGroups: ShortcutGroup[] = [];

  for (const group of DEFAULT_SHORTCUT_GROUPS) {
    if (group.category !== 'editor') {
      resultGroups.push({
        ...group,
        items: [...group.items],
      });
      continue;
    }

    const activeEditorItems: ShortcutItem[] = [];
    for (const item of group.items) {
      if (item.vimOverrideKey && overrides[item.vimOverrideKey] === false && item.vimNativeFallback) {
        vimNativeOverrides.push({
          id: `${item.id}_vim_native`,
          category: 'vim',
          label: item.vimNativeFallback.label,
          description: item.vimNativeFallback.description,
          keys: [...item.keys],
          badge: item.vimNativeFallback.badge ?? 'Vim 原生',
        });
      } else {
        activeEditorItems.push({
          ...item,
          description: item.vimActiveDescription ?? item.description,
        });
      }
    }

    resultGroups.push({
      ...group,
      items: activeEditorItems,
    });
  }

  const imeHint =
    overrides.imeAutoSwitch !== false ? '輸入法防呆：已啟用' : '輸入法防呆：已停用';

  const vimGroup: ShortcutGroup = {
    category: 'vim',
    title: 'Vim 模態與編輯指令',
    subtitle: imeHint,
    items: [...vimNativeOverrides, ...VIM_CORE_SHORTCUTS],
  };

  // 將 Vim 分組插入於「全域控制與跳轉」之後，讓開啟 Vim 模式時立即可見
  const globalIndex = resultGroups.findIndex((g) => g.category === 'global');
  if (globalIndex >= 0) {
    resultGroups.splice(globalIndex + 1, 0, vimGroup);
  } else {
    resultGroups.unshift(vimGroup);
  }

  return resultGroups;
}
