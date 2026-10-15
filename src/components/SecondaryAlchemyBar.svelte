<script lang="ts">
  import type { TabItem } from '../types/tab';
  import type { RefineryMode } from '../lib/ai/refinery';

  let {
    tabs = [],
    activeTabId = '',
    showDiffView = false,
    smearEnabled = $bindable(true),
    onSelectTab,
    onCloseTab,
    onRenameTab,
    onMoveTabDeck,
    onReorderTabs,
    onExecuteRefine,
    onOpenAiModal,
    onToggleDiffView
  } = $props<{
    tabs: TabItem[];
    activeTabId: string;
    showDiffView: boolean;
    smearEnabled: boolean;
    onSelectTab: (id: string) => void;
    onCloseTab: (id: string) => void;
    onRenameTab: (id: string, newTitle: string) => void;
    onMoveTabDeck: (id: string, deck: 'primary' | 'secondary') => void;
    onReorderTabs?: (sourceId: string, targetId: string) => void;
    onExecuteRefine: (mode: RefineryMode, customPrompt: string) => void;
    onOpenAiModal: () => void;
    onToggleDiffView: () => void;
  }>();

  // 僅篩選停靠在次頂欄的分頁
  const secondaryTabs = $derived(tabs.filter((t) => t.deck === 'secondary'));

  let editingTabId = $state<string | null>(null);
  let editInput = $state('');
  let draggedTabId = $state<string | null>(null);
  let dragOverTabId = $state<string | null>(null);

  function handleDragStart(e: DragEvent, id: string) {
    if (editingTabId) return;
    draggedTabId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    }
  }

  function handleDragOver(e: DragEvent, id: string) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    if (dragOverTabId !== id && draggedTabId !== id) {
      dragOverTabId = id;
    }
  }

  function handleDragLeave(e: DragEvent, id: string) {
    if (dragOverTabId === id) {
      dragOverTabId = null;
    }
  }

  function handleDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    if (draggedTabId && draggedTabId !== targetId) {
      onReorderTabs?.(draggedTabId, targetId);
    }
    draggedTabId = null;
    dragOverTabId = null;
  }

  function handleDragEnd() {
    draggedTabId = null;
    dragOverTabId = null;
  }

  function startRename(tab: TabItem) {
    editingTabId = tab.id;
    editInput = tab.title;
  }

  function commitRename() {
    if (editingTabId && editInput.trim()) {
      onRenameTab(editingTabId, editInput.trim());
    }
    editingTabId = null;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      commitRename();
    } else if (e.key === 'Escape') {
      editingTabId = null;
    }
  }
</script>

