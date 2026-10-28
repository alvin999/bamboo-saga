<script lang="ts">
  import { onMount } from "svelte";
  import {
    Check,
    Copy,
    X,
    CheckSquare,
    Square,
    Columns,
    Maximize2,
  } from "lucide-svelte";
  import {
    generateActionProposals,
    applySelectedProposals,
    type TextActionProposal,
  } from "../lib/editor/textProcessor";
  import { computeSideBySideDiff } from "../lib/editor/diffEngine";
  import type { SideBySideDiffResult } from "../types/history";

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
    content = "",
    selectedText = "",
    onApply,
    onClose,
    onShowToast = () => {},
  }: TextToolsModalProps = $props();

  let targetScope = $state<"selection" | "full">("full");
  let compareLayout = $state<"split" | "single">("split");

  let originalRawText = $derived(
    targetScope === "selection" && selectedText ? selectedText : content,
  );

  let proposals = $state<TextActionProposal[]>([]);
  let duplicateCaseSensitive = $state(true);
  let sortOrder = $state<"asc" | "desc">("asc");

  let previewText = $state("");
  let changeSummary = $state<string[]>([]);
  let copySuccess = $state(false);

  let sideBySideResult = $state<SideBySideDiffResult>({
    rows: [],
    additions: 0,
    deletions: 0,
    hasChanges: false,
  });

  let selectedCount = $derived(proposals.filter((p) => p.selected).length);
  let hasRecommendations = $derived(proposals.some((p) => p.recommended));

  function refreshProposalsAndPreview() {
    const raw = originalRawText;
    proposals = generateActionProposals(raw);
    recalculatePreview();
  }

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

  onMount(() => {
    if (selectedText && selectedText.trim().length > 0) {
      targetScope = "selection";
    } else {
      targetScope = "full";
    }
    refreshProposalsAndPreview();
  });

  function toggleProposal(index: number) {
    proposals[index].selected = !proposals[index].selected;
    recalculatePreview();
  }

  function setSelectAll(value: boolean) {
    proposals.forEach((p) => (p.selected = value));
    recalculatePreview();
  }

  function resetToRecommendations() {
    proposals.forEach((p) => (p.selected = p.recommended));
    recalculatePreview();
    onShowToast("已恢復為預設推薦勾選");
  }

  function handleScopeChange(scope: "full" | "selection") {
    targetScope = scope;
    refreshProposalsAndPreview();
  }

  function handleApply() {
    if (selectedCount === 0) {
      onShowToast("請至少勾選一項要應用的調理建議");
      return;
    }

    const logDesc =
      changeSummary.length > 0 ? changeSummary.join("、") : "完成格式調理";
    if (targetScope === "selection" && selectedText) {
      const fullText = content;
      const idx = fullText.indexOf(selectedText);
      if (idx !== -1) {
        const newFull =
          fullText.slice(0, idx) +
          previewText +
          fullText.slice(idx + selectedText.length);
        onApply(newFull, logDesc);
      } else {
        onApply(previewText, logDesc);
      }
    } else {
      onApply(previewText, logDesc);
    }
    onClose();
  }

  async function handleCopy() {
    if (!previewText) return;
    try {
      await navigator.clipboard.writeText(previewText);
      copySuccess = true;
      onShowToast("已複製調理成果至剪貼簿");
      setTimeout(() => (copySuccess = false), 2000);
    } catch {
      onShowToast("複製失敗");
    }
  }
</script>

