<script lang="ts">
  /**
   * BrandQuickMenu.svelte (精簡寬鬆舒適版)
   * 廣零散品牌核心快捷中樞 (Command Quick Action Hub)
   */

  interface BrandQuickMenuProps {
    vimMode: boolean;
    smearEnabled?: boolean;
    workbenchWidth?: "zen" | "full";
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
    workbenchWidth = "zen",
    autoOneDriveBackup = false,
    selectedOneDrivePath = "",
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
    onOpenSettings,
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
    if (e.key === "Escape") {
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
      <svg
        class="brand-icon-svg"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
      >
        <rect x="4.5" y="4" width="2.8" height="16" rx="1.2" fill="#8ec07c" />
        <rect
          x="3.5"
          y="8.5"
          width="4.8"
          height="1.8"
          rx="0.9"
          fill="#fabd2f"
        />
        <rect
          x="3.5"
          y="13.5"
          width="4.8"
          height="1.8"
          rx="0.9"
          fill="#fabd2f"
        />
        <rect x="9.5" y="6" width="9.5" height="2.4" rx="1" fill="#8ec07c" />
        <rect x="9.5" y="10.8" width="12" height="2.4" rx="1" fill="#b8bb26" />
        <rect x="9.5" y="15.6" width="8" height="2.4" rx="1" fill="#8ec07c" />
        <circle cx="20.2" cy="12" r="1.1" fill="#fe8019" />
      </svg>
    </span>

    <div class="brand-text">
      <img
        src="/logo-guangling-solid.svg"
        alt="廣零散"
        class="brand-title-svg"
      />
      <span class="brand-sub">BAMBOO·SAGA</span>
    </div>

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
      <!-- 核心首要入口：獨立焦點卡片 -->
      <button
        class="hero-item"
        onclick={() => handleAction(onToggleFileBrowser)}
        title="瀏覽已收錄目錄與檔案總管抽屜"
      >
        <div class="hero-left">
          <span class="hero-glyph">◫</span>
          <div class="hero-info">
            <span class="hero-name">藏卷洞天</span>
            <span class="hero-tip">開啟工作區目錄與檔案抽屜</span>
          </div>
        </div>
        <span class="key-badge">Ctrl+B</span>
      </button>

      <!-- 分組 1：卷軸與檔案 (單行舒適列表) -->
      <div class="menu-section">
        <div class="section-title">卷軸與工具</div>

        <button
          class="menu-item"
          onclick={() => handleAction(onAddTab)}
          title="開闢隨手空白筆記與代碼分頁"
        >
          <div class="item-left">
            <span class="item-glyph glyph-primary">▢</span>
            <span class="item-name">添新素簡</span>
          </div>
          <span class="key-badge">Ctrl+T</span>
        </button>

        {#if onOpenFuzzy}
          <button
            class="menu-item"
            onclick={() => handleAction(onOpenFuzzy)}
            title="模糊檢索全域檔案與近期卷軸"
          >
            <div class="item-left">
              <span class="item-glyph glyph-primary">◎</span>
              <span class="item-name">萬卷全搜</span>
            </div>
            <span class="key-badge">Ctrl+P</span>
          </button>
        {/if}

        {#if onManualSave}
          <button
            class="menu-item"
            onclick={() => handleAction(onManualSave)}
            title="立即將當前內容寫入實體磁碟"
          >
            <div class="item-left">
              <span class="item-glyph glyph-secondary">◈</span>
              <span class="item-name">封存卷軸</span>
              <span class="item-sub-hint">儲存</span>
            </div>
            <span class="key-badge">Ctrl+S</span>
          </button>
        {/if}

        {#if onSaveAs}
          <button
            class="menu-item"
            onclick={() => handleAction(onSaveAs)}
            title="語義分析智能歸類磁碟路徑"
          >
            <div class="item-left">
              <span class="item-glyph glyph-warm">❖</span>
              <span class="item-name">AI 智薦歸檔</span>
              <span class="item-sub-hint">另存</span>
            </div>
            <span class="key-badge">Ctrl+Shift+S</span>
          </button>
        {/if}

        {#if onOpenTextTools}
          <button
            class="menu-item"
            onclick={() => handleAction(onOpenTextTools)}
            title="批次行去重、快速排序與結構排版工具"
          >
            <div class="item-left">
              <span class="item-glyph glyph-primary">◬</span>
              <span class="item-name">行處理解藥包</span>
            </div>
            <span class="key-badge">Ctrl+Shift+T</span>
          </button>
        {/if}

        {#if onOpenExport}
          <button
            class="menu-item"
            onclick={() => handleAction(onOpenExport)}
            title="匯出當前手稿為 .md / .txt 或複製乾淨內容"
          >
            <div class="item-left">
              <span class="item-glyph glyph-secondary">⊼</span>
              <span class="item-name">藥帖匯出與複製</span>
            </div>
            <span class="key-badge">Ctrl+Shift+E</span>
          </button>
        {/if}
      </div>

      <div class="menu-divider"></div>

      <!-- 分組 2：工作台狀態切換 (雙欄舒適網格，大幅降低垂直視覺疲勞) -->
      <div class="menu-section">
        <div class="section-title">禪風工作台</div>

        <div class="toggle-grid">
          {#if onToggleVim}
            <button
              class="toggle-card"
              class:is-on={vimMode}
              onclick={() => handleAction(onToggleVim)}
              title="切換極速鍵道 Normal / Insert 模式"
            >
              <div class="toggle-top">
                <span class="item-glyph glyph-primary">⚔</span>
                <span class="status-dot {vimMode ? 'on' : ''}"></span>
              </div>
              <span class="toggle-name">Vim 劍道</span>
              <span class="toggle-state">{vimMode ? "已啟用" : "關閉"}</span>
            </button>
          {/if}

          {#if onToggleSmear}
            <button
              class="toggle-card"
              class:is-warm={smearEnabled}
              onclick={() => handleAction(onToggleSmear)}
              title="光標拖尾水墨動態渲染特效"
            >
              <div class="toggle-top">
                <span class="item-glyph glyph-warm">☄</span>
                <span class="status-dot {smearEnabled ? 'warm' : ''}"></span>
              </div>
              <span class="toggle-name">墨韻殘影</span>
              <span class="toggle-state"
                >{smearEnabled ? "已啟用" : "關閉"}</span
              >
            </button>
          {/if}

          {#if onToggleWorkbenchWidth}
            <button
              class="toggle-card"
              onclick={() => handleAction(onToggleWorkbenchWidth)}
              title="居中禪風 (960px) 與全螢幕滿版切換"
            >
              <div class="toggle-top">
                <span class="item-glyph glyph-primary">⊿</span>
                <span class="toggle-badge"
                  >{workbenchWidth === "full" ? "FULL" : "ZEN"}</span
                >
              </div>
              <span class="toggle-name">畫布寬度</span>
              <span class="toggle-state"
                >{workbenchWidth === "full" ? "全螢幕滿版" : "居中禪風"}</span
              >
            </button>
          {/if}

          {#if onToggleTypewriter}
            <button
              class="toggle-card"
              class:is-on={typewriterMode}
              onclick={() => handleAction(onToggleTypewriter)}
              title="視線垂直居中保持，行走字間自然呼吸"
            >
              <div class="toggle-top">
                <span class="item-glyph glyph-muted">⌨</span>
                <span class="status-dot {typewriterMode ? 'on' : ''}"></span>
              </div>
              <span class="toggle-name">打字機捲動</span>
              <span class="toggle-state"
                >{typewriterMode ? "垂直居中" : "關閉"}</span
              >
            </button>
          {/if}
        </div>

        {#if onToggleZenFocus}
          <button
            class="menu-item"
            onclick={() => handleAction(onToggleZenFocus)}
            title="隱藏全域邊界，只留一卷清幽筆墨"
          >
            <div class="item-left">
              <span class="item-glyph glyph-secondary">竹</span>
              <span class="item-name">竹林靜心專注</span>
            </div>
            <span class="key-badge">F11</span>
          </button>
        {/if}
      </div>

      <div class="menu-divider"></div>

      <!-- 分組 3：時光、雲端與系統 -->
      <div class="menu-section">
        <div class="section-title">時光與系統</div>

        {#if onOpenHistory}
          <button
            class="menu-item"
            onclick={() => handleAction(onOpenHistory)}
            title="本機快照時間軸與版本 Diff 比對"
          >
            <div class="item-left">
              <span class="item-glyph glyph-primary">⏱</span>
              <span class="item-name">歷史時光機</span>
            </div>
            <span class="key-badge">Alt+H</span>
          </button>
        {/if}

        {#if onOpenBackup}
          <button
            class="menu-item"
            onclick={() => handleAction(onOpenBackup)}
            title={selectedOneDrivePath
              ? autoOneDriveBackup
                ? "已啟用自動定時雲端同步"
                : "已配置備份路徑"
              : "未綁定雲端資料夾"}
          >
            <div class="item-left">
              <span class="item-glyph glyph-secondary">☁</span>
              <span class="item-name">雲端法印備份</span>
            </div>
            <span class="status-pill {selectedOneDrivePath ? 'ok' : 'idle'}">
              {selectedOneDrivePath ? "SYNC" : "OFF"}
            </span>
          </button>
        {/if}

        <!-- 底部雙欄系統列 -->
        <div class="footer-actions">
          {#if onOpenCheatSheet}
            <button
              class="footer-btn"
              onclick={() => handleAction(onOpenCheatSheet)}
              title="全系統快捷鍵與操作秘笈"
            >
              <span class="item-glyph glyph-primary">☵</span>
              <span>快捷鍵指南</span>
              <span class="key-badge">?</span>
            </button>
          {/if}

          {#if onOpenSettings}
            <button
              class="footer-btn"
              onclick={() => handleAction(onOpenSettings)}
              title="AI 煉丹模型與 API 金鑰保險庫"
            >
              <span class="item-glyph glyph-primary">⚙</span>
              <span>偏好設定</span>
              <span class="key-badge">Ctrl+K</span>
            </button>
          {/if}
        </div>
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
    font-family: "JetBrains Mono", monospace;
    font-size: 9px;
    color: #938c80;
    letter-spacing: 0.18em;
    margin-top: 2px;
  }

  .menu-indicator {
    font-size: 11px;
    color: #938c80;
    transition:
      transform 0.2s ease,
      color 0.2s ease;
    margin-left: 2px;
  }

  .brand-cluster:hover .menu-indicator,
  .menu-indicator.expanded {
    color: #fabd2f;
    transform: translateY(1px);
  }

  /* 下拉快顯面板：加寬、增加留白、降低邊框壓迫感 */
  .quick-menu-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    width: 344px;
    background: rgba(22, 24, 23, 0.97);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(100, 86, 66, 0.45);
    border-radius: 10px;
    box-shadow:
      0 20px 44px rgba(0, 0, 0, 0.72),
      0 0 0 1px rgba(250, 189, 47, 0.08);
    padding: 14px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: menuFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes menuFadeIn {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 頂部首要入口大卡片 */
  .hero-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 12px;
    background: rgba(250, 189, 47, 0.06);
    border: 1px solid rgba(250, 189, 47, 0.22);
    border-radius: 7px;
    cursor: pointer;
    text-align: left;
    transition: all 0.16s ease;
  }

  .hero-item:hover {
    background: rgba(250, 189, 47, 0.13);
    border-color: rgba(250, 189, 47, 0.45);
    transform: translateY(-1px);
  }

  .hero-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .hero-glyph {
    font-family: "JetBrains Mono", monospace;
    font-size: 18px;
    color: #fabd2f;
    line-height: 1;
  }

  .hero-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .hero-name {
    font-size: 14px;
    font-weight: 600;
    color: #fabd2f;
    letter-spacing: 0.03em;
  }

  .hero-tip {
    font-size: 11.5px;
    color: #b8ac99;
  }

  /* 分組與標題 */
  .menu-section {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    color: #8c8273;
    padding: 2px 8px 4px 8px;
    letter-spacing: 0.08em;
  }

  /* 單行舒適選單項 */
  .menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: #ebdbb2;
    cursor: pointer;
    text-align: left;
    transition: all 0.14s ease;
  }

  .menu-item:hover {
    background: rgba(235, 219, 178, 0.06);
    color: #fabd2f;
  }

  .item-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .item-glyph {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: "JetBrains Mono", monospace;
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
  }

  .item-glyph.glyph-primary {
    color: #fabd2f;
  }
  .item-glyph.glyph-secondary {
    color: #8ec07c;
  }
  .item-glyph.glyph-warm {
    color: #fe8019;
  }
  .item-glyph.glyph-muted {
    color: #a89984;
  }

  .item-name {
    font-size: 13.5px;
    font-weight: 500;
    color: #e6dfd5;
    letter-spacing: 0.02em;
    transition: color 0.12s ease;
  }

  .menu-item:hover .item-name {
    color: #fabd2f;
  }

  .item-sub-hint {
    font-size: 11.5px;
    color: #7c7365;
    margin-left: -2px;
  }

  /* 去邊框化的輕盈快捷鍵標籤 */
  .key-badge {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: #7c7365;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.03);
    letter-spacing: 0.02em;
    flex-shrink: 0;
    transition: all 0.14s ease;
  }

  .menu-item:hover .key-badge,
  .hero-item:hover .key-badge,
  .footer-btn:hover .key-badge {
    color: #d5c4a1;
    background: rgba(250, 189, 47, 0.12);
  }

  /* 雙欄切換卡片網格 */
  .toggle-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 2px 4px 4px 4px;
  }

  .toggle-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 9px 11px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(100, 86, 66, 0.28);
    border-radius: 7px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .toggle-card:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(250, 189, 47, 0.35);
  }

  .toggle-card.is-on {
    background: rgba(142, 192, 124, 0.08);
    border-color: rgba(142, 192, 124, 0.32);
  }

  .toggle-card.is-warm {
    background: rgba(250, 189, 47, 0.08);
    border-color: rgba(250, 189, 47, 0.32);
  }

  .toggle-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .toggle-name {
    font-size: 13px;
    font-weight: 500;
    color: #e6dfd5;
    margin-top: 2px;
  }

  .toggle-state {
    font-size: 11px;
    color: #8c8273;
  }

  .toggle-card.is-on .toggle-state {
    color: #8ec07c;
  }

  .toggle-card.is-warm .toggle-state {
    color: #fabd2f;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #504945;
  }

  .status-dot.on {
    background: #8ec07c;
    box-shadow: 0 0 6px rgba(142, 192, 124, 0.6);
  }

  .status-dot.warm {
    background: #fabd2f;
    box-shadow: 0 0 6px rgba(250, 189, 47, 0.6);
  }

  .toggle-badge {
    font-family: "JetBrains Mono", monospace;
    font-size: 9.5px;
    color: #d49b35;
    background: rgba(212, 155, 53, 0.14);
    padding: 1px 5px;
    border-radius: 3px;
  }

  /* 狀態膠囊 */
  .status-pill {
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    letter-spacing: 0.04em;
  }

  .status-pill.ok {
    background: rgba(142, 192, 124, 0.14);
    color: #8ec07c;
  }

  .status-pill.idle {
    background: rgba(147, 140, 128, 0.1);
    color: #7c7365;
  }

  /* 底部雙欄系統按鈕 */
  .footer-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px dashed rgba(100, 86, 66, 0.25);
  }

  .footer-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 9px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(100, 86, 66, 0.22);
    border-radius: 6px;
    color: #b8ac99;
    font-size: 12.5px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .footer-btn:hover {
    background: rgba(250, 189, 47, 0.08);
    color: #fabd2f;
    border-color: rgba(250, 189, 47, 0.3);
  }

  .menu-divider {
    height: 1px;
    background: rgba(100, 86, 66, 0.25);
    margin: 2px 6px;
  }
</style>