<div class="secondary-subbar">
  <!-- 左側：ZENITH 狀態與快捷提煉操作 -->
  <div class="deck-left">
    <div class="zenith-status">
      <span class="zenith-dot"></span>
      <span class="zenith-text">ZENITH_VOID // SYNCED</span>
    </div>

    <!-- 包浩斯形上學三大煉丹快捷鈕 -->
    <button 
      class="alchemy-action-btn" 
      onclick={() => onExecuteRefine('organize', '')} 
      title="[ 01 // 凝練 ] 自動提煉核心綱領與結構化要點"
    >
      <span class="step-num text-cinnabar">[01]</span>
      <span>凝練結論</span>
    </button>

    <button 
      class="alchemy-action-btn" 
      onclick={() => onExecuteRefine('action_items', '')} 
      title="[ 02 // 析理 ] 識別 TODO/FIXME 轉換為工單"
    >
      <span class="step-num text-ochre">[02]</span>
      <span>析理待辦</span>
    </button>

    <button 
      class="alchemy-action-btn" 
      onclick={() => onExecuteRefine('code_refactor', '')} 
      title="[ 03 // 淨心 ] 校對排版與智能命名補正"
    >
      <span class="step-num text-olive">[03]</span>
      <span>淨心修校</span>
    </button>
  </div>

  <!-- 中間：次頂專屬煉丹藥帖分頁 -->
  <div class="deck-center">
    {#if secondaryTabs.length > 0}
      <div class="sec-tabs-row">
        <span class="sec-label">次頂煉丹帖：</span>
        {#each secondaryTabs as tab (tab.id)}
          <div 
            class="secondary-tab-pill {tab.id === activeTabId ? 'active' : ''} {tab.isAiDraft ? 'has-draft' : ''} {draggedTabId === tab.id ? 'is-dragging' : ''} {dragOverTabId === tab.id ? 'drag-over' : ''}"
            draggable={editingTabId !== tab.id}
            ondragstart={(e) => handleDragStart(e, tab.id)}
            ondragover={(e) => handleDragOver(e, tab.id)}
            ondragleave={(e) => handleDragLeave(e, tab.id)}
            ondrop={(e) => handleDrop(e, tab.id)}
            ondragend={handleDragEnd}
            onclick={() => onSelectTab(tab.id)}
            ondblclick={() => startRename(tab)}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && onSelectTab(tab.id)}
          >
            <span class="fire-glyph">🔥</span>

            {#if editingTabId === tab.id}
              <input 
                type="text" 
                class="rename-input"
                bind:value={editInput} 
                onblur={commitRename}
                onkeydown={handleKeyDown}
                autofocus
              />
            {:else}
              <span class="tab-title" title={tab.title}>{tab.title}</span>
            {/if}

            {#if tab.isAiDraft}
              <span class="draft-badge">待審</span>
            {/if}

            <!-- 移回主頂欄按鈕 -->
            <button 
              class="move-up-btn" 
              onclick={(e) => { e.stopPropagation(); onMoveTabDeck(tab.id, 'primary'); }}
              title="移回主頂欄"
            >
              ↑
            </button>

            {#if tabs.length > 1}
              <button 
                class="close-btn" 
                onclick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                title="關閉分頁"
              >
                ×
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <span class="deck-hint">💡 點選主頂分頁的「↓」可移入次頂專注 AI 提煉</span>
    {/if}
  </div>

  <!-- 右側：AI 煉丹爐 (Ctrl+K)、SMEAR 游標開關、雙向對比 (精準對齊 code.html 第 8 行) -->
  <div class="deck-right">
    <button class="alchemy-trigger-btn" onclick={onOpenAiModal} title="開啟 AI 煉丹爐 (Ctrl+K)">
      <span class="diamond-sparkle"></span>
      <span class="alchemy-text">煉丹爐</span>
      <span class="ctrl-k-hint">Ctrl+K</span>
    </button>

    <button 
      class="smear-pill-btn" 
      onclick={() => (smearEnabled = !smearEnabled)}
      title="切換 Gruvbox 橘金雙阻尼物理拖尾游標"
    >
      <span class="smear-dot {smearEnabled ? 'on' : 'off'}"></span>
      <span class="smear-text">SMEAR_CURSOR: {smearEnabled ? 'ON' : 'OFF'}</span>
    </button>

    <button 
      class="diff-mode-btn {showDiffView ? 'active' : ''}" 
      onclick={onToggleDiffView}
      title="切換道藏古法雙欄對比模式"
    >
      <span class="material-symbols-outlined text-[13px]">vertical_split</span>
      <span>雙欄對照</span>
    </button>
  </div>
</div>

<style>
  /* 精準對齊 code.html 第 8 行：w-full bg-[#161817]/80 border-b border-[#292723]/40 px-4 sm:px-6 py-2 */
  .secondary-subbar {
    height: 38px;
    background: rgba(22, 24, 23, 0.85);
    border-bottom: 1px solid rgba(41, 39, 35, 0.45);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    gap: 12px;
    user-select: none;
    position: relative;
    z-index: 40;
    font-family: 'JetBrains Mono', monospace;
  }

  .deck-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .zenith-status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px;
    font-size: 11px;
    color: #736e63;
  }

  .zenith-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(201, 88, 71, 0.7);
  }

  .zenith-text {
    letter-spacing: 0.12em;
  }

  .alchemy-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 7px;
    background: #1f2020;
    border: 1px solid #504534;
    border-radius: 3px;
    color: #ece7dc;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .alchemy-action-btn:hover {
    background: #282a2a;
    border-color: #d49b35;
    color: #fabd2f;
  }

  .step-num {
    font-weight: 700;
  }

  .text-cinnabar { color: #c95847; }
  .text-ochre { color: #d49b35; }
  .text-olive { color: #869b74; }

  /* 中間次頂分頁 */
  .deck-center {
    flex: 1;
    overflow-x: auto;
    scrollbar-width: none;
    display: flex;
    align-items: center;
  }

  .deck-center::-webkit-scrollbar {
    display: none;
  }

  .sec-tabs-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: max-content;
  }

  .sec-label {
    font-size: 11px;
    color: #736e63;
  }

  .secondary-tab-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px;
    background: rgba(31, 32, 32, 0.85);
    border: 1px solid rgba(212, 155, 53, 0.4);
    border-radius: 3px;
    color: #ece7dc;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .secondary-tab-pill:hover {
    background: #282a2a;
    border-color: #fabd2f;
  }

  .secondary-tab-pill.active {
    background: rgba(212, 155, 53, 0.18);
    border-color: #fabd2f;
    color: #fabd2f;
    font-weight: 600;
  }

  .secondary-tab-pill.is-dragging {
    opacity: 0.4;
    cursor: grabbing;
  }

  .secondary-tab-pill.drag-over {
    border-left: 2px solid #fabd2f;
    background: rgba(250, 189, 47, 0.15);
  }

  .fire-glyph {
    font-size: 10px;
  }

  .tab-title {
    max-width: 140px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .draft-badge {
    font-size: 9px;
    padding: 0 3px;
    border-radius: 2px;
    background: #c95847;
    color: #fff;
  }

  .move-up-btn {
    background: transparent;
    border: none;
    color: #938c80;
    font-size: 11px;
    cursor: pointer;
    padding: 0 2px;
  }

  .move-up-btn:hover {
    color: #d49b35;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #736e63;
    font-size: 13px;
    cursor: pointer;
    padding: 0 2px;
  }

  .close-btn:hover {
    color: #c95847;
  }

  .deck-hint {
    font-size: 10px;
    color: #635f56;
  }

  /* 右側控制項 (精準對齊 code.html 第 2 行與第 8 行) */
  .deck-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .alchemy-trigger-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    background: transparent;
    border: none;
    color: #dcd7cb;
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .alchemy-trigger-btn:hover {
    color: #fff;
  }

  .diamond-sparkle {
    width: 6px;
    height: 6px;
    background: #d49b35;
    transform: rotate(45deg);
    transition: transform 0.15s;
    flex-shrink: 0;
  }

  .alchemy-trigger-btn:hover .diamond-sparkle {
    transform: rotate(45deg) scale(1.25);
  }

  .alchemy-text {
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.1em;
  }

  .ctrl-k-hint {
    font-size: 10px;
    color: #868074;
    padding: 0 4px;
    font-family: 'JetBrains Mono', monospace;
  }

  .smear-pill-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 2px 7px;
    background: transparent;
    border: 1px solid rgba(80, 69, 52, 0.4);
    border-radius: 3px;
    color: #868074;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .smear-pill-btn:hover {
    color: #dcd7cb;
    border-color: #d49b35;
  }

  .smear-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }

  .smear-dot.on {
    background: #869b74;
    box-shadow: 0 0 5px #869b74;
  }

  .smear-dot.off {
    background: #736e63;
  }

  .smear-text {
    letter-spacing: 0.05em;
  }

  .diff-mode-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    background: transparent;
    border: 1px solid rgba(80, 69, 52, 0.4);
    border-radius: 3px;
    color: #868074;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .diff-mode-btn:hover {
    color: #ece7dc;
    border-color: #d49b35;
  }

  .diff-mode-btn.active {
    background: #1f2020;
    border-color: #d49b35;
    color: #d49b35;
  }

  .rename-input {
    background: #0e0e0e;
    border: 1px solid #d49b35;
    color: #ece7dc;
    font-size: 11px;
    padding: 0 4px;
    border-radius: 2px;
    width: 80px;
    outline: none;
  }
</style>