{#if isOpen}
  <div
    class="modal-backdrop"
    onclick={onClose}
    onkeydown={(e) => e.key === "Escape" && onClose()}
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
      <!-- 頂部單行精簡標頭：整合作用範圍與視圖切換，移除原本佔空間的第二層狀態列 -->
      <header class="modal-header">
        <div class="header-left">
          <span class="brand-glyph">◬</span>
          <h2 class="title-text">行處理解藥包</h2>
          <span class="header-divider"></span>

          <!-- 作用範圍切換膠囊 -->
          <div class="scope-dock">
            <button
              type="button"
              class="dock-btn {targetScope === 'full' ? 'active' : ''}"
              onclick={() => handleScopeChange("full")}
            >
              全文 ({content.split("\n").length} 行)
            </button>
            <button
              type="button"
              class="dock-btn {targetScope === 'selection' ? 'active' : ''}"
              disabled={!selectedText || selectedText.trim().length === 0}
              onclick={() => handleScopeChange("selection")}
            >
              選取範圍 {selectedText
                ? `(${selectedText.split("\n").length} 行)`
                : "(無)"}
            </button>
          </div>
        </div>

        <div class="header-right">
          <div class="scope-dock">
            <button
              type="button"
              class="dock-btn {compareLayout === 'split' ? 'active' : ''}"
              onclick={() => (compareLayout = "split")}
            >
              <Columns size={12} />
              <span>雙欄對照</span>
            </button>
            <button
              type="button"
              class="dock-btn {compareLayout === 'single' ? 'active' : ''}"
              onclick={() => (compareLayout = "single")}
            >
              <Maximize2 size={12} />
              <span>純成果</span>
            </button>
          </div>

          <button
            type="button"
            class="close-btn"
            onclick={onClose}
            aria-label="關閉 (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <!-- 雙欄主體 -->
      <div class="modal-body-split">
        <!-- 左欄：調理處方勾選清單 -->
        <aside class="proposal-pane">
          <div class="pane-toolbar">
            <div class="pane-title">
              <span>調理處方</span>
              <span class="selected-pill"
                >{selectedCount} / {proposals.length}</span
              >
            </div>
            <div class="pane-actions">
              <button
                type="button"
                class="text-link"
                onclick={() => setSelectAll(true)}>全選</button
              >
              <span class="divider">·</span>
              <button
                type="button"
                class="text-link"
                onclick={() => setSelectAll(false)}>清空</button
              >
              <span class="divider">·</span>
              <button
                type="button"
                class="text-link"
                onclick={resetToRecommendations}>預設推薦</button
              >
            </div>
          </div>

          <!-- 輕量情境引導 -->
          <div class="use-case-strip">
            <span class="use-case-tag">適用：貼上雜亂網頁文字</span>
            <span class="use-case-sep">·</span>
            <span class="use-case-tag">清單去重與排序</span>
            <span class="use-case-sep">·</span>
            <span class="use-case-tag">壓縮多餘空行</span>
          </div>

          {#if !hasRecommendations}
            <div class="clean-state-banner">
              <span class="clean-icon">✦</span>
              <span>當前文稿整齊無明顯贅餘，可點選下方項目進行自訂排序或格式調整</span>
            </div>
          {/if}

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
                      <CheckSquare size={16} class="chk-icon-active" />
                    {:else}
                      <Square size={16} class="chk-icon-idle" />
                    {/if}
                  </div>

                  <div class="proposal-info">
                    <div class="proposal-title-row">
                      <span class="proposal-name">{item.title}</span>
                      <div class="badge-cluster">
                        {#if item.recommended}
                          <span class="badge ai-rec">推薦</span>
                        {/if}
                        <span class="badge {item.badgeType}">{item.badge}</span>
                      </div>
                    </div>
                    <span class="proposal-desc">{item.description}</span>
                  </div>
                </div>

                {#if item.selected && item.id === "dedup"}
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

                {#if item.selected && item.id === "sort"}
                  <div
                    class="sub-option"
                    onclick={(e) => e.stopPropagation()}
                    onkeydown={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    <span class="sub-label">排序：</span>
                    <select
                      class="sub-select"
                      bind:value={sortOrder}
                      onchange={recalculatePreview}
                    >
                      <option value="asc">升冪 (A → Z)</option>
                      <option value="desc">降冪 (Z → A)</option>
                    </select>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </aside>

        <!-- 右欄：即時對照檢視 -->
        <main class="preview-pane">
          <div
            class="diff-split-view {compareLayout === 'single'
              ? 'is-single'
              : ''}"
          >
            {#if compareLayout === "split"}
              <div class="split-side-by-side-container">
                <div class="split-column-headers">
                  <div class="column-header left">
                    <span class="glyph-mono">▢</span>
                    <span class="pane-title-text">原始手稿</span>
                    <span class="line-stat"
                      >{originalRawText.split("\n").length} 行</span
                    >
                  </div>
                  <div class="column-header right">
                    <span class="glyph-mono accent-glyph">◈</span>
                    <span class="pane-title-text accent-text">調理成果</span>
                    <div class="header-diff-stat">
                      {#if sideBySideResult.hasChanges}
                        <span class="stat-badge add"
                          >+{sideBySideResult.additions}</span
                        >
                        <span class="stat-badge del"
                          >-{sideBySideResult.deletions}</span
                        >
                      {/if}
                      <span class="line-stat"
                        >{previewText.split("\n").length} 行</span
                      >
                    </div>
                  </div>
                </div>

                <div class="diff-viewer">
                  <div class="split-diff-content">
                    {#each sideBySideResult.rows as row, idx (idx)}
                      <div class="split-diff-row">
                        <!-- 左欄：原始 -->
                        <div class="split-cell left {row.left.type}">
                          <div class="col-num">
                            {row.left.lineNumber !== undefined
                              ? row.left.lineNumber
                              : ""}
                          </div>
                          <div class="col-indicator">
                            {row.left.type === "removed" ? "-" : " "}
                          </div>
                          {#if row.left.type === "removed" && (!row.left.text || row.left.text.trim() === "")}
                            <div class="col-text empty-line-box">
                              <span class="empty-line-badge">↵ 空白行</span>
                            </div>
                          {:else}
                            <pre class="col-text">{row.left.text || " "}</pre>
                          {/if}
                        </div>

                        <!-- 右欄：成果 -->
                        <div class="split-cell right {row.right.type}">
                          <div class="col-num">
                            {row.right.lineNumber !== undefined
                              ? row.right.lineNumber
                              : ""}
                          </div>
                          <div class="col-indicator">
                            {row.right.type === "added" ? "+" : " "}
                          </div>
                          {#if row.right.type === "empty"}
                            <div class="col-text empty-placeholder-box">
                              {#if row.left.type === "removed"}
                                <span class="empty-row-hint">已收合</span>
                              {/if}
                            </div>
                          {:else if row.right.type === "added" && (!row.right.text || row.right.text.trim() === "")}
                            <div class="col-text empty-line-box">
                              <span class="empty-line-badge add"
                                >↵ 新增空行</span
                              >
                            </div>
                          {:else}
                            <pre class="col-text">{row.right.text || " "}</pre>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            {:else}
              <div class="diff-pane">
                <div class="column-header right single-header">
                  <span class="glyph-mono accent-glyph">◈</span>
                  <span class="pane-title-text accent-text">調理成果預覽</span>
                  <span class="line-stat"
                    >{previewText.split("\n").length} 行</span
                  >
                </div>
                <div class="pane-content">
                  <pre class="readonly-text">{previewText}</pre>
                </div>
              </div>
            {/if}
          </div>
        </main>
      </div>

      <!-- 底部操作列：整合變更摘要與執行按鈕 -->
      <footer class="modal-footer">
        <div class="footer-left-log">
          {#if changeSummary.length > 0}
            <span class="log-label">變更摘要：</span>
            <div class="log-tags">
              {#each changeSummary as log}
                <span class="log-pill">{log}</span>
              {/each}
            </div>
          {:else}
            <span class="log-none">尚未勾選處方，手稿將維持原樣</span>
          {/if}
        </div>

        <div class="footer-actions">
          <button type="button" class="footer-btn secondary" onclick={onClose}>
            取消
          </button>
          <button
            type="button"
            class="footer-btn copy-btn"
            onclick={handleCopy}
          >
            {#if copySuccess}
              <Check size={14} />
              <span>已複製</span>
            {:else}
              <Copy size={14} />
              <span>複製成果</span>
            {/if}
          </button>
          <button
            type="button"
            class="footer-btn apply-btn"
            disabled={selectedCount === 0}
            onclick={handleApply}
          >
            <Check size={14} />
            <span>
              {selectedCount > 0 ? `套用 (${selectedCount})` : "請勾選項目"}
            </span>
          </button>
        </div>
      </footer>
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
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    animation: fadeIn 0.16s ease-out;
  }

  .glyph-mono {
    font-family: "JetBrains Mono", monospace;
    line-height: 1;
  }

  /* 主卡片：Apothecary Gruvbox 寬鬆通透質感 */
  .modal-card {
    position: relative;
    width: 90vw;
    max-width: 1040px;
    height: 82vh;
    display: flex;
    flex-direction: column;
    background: rgba(20, 22, 21, 0.98);
    border: 1px solid rgba(100, 86, 66, 0.4);
    border-radius: 12px;
    box-shadow:
      0 24px 60px rgba(0, 0, 0, 0.78),
      0 0 0 1px rgba(250, 189, 47, 0.08);
    overflow: hidden;
    animation: scaleUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    color: #e6dfd5;
    outline: none;
  }

  /* 頂部單行標頭 */
  .modal-header {
    height: 54px;
    padding: 0 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(100, 86, 66, 0.25);
    background: rgba(16, 18, 17, 0.9);
    flex-shrink: 0;
  }

  .header-left,
  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-glyph {
    font-family: "JetBrains Mono", monospace;
    font-size: 17px;
    color: #fabd2f;
  }

  .title-text {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #ebdbb2;
    letter-spacing: 0.03em;
  }

  .header-divider {
    width: 1px;
    height: 16px;
    background: rgba(100, 86, 66, 0.3);
  }

  .scope-dock {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(100, 86, 66, 0.25);
    border-radius: 7px;
  }

  .dock-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    background: transparent;
    border: none;
    color: #8c8273;
    font-size: 12px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .dock-btn:hover:not(:disabled) {
    color: #d5c4a1;
  }

  .dock-btn.active {
    background: rgba(250, 189, 47, 0.12);
    color: #fabd2f;
    font-weight: 500;
  }

  .dock-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #7c7365;
    cursor: pointer;
    width: 30px;
    height: 30px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.14s ease;
  }

  .close-btn:hover {
    background: rgba(251, 73, 52, 0.14);
    color: #fb4934;
  }

  /* 雙欄主體 */
  .modal-body-split {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  /* 左欄：處方清單 */
  .proposal-pane {
    width: 340px;
    border-right: 1px solid rgba(100, 86, 66, 0.22);
    display: flex;
    flex-direction: column;
    background: rgba(16, 18, 17, 0.55);
    flex-shrink: 0;
  }

  .pane-toolbar {
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    border-bottom: 1px solid rgba(100, 86, 66, 0.18);
  }

  .use-case-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px;
    background: rgba(250, 189, 47, 0.04);
    border-bottom: 1px solid rgba(100, 86, 66, 0.15);
    font-size: 11px;
    color: #8c8273;
    white-space: nowrap;
    overflow-x: auto;
  }

  .use-case-tag {
    flex-shrink: 0;
  }

  .use-case-sep {
    color: rgba(100, 86, 66, 0.4);
    user-select: none;
  }

  .clean-state-banner {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(142, 192, 124, 0.05);
    border-bottom: 1px solid rgba(142, 192, 124, 0.15);
    font-size: 11px;
    color: #8ec07c;
    line-height: 1.4;
  }

  .clean-icon {
    font-size: 11px;
    color: #8ec07c;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .pane-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: #8c8273;
  }

  .selected-pill {
    padding: 1px 6px;
    background: rgba(250, 189, 47, 0.1);
    border-radius: 4px;
    color: #fabd2f;
    font-size: 11px;
    font-family: "JetBrains Mono", monospace;
  }

  .pane-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
  }

  .text-link {
    background: transparent;
    border: none;
    color: #9c8f7a;
    cursor: pointer;
    padding: 0;
    transition: color 0.14s ease;
  }

  .text-link:hover {
    color: #fabd2f;
  }

  .divider {
    color: #504945;
  }

  .proposal-list {
    padding: 12px;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* 處方卡片：清爽低干擾 */
  .proposal-card {
    display: flex;
    flex-direction: column;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(100, 86, 66, 0.22);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
    outline: none;
  }

  .proposal-card:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(250, 189, 47, 0.3);
  }

  .proposal-card.checked {
    border-color: rgba(250, 189, 47, 0.38);
    background: rgba(250, 189, 47, 0.07);
  }

  .card-left {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .checkbox-visual {
    margin-top: 2px;
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
    min-width: 0;
  }

  .proposal-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .proposal-name {
    font-size: 13.5px;
    font-weight: 500;
    color: #e6dfd5;
  }

  .proposal-card.checked .proposal-name {
    color: #fabd2f;
  }

  .badge-cluster {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .badge {
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10.5px;
    font-family: "JetBrains Mono", monospace;
    background: rgba(255, 255, 255, 0.05);
    color: #9c8f7a;
  }

  .badge.ai-rec,
  .badge.warning {
    background: rgba(250, 189, 47, 0.12);
    color: #fabd2f;
  }

  .badge.info,
  .badge.success {
    background: rgba(142, 192, 124, 0.12);
    color: #8ec07c;
  }

  .proposal-desc {
    font-size: 12px;
    color: #7c7365;
    line-height: 1.45;
  }

  .sub-option {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed rgba(100, 86, 66, 0.22);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .sub-label,
  .sub-checkbox {
    font-size: 11.5px;
    color: #9c8f7a;
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }

  .sub-checkbox input {
    accent-color: #fabd2f;
  }

  .sub-select {
    padding: 2px 8px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(100, 86, 66, 0.35);
    color: #ebdbb2;
    font-size: 11.5px;
    border-radius: 5px;
    outline: none;
  }

  /* 右欄：即時對照區 */
  .preview-pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: transparent;
  }

  .diff-split-view {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .split-side-by-side-container,
  .diff-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .split-column-headers {
    display: flex;
    height: 38px;
    background: rgba(16, 18, 17, 0.45);
    border-bottom: 1px solid rgba(100, 86, 66, 0.18);
    flex-shrink: 0;
  }

  .column-header {
    flex: 1 1 50%;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    font-size: 12px;
    color: #8c8273;
  }

  .column-header.left {
    border-right: 1px solid rgba(100, 86, 66, 0.18);
  }

  .single-header {
    height: 38px;
    flex: none;
    background: rgba(16, 18, 17, 0.45);
    border-bottom: 1px solid rgba(100, 86, 66, 0.18);
  }

  .accent-glyph,
  .accent-text {
    color: #fabd2f;
    font-weight: 500;
  }

  .line-stat {
    margin-left: auto;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: #665c54;
  }

  .header-diff-stat {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stat-badge {
    font-family: "JetBrains Mono", monospace;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10.5px;
  }

  .stat-badge.add {
    background: rgba(142, 192, 124, 0.14);
    color: #8ec07c;
  }

  .stat-badge.del {
    background: rgba(251, 73, 52, 0.14);
    color: #fb4934;
  }

  /* Diff 內容檢視器 */
  .diff-viewer {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    font-family: "JetBrains Mono", monospace;
    font-size: 13px;
    line-height: 24px;
  }

  .split-diff-content {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .split-diff-row {
    display: flex;
    min-height: 24px;
    width: 100%;
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
    padding: 1px 0;
  }

  .split-cell.left {
    border-right: 1px solid rgba(100, 86, 66, 0.15);
  }

  .split-cell.added {
    background: rgba(142, 192, 124, 0.09);
  }

  .split-cell.removed {
    background: rgba(251, 73, 52, 0.09);
  }

  .split-cell.empty {
    background: rgba(0, 0, 0, 0.2);
    user-select: none;
  }

  .empty-line-box,
  .empty-placeholder-box {
    display: flex;
    align-items: center;
  }

  .empty-line-badge {
    font-size: 10.5px;
    color: #fb4934;
    background: rgba(251, 73, 52, 0.12);
    border-radius: 4px;
    padding: 0 6px;
    line-height: 18px;
  }

  .empty-line-badge.add {
    color: #8ec07c;
    background: rgba(142, 192, 124, 0.12);
  }

  .empty-row-hint {
    font-size: 11px;
    color: #504945;
  }

  .col-num {
    width: 36px;
    padding-right: 8px;
    text-align: right;
    color: #504945;
    user-select: none;
    font-size: 11px;
    flex-shrink: 0;
  }

  .col-indicator {
    width: 16px;
    text-align: center;
    user-select: none;
    font-size: 12px;
    flex-shrink: 0;
  }

  .col-text {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding-right: 12px;
    white-space: pre-wrap;
    word-break: break-word;
    color: #d5c4a1;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
  }

  .split-cell.added .col-indicator,
  .split-cell.added .col-text {
    color: #8ec07c;
  }

  .split-cell.removed .col-indicator,
  .split-cell.removed .col-text {
    color: #fb4934;
  }

  .pane-content {
    flex: 1;
    overflow: auto;
    padding: 20px;
  }

  .readonly-text {
    margin: 0;
    font-family: "JetBrains Mono", monospace;
    font-size: 13.5px;
    line-height: 1.75;
    color: #d5c4a1;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* 底部單行操作與摘要列 */
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: rgba(16, 18, 17, 0.9);
    border-top: 1px solid rgba(100, 86, 66, 0.22);
    gap: 16px;
    flex-shrink: 0;
  }

  .footer-left-log {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    overflow-x: auto;
    min-width: 0;
  }

  .log-label {
    color: #7c7365;
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
    background: rgba(142, 192, 124, 0.1);
    border: 1px solid rgba(142, 192, 124, 0.25);
    border-radius: 4px;
    color: #8ec07c;
    font-size: 11.5px;
  }

  .log-none {
    color: #665c54;
  }

  .footer-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .footer-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 14px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
  }

  .footer-btn.secondary {
    background: transparent;
    border-color: rgba(100, 86, 66, 0.3);
    color: #9c8f7a;
  }

  .footer-btn.secondary:hover {
    color: #ebdbb2;
    background: rgba(255, 255, 255, 0.04);
  }

  .footer-btn.copy-btn {
    background: rgba(142, 192, 124, 0.1);
    border-color: rgba(142, 192, 124, 0.3);
    color: #8ec07c;
  }

  .footer-btn.copy-btn:hover {
    background: rgba(142, 192, 124, 0.2);
  }

  .footer-btn.apply-btn {
    background: rgba(250, 189, 47, 0.14);
    border-color: rgba(250, 189, 47, 0.4);
    color: #fabd2f;
    font-weight: 500;
  }

  .footer-btn.apply-btn:hover:not(:disabled) {
    background: #fabd2f;
    color: #1d2021;
  }

  .footer-btn.apply-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
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
