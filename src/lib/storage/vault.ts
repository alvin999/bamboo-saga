import { AppState, TabItem, VimKeyOverrides, AlchemyCardConfig, LayoutConfig } from '../../types/tab';

const STORAGE_KEY = 'bamboo_saga_vault_v1';

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  workbenchWidth: 'zen',
  autoDiffOnAi: true,
  scrollSync: true,
  smearCursor: true,
  fontSize: '14px',
  typewriterMode: false,
  zenFocusMode: false,
};

export function getDefaultLayoutConfig(): LayoutConfig {
  return { ...DEFAULT_LAYOUT_CONFIG };
}

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
    desc: '智能識別內容脈絡，自動提煉核心綱領與結構化要點',
    colorTag: 'cinnabar',
    systemPrompt: `你是一位敏銳且擅長知識提煉的結構化筆記師。請分析以下文字或速記片段，判斷其核心情境，並重整為層次分明、版面優雅的 Markdown 結構：

1. 【🎯 核心概要】：以精煉 1-3 句話提煉精髓或最高決策
2. 【📐 關鍵內涵】：依據內容屬性，自行劃分 2-4 個邏輯段落（例如：架構重點、問題根因、技術規格或論點分析）
3. 【⚡ 待辦與推進項目 (Action Items)】：若內容包含待辦或下一步，請以 Markdown 清單「- [ ]」輸出；若無明確行動，則列出 1-3 點潛在延伸評估

【排版與渲染規範】：
- 請一律以正體/繁體中文（台灣習慣用語）輸出。
- 重點段落標題請保留【】中文括號以觸發編輯器琥珀金高亮標籤。
- 若出現程式碼、指令或設定檔，請務必使用標準三重反引號並標明語言標籤（如 \`\`\`ts、\`\`\`python、\`\`\`json、\`\`\`sql）。
- 若提及關鍵度量衡數值（如 99.8%、42ms、16px、120ops/s）或關鍵專案術語，請保留精確數據格式以利編輯器智慧染色。

原始內容如下：
`,
  },
  action_items: {
    id: 'action_items',
    tag: '[ 02 // 析理 ]',
    title: '待辦矩陣化',
    desc: '識別行動項目與隱含任務，建立層次化排程清單',
    colorTag: 'ochre',
    systemPrompt: `請仔細分析以下筆記內容，提取出所有明確與隱含的待辦任務（Action Items），並以 Markdown 核取清單格式整理。

【排版與渲染規範】：
- 輸出格式請嚴格使用「- [ ] 任務名稱（標記負責人、預計時間或關鍵模組，若有）」。
- 善用警示藥囊標籤區分優先順序與性質（例如以 URGENT: 標示高急迫度任務、FIXME: 標示瑕疵修復、TODO: 標示常規任務）。
- 分組標題請使用【】括號（例如【🔥 今日緊急 URGENT】、【📌 本週待辦 TODO】、【💡 後續追蹤】）。
- 請一律以正體/繁體中文輸出，語意精準扼要。

原始筆記內容如下：
`,
  },
  code_refactor: {
    id: 'code_refactor',
    tag: '[ 03 // 淨心 ]',
    title: '代碼語法補正',
    desc: '排版校對、Markdown 標籤補齊與智能命名對齊',
    colorTag: 'olive',
    systemPrompt: `請針對選取的程式碼或文字片段，校對語法與排版、補齊 Markdown 格式標籤並進行智能命名對齊。保持原始程式碼或文字邏輯不變。

【排版與渲染規範】：
- 程式碼區塊必須使用標準 Markdown 語法封裝，且必須在首行反引號後明確標明語言名稱（例如 \`\`\`ts、\`\`\`javascript、\`\`\`python、\`\`\`json、\`\`\`sql、\`\`\`bash 等），不可省略語言標籤。
- 行內變數或單詞若屬代碼引用，請使用單個反引號包裹。
- 若為修復或重構，可於區塊上方簡要標示【重構說明】或以 // 或 # 註解說明重構關鍵理由。
- 輸出以繁體中文與標準規範代碼呈現。

內容如下：
`,
  },
};

export function getDefaultVimOverrides(): VimKeyOverrides {
  return { ...DEFAULT_VIM_OVERRIDES };
}

export function getDefaultAlchemyCards(): Record<string, AlchemyCardConfig> {
  return JSON.parse(JSON.stringify(DEFAULT_ALCHEMY_CARDS));
}

