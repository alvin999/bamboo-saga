# 🎋 廣零散 (bamboo-saga)

> **「廣納零散思緒，一帖 AI 成丹。」**  
> *Scatter thoughts on bamboo slips; forge an immortal saga with AI.*

**《廣零散 (bamboo-saga)》** 是一款專為開發者與高頻率會議工作者打造的**跨平台極輕量隨手筆記工作台（Scratchpad Hub）**。  
不綁定專案資料夾、完美相容中文注音輸入法（IME），結合 **Gruvbox 中藥百子櫃復古配色**、**Smear Cursor 絲滑殘影游標**、**旗艦級防重開機秒存機制**，以及支援**安全預覽與一鍵回溯（Rollback）的 Groq / Gemini 雙引擎 AI 整理師**。

---

## 📖 命名典故與設計哲學

* **廣零散 (Guang-Ling-San)**：
  * **典故諧音**：取自竹林七賢嵇康之千古絕響《廣陵散》。轉化為「**廣**納**零散**筆記」之意，專治開會、視訊、看 Log 時無處安放的碎片化思緒。
  * **中藥鋪意象**：「散」即傳統中藥散劑。搭配 **Gruvbox Dark** 深褐、暗黃、橘紅、草綠的暖色調，讓每個分頁（散帖）宛如老藥鋪裡的木頭百子櫃；透過 AI 提煉重點的過程則稱為「**收散成丹**」。
* **bamboo-saga**：
  * **Bamboo（竹林 / 竹簡）**：致敬竹林七賢（*Seven Sages of the Bamboo Grove*），亦象徵古人隨手刻寫記事的「竹簡」。
  * **Saga（傳奇史詩 / 分散式長事務模式）**：將每一場漫長曲折的會議或除錯紀錄化為一篇 Saga；同時致敬軟體架構中的 **Saga Pattern**——具備強大的狀態持久化與補償回滾（Rollback）機制，無論系統遭遇任何強制更新或斷電重開，筆記狀態永遠保持最終一致性。

---

## ✨ 專案必備核心功能 (Core Features)

### 1. 🛡️ 旗艦級「防重開機」狀態記憶 (Immortal Persistence)
* **無檔案負擔（Zero-File Overhead）**：不需綁定專案目錄、不需手動按 `Ctrl+S` 取檔名，點開即寫。
* **毫秒級硬碟持久化**：每一次鍵盤敲擊與注音落地，皆於底層即時同步寫入本地儲存空間（Local Vault / SQLite）。
* **全狀態還原**：遭遇 Windows 強制更新重開機、當機或意外關閉時，重新開啟後 100% 原地還原所有開啟的分頁內容、分頁順序、語言模式與**游標所在座標**。

### 2. 🎨 Gruvbox 百子櫃主題 & 即時智慧解析高亮 (Smart Highlighting)
* **純正 Gruvbox Dark 美學**：全介面至程式碼語法樹皆採用 Gruvbox 護眼暖色調。
* **多程式語言 Tree-sitter / Lezer 解析**：原生支援 Markdown、JavaScript/TypeScript、Python、SQL、JSON 等語法高亮與一鍵排版。
* **純文字智慧染色（Smart Plain-Text Tokenizer）**：即使在未指定語言的純文字速記模式下，仍會透過即時正則標記器自動高亮會議關鍵資訊：
  * 🔴 **警示與待辦**：`TODO`、`FIXME`、`BUG`、`ERROR`、`URGENT`、`ACTION`
  * 🟢 **引號與發言**：「中文引號」、『重點』、`"English Strings"`
  * 🟡 **括號與備註**：`()`、`[]`、【系統模組標籤】
  * 🟣 **數據與指標**：時間戳記（如 `10:30`）、效能數據（`3000ms`、`99%`、數字）
  * 🔵 **超連結**：`http://`、`https://` 網址自動標示

