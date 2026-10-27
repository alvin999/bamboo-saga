<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Sparkles,
    Check,
    Copy,
    X,
    CheckSquare,
    Square,
    Layers,
    Columns,
    Maximize2
  } from 'lucide-svelte';
  import {
    generateActionProposals,
    applySelectedProposals,
    type TextActionProposal
  } from '../lib/editor/textProcessor';
  import { computeSideBySideDiff } from '../lib/editor/diffEngine';
  import type { SideBySideDiffResult } from '../types/history';

  interface TextToolsModalProps {
    isOpen: boolean;
    content: string;
    selectedText?: string;
    onApply: (newContent: string, reasonDescription: string) => void;
    onClose: () => void;
    onShowToast?: (msg: string) => void;
  }

  let {
    isOpen = false,
    content = '',
    selectedText = '',
    onApply,
    onClose,
    onShowToast = () => {}
  }: TextToolsModalProps = $props();

  // 作用範圍切換：整份手稿 或 僅選取範圍
  let targetScope = $state<'selection' | 'full'>('full');

  // 右側對照檢視排版：雙欄對照 (split) 或 單欄成果 (single)
  let compareLayout = $state<'split' | 'single'>('split');

  // 當前原始輸入字串
  let originalRawText = $derived(
    targetScope === 'selection' && selectedText ? selectedText : content
  );

  // 提案清單
  let proposals = $state<TextActionProposal[]>([]);
  // 子選項設定
  let duplicateCaseSensitive = $state(true);
  let sortOrder = $state<'asc' | 'desc'>('asc');

  // 調理成果預覽與變更歷程
  let previewText = $state('');
  let changeSummary = $state<string[]>([]);
  let copySuccess = $state(false);

  // 左右成對比對結果 (復用 diffEngine，天然實現左右像素級同步連動滾動)
  let sideBySideResult = $state<SideBySideDiffResult>({
    rows: [],
    additions: 0,
    deletions: 0,
    hasChanges: false,
  });

  // 選取的提案數量
  let selectedCount = $derived(proposals.filter((p) => p.selected).length);

  // 執行診斷並產生提案清單
  function refreshProposalsAndPreview() {
    const raw = originalRawText;
    proposals = generateActionProposals(raw);
    recalculatePreview();
  }

  // 依據當前勾選的提案計算即時成果與左右對照
  function recalculatePreview() {
    const raw = originalRawText;
    const res = applySelectedProposals(raw, proposals, {
      caseSensitive: duplicateCaseSensitive,
      sortOrder,
    });
    previewText = res.result;
    changeSummary = res.changeLog;
    sideBySideResult = computeSideBySideDiff(raw, previewText);
  }

  // 元件掛載時執行一次性初始化，確保零卡頓
  onMount(() => {
    if (selectedText && selectedText.trim().length > 0) {
      targetScope = 'selection';
    } else {
      targetScope = 'full';
    }
    refreshProposalsAndPreview();
  });

  // 切換單一提案勾選狀態
  function toggleProposal(index: number) {
    proposals[index].selected = !proposals[index].selected;
    recalculatePreview();
  }

  // 全部勾選 / 全部取消
  function setSelectAll(value: boolean) {
    proposals.forEach((p) => (p.selected = value));
    recalculatePreview();
  }

  // 重設回 AI 初始推薦
  function resetToAiRecommendations() {
    proposals.forEach((p) => (p.selected = p.recommended));
    recalculatePreview();
    onShowToast('✨ 已恢復為預設推薦勾選');
  }

  // 切換作用範圍 (全文 / 選取)
  function handleScopeChange(scope: 'full' | 'selection') {
    targetScope = scope;
    refreshProposalsAndPreview();
  }

  // 套用所選項至手稿
  function handleApply() {
    if (selectedCount === 0) {
      onShowToast('⚠️ 請至少勾選一項要應用的調理建議');
      return;
    }

    const logDesc = changeSummary.length > 0 ? changeSummary.join('、') : '完成格式調理';
    if (targetScope === 'selection' && selectedText) {
      const fullText = content;
      const idx = fullText.indexOf(selectedText);
      if (idx !== -1) {
        const newFull = fullText.slice(0, idx) + previewText + fullText.slice(idx + selectedText.length);
        onApply(newFull, logDesc);
      } else {
        onApply(previewText, logDesc);
      }
    } else {
      onApply(previewText, logDesc);
    }
    onClose();
  }

  // 複製預覽結果
  async function handleCopy() {
    if (!previewText) return;
    try {
      await navigator.clipboard.writeText(previewText);
      copySuccess = true;
      onShowToast('📋 已複製成果內容至剪貼簿');
      setTimeout(() => (copySuccess = false), 2000);
    } catch {
      onShowToast('⚠️ 複製失敗');
    }
  }
