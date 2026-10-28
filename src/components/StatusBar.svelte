<script lang="ts">
  import type { SupportedLanguage, CursorPosition } from '../types/tab';

  interface StatusBarProps {
    content?: string;
    language?: SupportedLanguage;
    cursor?: CursorPosition;
    vimMode?: boolean;
    onLanguageChange: (lang: SupportedLanguage) => void;
    onToggleVim?: () => void;
    onOpenHistory?: () => void;
    onOpenFuzzy?: () => void;
    onOpenBackup?: () => void;
    selectionText?: string;
    onOpenTextTools?: () => void;
  }

  let {
    content = '',
    language = 'plaintext' as SupportedLanguage,
    cursor = { line: 1, ch: 0 },
    vimMode = false,
    onLanguageChange,
    onToggleVim,
    onOpenHistory,
    onOpenFuzzy,
    onOpenBackup,
    selectionText = '',
    onOpenTextTools
  }: StatusBarProps = $props();

  const selectedLineCount = $derived(
    selectionText && selectionText.trim().length > 0 ? selectionText.split('\n').length : 0
  );

  const charCount = $derived(content.length);
  const lineCount = $derived(content.split('\n').length);
</script>

<footer class="metaphysical-statusbar">
  <!-- 左側：模式與持久化狀態 (精準對齊 code.html 第 92 行) -->
  <div class="status-left">
    <button 
      class="mode-tag font-mono {vimMode ? 'active' : ''}" 
      onclick={() => onToggleVim?.()}
      title="點擊切換 Vim 編輯模式"
    >
      {vimMode ? 'MODE // VIM-HYBRID' : 'MODE // STD-EDIT'}
    </button>

    <div class="vault-tag font-mono" title="所有打字與中文注音皆即時毫秒級持久化入櫃">
      <span class="vault-amber-dot"></span>
      <span class="vault-label">VAULT // PRESERVED</span>
    </div>

    <button 
      class="fuzzy-quick-btn font-mono" 
      onclick={onOpenFuzzy}
      title="全域模糊搜尋與 AI 助查 (Ctrl+P)"
    >
      <span class="fuzzy-icon">🔍</span>
      <span>FIND // FUZZY</span>
    </button>

    <button 
      class="history-btn font-mono" 
      onclick={onOpenHistory}
      title="檢視本地歷史修訂與 Diff 比對 (Alt+H)"
    >
      <span class="history-icon">📜</span>
      <span>HIST // LOCAL</span>
    </button>

    <button 
      class="backup-quick-btn font-mono" 
      onclick={onOpenBackup}
      title="OneDrive 企業/個人版自動備份面板"
    >
      <span class="backup-icon">☁️</span>
      <span>ONEDRIVE</span>
    </button>
  </div>

  <!-- 中央動態情境輔助：反白選取超過 3 行時自動浮現快捷清理按鈕 -->
  {#if selectedLineCount >= 3 && onOpenTextTools}
    <div class="status-center-action">
      <button
        type="button"
        class="clean-selection-btn font-mono"
        onclick={onOpenTextTools}
        title="將已選取的 {selectedLineCount} 行載入行處理解藥包 (Ctrl+Shift+T)"
      >
        <span class="btn-glyph">◬</span>
        <span class="btn-text">清理選取行 ({selectedLineCount}行 去重/排序)</span>
      </button>
    </div>
  {/if}

  <!-- 右側：座標、字數、語言選擇與編碼 (精準對齊 code.html 第 92 行) -->
  <div class="status-right font-mono">
    <div class="metric-item">
      <span class="metric-key">POS:</span>
      <span class="metric-val">L{cursor.line}:C{cursor.ch + 1}</span>
    </div>

    <div class="metric-item">
      <span class="metric-key">SIZE:</span>
      <span class="metric-val">{lineCount}L / {charCount}C</span>
    </div>

    <div class="lang-selector-group">
      <span class="metric-key">LANG:</span>
      <select 
        value={language} 
        onchange={(e) => onLanguageChange((e.target as HTMLSelectElement).value as SupportedLanguage)}
        class="lang-dropdown"
      >
        <option value="plaintext">PLAINTEXT (智慧染色)</option>
        <option value="markdown">MARKDOWN</option>
        <option value="javascript">JAVASCRIPT</option>
        <option value="python">PYTHON</option>
        <option value="json">JSON</option>
        <option value="sql">SQL</option>
      </select>
      <span class="material-symbols-outlined text-[13px] text-[#b59e72] arrow-icon">expand_more</span>
    </div>

    <div class="encoding-badge">UTF-8</div>
  </div>
</footer>

<style>
  /* Apothecary Gruvbox 沉浸通透狀態底欄 */
  .metaphysical-statusbar {
    height: 30px;
    width: 100%;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(16, 17, 16, 0.98);
    border-top: 1px solid rgba(100, 86, 66, 0.25);
    color: #8c8273;
    font-size: 11px;
    user-select: none;
    position: relative;
    z-index: 40;
    flex-shrink: 0;
  }

  .status-left, .status-right {
    display: flex;
    align-items: center;
  }

  .status-left {
    gap: 10px;
  }

  .status-right {
    gap: 16px;
  }

  .mode-tag {
    color: #a89984;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(100, 86, 66, 0.25);
    border-radius: 4px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    padding: 2px 7px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-tag:hover {
    color: #fabd2f;
    border-color: rgba(250, 189, 47, 0.4);
    background: rgba(250, 189, 47, 0.08);
  }

  .mode-tag.active {
    color: #fabd2f;
    border-color: rgba(250, 189, 47, 0.45);
    background: rgba(250, 189, 47, 0.14);
  }

  .vault-tag {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 7px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(100, 86, 66, 0.2);
    border-radius: 4px;
  }

  .vault-amber-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #fabd2f;
    box-shadow: 0 0 5px rgba(250, 189, 47, 0.8);
    flex-shrink: 0;
  }

  .vault-label {
    color: #a89984;
    font-weight: 500;
    letter-spacing: 0.04em;
    font-size: 10.5px;
  }

  .history-btn, .fuzzy-quick-btn, .backup-quick-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(100, 86, 66, 0.22);
    border-radius: 4px;
    color: #8c8273;
    padding: 2px 7px;
    font-size: 10.5px;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .history-btn:hover, .fuzzy-quick-btn:hover, .backup-quick-btn:hover {
    color: #fabd2f;
    border-color: rgba(250, 189, 47, 0.35);
    background: rgba(250, 189, 47, 0.08);
  }

  /* 中央動態清理選取行按鈕 */
  .status-center-action {
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.18s ease;
  }

  .clean-selection-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(250, 189, 47, 0.12);
    border: 1px solid rgba(250, 189, 47, 0.4);
    color: #fabd2f;
    border-radius: 4px;
    padding: 1px 9px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.14s ease;
    box-shadow: 0 0 8px rgba(250, 189, 47, 0.15);
  }

  .clean-selection-btn:hover {
    background: #fabd2f;
    color: #1d2021;
    border-color: #fabd2f;
    box-shadow: 0 0 12px rgba(250, 189, 47, 0.35);
    transform: translateY(-0.5px);
  }

  .btn-glyph {
    font-size: 12px;
    line-height: 1;
  }

  .btn-text {
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .history-icon, .fuzzy-icon, .backup-icon {
    font-size: 11px;
    line-height: 1;
  }

  .metric-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 500;
  }

  .metric-key {
    color: #665c54;
    font-weight: 400;
  }

  .metric-val {
    color: #bdae93;
  }

  .lang-selector-group {
    display: flex;
    align-items: center;
    gap: 3px;
    position: relative;
  }

  .lang-dropdown {
    background: transparent;
    border: none;
    color: #bdae93;
    font-size: 11px;
    font-weight: 500;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
    outline: none;
    padding-right: 14px;
    appearance: none;
    -webkit-appearance: none;
    transition: color 0.12s ease;
  }

  .lang-dropdown:hover {
    color: #fabd2f;
  }

  .lang-dropdown option {
    background: #18191a;
    color: #ebdbb2;
  }

  .arrow-icon {
    position: absolute;
    right: 0;
    pointer-events: none;
    color: #7c7365;
  }

  .encoding-badge {
    color: #7c7365;
    font-size: 10.5px;
    padding: 1px 4px;
  }
</style>
