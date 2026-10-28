<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Scroll, Clock, FileText, Zap, Sparkles } from 'lucide-svelte';
  import type { TabItem, VaultFileEntry, RecentFileRecord, AiProvider } from '../types/tab';
  import { buildSearchIndex, DEMO_ACTION_ITEM, type UnifiedSearchItem } from '../lib/search/fuzzy';
  import { searchVaultWithAi, type AiSearchResultItem, type AiSearchCandidate } from '../lib/ai/refinery';

  let {
    isOpen = false,
    tabs = [],
    vaultFiles = [],
    recentFiles = [],
    groqApiKey = '',
    geminiApiKey = '',
    customApiKey = '',
    customEndpoint = '',
    selectedAiModel = 'gemini' as AiProvider,
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
    geminiKey: string;
    customApiKey?: string;
    customEndpoint?: string;
    selectedAiModel: AiProvider;
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
        customKey: customApiKey,
        customEndpoint,
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
        <span class="search-icon">
          {#if mode === 'fuzzy'}
            <Zap size={16} />
          {:else}
            <Sparkles size={16} />
          {/if}
        </span>
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
          <Zap size={13} />
          <span>模糊跳轉</span>
        </button>
        <button
          class="toggle-btn {mode === 'ai' ? 'active' : ''}"
          onclick={() => { mode = 'ai'; if (searchQuery) runAiSearch(); }}
          title="AI 對話智慧尋卷"
        >
          <Sparkles size={13} />
          <span>AI 助查</span>
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
                  <img src="/bamboo.svg" alt="示範手稿" class="action-bamboo-icon" />
                {:else if item.type === 'tab'}
                  <Scroll size={17} class="type-icon tab-icon" />
                {:else if item.type === 'recent'}
                  <Clock size={17} class="type-icon recent-icon" />
                {:else}
                  <FileText size={17} class="type-icon file-icon" />
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
            由 <strong>{selectedAiModel === 'groq' ? 'Groq (llama-3.3-70b)' : 'Gemini (gemini-1.5-flash)'}</strong> 協助語意解析全庫摘要，找出最精準的藥帖。
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
            <div class="empty-icon">
              <img src="/bamboo.svg" alt="Bamboo" class="empty-bamboo-icon" />
            </div>
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
    background: rgba(10, 12, 11, 0.72);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
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
    background: rgba(22, 24, 23, 0.97);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(100, 86, 66, 0.45);
    border-radius: 12px;
    box-shadow:
      0 24px 56px rgba(0, 0, 0, 0.75),
      0 0 0 1px rgba(250, 189, 47, 0.08);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideDown 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translate(-50%, -12px) scale(0.98); }
    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
  }

  .fuzzy-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: rgba(16, 18, 17, 0.85);
    border-bottom: 1px solid rgba(100, 86, 66, 0.25);
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    flex: 1;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(100, 86, 66, 0.35);
    border-radius: 8px;
    padding: 8px 12px;
    gap: 10px;
    transition: all 0.15s ease;
  }

  .search-input-wrapper:focus-within {
    border-color: rgba(250, 189, 47, 0.55);
    background: rgba(255, 255, 255, 0.05);
    box-shadow: 0 0 0 2px rgba(250, 189, 47, 0.12);
  }

  .search-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fabd2f;
    flex-shrink: 0;
  }

  .fuzzy-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #ebdbb2;
    font-size: 14px;
    font-family: inherit;
    letter-spacing: 0.02em;
  }

  .fuzzy-input::placeholder {
    color: #7c7365;
    font-size: 13px;
  }

  .clear-btn {
    background: none;
    border: none;
    color: #8c8273;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 4px;
    transition: all 0.12s;
  }

  .clear-btn:hover {
    color: #fabd2f;
    background: rgba(255, 255, 255, 0.05);
  }

  .mode-toggles {
    display: flex;
    gap: 4px;
    background: rgba(0, 0, 0, 0.25);
    padding: 3px;
    border-radius: 8px;
    border: 1px solid rgba(100, 86, 66, 0.25);
  }

  .toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: #8c8273;
    font-size: 12px;
    padding: 5px 11px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.14s ease;
    white-space: nowrap;
  }

  .toggle-btn:hover {
    color: #d5c4a1;
  }

  .toggle-btn.active {
    background: rgba(250, 189, 47, 0.12);
    color: #fabd2f;
    border-color: rgba(250, 189, 47, 0.3);
    font-weight: 600;
  }

  .results-list {
    max-height: 420px;
    overflow-y: auto;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .result-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 9px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.14s ease;
    border: 1px solid transparent;
    border-left: 2.5px solid transparent;
  }

  .result-item:hover,
  .result-item.selected {
    background: rgba(250, 189, 47, 0.07);
    border-color: rgba(250, 189, 47, 0.2);
    border-left-color: #fabd2f;
  }

  .result-item.selected .item-title {
    color: #fabd2f;
  }

  .item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .action-bamboo-icon {
    width: 20px;
    height: 20px;
    border-radius: 3px;
    object-fit: contain;
    display: block;
  }

  :global(.type-icon.tab-icon) {
    color: #8ec07c;
  }

  :global(.type-icon.recent-icon) {
    color: #fabd2f;
  }

  :global(.type-icon.file-icon) {
    color: #83a598;
  }

  .empty-bamboo-icon {
    width: 44px;
    height: 44px;
    opacity: 0.75;
    border-radius: 8px;
    display: inline-block;
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
    color: #e6dfd5;
    font-size: 13.5px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: 0.02em;
    transition: color 0.12s ease;
  }

  /* 輕盈膠囊式類型標籤 */
  .item-type-badge {
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    padding: 1.5px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.04);
    color: #8c8273;
    border: none;
    letter-spacing: 0.03em;
  }

  .item-type-badge.tab {
    background: rgba(142, 192, 124, 0.12);
    color: #8ec07c;
  }

  .item-type-badge.recent {
    background: rgba(250, 189, 47, 0.12);
    color: #fabd2f;
  }

  .item-type-badge.vault_file {
    background: rgba(131, 165, 152, 0.12);
    color: #83a598;
  }

  .item-type-badge.action {
    background: rgba(254, 128, 25, 0.12);
    color: #fe8019;
  }

  .item-sub {
    font-size: 11px;
    color: #7c7365;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 3px;
  }

  .item-preview {
    font-size: 11.5px;
    color: #a89984;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.2);
    padding: 4px 8px;
    border-radius: 4px;
    margin-top: 2px;
  }

  .item-action {
    display: flex;
    align-items: center;
    padding-top: 1px;
  }

  .enter-hint {
    font-family: "JetBrains Mono", monospace;
    font-size: 10.5px;
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.12);
    padding: 2px 7px;
    border-radius: 4px;
    opacity: 0;
    transition: opacity 0.14s ease;
    white-space: nowrap;
  }

  .result-item.selected .enter-hint {
    opacity: 1;
  }

  /* 底部提示列：虛線分割與大方呼吸感 */
  .fuzzy-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    background: rgba(16, 18, 17, 0.75);
    border-top: 1px dashed rgba(100, 86, 66, 0.25);
    font-size: 11.5px;
    color: #7c7365;
  }

  .footer-hints {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .key-tag {
    background: rgba(255, 255, 255, 0.04);
    color: #d5c4a1;
    padding: 1.5px 5px;
    border-radius: 4px;
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    letter-spacing: 0.03em;
  }

  .footer-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: #8c8273;
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
    padding: 10px 14px;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 8px;
    border: 1px solid rgba(100, 86, 66, 0.3);
  }

  .ai-desc {
    font-size: 12px;
    color: #a89984;
    line-height: 1.4;
  }

  .ai-desc strong {
    color: #fabd2f;
  }

  .ai-search-action-btn {
    background: #fabd2f;
    color: #1d2021;
    border: none;
    padding: 7px 15px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    box-shadow: 0 2px 6px rgba(250, 189, 47, 0.25);
  }

  .ai-search-action-btn:hover:not(:disabled) {
    background: #ffd666;
    transform: translateY(-1px);
  }

  .ai-search-action-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
  }

  .ai-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    gap: 14px;
    color: #fabd2f;
    font-size: 13px;
  }

  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(100, 86, 66, 0.35);
    border-top-color: #fabd2f;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .ai-results-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .ai-card {
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(100, 86, 66, 0.32);
    border-left: 3px solid #fabd2f;
    border-radius: 8px;
    padding: 12px 14px;
    cursor: pointer;
    transition: all 0.16s ease;
  }

  .ai-card:hover {
    background: rgba(250, 189, 47, 0.06);
    border-color: rgba(250, 189, 47, 0.35);
    border-left-color: #ffd666;
    transform: translateY(-1px);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .card-title {
    font-size: 14px;
    font-weight: 600;
    color: #ebdbb2;
    flex: 1;
    letter-spacing: 0.02em;
  }

  .card-open-btn {
    font-family: "JetBrains Mono", monospace;
    background: rgba(250, 189, 47, 0.1);
    color: #fabd2f;
    border: 1px solid rgba(250, 189, 47, 0.25);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .card-open-btn:hover {
    background: #fabd2f;
    color: #1d2021;
  }

  .card-reason {
    font-size: 12px;
    color: #bdae93;
    line-height: 1.45;
    margin-bottom: 6px;
  }

  .card-snippet {
    font-size: 11.5px;
    color: #8ec07c;
    background: rgba(0, 0, 0, 0.25);
    padding: 6px 10px;
    border-radius: 5px;
    font-family: "JetBrains Mono", monospace;
    margin-bottom: 6px;
  }

  .card-path {
    font-size: 10.5px;
    color: #7c7365;
    font-family: "JetBrains Mono", monospace;
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
    font-weight: 600;
    color: #ebdbb2;
    margin-bottom: 6px;
    letter-spacing: 0.02em;
  }

  .empty-sub {
    font-size: 12px;
    color: #8c8273;
    line-height: 1.6;
  }

  .empty-state {
    padding: 36px;
    text-align: center;
    color: #7c7365;
    font-size: 13px;
  }

  .ai-error-box {
    background: rgba(204, 36, 29, 0.12);
    border: 1px solid rgba(251, 73, 52, 0.35);
    color: #fb4934;
    padding: 10px 14px;
    border-radius: 7px;
    font-size: 12px;
  }
</style>
