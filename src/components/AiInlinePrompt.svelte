<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Sparkles, ArrowRight, X, History, CornerDownLeft, Loader2 } from 'lucide-svelte';

  interface AiInlinePromptProps {
    isOpen: boolean;
    selectionText?: string;
    paragraphText?: string;
    fullTextLength?: number;
    coords?: { x: number; y: number } | null;
    isExecuting?: boolean;
    onSubmit: (instruction: string, scope: 'paragraph' | 'full') => Promise<void> | void;
    onClose: () => void;
  }

  let {
    isOpen = false,
    selectionText = '',
    paragraphText = '',
    fullTextLength = 0,
    coords = null,
    isExecuting = false,
    onSubmit,
    onClose,
  }: AiInlinePromptProps = $props();

  let scope = $state<'paragraph' | 'full'>('paragraph');

  const computedPositionStyle = $derived.by(() => {
    const dialogWidth = 680;
    // 若無精確座標時，預設置中並懸浮於視窗偏下方，絕對不遮蔽頂部或中央手稿內容
    if (!coords) {
      return `position: fixed; left: 50%; transform: translateX(-50%); bottom: 60px; margin: 0; width: ${dialogWidth}px; max-width: 94vw;`;
    }

    const maxLeft = Math.max(10, window.innerWidth - dialogWidth - 20);
    const left = Math.min(Math.max(20, coords.x), maxLeft);
    
    // 嚴格保證：浮動列永遠定位在段落「正下方」！絕不向上翻轉遮蔽手稿文字
    let top = coords.y;
    const dialogEstimatedHeight = 180;
    if (top + dialogEstimatedHeight > window.innerHeight - 10) {
      top = Math.max(60, window.innerHeight - dialogEstimatedHeight - 15);
    }
    return `position: fixed; left: ${left}px; top: ${top}px; margin: 0; width: ${dialogWidth}px; max-width: 94vw;`;
  });

  let inputPrompt = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);
  let historyList = $state<string[]>([]);
  let historyIndex = $state<number>(-1);

  const STORAGE_KEY = 'bamboo_inline_prompt_history';

  const QUICK_TAGS = [
    { label: '優雅結構化', prompt: '將內容重整為層次分明、排版優雅的 Markdown 結構，並提煉核心概要與待辦' },
    { label: '提取待辦', prompt: '萃取所有待辦事項（Action Items），以 Markdown 核取清單 [-] 整理' },
    { label: '台灣繁體潤飾', prompt: '潤飾用字文筆，全面校準為台灣繁體習慣用語與技術名詞' },
    { label: '程式碼重構', prompt: '校對語法與排版、補齊 Markdown 語言標籤與關鍵變數命名說明' },
  ];

  onMount(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        historyList = JSON.parse(saved);
      }
    } catch (e) {
      // 忽略解析錯誤
    }
  });

  $effect(() => {
    if (isOpen) {
      inputPrompt = '';
      historyIndex = -1;
      // 若有反白選取或有游標段落，預設為段落修煉；否則預設為整篇手稿
      scope = (selectionText && selectionText.trim()) || (paragraphText && paragraphText.trim()) ? 'paragraph' : 'full';
      tick().then(() => {
        inputEl?.focus();
      });
    }
  });

  function saveToHistory(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const filtered = historyList.filter((item) => item !== trimmed);
    const updated = [trimmed, ...filtered].slice(0, 15);
    historyList = updated;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {}
  }

  async function handleFormSubmit() {
    const val = inputPrompt.trim();
    if (!val || isExecuting) return;
    saveToHistory(val);
    await onSubmit(val, scope);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      handleFormSubmit();
      return;
    }

    if (e.key === 'ArrowUp') {
      if (historyList.length === 0) return;
      e.preventDefault();
      if (historyIndex < historyList.length - 1) {
        historyIndex++;
        inputPrompt = historyList[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        inputPrompt = historyList[historyIndex];
      } else if (historyIndex === 0) {
        historyIndex = -1;
        inputPrompt = '';
      }
    }
  }

  function applyTag(tagPrompt: string) {
    inputPrompt = tagPrompt;
    inputEl?.focus();
  }
</script>

