<script lang="ts">
  let {
    summary = 'AI 整理結果',
    timestamp = 0,
    onApplyDecisions,
    onAcceptAllAi,
    onAcceptAllBoth,
    onRollback,
  } = $props<{
    summary?: string;
    timestamp?: number;
    onApplyDecisions: () => void;
    onAcceptAllAi: () => void;
    onAcceptAllBoth: () => void;
    onRollback: () => void;
  }>();

  const formattedTime = $derived(
    timestamp ? new Date(timestamp).toLocaleTimeString() : ''
  );
</script>

<div class="review-banner">
  <div class="info">
    <span class="sparkle">✨</span>
    <span class="title">AI 煉丹成果審核中：</span>
    <span class="summary-badge">{summary}</span>
    {#if formattedTime}
      <span class="time-tag">({formattedTime})</span>
    {/if}
  </div>

  <div class="actions">
    <!-- 主要確認：依目前逐段選擇收丹 -->
    <button class="action-btn btn-apply" onclick={onApplyDecisions} title="依照各卡片目前的選擇（採納 AI / 保留原稿 / 兩者並存）組合筆記並正式入櫃">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>✅ 依選擇收丹入櫃</span>
    </button>

    <!-- 快捷全域：一次全採納 AI -->
    <button class="action-btn btn-all-ai" onclick={onAcceptAllAi} title="不需逐段調整，直接將所有段落採用純淨 AI 提煉成果">
      <span class="btn-icon">⚡</span>
      <span>一次全採納 AI</span>
    </button>

    <!-- 快捷全域：一次全並存對照 -->
    <button class="action-btn btn-all-both" onclick={onAcceptAllBoth} title="所有段落皆採用 AI 提煉，並於文末掛載對應原始速記脈絡引言">
      <span class="btn-icon">📑</span>
      <span>一次全並存對照</span>
    </button>

    <!-- Saga 補償：全退回原稿 -->
    <button class="action-btn btn-rollback" onclick={onRollback} title="Saga 補償機制：100% 無損還原回 AI 整理前的原始手稿">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M1 4v6h6"></path>
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
      </svg>
      <span>⏪ 全退回原稿</span>
    </button>
  </div>
</div>

<style>
  .review-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px;
    background: linear-gradient(90deg, #32302f, #3c3836);
    border-bottom: 1px solid #fe8019;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 50;
    flex-shrink: 0;
  }

  .info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    color: #fbf1c7;
  }

  .sparkle {
    font-size: 1rem;
    animation: rotate-sparkle 3s infinite linear;
  }

  @keyframes rotate-sparkle {
    0% { transform: scale(1) rotate(0deg); }
    50% { transform: scale(1.15) rotate(15deg); }
    100% { transform: scale(1) rotate(0deg); }
  }

  .title {
    font-weight: 600;
    color: #fabd2f;
  }

  .summary-badge {
    background: #282828;
    color: #ebdbb2;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
    border: 1px solid #504945;
  }

  .time-tag {
    font-size: 0.72rem;
    color: #928374;
    font-family: var(--font-mono);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    padding: 4px 11px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 600;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  /* 依選擇收丹（亮金黃核心） */
  .btn-apply {
    background: #fabd2f;
    color: #1d2021;
    border: 1px solid #d79921;
  }

  .btn-apply:hover {
    background: #fe8019;
    color: #1d2021;
    box-shadow: 0 2px 8px rgba(254, 128, 25, 0.4);
  }

  /* 一次全採納 AI（草綠） */
  .btn-all-ai {
    background: #282828;
    color: #b8bb26;
    border: 1px solid #b8bb26;
  }

  .btn-all-ai:hover {
    background: #b8bb26;
    color: #1d2021;
  }

  /* 一次全並存（暖灰） */
  .btn-all-both {
    background: #282828;
    color: #d79921;
    border: 1px solid #504945;
  }

  .btn-all-both:hover {
    background: #3c3836;
    border-color: #fabd2f;
    color: #fabd2f;
  }

  /* 退回原稿警告紅按鈕 */
  .btn-rollback {
    background: #cc241d;
    color: #fbf1c7;
    border: 1px solid #9d0006;
  }

  .btn-rollback:hover {
    background: #fb4934;
    box-shadow: 0 2px 6px rgba(251, 73, 52, 0.3);
  }
</style>


