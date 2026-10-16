<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    History,
    RotateCcw,
    Copy,
    Tag,
    X,
    Clock,
    Sparkles,
    FileText,
    Save,
    Trash2,
    Check,
    Columns,
    Rows
  } from 'lucide-svelte';
  import type { HistorySnapshot } from '../types/history';
  import {
    getSnapshotsForFile,
    deleteSnapshot,
    updateSnapshotLabel
  } from '../lib/storage/localHistory';
  import { computeLineDiff, computeSideBySideDiff } from '../lib/editor/diffEngine';

  let {
    isOpen = false,
    fileKey = '',
    fileTitle = '',
    currentContent = '',
    onRevert,
    onOpenPutLabel,
    onClose
  } = $props<{
    isOpen: boolean;
    fileKey: string;
    fileTitle: string;
    currentContent: string;
    onRevert: (content: string) => void;
    onOpenPutLabel: () => void;
    onClose: () => void;
  }>();

  let snapshots = $state<HistorySnapshot[]>([]);
  let selectedSnapshotId = $state<string | null>(null);
  let isLoading = $state(false);
  let copySuccess = $state(false);
  // 檢視模式：預設為左右並排 (Split / Side-by-Side Git Diff 風格)
  let diffMode = $state<'split' | 'unified'>('split');

  // 選取的快照實體
  const selectedSnapshot = $derived(
    snapshots.find((s) => s.id === selectedSnapshotId) || snapshots[0] || null
  );

  // 計算選中快照 vs 當前編輯內容的 Side-by-Side 雙欄 Diff
  const sideBySideResult = $derived.by(() => {
    if (!selectedSnapshot) {
      return { rows: [], additions: 0, deletions: 0, hasChanges: false };
    }
    return computeSideBySideDiff(selectedSnapshot.content, currentContent);
  });

  // 計算選中快照 vs 當前編輯內容的單欄 Unified Diff
  const diffResult = $derived.by(() => {
    if (!selectedSnapshot) {
      return { lines: [], additions: 0, deletions: 0, hasChanges: false };
    }
    // 歷史版本 (舊) vs 當前編輯內容 (新)
    return computeLineDiff(selectedSnapshot.content, currentContent);
  });

  // 開啟時載入快照清單
  $effect(() => {
    if (isOpen && fileKey) {
      loadHistory();
    }
  });

  export async function loadHistory() {
    isLoading = true;
    try {
      const list = await getSnapshotsForFile(fileKey);
      snapshots = list;
      if (list.length > 0 && (!selectedSnapshotId || !list.some((s) => s.id === selectedSnapshotId))) {
        selectedSnapshotId = list[0].id;
      }
    } catch (err) {
      console.error('[LocalHistoryModal] Failed to load snapshots:', err);
    } finally {
      isLoading = false;
    }
  }

  /** 格式化完整日期時間：例如 2026/10/16 14:02:15 */
  function formatFullDateTime(ts: number): string {
    const d = new Date(ts);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}/${month}/${date} ${hours}:${minutes}:${seconds}`;
  }

  /** 格式化日期：例如 2026/10/16 */
  function formatDate(ts: number): string {
    const d = new Date(ts);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}/${month}/${date}`;
  }

  /** 格式化時間：例如 14:02:15 */
  function formatTime(ts: number): string {
    const d = new Date(ts);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  function getReasonLabel(reason: string): { label: string; icon: any; color: string } {
    switch (reason) {
      case 'typing':
        return { label: '編輯暫停', icon: Clock, color: '#a89984' };
      case 'save':
        return { label: '存檔', icon: Save, color: '#8ec07c' };
      case 'pre-ai':
        return { label: 'AI煉丹前', icon: Sparkles, color: '#d3869b' };
      case 'post-ai':
        return { label: 'AI煉丹後', icon: Sparkles, color: '#b8bb26' };
      case 'label':
        return { label: '自訂標籤', icon: Tag, color: '#fabd2f' };
      case 'initial':
        return { label: '初次載入', icon: FileText, color: '#83a598' };
      default:
        return { label: '變更節點', icon: Clock, color: '#a89984' };
    }
  }

  async function handleRevert() {
    if (!selectedSnapshot) return;
    const ok = window.confirm(
      `確定要將「${fileTitle}」還原至 ${formatFullDateTime(selectedSnapshot.timestamp)} 的歷史版本嗎？\n（目前編輯中的狀態會自動建檔保存，不用擔心遺失）`
    );
    if (!ok) return;

    onRevert(selectedSnapshot.content);
    onClose();
  }

  async function handleCopy() {
    if (!selectedSnapshot) return;
    try {
      await navigator.clipboard.writeText(selectedSnapshot.content);
      copySuccess = true;
      setTimeout(() => (copySuccess = false), 2000);
    } catch (e) {
      console.error('複製失敗:', e);
    }
  }

  async function handleDelete(id: string, e: MouseEvent) {
    e.stopPropagation();
    if (!confirm('確定刪除此歷史快照節點？')) return;
    await deleteSnapshot(id);
    await loadHistory();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }
</script>

{#if isOpen}
  <div
    class="modal-backdrop"
    onclick={onClose}
    role="presentation"
  >
    <div
      class="history-card"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <!-- 頂部標題列 -->
      <div class="card-header">
        <div class="header-left">
          <History size={18} class="accent-icon" />
          <div class="title-group">
            <span class="main-title">時光長河 · 溯源寶鑑</span>
            <span class="file-name">{fileTitle}</span>
          </div>
        </div>

        <div class="header-actions">
          <button
            class="action-btn label-btn"
            onclick={onOpenPutLabel}
            title="在此版本打上自訂標籤 (Put Label...)"
          >
            <Tag size={14} />
            <span>標註錨點 (Put Label)</span>
          </button>

          <button
            class="action-btn"
            disabled={!selectedSnapshot}
            onclick={handleCopy}
            title="複製此歷史版本的全文"
          >
            {#if copySuccess}
              <Check size={14} class="text-green" />
              <span>已複製全文</span>
            {:else}
              <Copy size={14} />
              <span>複製內容</span>
            {/if}
          </button>

          <button
            class="action-btn revert-btn"
            disabled={!selectedSnapshot}
            onclick={handleRevert}
            title="將分頁內容覆蓋還原至選取的歷史版本"
          >
            <RotateCcw size={14} />
            <span>還原至此版本 (Revert)</span>
          </button>

          <button class="close-btn" onclick={onClose} title="關閉視窗 (Esc)">
            <X size={16} />
          </button>
        </div>
      </div>

      <!-- 核心雙欄主體 -->
      <div class="card-body">
        <!-- 左欄：時間軸清單 -->
        <div class="timeline-pane">
          <div class="pane-header">
            <span>歷史版本 ({snapshots.length})</span>
            <span class="refresh-hint">即時無痕留存</span>
          </div>

          <div class="timeline-list">
            {#if isLoading}
              <div class="empty-state">檢索時光長河中...</div>
            {:else if snapshots.length === 0}
              <div class="empty-state">
                <Clock size={24} />
                <p>尚無歷史快照紀錄</p>
                <small>稍作編輯或打上標籤，系統將自動為您留下印記。</small>
              </div>
            {:else}
              {#each snapshots as snap (snap.id)}
                {@const reasonMeta = getReasonLabel(snap.reason)}
                {@const isSelected = selectedSnapshotId === snap.id}
                <div
                  class="timeline-item {isSelected ? 'active' : ''}"
                  onclick={() => (selectedSnapshotId = snap.id)}
                  onkeydown={(e) => e.key === 'Enter' && (selectedSnapshotId = snap.id)}
                  tabindex="0"
                  role="button"
                >
                  <div class="item-top">
                    <div class="datetime-badge">
                      <span class="date-str">{formatDate(snap.timestamp)}</span>
                      <span class="time-str">{formatTime(snap.timestamp)}</span>
                    </div>
                    <button
                      class="delete-snap-btn"
                      title="刪除此快照"
                      onclick={(e) => handleDelete(snap.id, e)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {#if snap.label}
                    <div class="label-badge">
                      <Tag size={11} />
                      <span>{snap.label}</span>
                    </div>
                  {/if}

                  <div class="item-bottom">
                    <span class="reason-tag" style="color: {reasonMeta.color}">
                      <reasonMeta.icon size={11} />
                      {reasonMeta.label}
                    </span>
                    <span class="stats-text">{snap.lineCount} 行 · {snap.charCount} 字</span>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <!-- 右欄：Diff 比對器 -->
        <div class="diff-pane">
          <div class="diff-header">
            <div class="diff-summary">
              {#if selectedSnapshot}
                <span class="diff-target-label">
                  歷史版本（{formatFullDateTime(selectedSnapshot.timestamp)}） vs 當前即時內容
                </span>
                {#if sideBySideResult.hasChanges}
                  <span class="stat-badge add">+{sideBySideResult.additions} 行</span>
                  <span class="stat-badge del">-{sideBySideResult.deletions} 行</span>
                {:else}
                  <span class="stat-badge match">兩者內容完全一致</span>
                {/if}
              {:else}
                <span>請由左側選取快照節點進行對照</span>
              {/if}
            </div>

            <div class="diff-header-right">
              <div class="diff-view-modes">
                <button
                  class="mode-btn {diffMode === 'split' ? 'active' : ''}"
                  onclick={() => (diffMode = 'split')}
                  title="雙鏡互照 (左右對比)"
                >
                  <Columns size={13} />
                  <span>雙鏡互照</span>
                </button>
                <button
                  class="mode-btn {diffMode === 'unified' ? 'active' : ''}"
                  onclick={() => (diffMode = 'unified')}
                  title="單卷通覽 (縱向整合)"
                >
                  <Rows size={13} />
                  <span>單卷通覽</span>
                </button>
              </div>
            </div>
          </div>

          <div class="diff-viewer">
            {#if !selectedSnapshot}
              <div class="empty-state">尚無比對內容</div>
            {:else if diffMode === 'split'}
              <!-- 雙鏡互照對照檢視 -->
              <div class="split-column-headers">
                <div class="column-header left">
                  <span class="column-tag old">溯源舊跡 (Old)</span>
                  <span class="column-timestamp">{formatFullDateTime(selectedSnapshot.timestamp)}</span>
                </div>
                <div class="column-header right">
                  <span class="column-tag current">即時墨痕 (Current)</span>
                  <span class="column-status">{fileTitle} 即時編輯區</span>
                </div>
              </div>
              <div class="split-diff-content">
                {#each sideBySideResult.rows as row, idx (idx)}
                  <div class="split-diff-row">
                    <!-- 左欄：歷史版本 (舊) -->
                    <div class="split-cell left {row.left.type}">
                      <div class="col-num">{row.left.lineNumber !== undefined ? row.left.lineNumber : ''}</div>
                      <div class="col-indicator">{row.left.type === 'removed' ? '-' : ' '}</div>
                      <pre class="col-text">{row.left.text || ' '}</pre>
                    </div>
                    <!-- 右欄：當前內容 (新) -->
                    <div class="split-cell right {row.right.type}">
                      <div class="col-num">{row.right.lineNumber !== undefined ? row.right.lineNumber : ''}</div>
                      <div class="col-indicator">{row.right.type === 'added' ? '+' : ' '}</div>
                      <pre class="col-text">{row.right.text || ' '}</pre>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <!-- 單欄整合 Diff 風格 -->
              <div class="diff-content">
                {#each diffResult.lines as line, idx (idx)}
                  <div class="diff-row {line.type}">
                    <div class="col-num old-num">
                      {line.oldLineNumber !== undefined ? line.oldLineNumber : ''}
                    </div>
                    <div class="col-num new-num">
                      {line.newLineNumber !== undefined ? line.newLineNumber : ''}
                    </div>
                    <div class="col-indicator">
                      {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                    </div>
                    <pre class="col-text">{line.text || ' '}</pre>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: rgba(10, 10, 12, 0.78);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    box-sizing: border-box;
  }

  .history-card {
    width: 100%;
    max-width: 1240px;
    height: 85vh;
    max-height: 880px;
    background: #1d2021;
    border: 1px solid #3c3836;
    border-radius: 8px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75);
    display: flex;
    flex-direction: column;
    color: #ebdbb2;
    overflow: hidden;
    animation: zoomIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes zoomIn {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* 頂部 Header */
  .card-header {
    height: 52px;
    background: #18191a;
    border-bottom: 1px solid #32353a;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    user-select: none;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  :global(.accent-icon) {
    color: #fabd2f;
  }

  .title-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .main-title {
    font-size: 14px;
    font-weight: 600;
    color: #fbf1c7;
  }

  .file-name {
    font-size: 12px;
    color: #83a598;
    background: #282828;
    padding: 2px 8px;
    border-radius: 4px;
    font-family: monospace;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .action-btn {
    background: #282828;
    border: 1px solid #504945;
    color: #ebdbb2;
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:hover:not(:disabled) {
    background: #3c3836;
    border-color: #665c54;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .label-btn {
    border-color: #d79921;
    color: #fabd2f;
  }

  .label-btn:hover {
    background: rgba(250, 189, 47, 0.12);
  }

  .revert-btn {
    background: #b57614;
    border-color: #fabd2f;
    color: #fbf1c7;
    font-weight: 600;
  }

  .revert-btn:hover:not(:disabled) {
    background: #d79921;
    box-shadow: 0 0 10px rgba(250, 189, 47, 0.3);
  }

  .close-btn {
    background: none;
    border: none;
    color: #928374;
    cursor: pointer;
    padding: 6px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition: all 0.15s;
    margin-left: 6px;
  }

  .close-btn:hover {
    background: #3c3836;
    color: #ebdbb2;
  }

  :global(.text-green) {
    color: #b8bb26;
  }

  /* 核心雙欄主體 */
  .card-body {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* 左側時間軸清單 */
  .timeline-pane {
    width: 290px;
    min-width: 260px;
    background: #141617;
    border-right: 1px solid #282828;
    display: flex;
    flex-direction: column;
  }

  .pane-header {
    height: 36px;
    background: #18191a;
    border-bottom: 1px solid #282828;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    font-size: 12px;
    font-weight: 600;
    color: #a89984;
  }

  .refresh-hint {
    font-size: 11px;
    color: #928374;
    font-weight: normal;
  }

  .timeline-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .timeline-item {
    background: #1d2021;
    border: 1px solid #282828;
    border-radius: 6px;
    padding: 10px 12px;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
  }

  .timeline-item:hover {
    background: #282828;
    border-color: #504945;
  }

  .timeline-item.active {
    background: #2d261e;
    border-color: #fabd2f;
    box-shadow: inset 3px 0 0 #fabd2f;
  }

  .item-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .datetime-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: monospace;
  }

  .date-str {
    font-size: 11px;
    font-weight: 500;
    color: #a89984;
    background: #282828;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .time-str {
    font-size: 12px;
    font-weight: 600;
    color: #fbf1c7;
    font-family: monospace;
  }

  .delete-snap-btn {
    background: none;
    border: none;
    color: #665c54;
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
    opacity: 0;
    transition: all 0.15s;
  }

  .timeline-item:hover .delete-snap-btn {
    opacity: 1;
  }

  .delete-snap-btn:hover {
    color: #fb4934;
    background: #3c3836;
  }

  .label-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(250, 189, 47, 0.15);
    border: 1px solid rgba(250, 189, 47, 0.4);
    color: #fabd2f;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    width: fit-content;
  }

  .item-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 2px;
  }

  .reason-tag {
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .stats-text {
    font-size: 11px;
    color: #7c6f64;
  }

  /* 右側 Diff 比對視圖 */
  .diff-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #18191a;
    overflow: hidden;
  }

  .diff-header {
    height: 38px;
    background: #161718;
    border-bottom: 1px solid #282828;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    font-size: 12px;
    user-select: none;
  }

  .diff-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .diff-target-label {
    color: #d5c4a1;
    font-weight: 500;
    font-family: monospace;
  }

  .stat-badge {
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
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

  .stat-badge.match {
    background: rgba(131, 165, 152, 0.18);
    color: #83a598;
  }

  .diff-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .diff-view-modes {
    display: flex;
    align-items: center;
    background: #1f2223;
    border: 1px solid #3c3836;
    border-radius: 4px;
    padding: 2px;
    gap: 2px;
  }

  .mode-btn {
    background: none;
    border: none;
    color: #a89984;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .mode-btn:hover {
    color: #ebdbb2;
    background: #282828;
  }

  .mode-btn.active {
    background: #3c3836;
    color: #fabd2f;
    font-weight: 600;
  }

  /* 左右雙欄 (Side-by-Side) 專屬樣式 */
  .split-column-headers {
    display: flex;
    height: 28px;
    background: #141617;
    border-bottom: 1px solid #282828;
    position: sticky;
    top: 0;
    z-index: 2;
    user-select: none;
  }

  .column-header {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    font-size: 11px;
    box-sizing: border-box;
  }

  .column-header.left {
    border-right: 1px solid #282828;
  }

  .column-tag {
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 3px;
  }

  .column-tag.old {
    background: rgba(251, 73, 52, 0.18);
    color: #fb4934;
  }

  .column-tag.current {
    background: rgba(184, 187, 38, 0.18);
    color: #b8bb26;
  }

  .column-timestamp,
  .column-status {
    color: #928374;
    font-family: monospace;
    font-size: 11px;
  }

  .split-diff-content {
    display: flex;
    flex-direction: column;
    min-width: 100%;
    width: max-content;
  }

  .split-diff-row {
    display: flex;
    min-height: 20px;
    width: 100%;
    transition: background 0.05s;
  }

  .split-diff-row:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .split-cell {
    flex: 1;
    min-width: 380px;
    display: flex;
    position: relative;
    box-sizing: border-box;
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
    background: rgba(0, 0, 0, 0.22);
    user-select: none;
  }

  .split-cell.added .col-indicator {
    color: #b8bb26;
  }

  .split-cell.removed .col-indicator {
    color: #fb4934;
  }

  .split-cell.added .col-text {
    color: #b8bb26;
  }

  .split-cell.removed .col-text {
    color: #fb4934;
    opacity: 0.9;
  }

  .diff-viewer {
    flex: 1;
    overflow: auto;
    font-family: 'Consolas', 'Fira Code', 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 20px;
    background: #18191a;
  }

  .diff-content {
    display: flex;
    flex-direction: column;
    min-width: 100%;
    width: max-content;
  }

  .diff-row {
    display: flex;
    min-height: 20px;
    transition: background 0.05s;
  }

  .diff-row.unchanged:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .diff-row.added {
    background: rgba(184, 187, 38, 0.12);
  }

  .diff-row.removed {
    background: rgba(251, 73, 52, 0.12);
  }

  .col-num {
    width: 44px;
    min-width: 44px;
    text-align: right;
    padding-right: 8px;
    color: #504945;
    font-size: 11px;
    user-select: none;
    box-sizing: border-box;
  }

  .old-num {
    border-right: 1px solid #282828;
  }

  .new-num {
    border-right: 1px solid #282828;
  }

  .col-indicator {
    width: 20px;
    min-width: 20px;
    text-align: center;
    user-select: none;
    font-weight: bold;
    font-size: 12px;
  }

  .diff-row.added .col-indicator {
    color: #b8bb26;
  }

  .diff-row.removed .col-indicator {
    color: #fb4934;
  }

  .diff-row.unchanged .col-indicator {
    color: transparent;
  }

  .col-text {
    flex: 1;
    margin: 0;
    padding: 0 10px;
    white-space: pre;
    color: #ebdbb2;
    tab-size: 2;
  }

  .diff-row.added .col-text {
    color: #b8bb26;
  }

  .diff-row.removed .col-text {
    color: #fb4934;
    text-decoration: line-through;
    opacity: 0.85;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #7c6f64;
    padding: 30px;
    text-align: center;
    gap: 8px;
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
    color: #a89984;
  }

  .empty-state small {
    font-size: 12px;
    color: #665c54;
  }
</style>
