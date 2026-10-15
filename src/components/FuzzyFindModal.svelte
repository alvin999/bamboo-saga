<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { TabItem, VaultFileEntry, RecentFileRecord } from '../types/tab';
  import { buildSearchIndex, DEMO_ACTION_ITEM, type UnifiedSearchItem } from '../lib/search/fuzzy';
  import { searchVaultWithAi, type AiSearchResultItem, type AiSearchCandidate } from '../lib/ai/refinery';

  let {
    isOpen = false,
    tabs = [],
    vaultFiles = [],
    recentFiles = [],
    groqApiKey = '',
    geminiApiKey = '',
    selectedAiModel = 'gemini',
    initialMode,
    onSelectTab,
    onOpenVaultFile,
    onCreateDemoTab,
    onClose
  } = $props<{
    isOpen: boolean;
    tabs: TabItem[];
    vaultFiles: VaultFileEntry[];
    recentFiles: RecentFileRecord[];
    groqApiKey: string;
    geminiApiKey: string;
    selectedAiModel: 'groq' | 'gemini';
    initialMode?: 'fuzzy' | 'ai';
    onSelectTab: (tabId: string) => void;
    onOpenVaultFile: (file: VaultFileEntry) => void;
    onCreateDemoTab?: () => void;
    onClose: () => void;
  }>();

  let mode = $state<'fuzzy' | 'ai'>('fuzzy');
  let searchQuery = $state('');
  let selectedIndex = $state(0);
  let searchInputEl = $state<HTMLInputElement | null>(null);

  // AI 搜尋狀態
  let isAiSearching = $state(false);
  let aiResults = $state<AiSearchResultItem[]>([]);
  let aiError = $state('');

  // 模糊比對索引
  let fuse = $derived(buildSearchIndex(tabs, vaultFiles, recentFiles));

  const filteredItems = $derived.by(() => {
    if (!searchQuery.trim()) {
      // 預設顯示動作命令、已開啟分頁與最近開啟
      const defaultList: UnifiedSearchItem[] = [DEMO_ACTION_ITEM];
      for (const t of tabs) {
        defaultList.push({
          id: `tab-${t.id}`,
          type: 'tab',
          title: t.title,
          subtitle: t.filePath ? `[本機] ${t.filePath}` : '百子櫃分頁',
          path: t.filePath,
          preview: t.content.slice(0, 150),
          tabRef: t,
        });
      }
      for (const rf of recentFiles.slice(0, 6)) {
        if (!defaultList.some((d) => d.path === rf.path)) {
          defaultList.push({
            id: `recent-${rf.path}`,
            type: 'recent',
            title: rf.title,
            subtitle: `🕒 最近開啟 · ${rf.path}`,
            path: rf.path,
            preview: rf.preview,
            recentRef: rf,
          });
        }
      }
      return defaultList;
    }

    const results = fuse.search(searchQuery, { limit: 20 });
    return results.map((r) => r.item);
  });

  // 當開啟時自動聚焦輸入框
  $effect(() => {
    if (isOpen) {
      if (initialMode) mode = initialMode;
      selectedIndex = 0;
      tick().then(() => {
        searchInputEl?.focus();
        searchInputEl?.select();
      });
    } else {
      searchQuery = '';
      aiResults = [];
      aiError = '';
    }
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (mode === 'fuzzy') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % Math.max(1, filteredItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + filteredItems.length) % Math.max(1, filteredItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          activateItem(filteredItems[selectedIndex]);
        }
      }
    } else if (mode === 'ai' && e.key === 'Enter') {
      e.preventDefault();
      runAiSearch();
    }
  }

  function activateItem(item: UnifiedSearchItem) {
    if (item.type === 'action') {
      if (item.actionId === 'create-demo-tab') {
        onCreateDemoTab?.();
      }
      onClose();
    } else if (item.type === 'tab' && item.tabRef) {
      onSelectTab(item.tabRef.id);
      onClose();
    } else if (item.type === 'vault_file' && item.vaultRef) {
      onOpenVaultFile(item.vaultRef);
      onClose();
    } else if (item.type === 'recent' && item.path) {
      // 嘗試從 vaultFiles 找
      const vf = vaultFiles.find((f) => f.path === item.path);
      if (vf) {
        onOpenVaultFile(vf);
      } else {
        // 從 tabs 找
        const t = tabs.find((x) => x.filePath === item.path);
        if (t) onSelectTab(t.id);
      }
      onClose();
    }
  }

  async function runAiSearch() {
    if (!searchQuery.trim() || isAiSearching) return;
    isAiSearching = true;
    aiError = '';
    aiResults = [];

    try {
      const candidates: AiSearchCandidate[] = [
        ...tabs.map((t) => ({ id: t.id, title: t.title, path: t.filePath, preview: t.content })),
        ...vaultFiles.map((f) => ({ id: f.path, title: f.name, path: f.path, preview: f.preview })),
      ];

      const res = await searchVaultWithAi({
        query: searchQuery,
        candidates,
        model: selectedAiModel,
        groqKey: groqApiKey,
        geminiKey: geminiApiKey,
      });

      aiResults = res;
    } catch (err: any) {
      aiError = err.message || 'AI 檢索發生問題，請檢查網路連線或 API Key';
    } finally {
      isAiSearching = false;
    }
  }

  function openAiResult(res: AiSearchResultItem) {
    // 先看是否已開啟為分頁
    const targetTab = tabs.find((t) => t.id === res.id || (res.path && t.filePath === res.path));
    if (targetTab) {
      onSelectTab(targetTab.id);
      onClose();
      return;
    }

    // 再看是否為實體檔案
    if (res.path) {
      const vf = vaultFiles.find((f) => f.path === res.path);
      if (vf) {
        onOpenVaultFile(vf);
        onClose();
        return;
      }
    }

    // 依標題尋找
    const fallbackTab = tabs.find((t) => t.title === res.title);
    if (fallbackTab) {
      onSelectTab(fallbackTab.id);
      onClose();
    }
  }