### 3. 🧪 智慧 AI 煉丹爐：整理、問答與安全回溯機制 (AI Refine & Rollback)
同時串接 **Groq API**（LPU 極速推論，0.5 秒內回應）與 **Gemini API**（長文本深度整理），並提供**零風險的審核與回溯（Transaction Rollback）機制**：
* **避免輸入干擾**：摒棄干擾中文打字思緒的行內灰色預測字（Ghost Text），改為主動觸發式處理。
* **三大煉丹模式**：
  1. **✨ 收散成丹（會議結構化）**：將中英夾雜、口語零散的速記，自動提煉為「核心結論」、「技術規格重點」與「待辦清單」。
  2. **☑️ 提煉待辦（Action Items）**：自動掃描全文，擷取出 `- [ ]` 格式的行動項目。
  3. **💬 選取問答與代碼排版**：針對選取的 SQL / Log / 規格片段進行即時問答或自動縮排並補齊 Markdown Code Block。
* **🔄 檢查與一鍵 Rollback 保護機制（Saga Compensation）**：
  * **Diff 預覽 / 快照保護**：AI 生成結果替換或寫入前，系統自動為原內容建立 **Pre-AI Snapshot（煉丹前快照）**。
  * **一鍵散丹（Rollback）**：檢視 AI 整理後的內容若覺得遺漏細節或不夠精準，可點擊頂部提示列的 **「⏪ 退回原散帖 (Rollback)」**（或直接透過 Vim `u` 歷史棧），100% 無損還原至 AI 介入前的原始手稿，並支援「原稿與 AI 稿上下對照檢視」。

### 4. 🗂️ 多分頁工作台與系統右鍵整合 (Multi-Tab & OS Integration)
* **百子櫃多分頁（Scratchpad Tabs）**：支援無限新增分頁、雙擊重新命名、拖曳排序與快速切換。
* **單一視窗攔截（Single-Instance Routing）**：內建跨平台單一實例鎖定。從系統檔案總管點擊或透過右鍵選單「**用 廣零散 收入藥帖**」開啟外部檔案時，**絕不彈出新視窗**，而是自動將檔案內容轉為現有視窗的新分頁並聚焦。

### 5. ☄️ Smear Cursor 物理殘影游標 & 原生 Vim 操作
* **60fps 阻尼殘影游標（Smear Cursor）**：於編輯器上層覆蓋獨立透明 `<canvas>`，利用頭尾雙阻尼插值演算法，在游標大幅移動（如 Vim 的 `w`、`b`、`gg`、`G` 或搜尋跳轉）時，繪製帶有 Gruvbox 亮橘至金黃漸層的動態拖尾特效。
* **Vim 模式無縫支援**：完整支援 Normal / Insert / Visual / Ex 指令操作，且在瀏覽器/WebView 原生核心加持下，**100% 正常顯示 Windows 微軟注音與 Linux 輸入法組字框与選字清單**。

---

## 🛠️ 技術架構 (Tech Stack)

| 層級 | 採用技術 | 選擇理由 |
| :--- | :--- | :--- |
| **跨平台桌面容器** | **Tauri v2 (Rust)** | 安裝包僅 ~4MB，0.2 秒極速冷啟動；原生支援 Windows 11 與 Arch Linux (Wayland/Hyprland)。 |
| **前端響應式框架** | **Svelte 5 (Runes)** | 無虛擬 DOM 開銷，利用 `$state` 極簡管理多分頁、快照堆疊與游標座標狀態。 |
| **核心編輯器引擎** | **CodeMirror 6** | 模組化程度極高，內建 `@replit/codemirror-vim` 與自訂 ViewPlugin 正則染色器。 |
| **視覺特效層** | **HTML5 Canvas 2D** | 獨立於 DOM 渲染之外的 60fps Smear Cursor 物理粒子拖尾畫布。 |
| **AI 推論雙引擎** | **Groq API + Gemini API** | Groq (`llama-3.3-70b`) 負責毫秒級即時排版；Gemini (`gemini-2.5-flash`) 負責長篇會議總結與問答。 |

---

## 🔄 AI 煉丹與 Rollback 狀態流轉設計


```text
[原始手稿 (散帖)] 
       │
       ├── 1. 觸發「✨ 收散成丹」或「💬 AI 問答」
       ▼
[建立快照 Snapshot #N] ──(推入 Undo/Rollback Stack)
       │
       ├── 2. 寫入 AI 整理結果，頂部浮現【🔍 審核列】
       ▼
┌────────────────────────────────────────────────────────┐
│ ✨ 已套用 AI 整理結果  [✅ 確認收丹]  [⏪ 一鍵退回原稿] │
└────────────────────────────────────────────────────────┘
```
