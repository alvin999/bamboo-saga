<script lang="ts">
  import type { TabItem, AlchemyCardConfig } from '../types/tab';
  import ShortcutCheatSheet from './ShortcutCheatSheet.svelte';
  import AlchemyPopover from './AlchemyPopover.svelte';

  interface PrimaryTopBarProps {
    vimMode: boolean;
    tabs: TabItem[];
    activeTabId: string;
    alchemyCards?: Record<string, AlchemyCardConfig>;
    isRefining?: boolean;
    isAlchemyOpen?: boolean;
    onSelectTab: (id: string) => void;
    onAddTab: () => void;
    onCloseTab: (id: string) => void;
    onRenameTab: (id: string, newTitle: string) => void;
    onMoveTabDeck: (id: string, deck: 'primary' | 'secondary') => void;
    onReorderTabs?: (sourceId: string, targetId: string) => void;
    onToggleFileBrowser: () => void;
    onOpenSettings: () => void;
    onOpenKeybindings?: () => void;
    onExecuteRefine?: (mode: string, customPrompt: string, cardPrompt?: string) => Promise<void>;
    onSaveAlchemyCards?: (cards: Record<string, AlchemyCardConfig>) => void;
    onShowToast?: (msg: string) => void;
    isSaved: boolean;
  }

  let { 
    vimMode = $bindable(false),
    tabs = [],
    activeTabId = '',
    alchemyCards = {},
    isRefining = false,
    isAlchemyOpen = $bindable(false),
    onSelectTab,
    onAddTab,
    onCloseTab,
    onRenameTab,
    onMoveTabDeck,
    onReorderTabs,
    onToggleFileBrowser,
    onOpenSettings,
    onOpenKeybindings,
    onExecuteRefine,
    onSaveAlchemyCards,
    onShowToast,
    isSaved = true
  }: PrimaryTopBarProps = $props();


  let isCheatSheetOpen = $state(false);
  let editingTabId = $state<string | null>(null);
  let editInput = $state('');
  let draggedTabId = $state<string | null>(null);
  let dragOverTabId = $state<string | null>(null);
  let isDeckDragOver = $state(false);

  // 統一由主頂欄管理所有分頁
  const primaryTabs = $derived(tabs);
  const activeTab = $derived(tabs.find((t: TabItem) => t.id === activeTabId) || null);

  function handleDragStart(e: DragEvent, id: string) {
    if (editingTabId) return;
    draggedTabId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'all';
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.setData('application/x-bamboo-tab', id);
    }
  }

  function handleDragEnter(e: DragEvent, id?: string) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    if (id && draggedTabId && draggedTabId !== id) {
      dragOverTabId = id;
    }
  }

  function handleDragOver(e: DragEvent, id?: string) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    if (id && draggedTabId && draggedTabId !== id) {
      dragOverTabId = id;
    }
  }

  function handleDragLeave(e: DragEvent, id: string) {
    const related = e.relatedTarget as HTMLElement | null;
    const current = e.currentTarget as HTMLElement | null;
    if (current && related && current.contains(related)) {
      return;
    }
    if (dragOverTabId === id) {
      dragOverTabId = null;
    }
  }

  function handleDrop(e: DragEvent, targetId?: string) {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = draggedTabId || e.dataTransfer?.getData('application/x-bamboo-tab') || e.dataTransfer?.getData('text/plain');
    if (sourceId) {
      if (targetId && sourceId !== targetId) {
        onReorderTabs?.(sourceId, targetId);
      } else {
        // 拖曳至主頂欄空白軌道處或自身
        onMoveTabDeck?.(sourceId, 'primary');
      }
    }
    draggedTabId = null;
    dragOverTabId = null;
    isDeckDragOver = false;
  }

  function handleDragEnd() {
    draggedTabId = null;
    dragOverTabId = null;
    isDeckDragOver = false;
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

<header class="constructivist-topbar">
  <div class="topbar-inner">
    <!-- 左側：品牌與檔案瀏覽庫 -->
    <div class="deck-left">
      <!-- 檔案總管按鈕 -->
      <button 
        class="file-vault-btn" 
        onclick={onToggleFileBrowser}
        title="開啟藏卷洞天·萬卷中控台 (Ctrl+B)"
      >
        <svg class="vault-icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <!-- 雙軸展卷古典卷軸 -->
          <line x1="7" y1="4" x2="17" y2="4" />
          <line x1="7" y1="20" x2="17" y2="20" />
          <path d="M7 4H4.5A1.5 1.5 0 0 0 3 5.5v13A1.5 1.5 0 0 0 4.5 20H7" />
          <path d="M17 4h2.5A1.5 1.5 0 0 1 21 5.5v13a1.5 1.5 0 0 1-1.5 1.5H17" />
          <path d="M7 4a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 7 20" />
          <path d="M17 4a1.5 1.5 0 0 0-1.5 1.5v13a1.5 1.5 0 0 0 1.5 1.5" />
          <line x1="10" y1="8.5" x2="14" y2="8.5" stroke-width="1.2" opacity="0.8" />
          <line x1="10" y1="12" x2="14" y2="12" stroke-width="1.2" opacity="0.8" />
          <line x1="10" y1="15.5" x2="13" y2="15.5" stroke-width="1.2" opacity="0.8" />
        </svg>
        <span class="vault-label">藏卷洞天</span>
      </button>

      <div class="brand-cluster select-none" title="廣零散 (bamboo-saga)">
        <span class="brand-icon">
          <svg class="brand-icon-svg" viewBox="0 0 24 24" width="20" height="20" fill="none">
            <!-- 左主幹幾何竹骨 -->
            <rect x="4.5" y="4" width="2.8" height="16" rx="1.2" fill="#8ec07c" />
            <!-- 幾何赭金節點扣環 -->
            <rect x="3.5" y="8.5" width="4.8" height="1.8" rx="0.9" fill="#fabd2f" />
            <rect x="3.5" y="13.5" width="4.8" height="1.8" rx="0.9" fill="#fabd2f" />

            <!-- 右側展開之幾何代碼竹簡條 (無葉純淨款) -->
            <rect x="9.5" y="6" width="9.5" height="2.4" rx="1" fill="#8ec07c" />
            <rect x="9.5" y="10.8" width="12" height="2.4" rx="1" fill="#b8bb26" />
            <rect x="9.5" y="15.6" width="8" height="2.4" rx="1" fill="#8ec07c" />

            <!-- 丹火幾何端點 (中央代碼行端點) -->
            <circle cx="20.2" cy="12" r="1.1" fill="#fe8019" />
          </svg>
        </span>
        <div class="brand-text">
          <img src="/logo-guangling-solid.svg" alt="廣零散" class="brand-title-svg" />
          <span class="brand-sub">BAMBOO·SAGA</span>
        </div>
      </div>

      <!-- 中間：主頂欄分頁標籤導航 -->
      <nav 
        class="nav-tabs-area {isDeckDragOver ? 'deck-drag-over' : ''}"
        ondragover={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          isDeckDragOver = true;
        }}
        ondragenter={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          isDeckDragOver = true;
        }}
        ondragleave={(e) => {
          const related = e.relatedTarget as HTMLElement | null;
          const current = e.currentTarget as HTMLElement | null;
          if (current && related && current.contains(related)) return;
          isDeckDragOver = false;
        }}
        ondrop={(e) => {
          isDeckDragOver = false;
          handleDrop(e);
        }}
      >
        {#each primaryTabs as tab (tab.id)}
          <div 
            class="tab-anchor {tab.id === activeTabId ? 'active' : ''} {tab.isAiDraft ? 'has-draft' : ''} {draggedTabId === tab.id ? 'is-dragging' : ''} {dragOverTabId === tab.id ? 'drag-over' : ''}"
            draggable={editingTabId !== tab.id}
            ondragstart={(e) => handleDragStart(e, tab.id)}
            ondragenter={(e) => handleDragEnter(e, tab.id)}
            ondragover={(e) => handleDragOver(e, tab.id)}
            ondragleave={(e) => handleDragLeave(e, tab.id)}
            ondrop={(e) => {
              e.stopPropagation();
              handleDrop(e, tab.id);
            }}
            ondragend={handleDragEnd}
            onclick={() => onSelectTab(tab.id)}
            ondblclick={() => startRename(tab)}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && onSelectTab(tab.id)}
          >
            <span class="tab-dot {tab.id === activeTabId ? 'active' : ''}"></span>

            {#if editingTabId === tab.id}
              <!-- svelte-ignore a11y_autofocus -->
              <input 
                type="text" 
                class="rename-input"
                bind:value={editInput} 
                onblur={commitRename}
                onkeydown={handleKeyDown}
                autofocus
              />
            {:else}
              <span class="tab-label" title={tab.title}>{tab.title}</span>
            {/if}

            {#if tab.isAiDraft}
              <span class="draft-tag">丹</span>
            {/if}

            {#if tabs.length > 1}
              <button 
                class="close-action-btn" 
                onclick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                title="收合新簡 (Ctrl+W)"
              >
                ×
              </button>
            {/if}

            <!-- 底部 1px 橘金底線 (Bauhaus Ochre Underline) -->
            {#if tab.id === activeTabId}
              <span class="ochre-underline"></span>
            {/if}
          </div>
        {/each}

        <button class="add-tab-link" onclick={onAddTab} title="新增隨手素簡 (Ctrl+T)">
          <span class="plus-symbol">+</span>
          <span>添新簡</span>
        </button>
      </nav>
    </div>

    <!-- 右側：SYNC 狀態、模式切換、偏好設定 -->
    <div class="deck-right">
      <div class="sync-cluster" title="旗艦級防重開機不滅記憶">
        <span class="sync-dot {isSaved ? 'synced' : 'saving'}"></span>
        <span class="sync-readout">{isSaved ? 'SYNC // 0.01MS' : 'FLUSH // VAULT'}</span>
      </div>

      <!-- 意圖煉丹爐：Hover 展開配置、整合核心提煉與自訂新增 -->
      {#if onExecuteRefine}
        <AlchemyPopover 
          {activeTab}
          {alchemyCards}
          {isRefining}
          bind:isOpen={isAlchemyOpen}
          {onExecuteRefine}
          {onSaveAlchemyCards}
          {onOpenSettings}
          {onShowToast}
        />
      {/if}

      <button 
        class="tune-btn shortcut-btn {isCheatSheetOpen ? 'active' : ''}" 
        onclick={() => (isCheatSheetOpen = !isCheatSheetOpen)} 
        title="快捷鍵速查說明指南"
      >
        <span class="material-symbols-outlined text-[16px]">keyboard</span>
      </button>

      <button class="tune-btn" onclick={onOpenSettings} title="偏好設定與 API 金鑰">
        <span class="material-symbols-outlined text-[16px]">tune</span>
      </button>
    </div>
  </div>

  <ShortcutCheatSheet 
    isOpen={isCheatSheetOpen}
    onClose={() => (isCheatSheetOpen = false)}
    onNavigateToSettings={onOpenKeybindings || onOpenSettings}
  />
</header>

<style>
  /* 56px 高度、深沉背景、構成主義分割線 (精準對齊 code.html 第 2 行) */
  .constructivist-topbar {
    height: 56px;
    background: rgba(20, 22, 21, 0.95);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(45, 43, 39, 0.4);
    position: relative;
    z-index: 50;
    user-select: none;
  }

  .topbar-inner {
    height: 100%;
    width: 100%;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(80, 69, 52, 0.4);
  }

  .deck-left {
    display: flex;
    align-items: center;
    gap: 20px;
    flex: 1;
    min-width: 0;
  }

  /* 卷軸庫檔案瀏覽按鈕 */
  .file-vault-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: #1f2020;
    border: 1px solid rgba(80, 69, 52, 0.5);
    border-radius: 3px;
    color: #ece7dc;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .file-vault-btn:hover {
    background: #282a2a;
    border-color: #d49b35;
    color: #d49b35;
  }

  .vault-icon-svg {
    display: inline-block;
    flex-shrink: 0;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .file-vault-btn:hover .vault-icon-svg {
    transform: scale(1.1);
  }

  .vault-label {
    letter-spacing: 0.05em;
  }

  /* 品牌組合 */
  .brand-cluster {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-shrink: 0;
  }

  .brand-icon {
    font-size: 16px;
    line-height: 16px;
    height: 20px;
    width: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
  }

  .brand-icon-svg {
    display: block;
    width: 20px;
    height: 20px;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .brand-cluster:hover .brand-icon-svg {
    transform: scale(1.12);
  }

  .brand-text {
    display: flex;
    flex-direction: column;
  }

  .brand-title-svg {
    height: 16px;
    width: auto;
    display: block;
    user-select: none;
    -webkit-user-drag: none;
    transform: translateY(1px);
  }

  .brand-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #938c80;
    letter-spacing: 0.18em;
    margin-top: 2px;
  }

  /* 分頁導航列 */
  .nav-tabs-area {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
    padding-left: 8px;
    flex: 1;
  }

  .nav-tabs-area::-webkit-scrollbar {
    display: none;
  }

  .nav-tabs-area.deck-drag-over {
    background: rgba(212, 155, 53, 0.08);
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px rgba(212, 155, 53, 0.35);
    transition: background 0.15s ease, box-shadow 0.15s ease;
  }

  .tab-anchor {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: #938c80;
    position: relative;
    cursor: pointer;
    transition: color 0.15s ease;
    white-space: nowrap;
    border-radius: 3px 3px 0 0;
    user-select: none;
    -webkit-user-select: none;
  }

  .tab-anchor :global(.tab-dot),
  .tab-anchor :global(.tab-label),
  .tab-anchor :global(.draft-tag),
  .tab-anchor :global(.ochre-underline) {
    pointer-events: none;
  }

  .tab-anchor :global(.close-action-btn),
  .tab-anchor :global(.rename-input) {
    pointer-events: auto;
  }

  .tab-anchor:hover {
    color: #dcd7cb;
  }

  .tab-anchor.active {
    color: #ece7dc;
    font-weight: 500;
  }

  .tab-anchor.is-dragging {
    opacity: 0.4;
    cursor: grabbing;
  }

  .tab-anchor.drag-over {
    border-left: 2px solid #fabd2f;
    background: rgba(250, 189, 47, 0.08);
  }

  .tab-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #5b564c;
    flex-shrink: 0;
  }

  .tab-dot.active {
    width: 6px;
    height: 6px;
    background: #d49b35;
    box-shadow: 0 0 6px rgba(212, 155, 53, 0.7);
  }

  .tab-label {
    letter-spacing: 0.02em;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .draft-tag {
    font-size: 9px;
    padding: 0 4px;
    border-radius: 2px;
    background: rgba(212, 155, 53, 0.2);
    color: #d49b35;
    border: 1px solid #d49b35;
  }

  .close-action-btn {
    background: transparent;
    border: none;
    color: #736e63;
    font-size: 13px;
    cursor: pointer;
    padding: 0 2px;
  }

  .close-action-btn:hover {
    color: #c95847;
  }

  /* 底部 1px 橘金發光標記 */
  .ochre-underline {
    position: absolute;
    bottom: 0;
    left: 12px;
    right: 12px;
    height: 1px;
    background: rgba(212, 155, 53, 0.85);
    box-shadow: 0 0 6px rgba(212, 155, 53, 0.8);
  }

  .add-tab-link {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px 8px;
    color: #938c80;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.08em;
    cursor: pointer;
    background: transparent;
    border: none;
    transition: color 0.15s ease;
  }

  .add-tab-link:hover {
    color: #dcd7cb;
  }

  .plus-symbol {
    font-size: 13px;
    line-height: 1;
  }

  /* 右側狀態 */
  .deck-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .sync-cluster {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #938c80;
  }

  .sync-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .sync-dot.synced {
    background: #c95847;
    opacity: 0.85;
    box-shadow: 0 0 6px rgba(201, 88, 71, 0.7);
  }

  .sync-dot.saving {
    background: #d49b35;
    box-shadow: 0 0 6px rgba(212, 155, 53, 0.7);
    animation: pulse 0.7s infinite alternate;
  }

  @keyframes pulse {
    from { opacity: 0.3; }
    to { opacity: 1; }
  }

  .sync-readout {
    letter-spacing: 0.08em;
  }

  .tune-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: transparent;
    border: none;
    color: #868074;
    cursor: pointer;
    transition: color 0.15s;
  }

  .tune-btn:hover,
  .tune-btn.active {
    color: #dcd7cb;
  }

  .shortcut-btn.active {
    color: #d49b35;
    background: rgba(212, 155, 53, 0.1);
    border-radius: 3px;
  }

  .rename-input {
    background: #0e0e0e;
    border: 1px solid #d49b35;
    color: #ece7dc;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
    padding: 1px 4px;
    border-radius: 2px;
    width: 90px;
    outline: none;
  }
</style>
