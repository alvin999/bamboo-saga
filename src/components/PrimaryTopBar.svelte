<script lang="ts">
  import type { RefineryMode } from "../lib/ai/refinery";
  import type { TabItem, AlchemyCardConfig } from "../types/tab";
  import ShortcutCheatSheet from "./ShortcutCheatSheet.svelte";
  import AlchemyPopover from "./AlchemyPopover.svelte";
  import ExportNotePopover from "./ExportNotePopover.svelte";
  import BrandQuickMenu from "./BrandQuickMenu.svelte";

  interface PrimaryTopBarProps {
    vimMode: boolean;
    smearEnabled?: boolean;
    workbenchWidth?: "zen" | "full";
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
    onMoveTabDeck: (id: string, deck: "primary" | "secondary") => void;
    onReorderTabs?: (sourceId: string, targetId: string) => void;
    onToggleFileBrowser: () => void;
    onManualSave?: () => void;
    onOpenFuzzy?: () => void;
    onSaveAs?: () => void;
    onOpenHistory?: () => void;
    onOpenBackup?: () => void;
    onOpenTextTools?: () => void;
    onToggleVim?: () => void;
    onToggleSmear?: () => void;
    onToggleWorkbenchWidth?: () => void;
    isZenFocusMode?: boolean;
    typewriterMode?: boolean;
    onToggleZenFocus?: () => void;
    onToggleTypewriter?: () => void;
    onOpenSettings: () => void;
    onOpenKeybindings?: () => void;
    onExecuteRefine?: (
      mode: RefineryMode | string,
      customPrompt: string,
      cardPrompt?: string,
    ) => Promise<void>;
    onSaveAlchemyCards?: (cards: Record<string, AlchemyCardConfig>) => void;
    onToggleAiChat?: () => void;
    isAiChatOpen?: boolean;
    isExportOpen?: boolean;
    onShowToast?: (msg: string) => void;
    isSaved: boolean;
  }

  let {
    vimMode = $bindable(false),
    smearEnabled = true,
    workbenchWidth = "zen",
    autoOneDriveBackup = false,
    selectedOneDrivePath = "",
    tabs = [],
    activeTabId = "",
    alchemyCards = {},
    isRefining = false,
    isAlchemyOpen = $bindable(false),
    isExportOpen = $bindable(false),
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
    onOpenTextTools,
    onToggleVim,
    onToggleSmear,
    onToggleWorkbenchWidth,
    isZenFocusMode = false,
    typewriterMode = false,
    onToggleZenFocus,
    onToggleTypewriter,
    onOpenSettings,
    onOpenKeybindings,
    onExecuteRefine,
    onSaveAlchemyCards,
    onToggleAiChat,
    isAiChatOpen = false,
    onShowToast,
    isSaved = true,
  }: PrimaryTopBarProps = $props();

  let isCheatSheetOpen = $state(false);
  let editingTabId = $state<string | null>(null);
  let editInput = $state("");
  let draggedTabId = $state<string | null>(null);
  let dragOverTabId = $state<string | null>(null);
  let isDeckDragOver = $state(false);

  const primaryTabs = $derived(tabs);
  const activeTab = $derived(
    tabs.find((t: TabItem) => t.id === activeTabId) || null,
  );

  function handleDragStart(e: DragEvent, id: string) {
    if (editingTabId) return;
    draggedTabId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "all";
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.setData("application/x-bamboo-tab", id);
    }
  }

  function handleDragEnter(e: DragEvent, id?: string) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    if (id && draggedTabId && draggedTabId !== id) {
      dragOverTabId = id;
    }
  }

  function handleDragOver(e: DragEvent, id?: string) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
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
    const sourceId =
      draggedTabId ||
      e.dataTransfer?.getData("application/x-bamboo-tab") ||
      e.dataTransfer?.getData("text/plain");
    if (sourceId) {
      if (targetId && sourceId !== targetId) {
        onReorderTabs?.(sourceId, targetId);
      } else {
        onMoveTabDeck?.(sourceId, "primary");
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
    if (e.key === "Enter") {
      commitRename();
    } else if (e.key === "Escape") {
      editingTabId = null;
    }
  }

  function handleTabAuxClick(e: MouseEvent, tabId: string) {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      if (editingTabId === tabId) return;
      if (tabs.length > 1) {
        onCloseTab(tabId);
      }
    }
  }

  function handleTabMouseDown(e: MouseEvent) {
    if (e.button === 1) {
      e.preventDefault();
    }
  }
