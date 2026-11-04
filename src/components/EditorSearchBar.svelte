<script lang="ts">
  import { tick } from 'svelte';
  import { Search, ChevronUp, ChevronDown, ChevronRight, X, Replace } from 'lucide-svelte';

  interface EditorSearchBarProps {
    isOpen: boolean;
    showReplace?: boolean;
    searchQuery: string;
    replaceQuery?: string;
    totalMatches: number;
    currentIndex: number;
    caseSensitive: boolean;
    regexp: boolean;
    wholeWord: boolean;
    onQueryChange: (query: string) => void;
    onReplaceQueryChange?: (query: string) => void;
    onToggleReplace?: () => void;
    onToggleCaseSensitive: () => void;
    onToggleRegexp: () => void;
    onToggleWholeWord: () => void;
    onFindNext: () => void;
    onFindPrevious: () => void;
    onReplaceNext?: () => void;
    onReplaceAll?: () => void;
    onClose: () => void;
  }

  let {
    isOpen = false,
    showReplace = false,
    searchQuery = '',
    replaceQuery = '',
    totalMatches = 0,
    currentIndex = -1,
    caseSensitive = false,
    regexp = false,
    wholeWord = false,
    onQueryChange,
    onReplaceQueryChange,
    onToggleReplace,
    onToggleCaseSensitive,
    onToggleRegexp,
    onToggleWholeWord,
    onFindNext,
    onFindPrevious,
    onReplaceNext,
    onReplaceAll,
    onClose,
  }: EditorSearchBarProps = $props();

  let inputEl = $state<HTMLInputElement | null>(null);
  let replaceInputEl = $state<HTMLInputElement | null>(null);

  // 當開啟時自動聚焦合適的輸入框
  $effect(() => {
    if (isOpen) {
      tick().then(() => {
        if (showReplace && searchQuery.trim() && replaceInputEl) {
          replaceInputEl.focus();
          replaceInputEl.select();
        } else if (inputEl) {
          inputEl.focus();
          inputEl.select();
        }
      });
    }
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        onFindPrevious();
      } else {
        onFindNext();
      }
    }
  }

  function handleReplaceKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (e.altKey) {
        onReplaceAll?.();
      } else {
        onReplaceNext?.();
      }
    }
  }

  function handleInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    onQueryChange(val);
  }

  function handleReplaceInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    onReplaceQueryChange?.(val);
  }
</script>

