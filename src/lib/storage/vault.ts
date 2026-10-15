import { AppState, TabItem, VimKeyOverrides, AlchemyCardConfig } from '../../types/tab';

const STORAGE_KEY = 'bamboo_saga_vault_v1';

export const DEFAULT_VIM_OVERRIDES: VimKeyOverrides = {
  ctrlS: true,
  ctrlC: true,
  ctrlV: true,
  ctrlA: true,
  ctrlF: true,
  imeWarning: true,
};

export const DEFAULT_ALCHEMY_CARDS: Record<string, AlchemyCardConfig> = {
  organize: {
    id: 'organize',
    tag: '[ 01 // 凝練 ]',
    title: '結構化結論',
    desc: '自動提煉會議要點、脈絡綱領與決策結論',
    colorTag: 'cinnabar',
    systemPrompt: `你是一位資深會議記錄與技術筆記整理師。請將以下零散速記（包含口語、中英夾雜、時間點或片段思緒），重整為清晰優雅的 Markdown 結構：
1. 【🎯 核心結論與決定事項】
2. 【📐 技術規格與討論細節】
3. 【⚡ 待辦清單與負責人 (Action Items)】（使用 - [ ] 格式）

原始速記內容如下：
`,
  },
  action_items: {
    id: 'action_items',
    tag: '[ 02 // 析理 ]',
    title: '待辦矩陣化',
    desc: '識別 TODO、FIXME 與行動項目，轉換為排程工單',
    colorTag: 'ochre',
    systemPrompt: `請仔細分析以下筆記內容，提取出所有明確與隱含的待辦任務（Action Items），並以 Markdown 核取清單格式整理：
- [ ] 任務名稱（標記負責人或預計時間，若有）

原始筆記內容如下：
`,
  },
  code_refactor: {
    id: 'code_refactor',
    tag: '[ 03 // 淨心 ]',
    title: '代碼語法補正',
    desc: '排版校對、Markdown 標籤補齊與智能命名對齊',
    colorTag: 'olive',
    systemPrompt: `請針對選取的程式碼或文字片段，校對語法與排版、補齊 Markdown 格式標籤並進行智能命名對齊。保持原始程式碼或文字邏輯不變。內容如下：
`,
  },
};

export function getDefaultVimOverrides(): VimKeyOverrides {
  return { ...DEFAULT_VIM_OVERRIDES };
}

export function getDefaultAlchemyCards(): Record<string, AlchemyCardConfig> {
  return JSON.parse(JSON.stringify(DEFAULT_ALCHEMY_CARDS));
}

export const INITIAL_WELCOME_CONTENT = `# 🎋 廣零散 (bamboo-saga)
> 「廣納零散思緒，一帖 AI 煉丹。」

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
    vimOverrides: getDefaultVimOverrides(),
    alchemyCards: getDefaultAlchemyCards(),
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
      parsed.vimOverrides = getDefaultVimOverrides();
    }
    // 補齊可能缺失的 alchemyCards 欄位
    if (!parsed.alchemyCards) {
      parsed.alchemyCards = getDefaultAlchemyCards();
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
