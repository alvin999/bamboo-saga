<script lang="ts">
  import type { TabItem } from '../types/tab';
  import { exportTabAsMarkdown, exportTabAsText, copyTabMarkdown } from '../lib/storage/exportHelper';
  import { Download, FileDown, FileText, Copy, Check } from 'lucide-svelte';

  let {
    activeTab = null,
    onShowToast,
    isOpen = $bindable(false),
  } = $props<{
    activeTab: TabItem | null;
    onShowToast?: (msg: string) => void;
    isOpen?: boolean;
  }>();

  let hasCopied = $state(false);
  let copyTimer: number | null = null;

  function toggleOpen() {
    isOpen = !isOpen;
  }

  function handleExportMd() {
    if (!activeTab) {
      onShowToast?.('⚠️ 當前無開啟的藥帖可供匯出');
      return;
    }
    exportTabAsMarkdown(activeTab);
    onShowToast?.(`📥 已下載藥帖《${activeTab.title}》(.md)`);
    isOpen = false;
  }

  function handleExportTxt() {
    if (!activeTab) {
      onShowToast?.('⚠️ 當前無開啟的藥帖可供匯出');
      return;
    }
    exportTabAsText(activeTab);
    onShowToast?.(`📄 已下載藥帖《${activeTab.title}》(.txt)`);
    isOpen = false;
  }

  async function handleCopy() {
    if (!activeTab) {
      onShowToast?.('⚠️ 當前無開啟的藥帖可供複製');
      return;
    }
    const success = await copyTabMarkdown(activeTab);
    if (success) {
      hasCopied = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => {
        hasCopied = false;
      }, 2000);
      onShowToast?.(`📋 已複製《${activeTab.title}》Markdown 內容至剪貼簿！`);
      setTimeout(() => {
        isOpen = false;
      }, 350);
    } else {
      onShowToast?.('⚠️ 複製至剪貼簿失敗');
    }
  }

  // 點擊外部自動收合
  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('export-popover-backdrop')) {
      isOpen = false;
    }
  }
</script>

<div class="export-popover-container">
  <button 
    type="button"
    class="tune-btn export-trigger-btn {isOpen ? 'active' : ''}"
    onclick={toggleOpen}
    title="單一藥帖快速匯出與複製 (Ctrl+Shift+E)"
  >
    <Download size={16} />
  </button>

  {#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="export-popover-backdrop" onclick={handleBackdropClick}>
      <div class="export-dropdown-card">
        <div class="dropdown-header">
          <span class="header-icon"><FileDown size={14} /></span>
          <span class="header-title">藥帖匯出 // EXPORT</span>
          <span class="tab-badge" title={activeTab?.title}>{activeTab?.title || '未命名'}</span>
        </div>

        <div class="dropdown-body">
          <button type="button" class="action-item" onclick={handleExportMd}>
            <div class="item-left">
              <span class="item-icon-box md"><Download size={14} /></span>
              <div class="item-text">
                <span class="item-primary">匯出為 Markdown</span>
                <span class="item-sub">下載標準 .md 檔案，保留完整結構</span>
              </div>
            </div>
            <span class="fmt-pill">.md</span>
          </button>

          <button type="button" class="action-item" onclick={handleExportTxt}>
            <div class="item-left">
              <span class="item-icon-box txt"><FileText size={14} /></span>
              <div class="item-text">
                <span class="item-primary">匯出為純文字</span>
                <span class="item-sub">下載通用 UTF-8 .txt 文字檔</span>
              </div>
            </div>
            <span class="fmt-pill">.txt</span>
          </button>

          <div class="divider"></div>

          <button type="button" class="action-item copy-item" onclick={handleCopy}>
            <div class="item-left">
              <span class="item-icon-box copy">
                {#if hasCopied}
                  <Check size={14} class="text-[#b8bb26]" />
                {:else}
                  <Copy size={14} />
                {/if}
              </span>
              <div class="item-text">
                <span class="item-primary">{hasCopied ? '已複製內容！' : '複製乾淨 Markdown'}</span>
                <span class="item-sub">將整篇內容快速複製至系統剪貼簿</span>
              </div>
            </div>
            <span class="key-badge">COPY</span>
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .export-popover-container {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .tune-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: 1px solid rgba(213, 196, 161, 0.1);
    color: #a89984;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .tune-btn:hover,
  .tune-btn.active {
    background: rgba(213, 196, 161, 0.08);
    color: #ebdbb2;
    border-color: rgba(215, 153, 33, 0.4);
  }

  .export-popover-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 999;
  }

  .export-dropdown-card {
    position: absolute;
    top: 48px;
    right: 0;
    width: 290px;
    background: #141615;
    border: 1px solid #2d2b27;
    border-radius: 6px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(16px);
    overflow: hidden;
    user-select: none;
    animation: fadeInSlide 0.15s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 1000;
  }

  @keyframes fadeInSlide {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #1a1c1b;
    border-bottom: 1px solid #2d2b27;
  }

  .header-icon {
    color: #d79921;
    display: flex;
    align-items: center;
  }

  .header-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #ebdbb2;
  }

  .tab-badge {
    margin-left: auto;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #928374;
    background: rgba(255, 255, 255, 0.04);
    padding: 2px 6px;
    border-radius: 3px;
    max-width: 100px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dropdown-body {
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .action-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .action-item:hover {
    background: rgba(215, 153, 33, 0.1);
    border-color: rgba(215, 153, 33, 0.25);
  }

  .item-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .item-icon-box {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.03);
    color: #a89984;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .action-item:hover .item-icon-box.md {
    color: #83a598;
    background: rgba(131, 165, 152, 0.15);
  }

  .action-item:hover .item-icon-box.txt {
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.15);
  }

  .action-item:hover .item-icon-box.copy {
    color: #b8bb26;
    background: rgba(184, 187, 38, 0.15);
  }

  .item-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .item-primary {
    font-size: 12px;
    font-weight: 500;
    color: #ebdbb2;
  }

  .item-sub {
    font-size: 10px;
    color: #7c6f64;
  }

  .fmt-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 3px;
    background: #1c1e1d;
    color: #83a598;
    border: 1px solid #2d2b27;
  }

  .divider {
    height: 1px;
    background: #232524;
    margin: 4px 6px;
  }

  .key-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 3px;
    background: #1c1e1d;
    color: #b8bb26;
    border: 1px solid #2d2b27;
  }
</style>