</script>

{#if isOpen}
  <!-- 遮罩背景 -->
  <div class="fuzzy-backdrop" onclick={onClose} role="presentation"></div>

  <!-- 檢索浮動視窗 (Command Palette 風格) -->
  <div class="fuzzy-modal" role="dialog" aria-modal="true" aria-label="全域快速檢索與 AI 尋卷">
    <!-- 頂部切換與搜尋輸入 -->
    <div class="fuzzy-header">
      <div class="search-input-wrapper">
        <span class="search-icon">{mode === 'fuzzy' ? '⚡' : '✨'}</span>
        <input
          bind:this={searchInputEl}
          type="text"
          class="fuzzy-input"
          placeholder={mode === 'fuzzy' ? '輸入檔名或內容關鍵字模糊跳轉... (↑↓導航, Enter開啟)' : '用自然語言提問尋卷（例如：「找連線池設定的那篇」）...'}
          bind:value={searchQuery}
          onkeydown={handleKeyDown}
        />
        {#if searchQuery}
          <button class="clear-btn" onclick={() => (searchQuery = '')}>✕</button>
        {/if}
      </div>

      <!-- 模式切換按鈕 -->
      <div class="mode-toggles">
        <button
          class="toggle-btn {mode === 'fuzzy' ? 'active' : ''}"
          onclick={() => { mode = 'fuzzy'; }}
          title="Fuzzy Find 模糊匹配"
        >
          <span>⚡ 模糊跳轉</span>
        </button>
        <button
          class="toggle-btn {mode === 'ai' ? 'active' : ''}"
          onclick={() => { mode = 'ai'; if (searchQuery) runAiSearch(); }}
          title="AI 對話智慧尋卷"
        >
          <span>✨ AI 助查</span>
        </button>
      </div>
    </div>

    <!-- 內容區域：Fuzzy 結果清單 -->
    {#if mode === 'fuzzy'}
      <div class="results-list" role="listbox">
        {#if filteredItems.length === 0}
          <div class="empty-state">
            <span>未找到符合「{searchQuery}」的卷軸或檔案</span>
          </div>
        {:else}
          {#each filteredItems as item, idx (item.id)}
            <div
              class="result-item {idx === selectedIndex ? 'selected' : ''}"
              onclick={() => activateItem(item)}
              onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && activateItem(item)}
              role="option"
              aria-selected={idx === selectedIndex}
              tabindex="0"
              onmouseenter={() => (selectedIndex = idx)}
            >
              <div class="item-icon">
                {#if item.type === 'action'}
                  🎋
                {:else if item.type === 'tab'}
                  📜
                {:else if item.type === 'recent'}
                  🕒
                {:else}
                  📄
                {/if}
              </div>

              <div class="item-body">
                <div class="item-top">
                  <span class="item-title">{item.title}</span>
                  <span class="item-type-badge {item.type}">
                    {item.type === 'action' ? '動作命令' : item.type === 'tab' ? '已開啟分頁' : item.type === 'recent' ? '最近開啟' : '實體檔案'}
                  </span>
                </div>
                <div class="item-sub">{item.subtitle}</div>
                {#if item.preview}
                  <div class="item-preview">{item.preview}</div>
                {/if}
              </div>

              <div class="item-action">
                <span class="enter-hint">↵ 開啟</span>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <div class="fuzzy-footer">
        <div class="footer-hints">
          <span class="key-tag">↑↓</span> 移動選取
          <span class="key-tag">↵</span> 確認開啟
          <span class="key-tag">ESC</span> 關閉
          <span class="key-tag">Ctrl+P</span> 呼叫面板
        </div>
        <div class="footer-count">
          候選項目：{filteredItems.length}
        </div>
      </div>

    <!-- 內容區域：AI 對話助查模式 -->
    {:else}
      <div class="ai-search-body">
        <div class="ai-prompt-bar">
          <span class="ai-desc">
            由 <strong>{selectedAiModel === 'groq' ? 'Groq (llama-3.3-70b)' : 'Gemini (gemini-2.5-flash)'}</strong> 協助語意解析全庫摘要，找出最精準的藥帖。
          </span>
          <button class="ai-search-action-btn" onclick={runAiSearch} disabled={isAiSearching || !searchQuery.trim()}>
            {isAiSearching ? '✨ 智慧推論中...' : '🔍 啟動 AI 尋卷'}
          </button>
        </div>

        {#if isAiSearching}
          <div class="ai-loading">
            <div class="spinner"></div>
            <span>正在翻閱百子櫃與本機資料夾，提煉語意匹配關聯...</span>
          </div>
        {:else if aiError}
          <div class="ai-error-box">
            <span>⚠️ {aiError}</span>
          </div>
        {:else if aiResults.length > 0}
          <div class="ai-results-grid">
            {#each aiResults as res}
              <div 
                class="ai-card" 
                onclick={() => openAiResult(res)} 
                onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openAiResult(res)}
                role="button" 
                tabindex="0"
              >
                <div class="card-header">
                  <span class="card-icon">🎯</span>
                  <span class="card-title">{res.title}</span>
                  <button class="card-open-btn">直達開啟 ➔</button>
                </div>
                <div class="card-reason">
                  <strong>💡 推薦理由：</strong>{res.reason}
                </div>
                {#if res.matchedSnippet}
                  <div class="card-snippet">
                    "{res.matchedSnippet}"
                  </div>
                {/if}
                {#if res.path}
                  <div class="card-path">📍 {res.path}</div>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <div class="ai-empty-prompt">
            <div class="empty-icon">🎋</div>
            <div class="empty-title">AI 對話輔助尋卷</div>
            <div class="empty-sub">
              請在上方輸入您想找的筆記細節，例如：<br/>
              <em>「找有記錄 API 認證與 token 的筆記」</em>、<em>「哪份檔案提到 Redis 快取穿透？」</em>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .fuzzy-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 15, 15, 0.75);
    backdrop-filter: blur(4px);
    z-index: 9998;
    animation: fadeIn 0.15s ease-out;
  }

  .fuzzy-modal {
    position: fixed;
    top: 12%;
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    max-width: 680px;
    background: #282828;
    border: 1px solid #504945;
    border-radius: 12px;
    box-shadow: 0 20px 45px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(254, 128, 25, 0.2);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translate(-50%, -15px) scale(0.98); }
    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
  }

  .fuzzy-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: #1d2021;
    border-bottom: 1px solid #3c3836;
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    flex: 1;
    background: #282828;
    border: 1px solid #504945;
    border-radius: 8px;
    padding: 6px 12px;
    gap: 8px;
  }

  .search-input-wrapper:focus-within {
    border-color: #fe8019;
    box-shadow: 0 0 0 2px rgba(254, 128, 25, 0.2);
  }

  .search-icon {
    font-size: 15px;
    color: #fabd2f;
  }

  .fuzzy-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #ebdbb2;
    font-size: 14px;
    font-family: inherit;
  }

  .clear-btn {
    background: none;
    border: none;
    color: #928374;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
  }

  .clear-btn:hover {
    color: #ebdbb2;
  }

  .mode-toggles {
    display: flex;
    gap: 4px;
    background: #282828;
    padding: 3px;
    border-radius: 8px;
    border: 1px solid #3c3836;
  }

  .toggle-btn {
    background: transparent;
    border: none;
    color: #a89984;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .toggle-btn:hover {
    color: #ebdbb2;
  }

  .toggle-btn.active {
    background: #3c3836;
    color: #fe8019;
    font-weight: bold;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }

  .results-list {
    max-height: 400px;
    overflow-y: auto;
    padding: 6px;
  }

  .result-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.1s;
    border: 1px solid transparent;
  }

  .result-item:hover,
  .result-item.selected {
    background: #3c3836;
    border-color: #504945;
  }

  .result-item.selected .item-title {
    color: #fe8019;
  }

  .item-icon {
    font-size: 18px;
    padding-top: 2px;
  }

  .item-body {
    flex: 1;
    min-width: 0;
  }

  .item-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }

  .item-title {
    color: #ebdbb2;
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-type-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    background: #32302f;
    color: #a89984;
    border: 1px solid #504945;
  }

  .item-type-badge.tab {
    background: #2b382d;
    color: #b8bb26;
    border-color: #4b6b4e;
  }

  .item-type-badge.recent {
    background: #3e3326;
    color: #fabd2f;
    border-color: #725932;
  }

  .item-type-badge.vault_file {
    background: #2b353b;
    color: #83a598;
    border-color: #465b68;
  }

  .item-type-badge.action {
    background: #422a3c;
    color: #d3869b;
    border-color: #8f3f71;
  }

  .item-sub {
    font-size: 11px;
    color: #928374;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 4px;
  }

  .item-preview {
    font-size: 12px;
    color: #bdae93;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    background: #242220;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .item-action {
    display: flex;
    align-items: center;
  }

  .enter-hint {
    font-size: 11px;
    color: #fe8019;
    opacity: 0;
    transition: opacity 0.15s;
    white-space: nowrap;
  }

  .result-item.selected .enter-hint {
    opacity: 1;
  }

  .fuzzy-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background: #1d2021;
    border-top: 1px solid #3c3836;
    font-size: 11px;
    color: #928374;
  }

  .key-tag {
    background: #3c3836;
    color: #ebdbb2;
    padding: 1px 4px;
    border-radius: 3px;
    font-family: monospace;
    font-size: 10px;
    margin: 0 2px;
  }

  /* AI 搜尋專區樣式 */
  .ai-search-body {
    padding: 16px;
    max-height: 440px;
    overflow-y: auto;
  }

  .ai-prompt-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding: 8px 12px;
    background: #1d2021;
    border-radius: 8px;
    border: 1px solid #3c3836;
  }

  .ai-desc {
    font-size: 12px;
    color: #a89984;
  }

  .ai-desc strong {
    color: #fabd2f;
  }

  .ai-search-action-btn {
    background: #fe8019;
    color: #1d2021;
    border: none;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
  }

  .ai-search-action-btn:hover:not(:disabled) {
    background: #fabd2f;
  }

  .ai-search-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ai-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    gap: 12px;
    color: #fabd2f;
    font-size: 13px;
  }

  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid #3c3836;
    border-top-color: #fe8019;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .ai-results-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .ai-card {
    background: #1d2021;
    border: 1px solid #3c3836;
    border-left: 4px solid #fe8019;
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .ai-card:hover {
    background: #32302f;
    border-color: #504945;
    border-left-color: #fabd2f;
    transform: translateY(-1px);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .card-title {
    font-size: 14px;
    font-weight: bold;
    color: #ebdbb2;
    flex: 1;
  }

  .card-open-btn {
    background: #3c3836;
    color: #fe8019;
    border: 1px solid #504945;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    cursor: pointer;
  }

  .card-reason {
    font-size: 12px;
    color: #bdae93;
    line-height: 1.4;
    margin-bottom: 6px;
  }

  .card-snippet {
    font-size: 11px;
    color: #83a598;
    background: #282828;
    padding: 6px 8px;
    border-radius: 4px;
    font-style: italic;
    margin-bottom: 6px;
  }

  .card-path {
    font-size: 10px;
    color: #928374;
    font-family: monospace;
  }

  .ai-empty-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
  }

  .empty-icon {
    font-size: 36px;
    margin-bottom: 8px;
  }

  .empty-title {
    font-size: 15px;
    font-weight: bold;
    color: #ebdbb2;
    margin-bottom: 6px;
  }

  .empty-sub {
    font-size: 12px;
    color: #928374;
    line-height: 1.6;
  }

  .empty-state {
    padding: 30px;
    text-align: center;
    color: #928374;
    font-size: 13px;
  }

  .ai-error-box {
    background: #442e2d;
    border: 1px solid #cc241d;
    color: #fb4934;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 12px;
  }
</style>
