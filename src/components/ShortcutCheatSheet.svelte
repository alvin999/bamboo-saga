<script lang="ts">
  import { DEFAULT_SHORTCUT_GROUPS } from '../lib/constants/shortcuts';
  import type { ShortcutGroup } from '../types/shortcut';

  let {
    isOpen = false,
    onClose,
    onNavigateToSettings
  } = $props<{
    isOpen: boolean;
    onClose: () => void;
    onNavigateToSettings?: () => void;
  }>();

  const groups: ShortcutGroup[] = DEFAULT_SHORTCUT_GROUPS;

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleNavigate() {
    onClose();
    if (onNavigateToSettings) {
      onNavigateToSettings();
    }
  }
</script>

{#if isOpen}
  <!-- 遮罩背景 (點擊外部自動收合) -->
  <div 
    class="cheatsheet-backdrop" 
    onclick={handleBackdropClick}
    role="presentation"
  >
    <div class="cheatsheet-popover" role="dialog" aria-labelledby="cheatsheet-title">
      <!-- 標題欄 -->
      <header class="popover-header">
        <div class="header-title-group">
          <span class="material-symbols-outlined header-icon">keyboard</span>
          <span id="cheatsheet-title" class="header-title">竹語快捷鍵指南 // CHEAT-SHEET</span>
        </div>
        <button class="close-btn" onclick={onClose} title="關閉說明 (ESC)">
          <span class="material-symbols-outlined text-[16px]">close</span>
        </button>
      </header>

      <!-- 快捷鍵分組清單 -->
      <div class="popover-body">
        {#each groups as group}
          <div class="shortcut-group">
            <div class="group-header">
              <span class="group-title">{group.title}</span>
              <span class="group-count">{group.items.length} 項</span>
            </div>

            <div class="group-items">
              {#each group.items as item}
                <div class="shortcut-row">
                  <div class="shortcut-info">
                    <span class="item-label">{item.label}</span>
                    <span class="item-desc">{item.description}</span>
                  </div>

                  <div class="shortcut-keys">
                    {#each item.keys as key}
                      <kbd class="key-cap">{key}</kbd>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <!-- 底部映射提示與快速設定按鈕 -->
      <footer class="popover-footer">
        <div class="footer-hint">
          <span class="pulse-indicator"></span>
          <span>已與系統按鍵偏好映射，支援未來客製化鍵位</span>
        </div>

        <button class="settings-link-btn" onclick={handleNavigate} title="前往偏好設定調整按鍵與 VIM 模式">
          <span class="material-symbols-outlined text-[15px]">tune</span>
          <span>前往按鍵偏好設定</span>
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .cheatsheet-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(14, 16, 15, 0.45);
    backdrop-filter: blur(2px);
    z-index: 1000;
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
    padding-top: 52px;
    padding-right: 18px;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .cheatsheet-popover {
    width: 380px;
    max-height: calc(85vh - 60px);
    background: rgba(24, 27, 26, 0.96);
    border: 1px solid rgba(212, 155, 53, 0.35);
    border-radius: 6px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.65), 0 0 1px rgba(235, 219, 178, 0.2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    backdrop-filter: blur(16px);
    animation: slideDown 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(235, 219, 178, 0.08);
    background: rgba(19, 21, 20, 0.85);
  }

  .header-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-icon {
    font-size: 17px;
    color: #d49b35;
  }

  .header-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: #ece7dc;
    font-family: 'JetBrains Mono', monospace;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #938c80;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border-radius: 3px;
    transition: all 0.15s;
  }

  .close-btn:hover {
    color: #ece7dc;
    background: rgba(235, 219, 178, 0.08);
  }

  .popover-body {
    flex: 1;
    overflow-y: auto;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .popover-body::-webkit-scrollbar {
    width: 4px;
  }

  .popover-body::-webkit-scrollbar-thumb {
    background: rgba(212, 155, 53, 0.2);
    border-radius: 2px;
  }

  .shortcut-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 4px;
    border-bottom: 1px dashed rgba(235, 219, 178, 0.08);
  }

  .group-title {
    font-size: 11px;
    color: #d49b35;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .group-count {
    font-size: 10px;
    color: #7c776d;
    font-family: 'JetBrains Mono', monospace;
  }

  .group-items {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .shortcut-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 6px;
    border-radius: 4px;
    background: rgba(30, 33, 32, 0.4);
    transition: background 0.12s;
  }

  .shortcut-row:hover {
    background: rgba(212, 155, 53, 0.08);
  }

  .shortcut-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 60%;
  }

  .item-label {
    font-size: 12px;
    color: #ece7dc;
    font-weight: 500;
  }

  .item-desc {
    font-size: 10px;
    color: #938c80;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .shortcut-keys {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .key-cap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    color: #ece7dc;
    background: #141615;
    border: 1px solid rgba(235, 219, 178, 0.2);
    border-bottom: 2px solid rgba(212, 155, 53, 0.5);
    border-radius: 3px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
    user-select: none;
  }

  .popover-footer {
    padding: 8px 12px;
    border-top: 1px solid rgba(235, 219, 178, 0.08);
    background: rgba(17, 19, 18, 0.95);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .footer-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: #868074;
  }

  .pulse-indicator {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #7daea3;
    box-shadow: 0 0 5px rgba(125, 174, 163, 0.6);
  }

  .settings-link-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    background: rgba(212, 155, 53, 0.12);
    border: 1px solid rgba(212, 155, 53, 0.3);
    border-radius: 4px;
    color: #ece7dc;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }

  .settings-link-btn:hover {
    background: rgba(212, 155, 53, 0.22);
    border-color: #d49b35;
    color: #ffffff;
    box-shadow: 0 2px 8px rgba(212, 155, 53, 0.2);
  }
</style>
