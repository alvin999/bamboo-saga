# 🎋 廣零散 (bamboo-saga) 版本變更紀錄 (Changelog)

所有關於《廣零散 (bamboo-saga)》的重要改動與版本演進皆記錄於此文件。

---

## [v0.1.7] - 2026-11-20

### ✨ 核心亮點 (Highlights)
* 🔄 **全自動更新中樞（Auto-Updater & In-App Release Pipeline）**：
  - **Tauri v2 官方 Updater 整合**：採用 Minisign 數位簽章驗證（防竄改非對稱金鑰），支援最新版自動偵測與背景分塊下載。
  - **應用程式內更新進度回報**：下載過程中即時呈現百分比進度條與階段狀態，下載完畢提供一鍵「立即重啟套用」。
  - **啟動靜默檢查與偏好設定開關**：於「系統整合」分頁新增「啟動時自動檢查新版本」開關，使用者可自由掌控。
  - **主畫面新版提醒徽章**：底層狀態列（StatusBar）新增發光呼吸燈綠色徽章 `🎋 vX.X.X 可更新`，一鍵點擊無縫開啟更新面板。
  - **雙層檢查與備援機制**：優先透過 Tauri 原生 Updater 檢查 `latest.json`，若處於 Web/測試環境則自動無縫降級至 GitHub Releases API。
  - **CI/CD 自動簽章工作流程**：發布流程全面整合 GitHub Secrets 私鑰自動簽發多平台安裝檔與 `latest.json`。

---

## [v0.1.6] - 2026-11-20

### ✨ 核心亮點 (Highlights)
* ⌨️ **跨平台 Vim 模式無視中文輸入法（Zed-like IME Auto-suspend）**：
  - **Linux (Arch Hyprland / Ubuntu / WebKitGTK)**：在 Vim Normal / Visual 指令模式下，底層自動將 WebKitGTK 輸入法上下文切換為 `None`，通知 Wayland `text-input-v3` / XIM 暫停組字處理，徹底杜絕 fcitx5 或 IBus 在移動（如 `h/j/k/l`）或執行指令時跳出注音或外溢寫入。
  - **Windows (10 / 11)**：透過原生 Win32 IMM32 API，在進入 Normal 模式時自動切換至英數狀態；返回 Insert 模式或焦點離開編輯器時，精準還原切換前的中文輸入法狀態。
  - **macOS (Apple Silicon)**：整合 Carbon HIToolbox，於 Normal 模式自動切換至 ASCII 輸入源，切回 Insert 時流暢復原原本輸入法。
  - **雙層靜默防護網**：CodeMirror 內部採用無聲 `beforeinput` 與低優先權 `EditorView.inputHandler` 雙層攔截，切換模式瞬間絕不再跳出多餘的告警 Toast，保持極致專注。
  - **偏好設定重構**：將原有衝突覆蓋項目重構並更名為 `imeAutoSwitch`「Vim 模式自動暫停中文輸入法」，預設啟用且支援隨時自訂開關。

---

## [v0.1.5] - 2026-11-04

### ✨ 核心亮點 (Highlights)
* 🔍 **全新竹風尋卷條 (Zen-styled Find & Search Bar)**：
  - 專屬浮動膠囊面板：半透明竹炭黑毛玻璃與沉香琥珀金微光邊框，無縫融入竹風包浩斯設計。
  - 動態匹配計數與高對比光暈：即時統計相符序號，自研 `bambooSearchHighlighter` 外掛呈現高對比焦點標記。
  - 靈動平滑替換（Find & Replace）：支援單筆與 Alt+Enter 全文批次取代。
  - Vim 衝突覆蓋擴充：新增 Ctrl+H 替換快捷鍵支援。

---

## [v0.1.4] - 2026-10-28
* 🧪 **八卦煉丹爐 AI UI 凝練重構**。
* 🎨 **頂欄與狀態列版面佈局優化**。
