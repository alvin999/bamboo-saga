<script lang="ts">
  import type { TabItem, AlchemyCardConfig } from '../types/tab';
  import ShortcutCheatSheet from './ShortcutCheatSheet.svelte';
  import AlchemyPopover from './AlchemyPopover.svelte';
  import BrandQuickMenu from './BrandQuickMenu.svelte';

  interface PrimaryTopBarProps {
    vimMode: boolean;
    smearEnabled?: boolean;
    workbenchWidth?: 'zen' | 'full';
    autoOneDriveBackup?: boolean;
    selectedOneDrivePath?: string;
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
    onManualSave?: () => void;
    onOpenFuzzy?: () => void;
    onSaveAs?: () => void;
    onOpenHistory?: () => void;
    onOpenBackup?: () => void;
    onToggleVim?: () => void;
    onToggleSmear?: () => void;
    onToggleWorkbenchWidth?: () => void;
    onOpenSettings: () => void;
    onOpenKeybindings?: () => void;
    onExecuteRefine?: (mode: string, customPrompt: string, cardPrompt?: string) => Promise<void>;
    onSaveAlchemyCards?: (cards: Record<string, AlchemyCardConfig>) => void;
    onToggleAiChat?: () => void;
    isAiChatOpen?: boolean;
    onShowToast?: (msg: string) => void;
    isSaved: boolean;
  }

  let { 
    vimMode = $bindable(false),
    smearEnabled = true,
    workbenchWidth = 'zen',
    autoOneDriveBackup = false,
    selectedOneDrivePath = '',
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
    onManualSave,
    onOpenFuzzy,
    onSaveAs,
    onOpenHistory,
    onOpenBackup,
    onToggleVim,
    onToggleSmear,
    onToggleWorkbenchWidth,
    onOpenSettings,
    onOpenKeybindings,
    onExecuteRefine,
    onSaveAlchemyCards,
    onToggleAiChat,
    isAiChatOpen = false,
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
    <!-- 左側：品牌 Logo 快捷中樞 (Hover 展開藏卷洞天與全域捷徑) -->
    <div class="deck-left">
      <BrandQuickMenu 
        {vimMode}
        {smearEnabled}
        {workbenchWidth}
        {autoOneDriveBackup}
        {selectedOneDrivePath}
        {onToggleFileBrowser}
        {onAddTab}
        {onManualSave}
        {onOpenFuzzy}
        {onSaveAs}
        {onOpenHistory}
        {onOpenBackup}
        {onToggleVim}
        {onToggleSmear}
        {onToggleWorkbenchWidth}
        onOpenCheatSheet={() => (isCheatSheetOpen = true)}
        {onOpenSettings}
      />

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

      {#if onToggleAiChat}
        <button 
          class="tune-btn ai-chat-btn {isAiChatOpen ? 'active' : ''}" 
          onclick={onToggleAiChat} 
          title="竹語參謀 (AI 問道多輪對話 Alt+I / Ctrl+J)"
        >
          <span class="material-symbols-outlined text-[16px]">forum</span>
        </button>
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

  .ai-chat-btn.active {
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.12);
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
