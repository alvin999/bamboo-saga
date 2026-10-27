<script lang="ts">
  import type { TabItem } from '../types/tab';
  import ShortcutCheatSheet from './ShortcutCheatSheet.svelte';

  let { 
    vimMode = $bindable(false),
    tabs = [],
    activeTabId = '',
    onSelectTab,
    onAddTab,
    onCloseTab,
    onRenameTab,
    onOpenAi,
    onOpenSettings,
    onOpenKeybindings,
    isSaved = true
  } = $props<{
    vimMode: boolean;
    tabs: TabItem[];
    activeTabId: string;
    onSelectTab: (id: string) => void;
    onAddTab: () => void;
    onCloseTab: (id: string) => void;
    onRenameTab: (id: string, newTitle: string) => void;
    onOpenAi: () => void;
    onOpenSettings: () => void;
    onOpenKeybindings?: () => void;
    isSaved: boolean;
  }>();

  let isCheatSheetOpen = $state(false);
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

<header class="unified-header">
  <!-- 左側：品牌與 HUD 狀態儀表 -->
  <div class="deck-section deck-left">
    <div class="brand">
      <span class="brand-icon">🎋</span>
      <img src="/logo-guangling-solid.svg" alt="廣零散" class="brand-title-svg" />
      <span class="brand-sub">SAGA</span>
    </div>

    <!-- HUD 戰術儀表標籤：致敬 Nothing OS / Raycast -->
    <div class="hud-sync-badge" title="旗艦級防重開機不滅記憶 (毫秒級狀態持久化)">
      <span class="status-dot {isSaved ? 'synced' : 'saving'}"></span>
      <span class="hud-code">{isSaved ? 'SYNC // 0.01ms' : 'FLUSH // VAULT'}</span>
    </div>
  </div>

  <!-- 中間：流線型分頁膠囊列 (Unified Pill Navigation) -->
  <div class="deck-section deck-center">
    <div class="tab-pills-container">
      {#each tabs as tab (tab.id)}
        <div 
          class="tab-pill {tab.id === activeTabId ? 'active' : ''} {tab.isAiDraft ? 'has-draft' : ''}"
          onclick={() => onSelectTab(tab.id)}
          ondblclick={() => startRename(tab)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && onSelectTab(tab.id)}
        >
          <span class="pill-dot"></span>
          
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
            <span class="pill-badge-draft" title="此藥帖有未審核的 AI 提煉結果">丹</span>
          {/if}

          {#if tabs.length > 1}
            <button 
              class="pill-close-btn" 
              onclick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              title="收合新簡 (Ctrl+W)"
            >
              ×
            </button>
          {/if}

          <!-- 底部雷射發光條 (Neon Underline) -->
          {#if tab.id === activeTabId}
            <div class="laser-underline"></div>
          {/if}
        </div>
      {/each}

      <button class="add-pill-btn" onclick={onAddTab} title="新增隨手素簡 (Ctrl+T)">
        <span class="plus-sign">+</span>
        <span class="btn-text">添新簡</span>
      </button>
    </div>
  </div>

  <!-- 右側：戰術 HUD 控制項與快捷鍵艙 -->
  <div class="deck-section deck-right">
    <button 
      class="specular-btn mode-btn {vimMode ? 'active' : ''}" 
      onclick={() => (vimMode = !vimMode)}
      title="切換 Vim 編輯模式"
    >
      <span class="btn-label">{vimMode ? 'MODE // VIM' : 'MODE // STD'}</span>
    </button>

    <button class="specular-btn ai-btn" onclick={onOpenAi} title="開啟 AI 煉丹爐 (Ctrl+K)">
      <span class="sparkle">✨</span>
      <span>煉丹爐</span>
      <kbd class="hud-kbd">Ctrl+K</kbd>
    </button>

    <button 
      class="specular-btn icon-only-btn {isCheatSheetOpen ? 'active' : ''}" 
      onclick={() => (isCheatSheetOpen = !isCheatSheetOpen)} 
      title="快速鍵速查說明指南"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect>
        <line x1="6" y1="8" x2="6" y2="8"></line>
        <line x1="10" y1="8" x2="10" y2="8"></line>
        <line x1="14" y1="8" x2="14" y2="8"></line>
        <line x1="18" y1="8" x2="18" y2="8"></line>
        <line x1="6" y1="12" x2="6" y2="12"></line>
        <line x1="10" y1="12" x2="10" y2="12"></line>
        <line x1="14" y1="12" x2="14" y2="12"></line>
        <line x1="18" y1="12" x2="18" y2="12"></line>
        <line x1="8" y1="16" x2="16" y2="16"></line>
      </svg>
    </button>

    <button class="specular-btn icon-only-btn" onclick={onOpenSettings} title="偏好設定與 API 金鑰">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    </button>
  </div>

  <ShortcutCheatSheet 
    isOpen={isCheatSheetOpen}
    onClose={() => (isCheatSheetOpen = false)}
    onNavigateToSettings={onOpenKeybindings || onOpenSettings}
  />
</header>

<style>
  /* 懸浮島嶼式頂欄 (Unified Floating Island) + 玻璃擬態 */
  .unified-header {
    height: 46px;
    background: rgba(24, 25, 26, 0.85);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    gap: 16px;
    user-select: none;
    position: relative;
    z-index: 20;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  }

  .deck-section {
    display: flex;
    align-items: center;
  }

  /* 左側品牌 */
  .deck-left {
    gap: 12px;
    flex-shrink: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .brand-icon {
    font-size: 1.15rem;
  }


  .brand-title-svg {
    height: 16px;
    width: auto;
    display: block;
    user-select: none;
    -webkit-user-drag: none;
  }

  .brand-sub {
    font-size: 0.65rem;
    font-family: var(--font-mono, monospace);
    color: #7a756b;
    padding: 1px 5px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    letter-spacing: 1px;
    font-weight: 600;
  }

  /* HUD 狀態儀表 */
  .hud-sync-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    font-size: 0.68rem;
    color: #8f897c;
  }

  .hud-code {
    font-family: var(--font-mono, monospace);
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .status-dot.synced {
    background: #8a9a6e;
    box-shadow: 0 0 6px rgba(138, 154, 110, 0.6);
  }

  .status-dot.saving {
    background: #cf984a;
    box-shadow: 0 0 6px rgba(207, 152, 74, 0.6);
    animation: pulse-glow 0.8s infinite alternate;
  }

  @keyframes pulse-glow {
    from { opacity: 0.3; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1.1); }
  }

  /* 中間分頁膠囊 (Pills) */
  .deck-center {
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .deck-center::-webkit-scrollbar {
    display: none;
  }

  .tab-pills-container {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: max-content;
    padding: 2px 0;
  }

  .tab-pill {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    background: rgba(35, 36, 38, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 15px;
    color: #8f897c;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    max-width: 200px;
  }

  .tab-pill:hover {
    color: #d4cebe;
    background: rgba(45, 47, 50, 0.65);
    border-color: rgba(255, 255, 255, 0.1);
  }

  /* 作用中膠囊 (Active Pill) */
  .tab-pill.active {
    background: rgba(24, 25, 26, 0.95);
    color: #cf984a;
    border-color: rgba(207, 152, 74, 0.35);
    box-shadow: 
      0 2px 8px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  /* 底部雷射發光條 (Neon Underline) */
  .laser-underline {
    position: absolute;
    bottom: -1px;
    left: 14px;
    right: 14px;
    height: 2px;
    background: #cf984a;
    border-radius: 2px;
    box-shadow: 0 0 6px rgba(207, 152, 74, 0.6);
    animation: neon-glow 1.5s ease-in-out infinite alternate;
  }

  @keyframes neon-glow {
    from { opacity: 0.8; }
    to { opacity: 1; filter: drop-shadow(0 0 5px rgba(207, 152, 74, 0.5)); }
  }

  .pill-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #52565b;
  }

  .tab-pill.active .pill-dot {
    background: #cf984a;
    box-shadow: 0 0 5px rgba(207, 152, 74, 0.5);
  }

  .tab-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pill-badge-draft {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(207, 152, 74, 0.18);
    color: #cf984a;
    font-weight: 700;
    border: 1px solid rgba(207, 152, 74, 0.35);
  }

  .pill-close-btn {
    background: transparent;
    border: none;
    color: #7a756b;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s;
  }

  .pill-close-btn:hover {
    color: #bf584d;
    background: rgba(191, 88, 77, 0.15);
  }

  .rename-input {
    background: #18191a;
    border: 1px solid #cf984a;
    color: #cf984a;
    font-size: 0.78rem;
    padding: 1px 6px;
    border-radius: 4px;
    width: 100px;
    outline: none;
  }

  /* 添藥帖按鈕 */
  .add-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    padding: 0 10px;
    background: transparent;
    border: 1px dashed rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    color: #7a756b;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .add-pill-btn:hover {
    color: #cf984a;
    border-color: #cf984a;
    background: rgba(207, 152, 74, 0.08);
  }

  /* 右側控制項與 1px 漸層高光邊框 (Specular Border) */
  .deck-right {
    gap: 8px;
    flex-shrink: 0;
  }

  .specular-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 11px;
    border-radius: 8px;
    background: rgba(35, 36, 38, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #bfb8a8;
    font-size: 0.75rem;
    font-family: var(--font-mono, monospace);
    font-weight: 600;
    cursor: pointer;
    box-shadow: 
      0 2px 6px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.08); /* 頂部漸層微反光 */
    transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .specular-btn:hover {
    background: rgba(45, 47, 50, 0.85);
    color: #cf984a;
    border-color: rgba(255, 255, 255, 0.15);
    transform: translateY(-1px);
  }

  .mode-btn.active {
    background: linear-gradient(135deg, rgba(207, 152, 74, 0.2) 0%, rgba(199, 120, 64, 0.28) 100%);
    color: #cf984a;
    border-color: rgba(207, 152, 74, 0.35);
    box-shadow: 
      0 2px 8px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(207, 152, 74, 0.25);
  }

  .ai-btn {
    background: linear-gradient(135deg, rgba(207, 152, 74, 0.15) 0%, rgba(199, 120, 64, 0.1) 100%);
    color: #cf984a;
    border-color: rgba(207, 152, 74, 0.25);
  }

  .ai-btn:hover {
    background: linear-gradient(135deg, #cf984a 0%, #b87e35 100%);
    color: #18191a;
    box-shadow: 0 0 12px rgba(207, 152, 74, 0.4);
  }

  .ai-btn:hover .hud-kbd {
    background: rgba(0, 0, 0, 0.3);
    color: #ede7dc;
    border-color: transparent;
  }

  .hud-kbd {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.45);
    color: #a89984;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .icon-only-btn {
    padding: 0 8px;
  }
</style>
