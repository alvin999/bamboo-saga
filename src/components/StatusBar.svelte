<script lang="ts">
  import type { SupportedLanguage, CursorPosition } from '../types/tab';

  let {
    content = '',
    language = 'plaintext' as SupportedLanguage,
    cursor = { line: 1, ch: 0 },
    vimMode = false,
    onLanguageChange,
    onToggleVim,
    onOpenHistory,
    onPutLabel
  } = $props<{
    content: string;
    language: SupportedLanguage;
    cursor: CursorPosition;
    vimMode: boolean;
    onLanguageChange: (lang: SupportedLanguage) => void;
    onToggleVim?: () => void;
    onOpenHistory?: () => void;
    onPutLabel?: () => void;
  }>();

  const charCount = $derived(content.length);
  const lineCount = $derived(content.split('\n').length);
</script>

<footer class="metaphysical-statusbar">
  <!-- 左側：模式與持久化狀態 (精準對齊 code.html 第 92 行) -->
  <div class="status-left">
    <button 
      class="mode-tag font-mono {vimMode ? 'active' : ''}" 
      onclick={onToggleVim}
      title="點擊切換 Vim 編輯模式"
    >
      {vimMode ? 'MODE // VIM-HYBRID' : 'MODE // STD-EDIT'}
    </button>

    <div class="vault-tag font-mono" title="所有打字與中文注音皆即時毫秒級持久化入櫃">
      <span class="vault-amber-dot"></span>
      <span class="vault-label">VAULT // PRESERVED</span>
    </div>

    <button 
      class="history-btn font-mono" 
      onclick={onOpenHistory}
      title="檢視本地歷史修訂與 Diff 比對 (Alt+H)"
    >
      <span class="history-icon">📜</span>
      <span>HIST // LOCAL</span>
    </button>

    <button 
      class="label-quick-btn font-mono" 
      onclick={onPutLabel}
      title="為當前狀態添加歷史錨點標籤 (Alt+L)"
    >
      <span>🏷️ LABEL</span>
    </button>
  </div>

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
  /* 精準對齊 code.html 第 92 行：h-8 w-full px-4 flex items-center justify-between bg-[#111312] border-t border-[#262420]/70 text-[#938c80] */
  .metaphysical-statusbar {
    height: 32px;
    width: 100%;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #111312;
    border-top: 1px solid rgba(38, 36, 32, 0.7);
    color: #938c80;
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
    gap: 12px;
  }

  .status-right {
    gap: 16px;
  }

  .mode-tag {
    color: #b59e72;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    padding: 2px 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-tag:hover {
    color: #d49b35;
    border-color: rgba(212, 155, 53, 0.4);
    background: rgba(212, 155, 53, 0.08);
  }

  .mode-tag.active {
    color: #fabd2f;
    border-color: #d49b35;
    background: rgba(212, 155, 53, 0.18);
  }

  .vault-tag {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px;
  }

  .vault-amber-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #d49b35;
    box-shadow: 0 0 5px #d49b35;
    flex-shrink: 0;
  }

  .vault-label {
    color: #b59e72;
    font-weight: 500;
    letter-spacing: 0.04em;
  }

  .metric-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 500;
    color: rgba(147, 140, 128, 0.85);
  }

  .metric-key {
    color: #5b564c;
    font-weight: 400;
  }

  .metric-val {
    color: #938c80;
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
    color: #b59e72;
    font-size: 11px;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
    outline: none;
    padding-right: 14px;
    appearance: none;
    -webkit-appearance: none;
  }

  .lang-dropdown:hover {
    color: #d49b35;
  }

  .lang-dropdown option {
    background: #191b1a;
    color: #ece7dc;
  }

  .arrow-icon {
    position: absolute;
    right: 0;
    pointer-events: none;
  }

  .encoding-badge {
    color: #868074;
    font-size: 11px;
    padding: 1px 4px;
  }

  .history-btn, .label-quick-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: 1px solid rgba(80, 69, 52, 0.45);
    border-radius: 3px;
    color: #b59e72;
    padding: 2px 7px;
    font-size: 11px;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .history-btn:hover, .label-quick-btn:hover {
    color: #fabd2f;
    border-color: #fabd2f;
    background: rgba(250, 189, 47, 0.1);
  }

  .history-icon {
    font-size: 10px;
  }
</style>
