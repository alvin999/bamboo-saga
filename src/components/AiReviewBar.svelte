<script lang="ts">
  let {
    summary = 'AI 整理結果',
    timestamp = 0,
    additions = 0,
    deletions = 0,
    onAccept,
    onRollback,
    onToggleDiff,
    showDiff = false
  } = $props<{
    summary?: string;
    timestamp?: number;
    additions?: number;
    deletions?: number;
    onAccept: () => void;
    onRollback: () => void;
    onToggleDiff: () => void;
    showDiff: boolean;
  }>();

  const formattedTime = $derived(
    timestamp ? new Date(timestamp).toLocaleTimeString() : ''
  );
</script>

<div class="review-banner">
  <div class="info">
    <span class="sparkle">✨</span>
    <span class="title">已套用 AI 煉丹成果：</span>
    <span class="summary-badge">{summary}</span>
    {#if formattedTime}
      <span class="time-tag">({formattedTime})</span>
    {/if}
    {#if additions > 0 || deletions > 0}
      <div class="stat-pills">
        {#if additions > 0}
          <span class="stat-badge add">+{additions}</span>
        {/if}
        {#if deletions > 0}
          <span class="stat-badge del">-{deletions}</span>
        {/if}
      </div>
    {/if}
  </div>

  <div class="actions">
    <button class="diff-btn {showDiff ? 'active' : ''}" onclick={onToggleDiff} title="切換雙鑑對照與獨卷靜修">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="12" y1="3" x2="12" y2="21"></line>
      </svg>
      <span>{showDiff ? '獨卷靜修' : '雙鑑對照'}</span>
    </button>

    <button class="accept-btn" onclick={onAccept} title="確認以此內容入櫃">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>確認收丹</span>
    </button>

    <button class="rollback-btn" onclick={onRollback} title="Saga 補償機制：100% 無損還原回 AI 整理前的原始手稿">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M1 4v6h6"></path>
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
      </svg>
      <span>一鍵退回原稿 (Rollback)</span>
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

  .stat-pills {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 4px;
  }

  .stat-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 3px;
    font-family: monospace;
  }

  .stat-badge.add {
    background: rgba(184, 187, 38, 0.2);
    color: #b8bb26;
    border: 1px solid rgba(184, 187, 38, 0.35);
  }

  .stat-badge.del {
    background: rgba(251, 73, 52, 0.2);
    color: #fb4934;
    border: 1px solid rgba(251, 73, 52, 0.35);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .diff-btn {
    padding: 4px 10px;
    border-radius: 4px;
    background: #282828;
    border: 1px solid #504945;
    color: #d5c4a1;
    font-size: 0.8rem;
    gap: 6px;
  }

  .diff-btn.active {
    background: #504945;
    color: #fbf1c7;
    border-color: #fabd2f;
  }

  .accept-btn {
    padding: 4px 12px;
    border-radius: 4px;
    background: #b8bb26;
    color: #1d2021;
    font-size: 0.8rem;
    font-weight: 600;
    gap: 6px;
  }

  .accept-btn:hover {
    background: #98971a;
    color: #fbf1c7;
  }

  .rollback-btn {
    padding: 4px 12px;
    border-radius: 4px;
    background: #cc241d;
    color: #fbf1c7;
    font-size: 0.8rem;
    font-weight: 600;
    gap: 6px;
  }

  .rollback-btn:hover {
    background: #fb4934;
  }
</style>
