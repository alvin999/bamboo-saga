<script lang="ts">
  /**
   * BrandQuickMenu.svelte
   * 廣零散品牌核心快捷中樞 (Command Quick Action Hub)
   * 
   * 懸停（Hover）於品牌 Logo 時由下方平滑滑出，整合藏卷洞天、檔案操作、
   * 時光機、雲端法印、劍道/水墨模式開關與系統指南等全局核心操作。
   */

  interface BrandQuickMenuProps {
    vimMode: boolean;
    smearEnabled?: boolean;
    workbenchWidth?: 'zen' | 'full';
    autoOneDriveBackup?: boolean;
    selectedOneDrivePath?: string;
    onToggleFileBrowser: () => void;
    onAddTab: () => void;
    onManualSave?: () => void;
    onOpenFuzzy?: () => void;
    onSaveAs?: () => void;
    onOpenHistory?: () => void;
    onOpenBackup?: () => void;
    onOpenTextTools?: () => void;
    onOpenExport?: () => void;
    onToggleVim?: () => void;
    onToggleSmear?: () => void;
    onToggleWorkbenchWidth?: () => void;
    isZenFocusMode?: boolean;
    typewriterMode?: boolean;
    onToggleZenFocus?: () => void;
    onToggleTypewriter?: () => void;
    onOpenCheatSheet?: () => void;
    onOpenSettings?: () => void;
  }

  let {
    vimMode = false,
    smearEnabled = true,
    workbenchWidth = 'zen',
    autoOneDriveBackup = false,
    selectedOneDrivePath = '',
    isZenFocusMode = false,
    typewriterMode = false,
    onToggleFileBrowser,
    onAddTab,
    onManualSave,
    onOpenFuzzy,
    onSaveAs,
    onOpenHistory,
    onOpenBackup,
    onOpenTextTools,
    onOpenExport,
    onToggleVim,
    onToggleSmear,
    onToggleWorkbenchWidth,
    onToggleZenFocus,
    onToggleTypewriter,
    onOpenCheatSheet,
    onOpenSettings
  }: BrandQuickMenuProps = $props();

  let isOpen = $state(false);
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  function handleMouseEnter() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    isOpen = true;
  }

  function handleMouseLeave() {
    if (closeTimer) clearTimeout(closeTimer);
    // 180ms 離開延遲防誤觸緩衝
    closeTimer = setTimeout(() => {
      isOpen = false;
    }, 180);
  }

  function handleAction(action?: () => void) {
    if (action) {
      action();
    }
    isOpen = false;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      isOpen = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div 
  class="brand-menu-wrapper"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  role="region"
  aria-label="廣零散品牌快捷選單"
>
  <!-- 品牌標誌主體 (懸停觸發錨點) -->
  <div class="brand-cluster select-none" class:is-active={isOpen}>
    <span class="brand-icon">
      <svg class="brand-icon-svg" viewBox="0 0 24 24" width="20" height="20" fill="none">
        <!-- 左主幹幾何竹骨 -->
        <rect x="4.5" y="4" width="2.8" height="16" rx="1.2" fill="#8ec07c" />
        <!-- 幾何赭金節點扣環 -->
        <rect x="3.5" y="8.5" width="4.8" height="1.8" rx="0.9" fill="#fabd2f" />
        <rect x="3.5" y="13.5" width="4.8" height="1.8" rx="0.9" fill="#fabd2f" />

        <!-- 右側展開之幾何代碼竹簡條 (無葉純淨款) -->
        <rect x="9.5" y="6" width="9.5" height="2.4" rx="1" fill="#8ec07c" />
        <rect x="9.5" y="10.8" width="12" height="2.4" rx="1" fill="#b8bb26" />
        <rect x="9.5" y="15.6" width="8" height="2.4" rx="1" fill="#8ec07c" />

        <!-- 丹火幾何端點 (中央代碼行端點) -->
        <circle cx="20.2" cy="12" r="1.1" fill="#fe8019" />
      </svg>
    </span>

    <div class="brand-text">
      <img src="/logo-guangling-solid.svg" alt="廣零散" class="brand-title-svg" />
      <span class="brand-sub">BAMBOO·SAGA</span>
    </div>

    <!-- 微指示箭頭 -->
    <span class="menu-indicator {isOpen ? 'expanded' : ''}">▾</span>
  </div>

  <!-- 下拉懸浮快顯面板 -->
  {#if isOpen}
    <div 
      class="quick-menu-dropdown"
      role="menu"
      tabindex="-1"
      onmouseenter={handleMouseEnter}
      onmouseleave={handleMouseLeave}
    >
      <div class="menu-header">
        <div class="header-left">
          <span class="hud-tag">SAGA // QUICK HUB</span>
          <span class="header-desc">廣零散 · 萬卷捷徑掌心印</span>
        </div>
        <span class="vault-tag">[00 // CONTROL-VAULT]</span>
      </div>

      <!-- 分組 1：卷軸與檔案 -->
      <div class="menu-section">
        <div class="section-title">
          <span class="sec-dot"></span>
          <span>卷軸與檔案</span>
        </div>
        
        <button 
          class="menu-item highlight" 
          onclick={() => handleAction(onToggleFileBrowser)}
        >
          <div class="item-left">
            <span class="item-glyph glyph-primary">◫</span>
            <div class="item-info">
              <span class="item-name">藏卷洞天 · 萬卷中控台</span>
              <span class="item-tip">瀏覽已收錄目錄與檔案總管抽屜</span>
            </div>
          </div>
          <span class="key-badge">Ctrl+B</span>
        </button>

        <button 
          class="menu-item" 
          onclick={() => handleAction(onAddTab)}
        >
          <div class="item-left">
            <span class="item-glyph glyph-primary">▢</span>
            <div class="item-info">
              <span class="item-name">添新素簡</span>
              <span class="item-tip">開闢隨手空白筆記與代碼分頁</span>
            </div>
          </div>
          <span class="key-badge">Ctrl+T</span>
        </button>

        {#if onManualSave}
          <button 
            class="menu-item" 
            onclick={() => handleAction(onManualSave)}
          >
            <div class="item-left">
              <span class="item-glyph glyph-secondary">◈</span>
              <div class="item-info">
                <span class="item-name">封存卷軸 · 儲存檔案</span>
                <span class="item-tip">立即將當前內容寫入實體磁碟</span>
              </div>
            </div>
            <span class="key-badge">Ctrl+S</span>
          </button>
        {/if}

        {#if onSaveAs}
          <button 
            class="menu-item" 
            onclick={() => handleAction(onSaveAs)}
          >
            <div class="item-left">
              <span class="item-glyph glyph-warm">❖</span>
              <div class="item-info">
                <span class="item-name">AI 智薦歸檔 · 另存新卷</span>
                <span class="item-tip">語義分析智能歸類磁碟路徑</span>
              </div>
            </div>
            <span class="key-badge">Ctrl+Shift+S</span>
          </button>
        {/if}

        {#if onOpenFuzzy}
          <button 
            class="menu-item" 
            onclick={() => handleAction(onOpenFuzzy)}
          >
            <div class="item-left">
              <span class="item-glyph glyph-primary">◎</span>
              <div class="item-info">
                <span class="item-name">萬卷全搜</span>
                <span class="item-tip">模糊檢索全域檔案與近期卷軸</span>
              </div>
            </div>
            <span class="key-badge">Ctrl+P</span>
          </button>
        {/if}

        {#if onOpenTextTools}
          <button 
            class="menu-item highlight-subtle" 
            onclick={() => handleAction(onOpenTextTools)}
          >
            <div class="item-left">
              <span class="item-glyph glyph-primary">◬</span>
              <div class="item-info">
                <span class="item-name">行處理解藥包 · 文本排版</span>
                <span class="item-tip">批次行去重、快速排序與結構排版工具</span>
              </div>
            </div>
            <span class="key-badge">Ctrl+Shift+T</span>
          </button>
        {/if}

        {#if onOpenExport}
          <button 
            class="menu-item highlight-subtle" 
            onclick={() => handleAction(onOpenExport)}
          >
            <div class="item-left">
              <span class="item-glyph glyph-secondary">⊼</span>
              <div class="item-info">
                <span class="item-name">藥帖匯出 · 下載與複製</span>
                <span class="item-tip">匯出當前手稿為 .md / .txt 或複製乾淨內容</span>
              </div>
            </div>
            <span class="key-badge">Ctrl+Shift+E</span>
          </button>
        {/if}
      </div>

      <div class="menu-divider"></div>

      <!-- 分組 2：時光與同步 -->
      <div class="menu-section">
        <div class="section-title">
          <span class="sec-dot"></span>
          <span>時光與同步</span>
        </div>

        {#if onOpenHistory}
          <button 
            class="menu-item" 
            onclick={() => handleAction(onOpenHistory)}
          >
            <div class="item-left">
              <span class="item-glyph glyph-primary">⏱</span>
              <div class="item-info">
                <span class="item-name">卷軸歷史時光機</span>
                <span class="item-tip">本機快照時間軸與版本 Diff 比對</span>
              </div>
            </div>
            <span class="key-badge">Alt+H</span>
          </button>
        {/if}

        {#if onOpenBackup}
          <button 
            class="menu-item" 
            onclick={() => handleAction(onOpenBackup)}
          >
            <div class="item-left">
              <span class="item-glyph glyph-secondary">☁</span>
              <div class="item-info">
                <span class="item-name">雲端法印 (OneDrive 備份)</span>
                <span class="item-tip">
                  {selectedOneDrivePath ? (autoOneDriveBackup ? '已啟用自動定時雲端同步' : '已配置備份路徑') : '未綁定雲端資料夾'}
                </span>
              </div>
            </div>
            <span class="status-pill {selectedOneDrivePath ? 'ok' : 'idle'}">
              {selectedOneDrivePath ? 'SYNC OK' : 'OFF'}
            </span>
          </button>
        {/if}
      </div>

      <div class="menu-divider"></div>

      <!-- 分組 3：創渡與禪風工作台 -->
      <div class="menu-section">
        <div class="section-title">
          <span class="sec-dot"></span>
          <span>創渡與禪風工作台</span>
        </div>

        {#if onToggleVim}
          <button 
            class="menu-item" 
            onclick={() => handleAction(onToggleVim)}
          >
            <div class="item-left">
              <span class="item-glyph glyph-primary">⚔</span>
              <div class="item-info">
                <span class="item-name">Vim 劍道模式</span>
                <span class="item-tip">切換極速鍵道 Normal / Insert 模式</span>
              </div>
            </div>
            <span class="status-pill {vimMode ? 'active' : 'idle'}">
              {vimMode ? 'VIM ON' : 'VIM OFF'}
            </span>
          </button>
        {/if}

        {#if onToggleSmear}
          <button 
            class="menu-item" 
            onclick={() => handleAction(onToggleSmear)}
          >
            <div class="item-left">
              <span class="item-glyph glyph-warm">☄</span>
              <div class="item-info">
                <span class="item-name">墨韻殘影 (Smear Cursor)</span>
                <span class="item-tip">光標拖尾水墨動態渲染特效</span>
              </div>
            </div>
            <span class="status-pill {smearEnabled ? 'warm' : 'idle'}">
              {smearEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
        {/if}

        {#if onToggleWorkbenchWidth}
          <button 
            class="menu-item" 
            onclick={() => handleAction(onToggleWorkbenchWidth)}
          >
            <div class="item-left">
              <span class="item-glyph glyph-primary">⊿</span>
              <div class="item-info">
                <span class="item-name">工作台畫布寬度</span>
                <span class="item-tip">居中禪風 (960px) 與全螢幕滿版切換</span>
              </div>
            </div>
            <span class="status-pill neutral">
              {workbenchWidth === 'full' ? '滿版 FULL' : '禪風 ZEN'}
            </span>
          </button>
        {/if}

        {#if onToggleZenFocus}
          <button 
            class="menu-item" 
            onclick={() => handleAction(onToggleZenFocus)}
          >
            <div class="item-left">
              <span class="item-glyph glyph-secondary">竹</span>
              <div class="item-info">
                <span class="item-name">竹林靜心 · 沉浸專注</span>
                <span class="item-tip">隱藏全域邊界，只留一卷清幽筆墨</span>
              </div>
            </div>
            <span class="key-badge">F11 / Alt+Z</span>
          </button>
        {/if}

        {#if onToggleTypewriter}
          <button 
            class="menu-item" 
            onclick={() => handleAction(onToggleTypewriter)}
          >
            <div class="item-left">
              <span class="item-glyph glyph-muted">⌨</span>
              <div class="item-info">
                <span class="item-name">打字機捲動模式</span>
                <span class="item-tip">視線垂直居中保持，行走字間自然呼吸</span>
              </div>
            </div>
            <span class="status-pill {typewriterMode ? 'active' : 'idle'}">
              {typewriterMode ? 'ON' : 'OFF'}
            </span>
          </button>
        {/if}
      </div>

      <div class="menu-divider"></div>

      <!-- 分組 4：系統與指南 -->
      <div class="menu-section">
        <div class="section-title">
          <span class="sec-dot"></span>
          <span>系統與指南</span>
        </div>

        {#if onOpenCheatSheet}
          <button 
            class="menu-item" 
            onclick={() => handleAction(onOpenCheatSheet)}
          >
            <div class="item-left">
              <span class="item-glyph glyph-primary">☵</span>
              <div class="item-info">
                <span class="item-name">鍵道輕功速查指南</span>
                <span class="item-tip">全系統快捷鍵與操作秘笈</span>
              </div>
            </div>
            <span class="key-badge">?</span>
          </button>
        {/if}

        {#if onOpenSettings}
          <button 
            class="menu-item" 
            onclick={() => handleAction(onOpenSettings)}
          >
            <div class="item-left">
              <span class="item-glyph glyph-primary">⚙</span>
              <div class="item-info">
                <span class="item-name">靈石金鑰與偏好設定</span>
                <span class="item-tip">AI 煉丹模型與 API 金鑰保險庫</span>
              </div>
            </div>
            <span class="key-badge">Ctrl+K</span>
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .brand-menu-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 100%;
  }

  /* 品牌標誌組合 */
  .brand-cluster {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.18s ease;
    border: 1px solid transparent;
  }

  .brand-cluster:hover,
  .brand-cluster.is-active {
    background: rgba(40, 42, 42, 0.7);
    border-color: rgba(212, 155, 53, 0.35);
  }

  .brand-icon {
    font-size: 16px;
    line-height: 16px;
    height: 20px;
    width: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .brand-icon-svg {
    display: block;
    width: 20px;
    height: 20px;
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .brand-cluster:hover .brand-icon-svg,
  .brand-cluster.is-active .brand-icon-svg {
    transform: scale(1.15) rotate(-3deg);
  }

  .brand-text {
    display: flex;
    flex-direction: column;
  }

  .brand-title-svg {
    height: 16px;
    width: auto;
    display: block;
    user-select: none;
    -webkit-user-drag: none;
    transform: translateY(1px);
  }

  .brand-sub {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    color: #938c80;
    letter-spacing: 0.18em;
    margin-top: 2px;
  }

  .menu-indicator {
    font-size: 11px;
    color: #938c80;
    transition: transform 0.2s ease, color 0.2s ease;
    margin-left: 2px;
  }

  .brand-cluster:hover .menu-indicator,
  .menu-indicator.expanded {
    color: #fabd2f;
    transform: translateY(1px);
  }

  /* 下拉快顯面板 (兼具 Apothecary Gruvbox 東方藥理與通透呼吸感) */
  .quick-menu-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    width: 326px;
    background: rgba(20, 22, 21, 0.96);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(80, 69, 52, 0.5);
    border-radius: 6px;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.68), 0 0 0 1px rgba(250, 189, 47, 0.12);
    padding: 10px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 6px;
    animation: menuFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes menuFadeIn {
    from {
      opacity: 0;
      transform: translateY(-5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px 8px 6px;
    border-bottom: 1px solid rgba(80, 69, 52, 0.35);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .hud-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    color: #fabd2f;
    letter-spacing: 0.08em;
    font-weight: 600;
    background: rgba(250, 189, 47, 0.12);
    padding: 2px 5px;
    border-radius: 3px;
    border: 1px solid rgba(250, 189, 47, 0.25);
  }

  .header-desc {
    font-size: 10px;
    color: #9c8f7a;
  }

  .vault-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    padding: 1.5px 4.5px;
    border-radius: 3px;
    background: #181a18;
    color: #d4c5ad;
    border: 1px solid rgba(80, 69, 52, 0.4);
    letter-spacing: 0.06em;
  }

  .menu-section {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    color: #9c8f7a;
    padding: 4px 6px 2px 6px;
    letter-spacing: 0.06em;
  }

  .sec-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #fabd2f;
    opacity: 0.65;
  }

  .menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 6px 8px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #e4e2e1;
    cursor: pointer;
    text-align: left;
    transition: all 0.14s ease;
  }

  .menu-item:hover {
    background: rgba(250, 189, 47, 0.09);
    border-color: rgba(250, 189, 47, 0.3);
  }

  .menu-item:hover .item-name {
    color: #fabd2f;
  }

  .menu-item:hover .item-glyph {
    transform: scale(1.12);
  }

  .item-left {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  /* 自由呼吸的古典符號 (Monospace Apothecary Glyphs - 無生硬外框) */
  .item-glyph {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 1;
    flex-shrink: 0;
    transition: transform 0.15s ease, color 0.15s ease;
  }

  .item-glyph.glyph-primary {
    color: #fabd2f;
  }

  .item-glyph.glyph-secondary {
    color: #cacd39;
  }

  .item-glyph.glyph-warm {
    color: #ffdfa4;
  }

  .item-glyph.glyph-muted {
    color: #a89984;
  }

  .item-info {
    display: flex;
    flex-direction: column;
    gap: 1.5px;
    min-width: 0;
  }

  .item-name {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.25;
    color: #e4e2e1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 0.12s ease;
  }

  /* 副標採用無襯線比例字體與自然字距，輕盈好閱讀 */
  .item-tip {
    font-size: 10px;
    color: #8c8579;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 0.12s ease;
  }

  .menu-item:hover .item-tip {
    color: #d4c5ad;
  }

  .key-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    color: #a89f91;
    background: #171818;
    border: 1px solid rgba(80, 69, 52, 0.5);
    padding: 1px 5px;
    border-radius: 3px;
    letter-spacing: 0.02em;
    flex-shrink: 0;
    margin-left: 8px;
  }

  .status-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9.5px;
    padding: 1px 6px;
    border-radius: 3px;
    letter-spacing: 0.04em;
    flex-shrink: 0;
    margin-left: 8px;
    border: 1px solid transparent;
  }

  .status-pill.active,
  .status-pill.ok {
    background: rgba(142, 192, 124, 0.15);
    color: #8ec07c;
    border-color: rgba(142, 192, 124, 0.35);
  }

  .status-pill.warm {
    background: rgba(250, 189, 47, 0.14);
    color: #fabd2f;
    border-color: rgba(250, 189, 47, 0.32);
  }

  .status-pill.neutral {
    background: rgba(212, 155, 53, 0.12);
    color: #d49b35;
    border-color: rgba(212, 155, 53, 0.3);
  }

  .status-pill.idle {
    background: rgba(147, 140, 128, 0.12);
    color: #938c80;
    border-color: rgba(147, 140, 128, 0.25);
  }

  .menu-divider {
    height: 1px;
    background: rgba(80, 69, 52, 0.32);
    margin: 3px 4px;
  }
</style>
