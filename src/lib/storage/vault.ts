import { AppState, TabItem } from '../../types/tab';

const STORAGE_KEY = 'bamboo_saga_vault_v1';

export const INITIAL_WELCOME_CONTENT = `# 🎋 廣零散 (bamboo-saga)
> 「廣納零散思緒，一帖 AI 煉成丹。」

歡迎使用專為開發者與會議打造的隨手筆記工作台！

### ⚡ 核心亮點體驗：
1. 🛡️ **不滅記憶**：無需存檔（Ctrl+S），即使當機或重開機，字字句句與分頁 100% 原位還原。
2. 🎨 **純文字智慧染色**：
   - 🔴 警示：TODO: 修正連線池洩漏, FIXME: 檢查 NullPointerException, URGENT!
   - 🟢 發言：「產品經理表示下週需驗收」與 『核心里程碑』
   - 🟡 標籤：【認證模組】與 [API v2.5]
   - 🟣 數據：會議於 14:30 召開，響應時間 42ms，成功率 99.8%
   - 🔵 連結：https://github.com
3. ☄️ **Smear Cursor 殘影游標**：試著用方向鍵快速跳躍行或按快速鍵移動游標，感受 Gruvbox 橘金雙阻尼物理拖尾！
4. 🧪 **AI 煉丹爐 (Saga)**：點擊上方「✨ 煉丹」，自動將凌亂筆記提煉為結構化會議結論或待辦事項；並具備一鍵 Rollback 原稿保護機制！

---
隨手寫下你的思緒吧...
`;

export function createDefaultState(): AppState {
  const initialTab: TabItem = {
    id: 'tab-default-1',
    title: '藥帖一·竹簡手稿',
    content: INITIAL_WELCOME_CONTENT,
    language: 'plaintext',
    cursor: { line: 1, ch: 0 },
    lastModified: Date.now(),
    preAiSnapshot: null,
    isAiDraft: false,
  };

  return {
    activeTabId: initialTab.id,
    tabs: [initialTab],
    vimMode: false,
    vimOverrides: {
      ctrlS: true,
      ctrlC: true,
      ctrlV: true,
      ctrlA: true,
      ctrlF: true,
      imeWarning: true,
    },
    groqApiKey: '',
    geminiApiKey: '',
    selectedAiModel: 'gemini',
  };
}

export function loadVaultState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();

    const parsed: AppState = JSON.parse(raw);
    if (!parsed.tabs || parsed.tabs.length === 0) {
      return createDefaultState();
    }
    // 補齊可能缺失的 vimOverrides 欄位
    if (!parsed.vimOverrides) {
      parsed.vimOverrides = {
        ctrlS: true,
        ctrlC: true,
        ctrlV: true,
        ctrlA: true,
        ctrlF: true,
        imeWarning: true,
      };
    }
    return parsed;
  } catch (err) {
    console.error('[Vault] Failed to parse stored state, falling back to default:', err);
    return createDefaultState();
  }
}

// 毫秒級極速防抖/同步持久化
let saveTimeout: number | null = null;
export function saveVaultState(state: AppState, immediate = false) {
  const doSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('[Vault] Failed to persist state to storage:', err);
    }
  };

  if (immediate) {
    if (saveTimeout) clearTimeout(saveTimeout);
    doSave();
    return;
  }

  // 150ms 節流延遲，避免打字密集時過度寫入，但在視窗卸載前會強制 immediate
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(doSave, 120);
}
