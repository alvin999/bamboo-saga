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
    onToggleFileBrowser: () => void;
    onOpenSettings: () => void;
    isSaved: boolean;
  }>();

  let editingTabId = $state<string | null>(null);
  let editInput = $state('');

  // 僅篩選停靠在主頂欄的分頁 (未特別指定時預設在 primary)
  const primaryTabs = $derived(tabs.filter((t) => t.deck !== 'secondary'));

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
        <span class="material-symbols-outlined text-[15px]">folder_open</span>
        <span class="vault-label">卷軸庫</span>
      </button>

      <div class="brand-cluster select-none">
        <span class="brand-icon">🎋</span>
        <div class="brand-text">
          <span class="brand-title">廣零散</span>
          <span class="brand-sub">BAMBOO·SAGA</span>
        </div>
        <span class="brand-badge">[01]</span>
      </div>

      <!-- 中間：主頂欄分頁標籤導航 -->
      <nav class="nav-tabs-area">
        {#each primaryTabs as tab (tab.id)}
          <div 
            class="tab-anchor {tab.id === activeTabId ? 'active' : ''} {tab.isAiDraft ? 'has-draft' : ''}"
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

      <button 
        class="mode-badge {vimMode ? 'active' : ''}" 
        onclick={() => (vimMode = !vimMode)}
        title="切換 Vim 編輯模式"
      >
        {vimMode ? 'MODE // VIM' : 'MODE // STD-EDIT'}
      </button>

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

  .brand-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 15px;
    font-weight: 500;
    letter-spacing: 0.18em;
    color: #ece7dc;
    line-height: 1.1;
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
  }

  .tab-anchor:hover {
    color: #dcd7cb;
  }

  .tab-anchor.active {
    color: #ece7dc;
    font-weight: 500;
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

  .mode-badge {
    padding: 2px 7px;
    background: transparent;
    border: 1px solid rgba(80, 69, 52, 0.4);
    border-radius: 3px;
    color: #736e63;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: all 0.15s;
  }

  .mode-badge:hover {
    color: #ece7dc;
    border-color: #d49b35;
  }

  .mode-badge.active {
    background: rgba(212, 155, 53, 0.15);
    color: #d49b35;
    border-color: #d49b35;
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
