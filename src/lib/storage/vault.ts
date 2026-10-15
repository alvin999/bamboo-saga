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

歡迎踏入專為工程行者與修思筆耕打造的隨手丹室。
本藥帖竹簡記載了七曜五行之「純文字智慧染色」與「天地筆意渲染」：

---

### 1. 🟣 丹道火候與度量衡 (Metric & Fire Timing)
鼎爐時辰、淬火微秒與靈氣計量，凡入藥數值皆顯露紫羅蘭真火靈光：
- 溫爐與淬火：引地火溫爐需 42s，以無根水瞬息淬火僅需 42ms（心法感應 0.01ms）
- 吉時火候：於辰時 09:30 啟鼎投藥，至未時 14:30:00 文火化丹
- 丹成純度：九轉凝魂丹純度達 99.8%，結丹成功率 100%
- 乾坤鼎尺寸：頂蓋符文刻印 16px，聚靈法陣半徑 1.5rem
- 靈脈吐納：周天運轉吞吐達 1200ops/s，神識法眼映照平穩維持 60fps
- 靈石儲量：納戒靈石配額 512KB，丹霞靈氣精華 16MB，天道靈脈總藏 2.4GB

---

### 2. 🔴 丹劫警戒與炸爐避難 (Urgent & Warning Tokens)
爐溫失控或藥性相衝之時，天機自現珊瑚紅晶片符印，警醒丹師：
- URGENT: 丹劫紫雷將至，申時前須注滿本命真元護爐
- FIXME: 封堵乾坤鼎底座地火裂隙，避免靈氣洩漏
- TODO: 調配九葉重樓與天山雪蓮之陰陽相剋藥性
- BUG: 靈草採擷年份不足導致凝丹碎裂
- 宗門警示印鑑：[ERROR] 靈力逆流、[WARN] 爐溫偏高、[FATAL] 爐鼎將傾、[ACTION] 立即開爐

---

### 3. 🟢 祖師真言與修心密訣 (Quote & Wisdom)
歷代丹道長老心法真傳，自動點染草木綠之禪意生機：
- 丹尊有言：「心靜則神凝，火候存乎一心」
- 祖師遺訓：『採天地之靈氣，奪造化之玄機』
- 外邦梵音亦可通達："Spiritual Core Alchemy" 與 'Gruvbox Zen'

---

### 4. 🟡 藥帖百子櫃與陣法印記 (Brackets & Herbal Tags)
百子櫃抽屜標籤與陣法規格，自動鑲嵌包浩斯琥珀金符紋：
- 【天字號·洗髓丹】需以文火慢煨七七四十九日
- [兩儀四象聚靈陣 v2.5] 佈於鼎爐四周以固元氣
- (丹師密記：心浮氣躁者切莫強行啟爐)

---

### 5. 🔵 天機閣座標與通靈玉簡 (Links & Transmissions)
萬里傳音符陣與天機通達端點，化為青碧靈泉：
- 天機閣總壇：https://github.com
- 本地洞府傳訊陣眼：http://localhost:1420

---

### 6. ⚡ 丹方煉製進度 (Markdown Alchemy Checklist)
- [x] 神識不滅秒存（無須 Ctrl+S 施法，字字入骨，縱遭天劫重啟亦不滅）
- [x] 洞悉純文字五行智慧染色異象
- [ ] 催動頂部「✨ 煉丹」陣眼，一鍵將凌亂藥渣提煉為純陽極品丹方

\`\`\`javascript
// 丹道符咒亦與各門程式語言語法高亮無縫交融
function igniteFurnace() {
  const duration = "42ms"; // 即刻捕捉火候微秒
  console.log(\`丹成出爐，耗時 \${duration}\`);
}
\`\`\`

---
💡 **身法體驗**：試以方向鍵快速遊走於字句之間，親睹琥珀金御劍飛芒（Smear Cursor）之雙阻尼流體殘影！
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