</script>

{#if isOpen}
  <div
    class="modal-backdrop"
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="presentation"
    tabindex="-1"
  >
    <div
      class="modal-card"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="0"
    >
      <!-- 頂部標題列 -->
      <div class="modal-header">
        <div class="header-title-box">
          <div class="icon-badge">
            <Sparkles size={20} class="badge-icon-sparkle" />
          </div>
          <div>
            <h2 class="title-text">智慧文字調理工坊</h2>
            <p class="subtitle-text">自動診斷手稿瑕疵，自由勾選應用項目，雙欄即時對照檢閱</p>
          </div>
        </div>

        <button class="close-btn" onclick={onClose} aria-label="關閉">
          <X size={18} />
        </button>
      </div>

      <!-- 範圍與診斷提示列 -->
      <div class="status-ribbon">
        <div class="scope-picker">
          <span class="ribbon-label">作用範圍：</span>
          <button
            class="scope-chip {targetScope === 'full' ? 'active' : ''}"
            onclick={() => handleScopeChange('full')}
          >
            全文 ({content.split('\n').length} 行)
          </button>
          <button
            class="scope-chip {targetScope === 'selection' ? 'active' : ''}"
            disabled={!selectedText || selectedText.trim().length === 0}
            onclick={() => handleScopeChange('selection')}
          >
            選取區塊 {selectedText ? `(${selectedText.split('\n').length} 行)` : '(無選取)'}
          </button>
        </div>

        <div class="diagnosis-summary-capsule">
          <Sparkles size={14} class="ai-sparkle-dot" />
          <span class="ai-label">診斷摘要：</span>
          <span class="ai-detail">共探勘出 {proposals.length} 項優化建議，已勾選 {selectedCount} 項</span>
        </div>
      </div>

      <!-- 雙欄主體：左側提案勾選清單，右側煉丹爐雙欄對照 -->
      <div class="modal-body-split">
        <!-- 左側：提案審查與勾選清單 -->
        <div class="proposal-pane">
          <div class="pane-header">
            <div class="pane-title">
              <Layers size={15} />
              <span>請勾選要應用的項目</span>
              <span class="selected-pill">{selectedCount} / {proposals.length} 項</span>
            </div>
            <div class="pane-actions">
              <button class="text-link" onclick={() => setSelectAll(true)}>全選</button>
              <span class="divider">/</span>
              <button class="text-link" onclick={() => setSelectAll(false)}>全不選</button>
              <span class="divider">•</span>
              <button class="text-link" onclick={resetToAiRecommendations}>
                <Sparkles size={12} />
                <span>推薦</span>
              </button>
            </div>
          </div>

          <div class="proposal-list">
            {#each proposals as item, index}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                class="proposal-card {item.selected ? 'checked' : ''}"
                onclick={() => toggleProposal(index)}
                role="checkbox"
                aria-checked={item.selected}
                tabindex="0"
              >
                <div class="card-left">
                  <div class="checkbox-visual">
                    {#if item.selected}
                      <CheckSquare size={18} class="chk-icon-active" />
                    {:else}
                      <Square size={18} class="chk-icon-idle" />
                    {/if}
                  </div>

                  <div class="proposal-info">
                    <div class="proposal-title-row">
                      <span class="proposal-name">{item.title}</span>
                      <div class="badge-cluster">
                        {#if item.recommended}
                          <span class="badge ai-rec">建議</span>
                        {/if}
                        <span class="badge {item.badgeType}">{item.badge}</span>
                      </div>
                    </div>
                    <span class="proposal-desc">{item.description}</span>
                  </div>
                </div>

                <!-- 專屬微調子開關 -->
                {#if item.selected && item.id === 'dedup'}
                  <div
                    class="sub-option"
                    onclick={(e) => e.stopPropagation()}
                    onkeydown={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    <label class="sub-checkbox">
                      <input
                        type="checkbox"
                        bind:checked={duplicateCaseSensitive}
                        onchange={recalculatePreview}
                      />
                      <span>區分大小寫</span>
                    </label>
                  </div>
                {/if}

                {#if item.selected && item.id === 'sort'}
                  <div
                    class="sub-option"
                    onclick={(e) => e.stopPropagation()}
                    onkeydown={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    <span class="sub-label">排序方向：</span>
                    <select
                      class="sub-select"
                      bind:value={sortOrder}
                      onchange={recalculatePreview}
                    >
                      <option value="asc">升冪 (A → Z, 1 → 9)</option>
                      <option value="desc">降冪 (Z → A, 9 → 1)</option>
                    </select>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <!-- 右側：沿用煉丹爐經典雙欄對比檢視 (Split View) -->
        <div class="preview-pane">
          <div class="preview-top-toolbar">
            <span class="toolbar-hint">即時對照檢視</span>
            <div class="layout-toggle-group">
              <button
                class="layout-btn {compareLayout === 'split' ? 'active' : ''}"
                onclick={() => (compareLayout = 'split')}
                title="雙欄對照"
              >
                <Columns size={13} />
                <span>雙欄對照</span>
              </button>
              <button
                class="layout-btn {compareLayout === 'single' ? 'active' : ''}"
                onclick={() => (compareLayout = 'single')}
                title="僅顯示成果"
              >
                <Maximize2 size={13} />
                <span>成果</span>
              </button>
            </div>
          </div>

          <div class="diff-split-view {compareLayout === 'single' ? 'is-single' : ''}">
            {#if compareLayout === 'split'}
              <!-- 雙欄成對連動對照檢視：共享同一垂直滾動容器，天然實現 100% 左右像素級同步連動 -->
              <div class="split-side-by-side-container">
                <div class="split-column-headers">
                  <div class="column-header left">
                    <span class="hud-pill">ORIGINAL</span>
                    <span class="pane-title-text">原始手稿</span>
                    <span class="line-stat">{originalRawText.split('\n').length} 行</span>
                  </div>
                  <div class="column-header right">
                    <span class="hud-pill accent">REFINED</span>
                    <span class="pane-title-text">調理成果</span>
                    <div class="header-diff-stat">
                      {#if sideBySideResult.hasChanges}
                        <span class="stat-badge add">+{sideBySideResult.additions}</span>
                        <span class="stat-badge del">-{sideBySideResult.deletions}</span>
                      {/if}
                      <span class="line-stat">{previewText.split('\n').length} 行</span>
                    </div>
                  </div>
                </div>

                <div class="diff-viewer">
                  <div class="split-diff-content">
                    {#each sideBySideResult.rows as row, idx (idx)}
                      <div class="split-diff-row">
                        <!-- 左欄：原始手稿 (舊) -->
                        <div class="split-cell left {row.left.type}">
                          <div class="col-num">{row.left.lineNumber !== undefined ? row.left.lineNumber : ''}</div>
                          <div class="col-indicator">{row.left.type === 'removed' ? '-' : ' '}</div>
                          {#if row.left.type === 'removed' && (!row.left.text || row.left.text.trim() === '')}
                            <div class="col-text empty-line-box">
                              <span class="empty-line-badge">↵ [無效空白行]</span>
                            </div>
                          {:else}
                            <pre class="col-text">{row.left.text || ' '}</pre>
                          {/if}
                        </div>
                        <!-- 右欄：調理成果 (新) -->
                        <div class="split-cell right {row.right.type}">
                          <div class="col-num">{row.right.lineNumber !== undefined ? row.right.lineNumber : ''}</div>
                          <div class="col-indicator">{row.right.type === 'added' ? '+' : ' '}</div>
                          {#if row.right.type === 'empty'}
                            <div class="col-text empty-placeholder-box">
                              {#if row.left.type === 'removed' && (!row.left.text || row.left.text.trim() === '')}
                                <span class="empty-row-hint">⊘ 此處空行已清除並緊湊接齊</span>
                              {:else if row.left.type === 'removed'}
                                <span class="empty-row-hint">⊘ 此行已移除</span>
                              {:else}
                                <span class="empty-row-hint">///</span>
                              {/if}
                            </div>
                          {:else if row.right.type === 'added' && (!row.right.text || row.right.text.trim() === '')}
                            <div class="col-text empty-line-box">
                              <span class="empty-line-badge add">↵ [新增空白行]</span>
                            </div>
                          {:else}
                            <pre class="col-text">{row.right.text || ' '}</pre>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            {:else}
              <!-- 單欄成果預覽 -->
              <div class="diff-pane ai-pane">
                <div class="pane-header ai-header">
                  <span class="hud-pill accent">REFINED</span>
                  <span class="pane-title-text">調理成果</span>
                  <span class="line-stat">{previewText.split('\n').length} 行</span>
                </div>
                <div class="pane-content">
                  <pre class="readonly-text refined">{previewText}</pre>
                </div>
              </div>
            {/if}
          </div>

          <!-- 調理歷程橫條 -->
          <div class="change-log-footer">
            <span class="log-label">套用後將執行的改變：</span>
            {#if changeSummary.length > 0}
              <div class="log-tags">
                {#each changeSummary as log}
                  <span class="log-pill">{log}</span>
                {/each}
              </div>
            {:else}
              <span class="log-none">未勾選任何建議項目 (手稿將維持原樣)</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- 底部操作列 -->
      <div class="modal-footer">
        <div class="footer-left-hint">
          <span>提示：套用將自動於本機時光機 (IndexedDB) 建立備份，隨時可還原。</span>
        </div>
        <div class="footer-actions">
          <button class="footer-btn secondary" onclick={onClose}>
            <span>取消</span>
          </button>
          <button class="footer-btn copy-btn" onclick={handleCopy}>
            {#if copySuccess}
              <Check size={16} class="check-icon" />
              <span>已複製！</span>
            {:else}
              <Copy size={16} />
              <span>複製成果</span>
            {/if}
          </button>
          <button
            class="footer-btn apply-btn {selectedCount === 0 ? 'disabled' : ''}"
            disabled={selectedCount === 0}
            onclick={handleApply}
          >
            <Check size={16} />
            <span>
              {selectedCount > 0 ? `套用所選的 ${selectedCount} 項建議` : '請至少勾選一項'}
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(14, 15, 16, 0.82);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    animation: fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* 鬆弛自然彈窗卡片：以微光半透明羽化線代替硬實線，增加懸浮呼吸空間 */
  .modal-card {
    position: relative;
    width: 94%;
    max-width: 1140px;
    height: 84vh;
    display: flex;
    flex-direction: column;
    background: #18191a;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    box-shadow: 
      0 24px 64px rgba(0, 0, 0, 0.6),
      0 4px 16px rgba(0, 0, 0, 0.35);
    overflow: hidden;
    animation: scaleUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    color: #d4cebe;
    font-family: inherit;
    outline: none;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    background: #1c1d1f;
  }

  .header-title-box {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .icon-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    background: rgba(207, 152, 74, 0.1);
    border: 1px solid rgba(207, 152, 74, 0.25);
    border-radius: 10px;
  }

  :global(.badge-icon-sparkle) {
    color: #cf984a;
  }

  .title-text {
    margin: 0;
    font-size: 1.08rem;
    font-weight: 600;
    color: #ede7dc;
    letter-spacing: 0.5px;
  }

  .subtitle-text {
    margin: 3px 0 0 0;
    font-size: 0.78rem;
    color: #8f897c;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #8f897c;
    cursor: pointer;
    padding: 8px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #ede7dc;
  }

  /* 狀態彩帶：柔和低調 */
  .status-ribbon {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 24px;
    background: #1b1c1e;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    gap: 14px;
    font-size: 0.78rem;
  }

  .scope-picker {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .ribbon-label {
    color: #7a756b;
  }

  .scope-chip {
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: #a69f90;
    font-size: 0.75rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .scope-chip:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #d4cebe;
  }

  .scope-chip.active {
    background: rgba(207, 152, 74, 0.18);
    border-color: rgba(207, 152, 74, 0.4);
    color: #cf984a;
    font-weight: 600;
  }

  .scope-chip:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .diagnosis-summary-capsule {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(207, 152, 74, 0.08);
    padding: 4px 12px;
    border-radius: 16px;
    border: 1px solid rgba(207, 152, 74, 0.2);
  }

  :global(.ai-sparkle-dot) {
    color: #cf984a;
    flex-shrink: 0;
  }

  .ai-label {
    color: #cf984a;
    font-weight: 600;
  }

  .ai-detail {
    color: #bfb8a8;
  }

  /* 雙欄主體 */
  .modal-body-split {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* 左側提案清單欄：放寬至 37%，給予文字與選單充分空間 */
  .proposal-pane {
    width: 37%;
    border-right: 1px solid rgba(255, 255, 255, 0.04);
    display: flex;
    flex-direction: column;
    background: #191a1b;
  }

  .pane-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 18px;
    background: #1c1d1f;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .pane-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.82rem;
    font-weight: 600;
    color: #bfb8a8;
  }

  .selected-pill {
    padding: 2px 7px;
    background: rgba(207, 152, 74, 0.12);
    border: 1px solid rgba(207, 152, 74, 0.25);
    border-radius: 10px;
    color: #cf984a;
    font-size: 0.7rem;
    font-weight: normal;
  }

  .pane-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
  }

  .text-link {
    background: transparent;
    border: none;
    color: #71908d;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 3px;
    transition: color 0.15s;
  }

  .text-link:hover {
    color: #8a9a6e;
    text-decoration: underline;
  }

  .divider {
    color: #52565b;
  }

  .proposal-list {
    padding: 14px 16px;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* 提案卡片：舒展內距、柔邊、懸浮輕盈質感 */
  .proposal-card {
    display: flex;
    flex-direction: column;
    padding: 12px 15px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 9px;
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
    outline: none;
  }

  .proposal-card:hover {
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.045);
    transform: translateY(-1px);
  }

  .proposal-card.checked {
    border-color: rgba(207, 152, 74, 0.38);
    background: rgba(207, 152, 74, 0.07);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  }

  .card-left {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .checkbox-visual {
    margin-top: 2px;
    flex-shrink: 0;
  }

  :global(.chk-icon-active) {
    color: #cf984a;
  }

  :global(.chk-icon-idle) {
    color: #52565b;
  }

  .proposal-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .proposal-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .proposal-name {
    font-size: 0.86rem;
    font-weight: 500;
    color: #d4cebe;
  }

  .proposal-card.checked .proposal-name {
    color: #ede7dc;
    font-weight: 600;
  }

  .badge-cluster {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  /* 標籤降噪：純粹無邊框微透質感，不搶奪焦點 */
  .badge {
    padding: 1px 7px;
    border-radius: 5px;
    font-size: 0.68rem;
    font-weight: 500;
    white-space: nowrap;
    border: none;
  }

  .badge.ai-rec {
    background: rgba(207, 152, 74, 0.15);
    color: #cf984a;
  }

  .badge.warning {
    background: rgba(199, 120, 64, 0.15);
    color: #c77840;
  }

  .badge.info {
    background: rgba(113, 144, 141, 0.15);
    color: #71908d;
  }

  .badge.success {
    background: rgba(138, 154, 110, 0.15);
    color: #8a9a6e;
  }

  .badge.tip {
    background: rgba(176, 124, 145, 0.15);
    color: #b07c91;
  }

  .proposal-desc {
    font-size: 0.75rem;
    color: #8f897c;
    line-height: 1.45;
  }

  .sub-option {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .sub-label {
    font-size: 0.72rem;
    color: #7a756b;
  }

  .sub-checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
    color: #8f897c;
    cursor: pointer;
  }

  .sub-select {
    padding: 3px 8px;
    background: #1f2022;
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #d4cebe;
    font-size: 0.72rem;
    border-radius: 5px;
    outline: none;
  }

  /* 右側：煉丹爐雙欄對比檢視 (Split View) */
  .preview-pane {
    width: 63%;
    display: flex;
    flex-direction: column;
    background: #18191a;
  }

  .preview-top-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: #1b1c1e;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .toolbar-hint {
    font-size: 0.75rem;
    color: #7a756b;
    font-family: 'JetBrains Mono', monospace;
  }

  .layout-toggle-group {
    display: flex;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
  }

  .layout-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    color: #8f897c;
    font-size: 0.72rem;
    padding: 3px 9px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .layout-btn:hover {
    color: #d4cebe;
  }

  .layout-btn.active {
    background: rgba(255, 255, 255, 0.08);
    color: #cf984a;
    font-weight: 500;
  }

  /* 雙欄結構：精準對齊極簡禪風 */
  .diff-split-view {
    display: flex;
    flex: 1;
    width: 100%;
    overflow: hidden;
    gap: 1px;
    background: rgba(255, 255, 255, 0.03);
  }

  .diff-split-view.is-single .diff-pane {
    flex: 1;
  }

  .diff-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .origin-pane {
    background: #151617;
    border-right: 1px solid rgba(255, 255, 255, 0.03);
  }

  .ai-pane {
    background: #18191a;
  }

  .pane-header {
    height: 34px;
    background: #1b1c1e;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    font-size: 11px;
    color: #8f897c;
    font-family: 'JetBrains Mono', monospace;
  }

  .ai-header {
    color: #cf984a;
  }

  .pane-title-text {
    font-weight: 500;
    color: #d4cebe;
  }

  .ai-header .pane-title-text {
    color: #cf984a;
  }

  .line-stat {
    margin-left: auto;
    font-size: 10px;
    color: #7a756b;
  }

  .hud-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.05);
    color: #8f897c;
    font-weight: 600;
  }

  .hud-pill.accent {
    background: rgba(207, 152, 74, 0.15);
    color: #cf984a;
    border: 1px solid rgba(207, 152, 74, 0.3);
  }

  /* 左右雙欄成對同步連動容器 */
  .split-side-by-side-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: #18191a;
  }

  .split-column-headers {
    display: flex;
    height: 34px;
    background: #1b1c1e;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    user-select: none;
    flex-shrink: 0;
  }

  .column-header {
    flex: 1 1 50%;
    width: 50%;
    max-width: 50%;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    font-size: 11px;
    box-sizing: border-box;
    font-family: 'JetBrains Mono', monospace;
    color: #8f897c;
  }

  .column-header.left {
    border-right: 1px solid rgba(255, 255, 255, 0.04);
  }

  .header-diff-stat {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stat-badge {
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
  }

  .stat-badge.add {
    background: rgba(138, 154, 110, 0.18);
    color: #8a9a6e;
  }

  .stat-badge.del {
    background: rgba(191, 88, 77, 0.18);
    color: #bf584d;
  }

  /* 雙欄對齊比對內容 (天然支援 100% 左右滾動同步) */
  .diff-viewer {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    font-family: 'Consolas', 'Fira Code', 'JetBrains Mono', monospace;
    font-size: 12.5px;
    line-height: 22px;
    background: #18191a;
  }

  .split-diff-content {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 100%;
  }

  .split-diff-row {
    display: flex;
    min-height: 22px;
    width: 100%;
    transition: background 0.05s;
    align-items: stretch;
  }

  .split-diff-row:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .split-cell {
    flex: 1 1 50%;
    width: 50%;
    max-width: 50%;
    min-width: 0;
    display: flex;
    position: relative;
    box-sizing: border-box;
    padding: 2px 0;
  }

  .split-cell.left {
    border-right: 1px solid rgba(255, 255, 255, 0.04);
  }

  .split-cell.added {
    background: rgba(138, 154, 110, 0.12);
  }

  .split-cell.removed {
    background: rgba(191, 88, 77, 0.12);
  }

  .split-cell.empty {
    background: repeating-linear-gradient(
      -45deg,
      rgba(24, 25, 26, 0.95),
      rgba(24, 25, 26, 0.95) 8px,
      rgba(31, 32, 34, 0.95) 8px,
      rgba(31, 32, 34, 0.95) 16px
    );
    user-select: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.02);
  }

  .empty-line-box,
  .empty-placeholder-box {
    display: flex;
    align-items: center;
  }

  .empty-line-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-family: 'JetBrains Mono', monospace;
    color: #bf584d;
    background: rgba(191, 88, 77, 0.12);
    border: 1px dashed rgba(191, 88, 77, 0.35);
    border-radius: 4px;
    padding: 0 6px;
    user-select: none;
    line-height: 18px;
  }

  .empty-line-badge.add {
    color: #8a9a6e;
    background: rgba(138, 154, 110, 0.12);
    border-color: rgba(138, 154, 110, 0.35);
  }

  .empty-row-hint {
    font-size: 11px;
    font-family: inherit;
    font-style: italic;
    color: #7a756b;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    user-select: none;
    line-height: 18px;
  }

  .col-num {
    width: 38px;
    min-width: 38px;
    padding: 0 8px 0 0;
    text-align: right;
    color: #52565b;
    user-select: none;
    font-size: 11px;
    flex-shrink: 0;
  }

  .col-indicator {
    width: 16px;
    min-width: 16px;
    text-align: center;
    user-select: none;
    font-weight: bold;
    font-size: 12px;
    flex-shrink: 0;
  }

  .col-text {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 0 10px 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    color: #d4cebe;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
  }

  .split-cell.added .col-indicator,
  .split-cell.added .col-text {
    color: #8a9a6e;
  }

  .split-cell.removed .col-indicator,
  .split-cell.removed .col-text {
    color: #bf584d;
    opacity: 0.9;
  }

  .pane-content {
    flex: 1;
    overflow: auto;
    position: relative;
    padding: 16px 20px;
  }

  .readonly-text {
    margin: 0;
    padding: 0;
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 0.82rem;
    line-height: 1.7;
    color: #8f897c;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .readonly-text.refined {
    color: #d4cebe;
  }

  .change-log-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    background: #1b1c1e;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    font-size: 0.75rem;
    overflow-x: auto;
  }

  .log-label {
    color: #7a756b;
    flex-shrink: 0;
  }

  .log-tags {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .log-pill {
    padding: 2px 8px;
    background: rgba(138, 154, 110, 0.12);
    border: 1px solid rgba(138, 154, 110, 0.25);
    border-radius: 4px;
    color: #8a9a6e;
    font-size: 0.7rem;
  }

  .log-none {
    color: #686c72;
    font-style: italic;
  }

  /* 底部操作列：舒展寬敞 */
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 24px;
    background: #1c1d1f;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .footer-left-hint {
    font-size: 0.74rem;
    color: #7a756b;
  }

  .footer-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .footer-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 18px;
    border-radius: 8px;
    font-size: 0.84rem;
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    border: 1px solid transparent;
  }

  .footer-btn.secondary {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
    color: #d4cebe;
  }

  .footer-btn.secondary:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ede7dc;
  }

  .footer-btn.copy-btn {
    background: rgba(113, 144, 141, 0.12);
    border-color: rgba(113, 144, 141, 0.25);
    color: #71908d;
  }

  .footer-btn.copy-btn:hover {
    background: rgba(113, 144, 141, 0.22);
    border-color: rgba(113, 144, 141, 0.45);
    color: #ede7dc;
  }

  .footer-btn.apply-btn {
    background: #cf984a;
    border-color: #cf984a;
    color: #18191a;
    font-weight: 600;
    box-shadow: 0 2px 10px rgba(207, 152, 74, 0.25);
  }

  .footer-btn.apply-btn:hover {
    background: #b87e35;
    border-color: #b87e35;
    box-shadow: 0 3px 12px rgba(207, 152, 74, 0.35);
  }

  .footer-btn.apply-btn.disabled {
    opacity: 0.4;
    cursor: not-allowed;
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.08);
    color: #7a756b;
    box-shadow: none;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes scaleUp {
    from {
      transform: scale(0.98);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
