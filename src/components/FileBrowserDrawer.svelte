<script lang="ts">
  import type { TabItem, VaultFileEntry, RecentFileRecord } from '../types/tab';
  import Fuse from 'fuse.js';

  let {
    isOpen = false,
    tabs = [],
    activeTabId = '',
    vaultFolderPath = '',
    vaultFiles = [],
    recentFiles = [],
    isScanning = false,
    onSelectTab,
    onAddTab,
    onCloseTab,
    onCloseDrawer,
    onPickFolder,
    onRefreshFolder,
    onOpenVaultFile,
    onOpenFuzzyModal,
    onClearRecent
  } = $props<{
    isOpen: boolean;
    tabs: TabItem[];
    activeTabId: string;
    vaultFolderPath: string;
    vaultFiles: VaultFileEntry[];
    recentFiles: RecentFileRecord[];
    isScanning: boolean;
    onSelectTab: (id: string) => void;
    onAddTab: () => void;
    onCloseTab: (id: string) => void;
    onCloseDrawer: () => void;
    onPickFolder: () => void;
    onRefreshFolder: () => void;
    onOpenVaultFile: (file: VaultFileEntry) => void;
    onOpenFuzzyModal: (initialMode?: 'fuzzy' | 'ai') => void;
    onClearRecent: () => void;
  }>();

  let searchQuery = $state('');
  let activeView = $state<'all' | 'folder' | 'tabs'>('all');

  // Fuse 模糊比對資料夾檔案
  const fileFuse = $derived(
    new Fuse(vaultFiles, {
      keys: [
        { name: 'name', weight: 0.6 },
        { name: 'rel_path', weight: 0.25 },
        { name: 'preview', weight: 0.15 },
      ],
      threshold: 0.45,
    })
  );

  const filteredVaultFiles = $derived.by(() => {
    if (!searchQuery.trim()) return vaultFiles;
    return fileFuse.search(searchQuery).map((r) => r.item);
  });

  // Fuse 模糊比對分頁
  const tabFuse = $derived(
    new Fuse(tabs, {
      keys: [
        { name: 'title', weight: 0.7 },
        { name: 'content', weight: 0.3 },
      ],
      threshold: 0.45,
    })
  );

  const filteredTabs = $derived.by(() => {
    if (!searchQuery.trim()) return tabs;
    return tabFuse.search(searchQuery).map((r) => r.item);
  });

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

  function formatTime(timestamp: number) {
    if (!timestamp) return '';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return '剛剛';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
    return new Date(timestamp).toLocaleDateString();
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
        <span class="title-text">藥帖卷軸庫</span>
        <span class="badge">{tabs.length} 帖</span>
      </div>
      <button class="close-drawer-btn" onclick={onCloseDrawer} title="收起檔案瀏覽器">
        ✕
      </button>
    </div>

    <!-- 1. 本機資料夾連線狀態列 -->
    <div class="folder-sync-section">
      <div class="folder-info">
        {#if vaultFolderPath}
          <div class="folder-path-box" title={vaultFolderPath}>
            <span class="folder-icon">📂</span>
            <span class="folder-name">{vaultFolderPath.split(/[/|\\]/).pop() || '本機筆記庫'}</span>
            <span class="folder-count">({vaultFiles.length} 檔案)</span>
          </div>
        {:else}
          <div class="folder-path-box unlinked">
            <span class="folder-icon">⚠️</span>
            <span class="folder-name">尚未連接本機資料夾</span>
          </div>
        {/if}
      </div>

      <div class="folder-actions">
        <button class="folder-btn primary" onclick={onPickFolder} title="選擇電腦實體資料夾連線">
          <span>{vaultFolderPath ? '切換資料夾' : '🔗 連接資料夾'}</span>
        </button>
        {#if vaultFolderPath}
          <button class="folder-btn" onclick={onRefreshFolder} disabled={isScanning} title="重新整理掃描資料夾">
            <span>{isScanning ? '⏳' : '🔄'}</span>
          </button>
        {/if}
      </div>
    </div>

    <!-- 2. 最近開啟專區 (Recent Opened) -->
    {#if recentFiles.length > 0}
      <div class="recent-section">
        <div class="section-title-row">
          <span class="sec-title">🕒 最近開啟</span>
          <button class="clear-recent-btn" onclick={onClearRecent} title="清除歷史紀錄">清除</button>
        </div>
        <div class="recent-pills">
          {#each recentFiles.slice(0, 5) as rf}
            <button
              class="recent-pill-btn"
              onclick={() => {
                const vf = vaultFiles.find((f) => f.path === rf.path);
                if (vf) onOpenVaultFile(vf);
                else {
                  const t = tabs.find((x) => x.filePath === rf.path);
                  if (t) onSelectTab(t.id);
                }
              }}
              title={`${rf.title}\n路徑: ${rf.path}\n摘要: ${rf.preview}`}
            >
              <span class="pill-title">{rf.title}</span>
              <span class="pill-time">{formatTime(rf.lastOpened)}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- 3. 檔案快速搜尋列 + 全域跳轉與 AI 助查快捷按鈕 -->
    <div class="search-box">
      <div class="input-row">
        <input 
          type="text" 
          placeholder="模糊搜尋檔名或筆記內容..." 
          bind:value={searchQuery}
          class="search-input"
        />
        {#if searchQuery}
          <button class="clear-search-btn" onclick={() => (searchQuery = '')}>✕</button>
        {/if}
      </div>

      <div class="quick-assist-bar">
        <button class="assist-btn" onclick={() => onOpenFuzzyModal('fuzzy')} title="喚起 Ctrl+P 全域跳轉面板">
          <span>⚡ Fuzzy Find (Ctrl+P)</span>
        </button>
        <button class="assist-btn ai" onclick={() => onOpenFuzzyModal('ai')} title="使用 AI 對話語意尋卷">
          <span>✨ AI 對話助查</span>
        </button>
      </div>
    </div>

    <!-- 4. 視圖切換標籤 -->
    <div class="view-tabs">
      <button 
        class="v-tab {activeView === 'all' ? 'active' : ''}" 
        onclick={() => (activeView = 'all')}
      >
        全部 ({filteredTabs.length + filteredVaultFiles.length})
      </button>
      <button 
        class="v-tab {activeView === 'folder' ? 'active' : ''}" 
        onclick={() => (activeView = 'folder')}
      >
        📁 電腦檔案 ({filteredVaultFiles.length})
      </button>
      <button 
        class="v-tab {activeView === 'tabs' ? 'active' : ''}" 
        onclick={() => (activeView = 'tabs')}
      >
        📜 已開分頁 ({filteredTabs.length})
      </button>
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

    <!-- 藥帖與電腦檔案清單 -->
    <div class="file-list">
      <!-- A. 電腦資料夾檔案 (若選中 all 或 folder) -->
      {#if (activeView === 'all' || activeView === 'folder') && vaultFolderPath}
        <div class="list-group-header">
          <span>📁 電腦資料夾檔案 ({filteredVaultFiles.length})</span>
        </div>
        {#if filteredVaultFiles.length === 0}
          <div class="empty-sub-state">資料夾中無符合的文字檔案</div>
        {:else}
          {#each filteredVaultFiles as vf (vf.path)}
            {@const isOpened = tabs.some((t) => t.filePath === vf.path)}
            <div 
              class="file-item {isOpened ? 'opened' : ''}"
              onclick={() => onOpenVaultFile(vf)}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && onOpenVaultFile(vf)}
            >
              <div class="item-main">
                <span class="file-icon">{vf.extension === 'md' ? '📝' : '📄'}</span>
                <div class="file-meta">
                  <div class="name-line">
                    <span class="file-name" title={vf.name}>{vf.name}</span>
                    {#if isOpened}
                      <span class="opened-badge">已載入</span>
                    {/if}
                  </div>
                  <span class="file-sub" title={vf.path}>
                    {vf.rel_path} · {(vf.size / 1024).toFixed(1)} KB
                  </span>
                  {#if vf.preview}
                    <span class="file-snippet">{vf.preview.slice(0, 70)}...</span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        {/if}
      {/if}

      <!-- B. 已開啟的百子櫃分頁 (若選中 all 或 tabs) -->
      {#if activeView === 'all' || activeView === 'tabs'}
        <div class="list-group-header">
          <span>📜 百子櫃已開分頁 ({filteredTabs.length})</span>
        </div>
        {#if filteredTabs.length === 0}
          <div class="empty-sub-state">無相符的藥帖卷軸</div>
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
                  <div class="name-line">
                    <span class="file-name" title={tab.title}>{tab.title}</span>
                    {#if tab.filePath}
                      <span class="sync-tag" title={tab.filePath}>💾 本機</span>
                    {/if}
                  </div>
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
                    title="關閉此藥帖"
                  >
                    ✕
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      {/if}
    </div>

    <!-- 底部收合按鈕列 -->
    <div class="drawer-footer">
      <span class="shortcut-tip">提示：按 <code>Ctrl+P</code> 隨時開啟全域快速跳轉</span>
    </div>
  </aside>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
    z-index: 1000;
  }

  .file-browser-drawer {
    position: fixed;
    top: 0;
    left: 0;
    width: 380px;
    height: 100vh;
    background: #282828;
    border-right: 1px solid #3c3836;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.5);
    z-index: 1001;
    display: flex;
    flex-direction: column;
    animation: drawerSlide 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes drawerSlide {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #1d2021;
    border-bottom: 1px solid #3c3836;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: bold;
    color: #ebdbb2;
    font-size: 15px;
  }

  .badge {
    background: #3c3836;
    color: #fe8019;
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 10px;
    font-weight: normal;
  }

  .close-drawer-btn {
    background: none;
    border: none;
    color: #a89984;
    cursor: pointer;
    font-size: 14px;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .close-drawer-btn:hover {
    background: #3c3836;
    color: #ebdbb2;
  }

  /* 本機資料夾連線專區 */
  .folder-sync-section {
    padding: 10px 16px;
    background: #202020;
    border-bottom: 1px solid #32302f;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .folder-path-box {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #ebdbb2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
  }

  .folder-path-box.unlinked {
    color: #fabd2f;
  }

  .folder-count {
    color: #928374;
    font-size: 11px;
  }

  .folder-actions {
    display: flex;
    gap: 4px;
  }

  .folder-btn {
    background: #32302f;
    border: 1px solid #504945;
    color: #ebdbb2;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .folder-btn.primary {
    background: #3c3836;
    color: #fe8019;
    border-color: #665c54;
    font-weight: 600;
  }

  .folder-btn:hover:not(:disabled) {
    background: #504945;
  }

  /* 最近開啟專區 */
  .recent-section {
    padding: 8px 16px;
    background: #242220;
    border-bottom: 1px solid #32302f;
  }

  .section-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #a89984;
    margin-bottom: 6px;
  }

  .clear-recent-btn {
    background: none;
    border: none;
    color: #928374;
    font-size: 10px;
    cursor: pointer;
    padding: 0 4px;
  }

  .clear-recent-btn:hover {
    color: #fb4934;
  }

  .recent-pills {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .recent-pill-btn {
    background: #32302f;
    border: 1px solid #3c3836;
    border-radius: 12px;
    padding: 3px 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.12s;
  }

  .recent-pill-btn:hover {
    background: #3c3836;
    border-color: #fabd2f;
  }

  .pill-title {
    font-size: 11px;
    color: #ebdbb2;
    max-width: 110px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pill-time {
    font-size: 9px;
    color: #928374;
  }

  /* 搜尋列與快捷輔助 */
  .search-box {
    padding: 10px 16px;
    background: #1d2021;
    border-bottom: 1px solid #3c3836;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .input-row {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-input {
    width: 100%;
    background: #282828;
    border: 1px solid #504945;
    color: #ebdbb2;
    padding: 6px 30px 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    outline: none;
  }

  .search-input:focus {
    border-color: #fe8019;
  }

  .clear-search-btn {
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    color: #a89984;
    cursor: pointer;
    font-size: 11px;
  }

  .quick-assist-bar {
    display: flex;
    gap: 6px;
  }

  .assist-btn {
    flex: 1;
    background: #282828;
    border: 1px solid #3c3836;
    color: #ebdbb2;
    font-size: 11px;
    padding: 4px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .assist-btn:hover {
    background: #3c3836;
    color: #fabd2f;
    border-color: #504945;
  }

  .assist-btn.ai {
    color: #fe8019;
    border-color: rgba(254, 128, 25, 0.3);
  }

  .assist-btn.ai:hover {
    background: #3c3836;
    color: #fabd2f;
  }

  /* 視圖切換標籤 */
  .view-tabs {
    display: flex;
    background: #202020;
    border-bottom: 1px solid #32302f;
    padding: 4px 12px;
    gap: 4px;
  }

  .v-tab {
    flex: 1;
    background: transparent;
    border: none;
    color: #928374;
    font-size: 11px;
    padding: 5px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .v-tab:hover {
    color: #ebdbb2;
  }

  .v-tab.active {
    background: #32302f;
    color: #ebdbb2;
    font-weight: bold;
  }

  .drawer-actions {
    display: flex;
    gap: 8px;
    padding: 8px 16px;
    border-bottom: 1px solid #32302f;
    background: #1d2021;
  }

  .action-btn {
    flex: 1;
    padding: 5px 8px;
    font-size: 12px;
    border-radius: 6px;
    border: 1px solid #504945;
    background: #32302f;
    color: #ebdbb2;
    cursor: pointer;
    transition: background 0.15s;
  }

  .action-btn.primary {
    background: #3c3836;
    color: #fe8019;
    font-weight: bold;
    border-color: #665c54;
  }

  .action-btn:hover {
    background: #504945;
  }

  /* 檔案列表區 */
  .file-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px 8px;
  }

  .list-group-header {
    font-size: 10px;
    color: #928374;
    padding: 8px 8px 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .file-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: 6px;
    margin-bottom: 3px;
    cursor: pointer;
    transition: background 0.1s;
    border: 1px solid transparent;
  }

  .file-item:hover {
    background: #32302f;
  }

  .file-item.active {
    background: #3c3836;
    border-color: #fe8019;
  }

  .item-main {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .file-icon {
    font-size: 15px;
    padding-top: 1px;
  }

  .file-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .name-line {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .file-name {
    font-size: 12px;
    font-weight: 600;
    color: #ebdbb2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .opened-badge {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: #2b382d;
    color: #b8bb26;
  }

  .sync-tag {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: #2b353b;
    color: #83a598;
  }

  .file-sub {
    font-size: 10px;
    color: #928374;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-snippet {
    font-size: 10px;
    color: #a89984;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.8;
  }

  .item-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .tag-draft {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: #fabd2f;
    color: #1d2021;
    font-weight: bold;
  }

  .del-file-btn {
    background: none;
    border: none;
    color: #928374;
    cursor: pointer;
    font-size: 11px;
    padding: 2px 4px;
    border-radius: 3px;
  }

  .del-file-btn:hover {
    color: #fb4934;
    background: #3c3836;
  }

  .empty-sub-state {
    padding: 14px 10px;
    color: #7c6f64;
    font-size: 11px;
    text-align: center;
  }

  .drawer-footer {
    padding: 8px 16px;
    background: #1d2021;
    border-top: 1px solid #3c3836;
    text-align: center;
  }

  .shortcut-tip {
    font-size: 10px;
    color: #928374;
  }

  .shortcut-tip code {
    background: #32302f;
    color: #ebdbb2;
    padding: 1px 4px;
    border-radius: 3px;
  }
</style>
