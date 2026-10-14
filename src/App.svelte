<script lang="ts">
  import { onMount } from 'svelte';
  import type { TabItem, SupportedLanguage, CursorPosition } from './types/tab';
  import { loadVaultState, saveVaultState } from './lib/storage/vault';
  import { refineNotes } from './lib/ai/refinery';
  import type { RefineryMode } from './lib/ai/refinery';
  import type { VimKeyOverrides } from './types/tab';

  import PrimaryTopBar from './components/PrimaryTopBar.svelte';
  import SecondaryAlchemyBar from './components/SecondaryAlchemyBar.svelte';
  import FileBrowserDrawer from './components/FileBrowserDrawer.svelte';
  import CodeEditor from './components/CodeEditor.svelte';
  import AiReviewBar from './components/AiReviewBar.svelte';
  import AiModal from './components/AiModal.svelte';
  import StatusBar from './components/StatusBar.svelte';

  // 核心應用狀態
  let state = $state(loadVaultState());
  let isAiModalOpen = $state(false);
  let isFileBrowserOpen = $state(false);
  let showDiffView = $state(false);
  let smearEnabled = $state(true);
  let isSavingIndicator = $state(true);
  let isRefining = $state(false); // AI 提煉中的動態過場狀態

  // 當前作用中分頁
  const activeTab = $derived(
    state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0]
  );

  // 當狀態有任何細微變更時，觸發毫秒級持久化
  $effect(() => {
    saveVaultState(state);
  });

  onMount(() => {
    // 監聽視窗關閉或重載，強制立即同步寫入
    const handleBeforeUnload = () => {
      saveVaultState(state, true);
    };

    // 全域快速鍵 Ctrl+K 直呼 AI 煉丹爐；Ctrl+B 開關檔案總管
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        isAiModalOpen = !isAiModalOpen;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        isFileBrowserOpen = !isFileBrowserOpen;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleGlobalKeydown);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleGlobalKeydown);
    };
  });

  // 分頁操作
  function selectTab(id: string) {
    state.activeTabId = id;
    showDiffView = false;
  }

  function addTab() {
    const newIndex = state.tabs.length + 1;
    const newTab: TabItem = {
      id: `tab-${Date.now()}`,
      title: `藥帖${newIndex}·竹簡手稿`,
      content: `# 藥帖${newIndex}\n\n`,
      language: 'plaintext',
      cursor: { line: 1, ch: 0 },
      lastModified: Date.now(),
      preAiSnapshot: null,
      isAiDraft: false,
      deck: 'primary',
    };
    state.tabs.push(newTab);
    state.activeTabId = newTab.id;
  }

  function closeTab(id: string) {
    if (state.tabs.length <= 1) return;
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx !== -1) {
      state.tabs.splice(idx, 1);
      if (state.activeTabId === id) {
        state.activeTabId = state.tabs[Math.max(0, idx - 1)].id;
      }
    }
  }

  function renameTab(id: string, newTitle: string) {
    const target = state.tabs.find((t) => t.id === id);
    if (target) {
      target.title = newTitle;
    }
  }

  // 分頁在主頂欄與次頂欄之間自由移動
  function handleMoveTabDeck(tabId: string, deck: 'primary' | 'secondary') {
    const target = state.tabs.find((t) => t.id === tabId);
    if (target) {
      target.deck = deck;
      saveVaultState(state, true);
      showToast(deck === 'secondary' ? '🔥 藥帖已移入「次頂 AI 煉丹欄」' : '📜 藥帖已移回「主頂檔案欄」');
    }
  }

  // 編輯器內容與游標變更
  function handleContentChange(newContent: string) {
    if (activeTab) {
      activeTab.content = newContent;
      activeTab.lastModified = Date.now();
    }
  }

  function handleCursorChange(newCursor: CursorPosition) {
    if (activeTab) {
      activeTab.cursor = newCursor;
    }
  }

  function handleLanguageChange(lang: SupportedLanguage) {
    if (activeTab) {
      activeTab.language = lang;
    }
  }

  // AI 煉丹操作
  async function handleExecuteRefine(mode: RefineryMode, customPrompt: string) {
    if (!activeTab) return;
    isRefining = true;

    try {
      // 1. Saga 快照建立：保留 AI 介入前的 100% 原稿
      activeTab.preAiSnapshot = {
        content: activeTab.content,
        timestamp: Date.now(),
        reason: `煉丹前快照 (${mode})`,
      };

      // 2. 呼叫雙引擎推論
      const res = await refineNotes({
        model: state.selectedAiModel,
        groqKey: state.groqApiKey,
        geminiKey: state.geminiApiKey,
        mode,
        content: activeTab.content,
        customPrompt,
      });

      // 3. 寫入煉丹結果並切換為草稿審核狀態
      activeTab.content = res.refinedText;
      activeTab.isAiDraft = true;
      activeTab.aiPromptSummary = `${res.summary} [${res.engineUsed}]`;
      activeTab.language = 'markdown'; // AI 產出預設為標準 Markdown
      activeTab.lastModified = Date.now();
      saveVaultState(state, true);
      showToast(`✨ 煉丹完成：${res.summary}`);
    } finally {
      isRefining = false;
    }
  }

  // Saga 補償：確認收丹
  function handleAcceptAi() {
    if (!activeTab) return;
    activeTab.isAiDraft = false;
    activeTab.preAiSnapshot = null;
    activeTab.aiPromptSummary = undefined;
    showDiffView = false;
    saveVaultState(state, true);
    showToast('📜 丹道落成：已納入藥帖典藏！');
  }

  // Saga 補償：一鍵退回原稿 (Rollback)
  function handleRollbackAi() {
    if (!activeTab || !activeTab.preAiSnapshot) return;
    activeTab.content = activeTab.preAiSnapshot.content;
    activeTab.isAiDraft = false;
    activeTab.preAiSnapshot = null;
    activeTab.aiPromptSummary = undefined;
    showDiffView = false;
    saveVaultState(state, true);
    showToast('⏪ 原稿回滾：時空膠囊完好還原！');
  }

  // 浮動 Toast 狀態
  let toastMsg = $state<string | null>(null);
  let toastTimer: number | null = null;

  function showToast(msg: string) {
    toastMsg = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastMsg = null;
    }, 2600);
  }

  function handleManualSave() {
    saveVaultState(state, true);
    showToast('🍃 藥帖已手動入櫃保存！');
  }

  function handleImeWarning(msg: string) {
    showToast(msg);
  }

  function handleSaveSettings(
    groq: string, 
    gemini: string, 
    model: 'groq' | 'gemini',
    overrides: VimKeyOverrides
  ) {
    state.groqApiKey = groq;
    state.geminiApiKey = gemini;
    state.selectedAiModel = model;
    state.vimOverrides = overrides;
    saveVaultState(state, true);
    showToast('⚙️ 偏好與金鑰設定已成功儲存！');
  }
