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
    background: rgba(29, 32, 33, 0.78);
    backdrop-filter: blur(4px);
    animation: fadeIn 0.15s ease-out;
  }

  .modal-card {
    position: relative;
    width: 95%;
    max-width: 1100px;
    height: 86vh;
    display: flex;
    flex-direction: column;
    background: #1d2021;
    border: 1px solid #504945;
    border-radius: 8px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65);
    overflow: hidden;
    animation: scaleUp 0.15s ease-out;
    color: #ebdbb2;
    font-family: inherit;
    outline: none;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid #3c3836;
    background: #282828;
  }

  .header-title-box {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .icon-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: #32302f;
    border: 1px solid #504945;
    border-radius: 6px;
  }

  :global(.badge-icon-sparkle) {
    color: #fabd2f;
  }

  .title-text {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: #fbf1c7;
    letter-spacing: 0.5px;
  }

  .subtitle-text {
    margin: 2px 0 0 0;
    font-size: 0.78rem;
    color: #a89984;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #a89984;
    cursor: pointer;
    padding: 6px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .close-btn:hover {
    background: #3c3836;
    color: #fbf1c7;
  }

  /* 狀態彩帶 */
  .status-ribbon {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 20px;
    background: #242626;
    border-bottom: 1px solid #3c3836;
    gap: 12px;
    font-size: 0.78rem;
  }

  .scope-picker {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .ribbon-label {
    color: #928374;
  }

  .scope-chip {
    padding: 3px 8px;
    background: #282828;
    border: 1px solid #3c3836;
    color: #a89984;
    font-size: 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .scope-chip.active {
    background: #fe8019;
    border-color: #fe8019;
    color: #1d2021;
    font-weight: 600;
  }

  .scope-chip:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .diagnosis-summary-capsule {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #1d2021;
    padding: 3px 10px;
    border-radius: 20px;
    border: 1px solid #fabd2f44;
  }

  :global(.ai-sparkle-dot) {
    color: #fabd2f;
    flex-shrink: 0;
  }

  .ai-label {
    color: #fabd2f;
    font-weight: 600;
  }

  .ai-detail {
    color: #d5c4a1;
  }

  /* 雙欄主體 */
  .modal-body-split {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* 左側提案清單欄 */
  .proposal-pane {
    width: 32%;
    border-right: 1px solid #3c3836;
    display: flex;
    flex-direction: column;
    background: #202222;
  }

  .pane-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: #282828;
    border-bottom: 1px solid #3c3836;
  }

  .pane-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    color: #d5c4a1;
  }

  .selected-pill {
    padding: 1px 6px;
    background: #fabd2f22;
    border: 1px solid #fabd2f55;
    border-radius: 10px;
    color: #fabd2f;
    font-size: 0.7rem;
    font-weight: normal;
  }

  .pane-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
  }

  .text-link {
    background: transparent;
    border: none;
    color: #83a598;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .text-link:hover {
    text-decoration: underline;
    color: #b8bb26;
  }

  .divider {
    color: #504945;
  }

  .proposal-list {
    padding: 12px 14px;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .proposal-card {
    display: flex;
    flex-direction: column;
    padding: 10px 12px;
    background: #1d2021;
    border: 1px solid #3c3836;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    user-select: none;
    outline: none;
  }

  .proposal-card:hover {
    border-color: #504945;
    background: #242626;
  }

  .proposal-card.checked {
    border-color: #fabd2f;
    background: #242521;
  }

  .card-left {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .checkbox-visual {
    margin-top: 1px;
    flex-shrink: 0;
  }

  :global(.chk-icon-active) {
    color: #fabd2f;
  }

  :global(.chk-icon-idle) {
    color: #665c54;
  }

  .proposal-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
  }

  .proposal-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .proposal-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: #ebdbb2;
  }

  .proposal-card.checked .proposal-name {
    color: #fbf1c7;
  }

  .badge-cluster {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .badge {
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 0.68rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .badge.ai-rec {
    background: #fabd2f22;
    color: #fabd2f;
    border: 1px solid #fabd2f55;
  }

  .badge.warning {
    background: #fe801922;
    color: #fe8019;
    border: 1px solid #fe801955;
  }

  .badge.info {
    background: #83a59822;
    color: #83a598;
    border: 1px solid #83a59855;
  }

  .badge.success {
    background: #b8bb2622;
    color: #b8bb26;
    border: 1px solid #b8bb2655;
  }

  .badge.tip {
    background: #d3869b22;
    color: #d3869b;
    border: 1px solid #d3869b55;
  }

  .proposal-desc {
    font-size: 0.74rem;
    color: #928374;
  }

  .sub-option {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed #3c3836;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }

  .sub-label {
    font-size: 0.72rem;
    color: #928374;
  }

  .sub-checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
    color: #a89984;
    cursor: pointer;
  }

  .sub-select {
    padding: 2px 6px;
    background: #282828;
    border: 1px solid #3c3836;
    color: #ebdbb2;
    font-size: 0.72rem;
    border-radius: 4px;
    outline: none;
  }

  /* 右側：煉丹爐雙欄對比檢視 (Split View) */
  .preview-pane {
    width: 68%;
    display: flex;
    flex-direction: column;
    background: #181a1b;
  }

  .preview-top-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px;
    background: #242626;
    border-bottom: 1px solid #3c3836;
  }

  .toolbar-hint {
    font-size: 0.75rem;
    color: #928374;
    font-family: 'JetBrains Mono', monospace;
  }

  .layout-toggle-group {
    display: flex;
    background: #1d2021;
    border: 1px solid #3c3836;
    border-radius: 4px;
    padding: 2px;
    gap: 2px;
  }

  .layout-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    color: #a89984;
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .layout-btn:hover {
    color: #ebdbb2;
  }

  .layout-btn.active {
    background: #3c3836;
    color: #fabd2f;
    font-weight: 500;
  }

  /* 煉丹爐經典雙欄結構 (精準對齊 App.svelte 第 1820 行) */
  .diff-split-view {
    display: flex;
    flex: 1;
    width: 100%;
    overflow: hidden;
    gap: 1px;
    background: rgba(80, 69, 52, 0.35);
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
    background: #121414;
    border-right: 1px solid #282828;
  }

  .ai-pane {
    background: #141615;
  }

  .pane-header {
    height: 32px;
    background: #161817;
    border-bottom: 1px solid rgba(80, 69, 52, 0.35);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    font-size: 11px;
    color: #938c80;
    font-family: 'JetBrains Mono', monospace;
  }

  .ai-header {
    color: #d49b35;
  }

  .pane-title-text {
    font-weight: 500;
    color: #ebdbb2;
  }

  .ai-header .pane-title-text {
    color: #fabd2f;
  }

  .line-stat {
    margin-left: auto;
    font-size: 10px;
    color: #7c6f64;
  }

  .hud-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 9px;
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
    height: 32px;
    background: #141617;
    border-bottom: 1px solid #282828;
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
    padding: 0 12px;
    font-size: 11px;
    box-sizing: border-box;
    font-family: 'JetBrains Mono', monospace;
  }

  .column-header.left {
    border-right: 1px solid #282828;
  }

  .header-diff-stat {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stat-badge {
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
  }

  .stat-badge.add {
    background: rgba(184, 187, 38, 0.18);
    color: #b8bb26;
  }

  .stat-badge.del {
    background: rgba(251, 73, 52, 0.18);
    color: #fb4934;
  }

  /* 雙欄對齊比對內容 (天然支援 100% 左右滾動同步) */
  .diff-viewer {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    font-family: 'Consolas', 'Fira Code', 'JetBrains Mono', monospace;
    font-size: 12px;
    line-height: 20px;
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
    min-height: 20px;
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
    border-right: 1px solid #282828;
  }

  .split-cell.added {
    background: rgba(184, 187, 38, 0.14);
  }

  .split-cell.removed {
    background: rgba(251, 73, 52, 0.14);
  }

  .split-cell.empty {
    background: repeating-linear-gradient(
      -45deg,
      rgba(24, 25, 26, 0.95),
      rgba(24, 25, 26, 0.95) 8px,
      rgba(35, 37, 38, 0.95) 8px,
      rgba(35, 37, 38, 0.95) 16px
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
    color: #fb4934;
    background: rgba(251, 73, 52, 0.15);
    border: 1px dashed rgba(251, 73, 52, 0.45);
    border-radius: 3px;
    padding: 0 5px;
    user-select: none;
    line-height: 16px;
  }

  .empty-line-badge.add {
    color: #b8bb26;
    background: rgba(184, 187, 38, 0.15);
    border-color: rgba(184, 187, 38, 0.45);
  }

  .empty-row-hint {
    font-size: 11px;
    font-family: inherit;
    font-style: italic;
    color: #7c6f64;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    user-select: none;
    line-height: 18px;
  }

  .col-num {
    width: 36px;
    min-width: 36px;
    padding: 0 6px 0 0;
    text-align: right;
    color: #504945;
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
    padding: 0 8px 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    color: #ebdbb2;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
  }

  .split-cell.added .col-indicator,
  .split-cell.added .col-text {
    color: #b8bb26;
  }

  .split-cell.removed .col-indicator,
  .split-cell.removed .col-text {
    color: #fb4934;
    opacity: 0.9;
  }

  .pane-content {
    flex: 1;
    overflow: auto;
    position: relative;
    padding: 12px 14px;
  }

  .readonly-text {
    margin: 0;
    padding: 0;
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 0.8rem;
    line-height: 1.6;
    color: #a89984;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .readonly-text.refined {
    color: #ebdbb2;
  }

  .change-log-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: #202222;
    border-top: 1px solid #3c3836;
    font-size: 0.75rem;
    overflow-x: auto;
  }

  .log-label {
    color: #928374;
    flex-shrink: 0;
  }

  .log-tags {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .log-pill {
    padding: 2px 7px;
    background: #32302f;
    border: 1px solid #504945;
    border-radius: 3px;
    color: #b8bb26;
    font-size: 0.7rem;
  }

  .log-none {
    color: #7c6f64;
    font-style: italic;
  }

  /* 底部操作列 */
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: #242626;
    border-top: 1px solid #3c3836;
  }

  .footer-left-hint {
    font-size: 0.72rem;
    color: #7c6f64;
  }

  .footer-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .footer-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s;
    border: 1px solid transparent;
  }

  .footer-btn.secondary {
    background: #32302f;
    border-color: #504945;
    color: #ebdbb2;
  }

  .footer-btn.secondary:hover {
    background: #3c3836;
    color: #fbf1c7;
  }

  .footer-btn.copy-btn {
    background: #282828;
    border-color: #83a598;
    color: #83a598;
  }

  .footer-btn.copy-btn:hover {
    background: #83a598;
    color: #1d2021;
  }

  .footer-btn.apply-btn {
    background: #b8bb26;
    border-color: #b8bb26;
    color: #1d2021;
    font-weight: 600;
  }

  .footer-btn.apply-btn:hover {
    background: #98971a;
    border-color: #98971a;
  }

  .footer-btn.apply-btn.disabled {
    opacity: 0.45;
    cursor: not-allowed;
    background: #3c3836;
    border-color: #504945;
    color: #928374;
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
      transform: scale(0.97);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