export const INITIAL_WELCOME_CONTENT = `# ![廣零散](/bamboo.svg) 廣零散 (bamboo-saga)
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

### 6. 🖼️ 丹青靈圖行內即顯 (Markdown Image Live Preview)
<!-- 
  💡 圖片插入心法：
  在筆記中寫入標準 Markdown 圖片語法，即可原地即時顯影；游標移入時自動展開原始碼方便修改：
  - 語法：![圖片說明](圖片網址或本機路徑)
  - 範例：![丹道靈竹](/bamboo.svg)
-->
- 支援專案圖資、網路圖片或截圖貼上：
![丹道靈竹](/bamboo.svg)

---

### 7. ⚡ 丹方煉製進度 (Markdown Alchemy Checklist)
- [x] 神識不滅秒存（無須 Ctrl+S 施法，字字入骨，縱遭天劫重啟亦不滅）
- [x] 洞悉純文字五行智慧染色異象
- [ ] 催動頂部「✨ 煉丹」陣眼，一鍵將凌亂藥渣提煉為純陽極品丹方

---

### 8. 🛡️ 機敏資訊防護濾網 (Sanitizer Guard & Privacy Shield)
廣零散落實 Zero-Trust 零信任本機私密防護，語意職責各司其職：

1. **全篇私密標籤 (\`#private\`)**：
   - 只要藥帖內任何一處標註 \`#private\`，這篇筆記便視為「全篇機密」。
   - 當您使用雲端 AI 煉丹或問道時，系統將**整篇直接攔截阻斷、絕不外流**！
   - （範例語法：\`#private\`）

2. **段落私密標籤 (\`#secret\`)**：
   - 若手稿大體為公開心得，僅某個段落涉及私人秘密，請在該段落加上 \`#secret\`。
   - 雲端 AI 煉丹時，**只有帶有 #secret 的該段落會被自動過濾排除**，其餘段落依然正常提煉！
   - （範例：這行記載了不可告人的丹方密碼 #secret ➔ 雲端傳送時該段自動變為 \`[REDACTED:SECRET_PARAGRAPH]\`）

3. **行內金鑰與密碼自動脫敏 (Automatic Inline Redaction)**：
   - 手稿即使沒打任何標籤，凡出現常見金鑰、連線字串或個資，向外連 API 傳送前前端皆會**自動替換脫敏**：
   - 原始內容：\`openai_key = "sk-1234567890abcdefghijklmn..."\`
     ➔ 送給 AI 時自動脫敏為：\`openai_key = "[REDACTED:OPENAI_KEY]"\`
   - 原始內容：\`database_url = "postgres://admin:secret123@db.com/prod"\`
     ➔ 送給 AI 時自動脫敏為：\`database_url = "[REDACTED:DB_CONNECTION_URL]"\`
   - 原始內容：\`Taiwan ID: A123456789\`
     ➔ 送給 AI 時自動脫敏為：\`Taiwan ID: [REDACTED:TW_ID]\`

---

### 9. 🎋 竹林靜心與打字機模式 (True Zen Mode & Typewriter)
- 竹林靜心 (True Zen Mode)：敲擊 \`F11\` 或 \`Alt+Z\`，瞬間隱藏頂底欄，只留一卷清幽筆墨；按 \`Esc\` 隨時秒退。
- 打字機置中捲動 (Typewriter Scrolling)：輸入或移動游標時，始終將正在書寫的行保持於視線垂直居中位置，底部預留從容呼吸空間。可在「⚙️ 設定 -> 版面偏好」隨心開啟。

---

### 10. 🧹 行處理解藥包與雙向連結 (Text Tools & WikiLinks)
- 行處理解藥包：隨時按 \`Ctrl+Shift+T\`，一鍵去除重複行、清除空白行、中英混排 Markdown 表格自動對齊。
- 輕量雙向關聯 (WikiLinks)：支援 \`[[藥帖名稱]]\` 語法，手稿筆墨自然交織成網。

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
    language: 'markdown',
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
    layoutConfig: getDefaultLayoutConfig(),
    groqApiKey: '',
    geminiApiKey: '',
    selectedAiModel: 'gemini',
    selectedAiModelId: 'gemini-1.5-flash',
    securityMode: 'scheme_3_os_native',
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
    // 補齊可能缺失或校正過時的 selectedAiModelId 欄位
    if (!parsed.selectedAiModelId || parsed.selectedAiModelId === 'gemini-2.5-flash') {
      parsed.selectedAiModelId = parsed.selectedAiModel === 'groq' ? 'llama-3.3-70b-versatile' : 'gemini-1.5-flash';
    }
    if (!parsed.securityMode) {
      parsed.securityMode = 'scheme_3_os_native';
    }
    // 補齊可能缺失的 vimOverrides 欄位
    parsed.vimOverrides = {
      ...getDefaultVimOverrides(),
      ...(parsed.vimOverrides || {}),
    };
    // 補齊可能缺失的 alchemyCards 欄位
    if (!parsed.alchemyCards) {
      parsed.alchemyCards = getDefaultAlchemyCards();
    }
    // 補齊可能缺失的 layoutConfig 欄位
    if (!parsed.layoutConfig) {
      parsed.layoutConfig = getDefaultLayoutConfig();
    } else {
      parsed.layoutConfig = {
        ...DEFAULT_LAYOUT_CONFIG,
        ...parsed.layoutConfig,
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
