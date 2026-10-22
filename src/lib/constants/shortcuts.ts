import type { ShortcutGroup } from '../../types/shortcut';

/**
 * 竹語系統快捷鍵總表（Single Source of Truth）
 * 與全域鍵盤監聽及設定視窗（按鍵偏好）保持雙向映射
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
      },
      {
        id: 'save_file',
        category: 'editor',
        label: '立即儲存 / 快照',
        description: '將更動寫入磁碟並自動壓製本地防重開機快照',
        keys: ['Ctrl', 'S'],
        badge: '編輯器',
      },
      {
        id: 'search_editor',
        category: 'editor',
        label: '內容搜尋',
        description: '於當前編輯檔案中全文比對搜尋關鍵字',
        keys: ['Ctrl', 'F'],
        badge: '編輯器',
      },
      {
        id: 'select_all',
        category: 'editor',
        label: '全選內容',
        description: '選取當前素簡的所有文字內容',
        keys: ['Ctrl', 'A'],
        badge: '編輯器',
      },
      {
        id: 'clipboard_copy',
        category: 'editor',
        label: '系統剪貼簿複製',
        description: '複製選取文字（Vim 模式下相容系統剪貼簿）',
        keys: ['Ctrl', 'C'],
        badge: '系統',
      },
      {
        id: 'clipboard_paste',
        category: 'editor',
        label: '系統剪貼簿貼上',
        description: '貼上文字（Vim 模式下相容系統剪貼簿）',
        keys: ['Ctrl', 'V'],
        badge: '系統',
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