</script>

<div class="app-layout {activeTab?.isAiDraft ? 'ai-draft-active' : ''} {isRefining ? 'is-refining' : ''}">
  <!-- 包浩斯形上學極簡微點陣 (24px x 24px) -->
  <div class="metaphysical-grid"></div>

  <!-- 主頂欄 (Primary Constructivist Command Bar)：56px 高度、檔案瀏覽功能、主頂分頁 -->
  <PrimaryTopBar 
    bind:vimMode={state.vimMode}
    tabs={state.tabs}
    activeTabId={state.activeTabId}
    onSelectTab={selectTab}
    onAddTab={addTab}
    onCloseTab={closeTab}
    onRenameTab={renameTab}
    onMoveTabDeck={handleMoveTabDeck}
    onToggleFileBrowser={() => (isFileBrowserOpen = !isFileBrowserOpen)}
    onOpenSettings={() => (isAiModalOpen = true)}
    isSaved={isSavingIndicator}
  />

  <!-- 次頂欄 (Secondary Alchemy Bar)：38px 高度、AI 煉丹操作與次頂分頁 -->
  <SecondaryAlchemyBar 
    tabs={state.tabs}
    activeTabId={state.activeTabId}
    showDiffView={showDiffView}
    bind:smearEnabled={smearEnabled}
    onSelectTab={selectTab}
    onCloseTab={closeTab}
    onRenameTab={renameTab}
    onMoveTabDeck={handleMoveTabDeck}
    onExecuteRefine={handleExecuteRefine}
    onOpenAiModal={() => (isAiModalOpen = true)}
    onToggleDiffView={() => (showDiffView = !showDiffView)}
  />

  {#if activeTab?.isAiDraft}
    <div class="review-bar-strip">
      <AiReviewBar 
        summary={activeTab.aiPromptSummary}
        timestamp={activeTab.preAiSnapshot?.timestamp}
        onAccept={handleAcceptAi}
        onRollback={handleRollbackAi}
        onToggleDiff={() => (showDiffView = !showDiffView)}
        showDiff={showDiffView}
      />
    </div>
  {/if}

  <!-- 主編輯工作台：沉陷包浩斯禪風置中排版 (精準對齊 code.html 第 15 行) -->
  <main class="workbench-sanctuary">
    <div class="zen-canvas-frame {showDiffView ? 'is-split-view' : ''}">
      {#if showDiffView && activeTab?.preAiSnapshot}
        <!-- 雙欄對比模式：左側原稿，右側 AI 整理稿 -->
        <div class="diff-split-view">
          <div class="diff-pane origin-pane">
            <div class="pane-header">
              <span class="hud-pill">RAW // SNAPSHOT</span>
              <span class="pane-title">📜 原始手稿（AI 介入前快照）</span>
            </div>
            <div class="pane-content">
              <pre class="readonly-text">{activeTab.preAiSnapshot.content}</pre>
            </div>
          </div>

          <div class="diff-pane ai-pane">
            <div class="pane-header ai-header">
              <span class="hud-pill accent">SAGA // REFINED</span>
              <span class="pane-title">✨ AI 提煉成果</span>
            </div>
            <div class="pane-content editor-wrapper">
              <CodeEditor 
                content={activeTab.content}
                language={activeTab.language}
                vimMode={state.vimMode}
                vimOverrides={state.vimOverrides}
                cursor={activeTab.cursor}
                smearEnabled={smearEnabled}
                onChange={handleContentChange}
                onCursorChange={handleCursorChange}
                onManualSave={handleManualSave}
                onImeWarning={handleImeWarning}
              />
            </div>
          </div>
        </div>
      {:else if activeTab}
        <!-- 單一全功能沉浸編輯模式：置中書卷感、精確包浩斯邊線 -->
        <div class="zen-editor-pod">
          <CodeEditor 
            content={activeTab.content}
            language={activeTab.language}
            vimMode={state.vimMode}
            vimOverrides={state.vimOverrides}
            cursor={activeTab.cursor}
            smearEnabled={smearEnabled}
            onChange={handleContentChange}
            onCursorChange={handleCursorChange}
            onManualSave={handleManualSave}
            onImeWarning={handleImeWarning}
          />
        </div>
      {/if}
    </div>
  </main>

  <!-- 底部狀態儀表：32px 高度 (精準對齊 code.html 第 92 行) -->
  {#if activeTab}
    <StatusBar 
      content={activeTab.content}
      language={activeTab.language}
      cursor={activeTab.cursor}
      vimMode={state.vimMode}
      onLanguageChange={handleLanguageChange}
      onToggleVim={() => (state.vimMode = !state.vimMode)}
    />
  {/if}

  <!-- 純文字編輯器檔案總管抽屜 (可隨時以 Ctrl+B 開合) -->
  <FileBrowserDrawer 
    isOpen={isFileBrowserOpen}
    tabs={state.tabs}
    activeTabId={state.activeTabId}
    onSelectTab={selectTab}
    onAddTab={addTab}
    onCloseTab={closeTab}
    onCloseDrawer={() => (isFileBrowserOpen = false)}
  />

  <!-- 浮動 Toast 提示 -->
  {#if toastMsg}
    <div class="toast-capsule">
      <span class="toast-dot"></span>
      <span>{toastMsg}</span>
    </div>
  {/if}

  <!-- SAGA Tech Engine AI 煉丹對話框 -->
  <AiModal 
    isOpen={isAiModalOpen}
    selectedModel={state.selectedAiModel}
    groqApiKey={state.groqApiKey}
    geminiApiKey={state.geminiApiKey}
    vimOverrides={state.vimOverrides}
    onClose={() => (isAiModalOpen = false)}
    onRefine={handleExecuteRefine}
    onSaveSettings={handleSaveSettings}
  />
</div>

<style>
  .app-layout {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #141615; /* 包浩斯形上學深黑大地底色 */
    color: #dcd7cb;
  }

  /* 極簡禪風包浩斯微點陣 (透明度 3.5% 的 24px x 24px 網格) */
  .metaphysical-grid {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(212, 155, 53, 0.035) 1px, transparent 1px);
    background-size: 24px 24px;
    pointer-events: none;
    z-index: 0;
  }

  .review-bar-strip {
    position: relative;
    z-index: 25;
    padding: 4px 16px 0 16px;
    background: #141615;
  }

  /* 主工作台：沉浸式置中禪風排版 (精準對齊 code.html 第 15 行) */
  .workbench-sanctuary {
    flex: 1;
    position: relative;
    z-index: 5;
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: stretch;
    background: #141615;
    padding: 0 20px;
  }

  .zen-canvas-frame {
    flex: 1;
    width: 100%;
    max-width: 960px; /* 包浩斯沉陷書卷開闊黃金閱讀寬度 */
    height: 100%;
    display: flex;
    position: relative;
    border-left: 1px solid rgba(80, 69, 52, 0.25);
    border-right: 1px solid rgba(80, 69, 52, 0.25);
    background: #141615;
    transition: max-width 0.2s ease, border-color 0.2s ease;
  }

  .zen-canvas-frame.is-split-view {
    max-width: 100%;
    border-left: none;
    border-right: none;
  }

  /* 處於 AI 煉丹草稿狀態時的外框高光 */
  .app-layout.ai-draft-active .zen-canvas-frame {
    border-color: rgba(212, 155, 53, 0.55);
    box-shadow: 0 0 30px rgba(212, 155, 53, 0.08);
  }

  .zen-editor-pod {
    width: 100%;
    height: 100%;
    position: relative;
  }

  /* 雙欄對比模式 */
  .diff-split-view {
    display: flex;
    width: 100%;
    height: 100%;
    gap: 1px;
    background: rgba(80, 69, 52, 0.35);
  }

  .diff-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .origin-pane {
    background: #121414;
  }

  .ai-pane {
    background: #141615;
  }

  .pane-header {
    height: 34px;
    background: #161817;
    border-bottom: 1px solid rgba(80, 69, 52, 0.35);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    font-size: 11px;
    color: #938c80;
    font-family: 'JetBrains Mono', monospace;
  }

  .ai-header {
    color: #d49b35;
  }

  .hud-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.06);
    color: #938c80;
    font-weight: 600;
  }

  .hud-pill.accent {
    background: rgba(212, 155, 53, 0.2);
    color: #d49b35;
    border: 1px solid #d49b35;
  }

  .pane-content {
    flex: 1;
    overflow: auto;
    position: relative;
  }

  .readonly-text {
    padding: 24px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14.5px;
    line-height: 2.1;
    color: #938c80;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .editor-wrapper {
    height: 100%;
  }

  /* 浮動 Toast */
  .toast-capsule {
    position: fixed;
    bottom: 42px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(22, 24, 23, 0.96);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: #ece7dc;
    border: 1px solid #d49b35;
    padding: 7px 18px;
    border-radius: 4px;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
    box-shadow: 0 12px 35px rgba(0, 0, 0, 0.85);
    z-index: 9999;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    animation: toast-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
  }

  .toast-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #d49b35;
    box-shadow: 0 0 6px #d49b35;
  }

  @keyframes toast-pop {
    from { opacity: 0; transform: translate(-50%, 8px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
</style>
