<script lang="ts">
  let { 
    vimMode = $bindable(false),
    onOpenAi,
    onOpenSettings,
    isSaved = true
  } = $props<{
    vimMode: boolean;
    onOpenAi: () => void;
    onOpenSettings: () => void;
    isSaved: boolean;
  }>();
</script>

<header class="titlebar">
  <div class="brand">
    <span class="icon">🎋</span>
    <span class="title">廣零散</span>
    <span class="sub">bamboo-saga</span>
    <span class="badge" title="IntelliJ 級別防重開機不滅記憶">
      <span class="dot {isSaved ? 'synced' : 'saving'}"></span>
      {isSaved ? '藥帖秒存中' : '落墨入櫃...'}
    </span>
  </div>

  <div class="actions">
    <button 
      class="mode-btn {vimMode ? 'active' : ''}" 
      onclick={() => (vimMode = !vimMode)}
      title="切換 Vim 編輯模式"
    >
      <span class="mode-tag">{vimMode ? 'VIM' : 'STD'}</span>
    </button>

    <button class="pill-btn ai-btn" onclick={onOpenAi} title="開啟 AI 煉丹爐整理思緒">
      <span class="btn-sparkle">✨</span>
      <span>煉丹爐</span>
    </button>

    <button class="icon-btn" onclick={onOpenSettings} title="偏好設定與 API 金鑰">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    </button>
  </div>
</header>

<style>
  .titlebar {
    height: 40px;
    background: #1d2021;
    border-bottom: 1px solid #32302f;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    flex-shrink: 0;
    user-select: none;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .icon {
    font-size: 1.15rem;
  }

  .title {
    font-weight: 700;
    font-size: 0.95rem;
    color: #fbf1c7;
    letter-spacing: 0.05em;
  }

  .sub {
    font-size: 0.75rem;
    color: #928374;
    font-family: var(--font-mono);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    background: #282828;
    border: 1px solid #3c3836;
    border-radius: 12px;
    font-size: 0.72rem;
    color: #a89984;
    margin-left: 8px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .dot.synced {
    background: #b8bb26;
    box-shadow: 0 0 6px #b8bb26;
  }

  .dot.saving {
    background: #fabd2f;
    animation: pulse 0.8s infinite alternate;
  }

  @keyframes pulse {
    from { opacity: 0.3; }
    to { opacity: 1; }
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mode-btn {
    padding: 3px 8px;
    border-radius: 4px;
    background: #282828;
    border: 1px solid #3c3836;
    color: #a89984;
    font-size: 0.75rem;
    font-family: var(--font-mono);
    font-weight: 600;
  }

  .mode-btn.active {
    background: #fe8019;
    color: #1d2021;
    border-color: #fe8019;
  }

  .pill-btn {
    padding: 4px 12px;
    border-radius: 14px;
    font-size: 0.8rem;
    font-weight: 600;
    gap: 6px;
  }

  .ai-btn {
    background: linear-gradient(135deg, #d65d0e, #fe8019);
    color: #1d2021;
    box-shadow: 0 2px 8px rgba(254, 128, 25, 0.25);
  }

  .ai-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(254, 128, 25, 0.4);
  }

  .btn-sparkle {
    font-size: 0.85rem;
  }

  .icon-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    color: #a89984;
  }

  .icon-btn:hover {
    background: #32302f;
    color: #fbf1c7;
  }
</style>
