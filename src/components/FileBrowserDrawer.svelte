<script lang="ts">
  import type { TabItem } from '../types/tab';

  let {
    isOpen = false,
    tabs = [],
    activeTabId = '',
    onSelectTab,
    onAddTab,
    onCloseTab,
    onCloseDrawer
  } = $props<{
    isOpen: boolean;
    tabs: TabItem[];
    activeTabId: string;
    onSelectTab: (id: string) => void;
    onAddTab: () => void;
    onCloseTab: (id: string) => void;
    onCloseDrawer: () => void;
  }>();

  let searchQuery = $state('');

  const filteredTabs = $derived(
    tabs.filter((t) => 
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.content.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  function handleExportAll() {
    const backupData = JSON.stringify(tabs, null, 2);
    const blob = new Blob([backupData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bamboo-saga-vault-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

{#if isOpen}
  <!-- 遮罩層 (點擊收合) -->
  <div class="drawer-backdrop" onclick={onCloseDrawer} role="presentation"></div>

  <!-- 側邊檔案瀏覽器 (File Browser / Explorer) -->
  <aside class="file-browser-drawer" aria-label="藥帖卷軸庫檔案瀏覽器">
    <div class="drawer-header">
      <div class="header-title">
        <span class="icon">📁</span>
        <span class="title-text">百子櫃檔案總管</span>
        <span class="badge">{tabs.length} 帖</span>
      </div>
      <button class="close-drawer-btn" onclick={onCloseDrawer} title="收起檔案瀏覽器">
        ✕
      </button>
    </div>

    <!-- 檔案快速搜尋列 -->
    <div class="search-box">
      <input 
        type="text" 
        placeholder="搜尋藥帖內容或標題..." 
        bind:value={searchQuery}
        class="search-input"
      />
      {#if searchQuery}
        <button class="clear-search-btn" onclick={() => (searchQuery = '')}>✕</button>
      {/if}
    </div>

    <!-- 快捷操作列 -->
    <div class="drawer-actions">
      <button class="action-btn primary" onclick={() => { onAddTab(); }}>
        <span>+ 新闢藥帖</span>
      </button>
      <button class="action-btn" onclick={handleExportAll} title="備份導出全卷軸 JSON">
        <span>⤓ 全卷導出</span>
      </button>
    </div>

    <!-- 藥帖文件樹列表 -->
    <div class="file-list">
      {#if filteredTabs.length === 0}
        <div class="empty-state">
          <span>無相符的藥帖卷軸</span>
        </div>
      {:else}
        {#each filteredTabs as tab (tab.id)}
          <div 
            class="file-item {tab.id === activeTabId ? 'active' : ''}"
            onclick={() => { onSelectTab(tab.id); onCloseDrawer(); }}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && onSelectTab(tab.id)}
          >
            <div class="item-main">
              <span class="file-icon">{tab.language === 'markdown' ? '📝' : '📜'}</span>
              <div class="file-meta">
                <span class="file-name" title={tab.title}>{tab.title}</span>
                <span class="file-sub">
                  {tab.language.toUpperCase()} · {tab.content.length} 字元 · {tab.deck === 'secondary' ? '次頂煉丹欄' : '主頂欄'}
                </span>
              </div>
            </div>

            <div class="item-actions">
              {#if tab.isAiDraft}
                <span class="tag-draft">丹</span>
              {/if}
              {#if tabs.length > 1}
                <button 
                  class="del-file-btn" 
                  onclick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                  title="歸檔刪除此藥帖"
                >
                  ✕
                </button>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <div class="drawer-footer">
      <span class="hint">快捷鍵：主頂欄隨時一鍵開關</span>
    </div>
  </aside>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 100;
  }

  .file-browser-drawer {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 320px;
    background: #161817;
    border-right: 1px solid #504534;
    box-shadow: 10px 0 40px rgba(0, 0, 0, 0.7);
    z-index: 101;
    display: flex;
    flex-direction: column;
    animation: drawer-slide-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes drawer-slide-in {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }

  .drawer-header {
    height: 52px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #2d2b27;
    background: #141615;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono, monospace);
  }

  .title-text {
    font-weight: 600;
    font-size: 0.9rem;
    color: #ece7dc;
    letter-spacing: 0.05em;
  }

  .badge {
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 4px;
    background: #242220;
    color: #b59e72;
    border: 1px solid #504534;
  }

  .close-drawer-btn {
    background: transparent;
    border: none;
    color: #938c80;
    font-size: 1rem;
    cursor: pointer;
    padding: 4px;
  }

  .close-drawer-btn:hover {
    color: #ece7dc;
  }

  .search-box {
    padding: 10px 14px;
    position: relative;
    border-bottom: 1px solid #262420;
  }

  .search-input {
    width: 100%;
    height: 32px;
    padding: 0 28px 0 10px;
    background: #0e0e0e;
    border: 1px solid #504534;
    border-radius: 4px;
    color: #ece7dc;
    font-size: 0.78rem;
    font-family: var(--font-mono, monospace);
    outline: none;
  }

  .search-input:focus {
    border-color: #d49b35;
  }

  .clear-search-btn {
    position: absolute;
    right: 22px;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    color: #938c80;
    cursor: pointer;
  }

  .drawer-actions {
    display: flex;
    gap: 8px;
    padding: 8px 14px;
    border-bottom: 1px solid #262420;
  }

  .action-btn {
    flex: 1;
    height: 28px;
    border-radius: 4px;
    background: #1f2020;
    border: 1px solid #504534;
    color: #ece7dc;
    font-size: 0.75rem;
    font-family: var(--font-mono, monospace);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn:hover {
    background: #292a2a;
    border-color: #d49b35;
    color: #d49b35;
  }

  .action-btn.primary {
    background: #d49b35;
    color: #141615;
    border-color: #d49b35;
    font-weight: 600;
  }

  .action-btn.primary:hover {
    background: #fabd2f;
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px 8px;
  }

  .file-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: 4px;
    border: 1px solid transparent;
    cursor: pointer;
    margin-bottom: 4px;
    transition: all 0.12s ease;
  }

  .file-item:hover {
    background: #1f2020;
    border-color: #504534;
  }

  .file-item.active {
    background: #242220;
    border-color: #d49b35;
  }

  .item-main {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .file-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .file-name {
    font-size: 0.82rem;
    color: #ece7dc;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-item.active .file-name {
    color: #d49b35;
    font-weight: 600;
  }

  .file-sub {
    font-size: 0.68rem;
    font-family: var(--font-mono, monospace);
    color: #938c80;
    margin-top: 2px;
  }

  .item-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tag-draft {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(212, 155, 53, 0.2);
    color: #d49b35;
    border: 1px solid #d49b35;
    font-weight: 600;
  }

  .del-file-btn {
    background: transparent;
    border: none;
    color: #736e63;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
  }

  .del-file-btn:hover {
    color: #c95847;
    background: rgba(201, 88, 71, 0.15);
  }

  .empty-state {
    padding: 30px;
    text-align: center;
    color: #736e63;
    font-size: 0.8rem;
    font-family: var(--font-mono, monospace);
  }

  .drawer-footer {
    height: 32px;
    padding: 0 14px;
    background: #111312;
    border-top: 1px solid #262420;
    display: flex;
    align-items: center;
    font-size: 0.68rem;
    font-family: var(--font-mono, monospace);
    color: #736e63;
  }
</style>