{#if isOpen}
  <div class="search-bar-capsule {showReplace ? 'has-replace' : ''}" role="search" aria-label="手稿搜尋與替換條">
    <!-- 第一行：搜尋控制列 -->
    <div class="search-row">
      <!-- 展開/收折替換面板按鈕 -->
      <button
        type="button"
        class="icon-btn expand-btn {showReplace ? 'expanded' : ''}"
        onclick={onToggleReplace}
        title={showReplace ? "收起替換列" : "展開替換列 (Ctrl+H)"}
        aria-label="切換替換模式"
      >
        {#if showReplace}
          <ChevronDown size={14} />
        {:else}
          <ChevronRight size={14} />
        {/if}
      </button>

      <!-- 搜尋圖示 -->
      <div class="search-icon-box">
        <Search size={14} class="search-icon" />
      </div>

      <!-- 搜尋輸入框 -->
      <input
        bind:this={inputEl}
        type="text"
        class="search-input"
        placeholder="尋找手稿關鍵字..."
        value={searchQuery}
        oninput={handleInput}
        onkeydown={handleKeyDown}
        spellcheck="false"
        autocomplete="off"
      />

      <!-- 計數徽章 (如 3 / 12 或 0 / 0) -->
      <div
        class="count-badge {totalMatches > 0 ? 'has-matches' : searchQuery.trim() ? 'no-matches' : 'empty'}"
        title="搜尋結果 (當前序號 / 總相符數)"
      >
        {#if !searchQuery.trim()}
          <span class="count-text">0 / 0</span>
        {:else if totalMatches > 0}
          <span class="count-text">{currentIndex + 1} / {totalMatches}</span>
        {:else}
          <span class="count-text">無相符</span>
        {/if}
      </div>

      <!-- 分隔線 -->
      <div class="bar-divider"></div>

      <!-- 進階比對切換鍵 (Aa, .*, \b) -->
      <div class="option-toggles">
        <button
          type="button"
          class="toggle-btn {caseSensitive ? 'active' : ''}"
          onclick={onToggleCaseSensitive}
          title="區分大小寫 (Match Case)"
        >
          <span>Aa</span>
        </button>
        <button
          type="button"
          class="toggle-btn {regexp ? 'active' : ''}"
          onclick={onToggleRegexp}
          title="規則運算式 (Regular Expression)"
        >
          <span>.*</span>
        </button>
        <button
          type="button"
          class="toggle-btn {wholeWord ? 'active' : ''}"
          onclick={onToggleWholeWord}
          title="全字相符 (Match Whole Word)"
        >
          <span>\b</span>
        </button>
      </div>

      <!-- 分隔線 -->
      <div class="bar-divider"></div>

      <!-- 導航按鈕組 (上一個 / 下一個) -->
      <div class="nav-buttons">
        <button
          type="button"
          class="icon-btn"
          onclick={onFindPrevious}
          title="尋找上一個 (Shift+Enter)"
          aria-label="尋找上一個"
        >
          <ChevronUp size={15} />
        </button>
        <button
          type="button"
          class="icon-btn"
          onclick={onFindNext}
          title="尋找下一個 (Enter)"
          aria-label="尋找下一個"
        >
          <ChevronDown size={15} />
        </button>
      </div>

      <!-- 關閉按鈕 -->
      <button
        type="button"
        class="icon-btn close-btn"
        onclick={onClose}
        title="關閉搜尋列 (Esc)"
        aria-label="關閉搜尋列"
      >
        <X size={15} />
      </button>
    </div>

    <!-- 第二行：替換控制列 (支援點擊展開或 Ctrl+H) -->
    {#if showReplace}
      <div class="replace-row">
        <!-- 替換圖示 -->
        <div class="replace-icon-box">
          <Replace size={14} class="replace-icon" />
        </div>

        <!-- 替換輸入框 -->
        <input
          bind:this={replaceInputEl}
          type="text"
          class="replace-input"
          placeholder="替換為 (可為空)..."
          value={replaceQuery}
          oninput={handleReplaceInput}
          onkeydown={handleReplaceKeyDown}
          spellcheck="false"
          autocomplete="off"
        />

        <!-- 替換操作按鈕組 -->
        <div class="replace-actions">
          <button
            type="button"
            class="action-text-btn"
            onclick={onReplaceNext}
            title="取代當前選中項目 (Enter)"
          >
            取代
          </button>
          <button
            type="button"
            class="action-text-btn"
            onclick={onReplaceAll}
            title="全部取代 (Alt+Enter)"
          >
            全部取代
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* 浮動膠囊本體：置於編輯器右上角，符合竹風暗色禪風設計 */
  .search-bar-capsule {
    position: absolute;
    top: 12px;
    right: 28px;
    z-index: 80;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: rgba(22, 24, 23, 0.96);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(100, 86, 66, 0.48);
    border-radius: 8px;
    padding: 6px 8px;
    box-shadow:
      0 14px 36px rgba(0, 0, 0, 0.8),
      0 0 0 1px rgba(250, 189, 47, 0.08);
    font-family: 'JetBrains Mono', monospace;
    animation: searchBarPop 0.16s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    user-select: none;
  }

  @keyframes searchBarPop {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* 第一行搜尋列 */
  .search-row {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  /* 第二行替換列 */
  .replace-row {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding-left: 28px; /* 對齊輸入框起點 */
    padding-top: 4px;
    border-top: 1px solid rgba(100, 86, 66, 0.25);
    animation: replaceSlideDown 0.15s ease-out;
  }

  @keyframes replaceSlideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .expand-btn {
    color: #8c8273;
    transition: transform 0.18s ease, color 0.18s ease;
  }

  .expand-btn.expanded {
    color: #fabd2f;
  }

  .search-icon-box,
  .replace-icon-box {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #938c80;
    flex-shrink: 0;
  }

  .replace-icon-box {
    color: #fabd2f;
    opacity: 0.85;
  }

  /* 輸入框樣式 */
  .search-input,
  .replace-input {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(100, 86, 66, 0.35);
    border-radius: 4px;
    color: #ede7dc;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12.5px;
    line-height: 1.4;
    padding: 4px 8px;
    width: 170px;
    outline: none;
    transition: all 0.15s ease;
  }

  .search-input:focus,
  .replace-input:focus {
    border-color: rgba(212, 155, 53, 0.7);
    box-shadow: 0 0 0 1px rgba(212, 155, 53, 0.25);
    background: rgba(0, 0, 0, 0.45);
  }

  .search-input::placeholder,
  .replace-input::placeholder {
    color: #6d675c;
    font-size: 11.5px;
  }

  /* 計數徽章 */
  .count-badge {
    padding: 2px 7px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.2;
    min-width: 48px;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .count-badge.has-matches {
    background: rgba(250, 189, 47, 0.14);
    color: #fabd2f;
    border: 1px solid rgba(250, 189, 47, 0.35);
  }

  .count-badge.no-matches {
    background: rgba(219, 76, 63, 0.14);
    color: #e06c75;
    border: 1px solid rgba(219, 76, 63, 0.35);
  }

  .count-badge.empty {
    background: rgba(255, 255, 255, 0.04);
    color: #706b62;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .count-text {
    letter-spacing: 0.04em;
  }

  /* 垂直分隔線 */
  .bar-divider {
    width: 1px;
    height: 16px;
    background: rgba(100, 86, 66, 0.3);
    margin: 0 2px;
  }

  /* 選項切換按鈕組 */
  .option-toggles {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .toggle-btn {
    background: transparent;
    border: 1px solid transparent;
    color: #8c8273;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 5px;
    border-radius: 3px;
    cursor: pointer;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    transition: all 0.14s ease;
  }

  .toggle-btn:hover {
    color: #ede7dc;
    background: rgba(255, 255, 255, 0.06);
  }

  .toggle-btn.active {
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.18);
    border-color: rgba(250, 189, 47, 0.45);
    box-shadow: 0 0 6px rgba(250, 189, 47, 0.2);
  }

  /* 導航與功能按鈕 */
  .nav-buttons {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .icon-btn {
    background: transparent;
    border: 1px solid transparent;
    color: #a89f91;
    border-radius: 3px;
    padding: 3px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    width: 24px;
    transition: all 0.14s ease;
  }

  .icon-btn:hover {
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.12);
    border-color: rgba(250, 189, 47, 0.3);
  }

  .icon-btn.close-btn:hover {
    color: #ff857f;
    background: rgba(219, 76, 63, 0.15);
    border-color: rgba(219, 76, 63, 0.35);
  }

  /* 替換文字按鈕 */
  .replace-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 4px;
  }

  .action-text-btn {
    background: rgba(250, 189, 47, 0.08);
    border: 1px solid rgba(250, 189, 47, 0.28);
    color: #ede7dc;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11.5px;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    line-height: 1.3;
    transition: all 0.14s ease;
  }

  .action-text-btn:hover {
    background: rgba(250, 189, 47, 0.2);
    border-color: rgba(250, 189, 47, 0.55);
    color: #fabd2f;
    transform: translateY(-1px);
  }
</style>
