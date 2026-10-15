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
    onOpenAi,
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
    onOpenAi: () => void;
    onOpenSettings: () => void;
    isSaved: boolean;
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
              title="歸還藥帖"
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

      <button class="add-pill-btn" onclick={onAddTab} title="新增隨手藥帖 (百子櫃)">
        <span class="plus-sign">+</span>
        <span class="btn-text">添藥帖</span>
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

    <button class="specular-btn icon-only-btn" onclick={onOpenSettings} title="偏好設定與 API 金鑰">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    </button>
  </div>
</header>

<style>
  /* 懸浮島嶼式頂欄 (Unified Floating Island) + 玻璃擬態 */
  .unified-header {
    height: 46px;
    background: rgba(29, 32, 33, 0.78);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(235, 219, 178, 0.08);
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
    color: #928374;
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
    border: 1px solid rgba(235, 219, 178, 0.09);
    border-radius: 6px;
    font-size: 0.68rem;
    color: #a89984;
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
    background: #b8bb26;
    box-shadow: 0 0 8px rgba(184, 187, 38, 0.8);
  }

  .status-dot.saving {
    background: #fabd2f;
    box-shadow: 0 0 8px rgba(250, 189, 47, 0.8);
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
    background: rgba(40, 40, 40, 0.45);
    border: 1px solid rgba(235, 219, 178, 0.08);
    border-radius: 15px;
    color: #a89984;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    max-width: 200px;
  }

  .tab-pill:hover {
    color: #ebdbb2;
    background: rgba(50, 48, 47, 0.65);
    border-color: rgba(235, 219, 178, 0.15);
  }

  /* 作用中膠囊 (Active Pill) */
  .tab-pill.active {
    background: rgba(29, 32, 33, 0.95);
    color: #fabd2f;
    border-color: rgba(254, 128, 25, 0.3);
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
    background: #fe8019;
    border-radius: 2px;
    box-shadow: 0 0 8px #fe8019, 0 0 2px #fabd2f;
    animation: neon-glow 1.5s ease-in-out infinite alternate;
  }

  @keyframes neon-glow {
    from { opacity: 0.8; }
    to { opacity: 1; filter: drop-shadow(0 0 6px #fe8019); }
  }

  .pill-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #504945;
  }

  .tab-pill.active .pill-dot {
    background: #fe8019;
    box-shadow: 0 0 6px #fe8019;
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
    background: rgba(254, 128, 25, 0.25);
    color: #fe8019;
    font-weight: 700;
    border: 1px solid rgba(254, 128, 25, 0.4);
  }

  .pill-close-btn {
    background: transparent;
    border: none;
    color: #7c6f64;
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
    color: #fb4934;
    background: rgba(251, 73, 52, 0.15);
  }

  .rename-input {
    background: #141617;
    border: 1px solid #fe8019;
    color: #fabd2f;
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
    border: 1px dashed rgba(235, 219, 178, 0.18);
    border-radius: 14px;
    color: #928374;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .add-pill-btn:hover {
    color: #fabd2f;
    border-color: #fabd2f;
    background: rgba(250, 189, 47, 0.08);
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
    background: rgba(40, 40, 40, 0.7);
    border: 1px solid rgba(235, 219, 178, 0.1);
    color: #d5c4a1;
    font-size: 0.75rem;
    font-family: var(--font-mono, monospace);
    font-weight: 600;
    cursor: pointer;
    box-shadow: 
      0 2px 6px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.12); /* 頂部漸層微反光 */
    transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .specular-btn:hover {
    background: rgba(50, 48, 47, 0.85);
    color: #fabd2f;
    border-color: rgba(235, 219, 178, 0.2);
    transform: translateY(-1px);
  }

  .mode-btn.active {
    background: linear-gradient(135deg, rgba(254, 128, 25, 0.25) 0%, rgba(214, 93, 14, 0.35) 100%);
    color: #fe8019;
    border-color: rgba(254, 128, 25, 0.4);
    box-shadow: 
      0 2px 8px rgba(254, 128, 25, 0.25),
      inset 0 1px 0 rgba(254, 128, 25, 0.3);
  }

  .ai-btn {
    background: linear-gradient(135deg, rgba(254, 128, 25, 0.18) 0%, rgba(250, 189, 47, 0.1) 100%);
    color: #fe8019;
    border-color: rgba(254, 128, 25, 0.3);
  }

  .ai-btn:hover {
    background: linear-gradient(135deg, #fe8019 0%, #d65d0e 100%);
    color: #1d2021;
    box-shadow: 0 0 14px rgba(254, 128, 25, 0.5);
  }

  .ai-btn:hover .hud-kbd {
    background: rgba(0, 0, 0, 0.3);
    color: #fbf1c7;
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