{#if isOpen}
  <!-- 遮罩層：淡暗半透明點擊關閉 -->
  <div 
    class="inline-prompt-overlay"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
    role="presentation"
  >
    <div 
      class="inline-prompt-dialog" 
      role="dialog" 
      aria-modal="true"
      style={computedPositionStyle}
    >
      <!-- 頂部膠囊指示列 -->
      <div class="dialog-header">
        <div class="header-badge">
          <Sparkles class="icon-sparkle {isExecuting ? 'spin-pulse' : ''}" size={14} />
          <span class="badge-title">AI 行內修煉</span>
        </div>

        <!-- 作用範圍切換組：該段落 vs 整篇手稿 -->
        <div class="scope-toggle-group">
          <button
            type="button"
            class="scope-btn {scope === 'paragraph' ? 'active' : ''}"
            onclick={() => (scope = 'paragraph')}
            title="僅針對當前游標段落或選取文字改寫，精準替換"
            disabled={isExecuting}
          >
            <span>📑 該段落</span>
            {#if selectionText && selectionText.trim()}
              <span class="scope-count">({selectionText.trim().length}字)</span>
            {:else if paragraphText && paragraphText.trim()}
              <span class="scope-count">({paragraphText.trim().length}字)</span>
            {/if}
          </button>

          <button
            type="button"
            class="scope-btn {scope === 'full' ? 'active' : ''}"
            onclick={() => (scope = 'full')}
            title="針對全篇手稿進行結構梳理"
            disabled={isExecuting}
          >
            <span>📜 整篇手稿</span>
            {#if fullTextLength > 0}
              <span class="scope-count">({fullTextLength}字)</span>
            {/if}
          </button>
        </div>

        <button class="btn-close" onclick={onClose} title="關閉 (ESC)">
          <X size={15} />
        </button>
      </div>

      <!-- 輸入框主體 -->
      <div class="input-row">
        <input
          bind:this={inputEl}
          type="text"
          class="prompt-input"
          placeholder="請輸入心法指令（例如：精簡文筆、轉成條列、加入 Action Items）..."
          bind:value={inputPrompt}
          onkeydown={handleKeyDown}
          disabled={isExecuting}
        />

        <button
          type="button"
          class="btn-submit {isExecuting ? 'is-loading' : ''}"
          onclick={handleFormSubmit}
          disabled={!inputPrompt.trim() || isExecuting}
          title="執行並進入對照審核 (Enter)"
        >
          {#if isExecuting}
            <Loader2 size={16} class="spin" />
            <span>提煉中</span>
          {:else}
            <span>送出</span>
            <CornerDownLeft size={14} />
          {/if}
        </button>
      </div>

      <!-- 快捷標籤列與提示 -->
      <div class="quick-tags-row">
        <span class="tags-hint">常用心法：</span>
        <div class="tags-container">
          {#each QUICK_TAGS as tag}
            <button
              type="button"
              class="quick-tag-chip"
              onclick={() => applyTag(tag.prompt)}
              disabled={isExecuting}
            >
              {tag.label}
            </button>
          {/each}
        </div>
        <div class="shortcut-tip">
          <span><code>↑</code><code>↓</code> 歷程</span>
          <span><code>Enter</code> 執行</span>
          <span><code>ESC</code> 離開</span>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .inline-prompt-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
    background: transparent; /* 完全透明，零遮蔽背景，讓原文一覽無遺 */
    pointer-events: auto;
  }

  .inline-prompt-dialog {
    width: 680px;
    max-width: 92vw;
    background: #242628;
    border: 1px solid rgba(250, 189, 47, 0.4);
    border-radius: 10px;
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(250, 189, 47, 0.25);
    padding: 14px 18px 12px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: slideDown 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-badge {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  :global(.icon-sparkle) {
    color: #fabd2f;
  }

  .badge-title {
    font-size: 13px;
    font-weight: 600;
    color: #ebdbb2;
    letter-spacing: 0.3px;
  }

  .scope-toggle-group {
    display: flex;
    align-items: center;
    background: #1d2021;
    border: 1px solid #3c3836;
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
  }

  .scope-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    color: #928374;
    padding: 3px 9px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s ease;
  }

  .scope-btn:hover:not(:disabled) {
    color: #ebdbb2;
    background: #282828;
  }

  .scope-btn.active {
    background: #32302f;
    color: #fabd2f;
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  }

  .scope-count {
    font-size: 10px;
    opacity: 0.8;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #928374;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .btn-close:hover {
    color: #ebdbb2;
    background: #3c3836;
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #1d2021;
    border: 1px solid #3c3836;
    border-radius: 8px;
    padding: 4px 6px 4px 12px;
    transition: border-color 0.15s ease;
  }

  .input-row:focus-within {
    border-color: #fabd2f;
    box-shadow: 0 0 0 2px rgba(250, 189, 47, 0.12);
  }

  .prompt-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #fbf1c7;
    font-size: 14px;
    padding: 6px 0;
    font-family: inherit;
  }

  .prompt-input::placeholder {
    color: #7c6f64;
    font-size: 13px;
  }

  .btn-submit {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #fabd2f;
    color: #282828;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-submit:hover:not(:disabled) {
    background: #fe8019;
    color: #1d2021;
  }

  .btn-submit:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .quick-tags-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: #928374;
    padding-top: 2px;
  }

  .tags-hint {
    flex-shrink: 0;
  }

  .tags-container {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .quick-tag-chip {
    background: #32302f;
    border: 1px solid #504945;
    color: #d5c4a1;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s ease;
  }

  .quick-tag-chip:hover:not(:disabled) {
    border-color: #fabd2f;
    color: #fabd2f;
    background: #3c3836;
  }

  .shortcut-tip {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #7c6f64;
    font-size: 11px;
  }

  .shortcut-tip code {
    background: #32302f;
    padding: 1px 4px;
    border-radius: 3px;
    border: 1px solid #504945;
    font-family: inherit;
    font-size: 10px;
    color: #a89984;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
