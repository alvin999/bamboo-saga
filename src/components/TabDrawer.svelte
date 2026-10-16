<script lang="ts">
  import type { TabItem } from '../types/tab';

  let {
    tabs = [],
    activeTabId = '',
    onSelectTab,
    onAddTab,
    onCloseTab,
    onRenameTab
  } = $props<{
    tabs: TabItem[];
    activeTabId: string;
    onSelectTab: (id: string) => void;
    onAddTab: () => void;
    onCloseTab: (id: string) => void;
    onRenameTab: (id: string, newTitle: string) => void;
  }>();

  let editingTabId = $state<string | null>(null);
  let editInput = $state('');

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

<div class="drawer-bar">
  <div class="tabs-scroller">
    {#each tabs as tab (tab.id)}
      <div 
        class="tab-card {tab.id === activeTabId ? 'active' : ''} {tab.isAiDraft ? 'has-draft' : ''}"
        onclick={() => onSelectTab(tab.id)}
        ondblclick={() => startRename(tab)}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && onSelectTab(tab.id)}
      >
        <span class="tab-knot"></span>
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
          <span class="draft-badge" title="此藥帖有未審核的 AI 整理結果">丹</span>
        {/if}

        {#if tabs.length > 1}
          <button 
            class="close-btn" 
            onclick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
            title="收合新簡 (Ctrl+W)"
          >
            ×
          </button>
        {/if}
      </div>
    {/each}

    <button class="add-tab-btn" onclick={onAddTab} title="新增隨手素簡 (Ctrl+T)">
      <span class="plus-icon">+</span>
      <span>添新簡</span>
    </button>
  </div>
</div>

<style>
  .drawer-bar {
    background: #282828;
    border-bottom: 1px solid #3c3836;
    display: flex;
    align-items: center;
    padding: 6px 10px 0 10px;
    user-select: none;
    overflow-x: auto;
  }

  .tabs-scroller {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: max-content;
  }

  .tab-card {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    background: #1d2021;
    border: 1px solid #3c3836;
    border-bottom: none;
    border-radius: 6px 6px 0 0;
    color: #a89984;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
    position: relative;
    max-width: 220px;
  }

  .tab-card:hover {
    color: #ebdbb2;
    background: #242220;
  }

  .tab-card.active {
    background: #1d2021;
    color: #fabd2f;
    border-color: #504945;
    border-top: 2px solid #fe8019;
    box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.25);
  }

  .tab-card.has-draft {
    border-top-color: #b8bb26;
  }

  .tab-knot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #7c6f64;
  }

  .tab-card.active .tab-knot {
    background: #fe8019;
  }

  .tab-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rename-input {
    background: #32302f;
    color: #fbf1c7;
    border: 1px solid #fe8019;
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 0.8rem;
    width: 100px;
    outline: none;
  }

  .draft-badge {
    font-size: 0.65rem;
    padding: 1px 4px;
    border-radius: 4px;
    background: rgba(184, 187, 38, 0.25);
    color: #b8bb26;
    font-weight: bold;
    border: 1px solid rgba(184, 187, 38, 0.4);
  }

  .close-btn {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    font-size: 14px;
    line-height: 1;
    color: #7c6f64;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 2px;
  }

  .close-btn:hover {
    background: #cc241d;
    color: #fbf1c7;
  }

  .add-tab-btn {
    height: 28px;
    padding: 0 10px;
    border-radius: 4px;
    background: transparent;
    color: #928374;
    font-size: 0.78rem;
    gap: 4px;
    border: 1px dashed #3c3836;
    margin-left: 4px;
  }

  .add-tab-btn:hover {
    background: #32302f;
    color: #ebdbb2;
    border-color: #504945;
  }

  .plus-icon {
    font-size: 1rem;
    line-height: 1;
  }
</style>
