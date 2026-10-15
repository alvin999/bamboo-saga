<script lang="ts">
  import type { TabItem } from '../types/tab';

  let { 
    vimMode = $bindable(false),
    tabs = [],
    activeTabId = '',
    onSelectTab,
    onAddTab,
    onCloseTab,
    onRenameTab,
    onMoveTabDeck,
    onReorderTabs,
    onToggleFileBrowser,
    onOpenSettings,
    isSaved = true
  } = $props<{
    vimMode: boolean;
    tabs: TabItem[];
    activeTabId: string;
    onSelectTab: (id: string) => void;
    onAddTab: () => void;
    onCloseTab: (id: string) => void;
    onRenameTab: (id: string, newTitle: string) => void;
    onMoveTabDeck: (id: string, deck: 'primary' | 'secondary') => void;
    onReorderTabs?: (sourceId: string, targetId: string) => void;
    onToggleFileBrowser: () => void;
    onOpenSettings: () => void;
    isSaved: boolean;
  }>();

  let editingTabId = $state<string | null>(null);
  let editInput = $state('');
  let draggedTabId = $state<string | null>(null);
  let dragOverTabId = $state<string | null>(null);

  // 僅篩選停靠在主頂欄的分頁 (未特別指定時預設在 primary)
  const primaryTabs = $derived(tabs.filter((t: TabItem) => t.deck !== 'secondary'));

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
    const sourceId = draggedTabId || e.dataTransfer?.getData('application/x-bamboo-tab') || e.dataTransfer?.getData('text/plain');
    if (sourceId && targetId && sourceId !== targetId) {
      onReorderTabs?.(sourceId, targetId);
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

<header class="constructivist-topbar">
  <div class="topbar-inner">
    <!-- 左側：品牌與檔案瀏覽庫 -->
    <div class="deck-left">
      <!-- 檔案總管按鈕 -->
      <button 
        class="file-vault-btn" 
        onclick={onToggleFileBrowser}
        title="開啟百子櫃檔案總管 (Ctrl+B)"
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
        <span class="vault-label">卷軸庫</span>
      </button>

      <div class="brand-cluster select-none">
        <span class="brand-icon">🎋</span>
        <div class="brand-text">
          <img src="/logo-guangling-solid.svg" alt="廣零散" class="brand-title-svg" />
          <span class="brand-sub">BAMBOO·SAGA</span>
        </div>
        <span class="brand-badge">[01]</span>
      </div>

      <!-- 中間：主頂欄分頁標籤導航 -->
      <nav 
        class="nav-tabs-area"
        ondragover={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        }}
        ondragenter={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
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
            ondrop={(e) => handleDrop(e, tab.id)}
            ondragend={handleDragEnd}
            onclick={() => onSelectTab(tab.id)}
            ondblclick={() => startRename(tab)}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && onSelectTab(tab.id)}
          >
            <span class="tab-dot {tab.id === activeTabId ? 'active' : ''}"></span>

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
              <span class="tab-label" title={tab.title}>{tab.title}</span>
            {/if}

            {#if tab.isAiDraft}
              <span class="draft-tag">丹</span>
            {/if}

            <!-- 移動至次頂煉丹欄按鈕 -->
            <button 
              class="deck-action-btn" 
              onclick={(e) => { e.stopPropagation(); onMoveTabDeck(tab.id, 'secondary'); }}
              title="將此藥帖移至次頂 AI 煉丹甲板"
            >
              ↓
            </button>

            {#if tabs.length > 1}
              <button 
                class="close-action-btn" 
                onclick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                title="關閉藥帖"
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

        <button class="add-tab-link" onclick={onAddTab} title="新增隨手藥帖">
          <span class="plus-symbol">+</span>
          <span>添藥帖</span>
        </button>
      </nav>
    </div>

    <!-- 右側：SYNC 狀態、模式切換、偏好設定 -->
    <div class="deck-right">
      <div class="sync-cluster" title="旗艦級防重開機不滅記憶">
        <span class="sync-dot {isSaved ? 'synced' : 'saving'}"></span>
        <span class="sync-readout">{isSaved ? 'SYNC // 0.01MS' : 'FLUSH // VAULT'}</span>
      </div>

      <button class="tune-btn" onclick={onOpenSettings} title="偏好設定與 API 金鑰">
        <span class="material-symbols-outlined text-[16px]">tune</span>
      </button>
    </div>
  </div>
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
    line-height: 1;
    opacity: 0.9;
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
  }

  .brand-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #938c80;
    letter-spacing: 0.18em;
    margin-top: -2px;
  }

  .brand-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #b59e72;
    letter-spacing: 0.1em;
    padding: 1px 6px;
    border-radius: 3px;
    background: rgba(181, 158, 114, 0.08);
    border: 1px solid rgba(80, 69, 52, 0.35);
    opacity: 0.85;
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

  .tab-anchor :global(.deck-action-btn),
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

  .deck-action-btn {
    background: transparent;
    border: none;
    color: #736e63;
    font-size: 11px;
    cursor: pointer;
    padding: 0 2px;
    border-radius: 2px;
  }

  .deck-action-btn:hover {
    color: #d49b35;
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

  .tune-btn:hover {
    color: #dcd7cb;
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