</script>

<header class="constructivist-topbar">
  <div class="topbar-inner">
    <!-- 左側：品牌快捷中樞 + 柔和分隔線 + 分頁導航 -->
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
        {onOpenTextTools}
        onOpenExport={() => (isExportOpen = true)}
        {onToggleVim}
        {onToggleSmear}
        {onToggleWorkbenchWidth}
        {isZenFocusMode}
        {typewriterMode}
        {onToggleZenFocus}
        {onToggleTypewriter}
        onOpenCheatSheet={() => (isCheatSheetOpen = true)}
        {onOpenSettings}
      />

      <span class="brand-divider"></span>

      <!-- 中間：寬鬆膠囊式分頁導航 -->
      <nav
        class="nav-tabs-area {isDeckDragOver ? 'deck-drag-over' : ''}"
        ondragover={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
          isDeckDragOver = true;
        }}
        ondragenter={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
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
            class="tab-pill {tab.id === activeTabId
              ? 'active'
              : ''} {tab.isAiDraft ? 'has-draft' : ''} {draggedTabId === tab.id
              ? 'is-dragging'
              : ''} {dragOverTabId === tab.id ? 'drag-over' : ''}"
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
            onauxclick={(e) => handleTabAuxClick(e, tab.id)}
            onmousedown={handleTabMouseDown}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === "Enter" && onSelectTab(tab.id)}
          >
            <!-- 僅在當前啟用分頁顯示琥珀金光點，減少非啟用分頁的視覺雜訊 -->
            {#if tab.id === activeTabId}
              <span class="active-indicator"></span>
            {/if}

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
              <span class="tab-label" title="{tab.title} (雙擊改名 / 中鍵關閉)"
                >{tab.title}</span
              >
            {/if}

            {#if tab.isAiDraft}
              <span class="draft-tag">丹</span>
            {/if}

            {#if tabs.length > 1}
              <button
                class="close-action-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                title="收合素簡 (Ctrl+W / 滑鼠中鍵)"
              >
                ×
              </button>
            {/if}
          </div>
        {/each}

        <!-- 極簡化新增按鈕：單分頁時有文字引導，多分頁時化為純粹的 + 號 -->
        <button
          class="add-tab-btn"
          onclick={onAddTab}
          title="添新素簡 (Ctrl+T)"
        >
          <span class="plus-symbol">+</span>
          {#if tabs.length <= 2}
            <span class="add-tab-text">新簡</span>
          {/if}
        </button>
      </nav>
    </div>

    <!-- 右側：溫潤極簡狀態與 AI 創作中樞 -->
    <div class="deck-right">
      <!-- 極簡同步指示：去除外框與生硬的 0.01MS 讀數，僅保留溫潤呼吸燈 -->
      <div class="sync-whisper" title="本機即時自動封存保護中">
        <span class="sync-dot {isSaved ? 'synced' : 'saving'}"></span>
        <span class="sync-text">{isSaved ? "已封存" : "寫入中"}</span>
      </div>

      <!-- 核心創作工具膠囊底座 -->
      <div class="action-dock">
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
            class="dock-btn {isAiChatOpen ? 'active' : ''}"
            onclick={onToggleAiChat}
            title="竹語參謀 (AI 問道對話 Alt+I / Ctrl+J)"
          >
            <span class="material-symbols-outlined text-[16px]">forum</span>
            <span class="btn-label">參謀</span>
          </button>
        {/if}

        <ExportNotePopover
          {activeTab}
          {onShowToast}
          bind:isOpen={isExportOpen}
        />
      </div>

      <!-- 獨立設定入口 (快捷鍵指南已收攏於左側選單或按 ? 觸發，不再重複佔位) -->
      <button
        class="tune-btn"
        onclick={onOpenSettings}
        title="偏好設定與 API 金鑰 (Ctrl+K)"
      >
        <span class="material-symbols-outlined text-[17px]">tune</span>
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
  .constructivist-topbar {
    height: 54px;
    background: rgba(18, 19, 18, 0.96);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(100, 86, 66, 0.25);
    position: relative;
    z-index: 50;
    user-select: none;
  }

  .topbar-inner {
    height: 100%;
    width: 100%;
    padding: 0 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .deck-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }

  .brand-divider {
    width: 1px;
    height: 18px;
    background: rgba(100, 86, 66, 0.3);
    flex-shrink: 0;
  }

  /* 寬鬆分頁導航列 */
  .nav-tabs-area {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 4px 2px;
    flex: 1;
  }

  .nav-tabs-area::-webkit-scrollbar {
    display: none;
  }

  .nav-tabs-area.deck-drag-over {
    background: rgba(250, 189, 47, 0.06);
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px rgba(250, 189, 47, 0.3);
  }

  /* 懸浮膠囊式分頁：去除繁瑣外框與底線，改用溫潤底色與無襯線字體 */
  .tab-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 12px;
    font-size: 13.5px;
    color: #8c8273;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 7px;
    position: relative;
    cursor: pointer;
    transition: all 0.16s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .tab-pill :global(.active-indicator),
  .tab-pill :global(.tab-label),
  .tab-pill :global(.draft-tag) {
    pointer-events: none;
  }

  .tab-pill :global(.close-action-btn),
  .tab-pill :global(.rename-input) {
    pointer-events: auto;
  }

  .tab-pill:hover {
    color: #d5c4a1;
    background: rgba(255, 255, 255, 0.035);
  }

  .tab-pill.active {
    color: #ebdbb2;
    background: rgba(250, 189, 47, 0.08);
    border-color: rgba(250, 189, 47, 0.22);
    font-weight: 500;
  }

  .tab-pill.is-dragging {
    opacity: 0.35;
    cursor: grabbing;
  }

  .tab-pill.drag-over {
    box-shadow: -2px 0 0 #fabd2f;
    background: rgba(250, 189, 47, 0.12);
  }

  /* 僅 Active 分頁顯示的琥珀金微光點 */
  .active-indicator {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #fabd2f;
    box-shadow: 0 0 6px rgba(250, 189, 47, 0.75);
    flex-shrink: 0;
  }

  .tab-label {
    letter-spacing: 0.02em;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .draft-tag {
    font-size: 10px;
    padding: 0 4px;
    border-radius: 3px;
    background: rgba(250, 189, 47, 0.15);
    color: #fabd2f;
  }

  /* 關閉按鈕：預設隱藏，Hover 或 Active 時才優雅浮現 */
  .close-action-btn {
    background: transparent;
    border: none;
    color: #7c7365;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    opacity: 0;
    margin-left: -2px;
    transition: all 0.14s ease;
  }

  .tab-pill:hover .close-action-btn,
  .tab-pill.active .close-action-btn {
    opacity: 0.75;
  }

  .close-action-btn:hover {
    opacity: 1 !important;
    color: #fb4934;
    background: rgba(251, 73, 52, 0.16);
  }

  /* 輕量化新增分頁按鈕 */
  .add-tab-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 32px;
    padding: 0 10px;
    color: #7c7365;
    font-size: 12.5px;
    cursor: pointer;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .add-tab-btn:hover {
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.07);
  }

  .plus-symbol {
    font-family: "JetBrains Mono", monospace;
    font-size: 14px;
    line-height: 1;
  }

  .add-tab-text {
    font-size: 12px;
    letter-spacing: 0.03em;
  }

  /* 右側工具列 */
  .deck-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  /* 去框化的呼吸同步狀態 */
  .sync-whisper {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px;
    font-size: 11.5px;
    color: #665c54;
    letter-spacing: 0.04em;
  }

  .sync-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }

  .sync-dot.synced {
    background: #8ec07c;
    opacity: 0.75;
  }

  .sync-dot.saving {
    background: #fabd2f;
    box-shadow: 0 0 6px rgba(250, 189, 47, 0.7);
    animation: pulse 0.6s infinite alternate;
  }

  @keyframes pulse {
    from {
      opacity: 0.3;
    }
    to {
      opacity: 1;
    }
  }

  /* 右側 AI 與匯出底座 */
  .action-dock {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(100, 86, 66, 0.22);
    border-radius: 8px;
  }

  .dock-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 9px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    color: #a89984;
    font-size: 12.5px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .dock-btn:hover {
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.08);
  }

  .dock-btn.active {
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.14);
    border-color: rgba(250, 189, 47, 0.3);
  }

  .btn-label {
    letter-spacing: 0.02em;
  }

  .tune-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 7px;
    color: #7c7365;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .tune-btn:hover {
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.08);
  }

  .rename-input {
    background: rgba(14, 16, 15, 0.95);
    border: 1px solid #fabd2f;
    color: #ebdbb2;
    font-size: 13px;
    padding: 2px 6px;
    border-radius: 4px;
    width: 110px;
    outline: none;
    box-shadow: 0 0 8px rgba(250, 189, 47, 0.25);
  }
</style>
