<script lang="ts">
  import type { ReviewChunk, ChunkDecision } from '../lib/editor/chunkReview';

  let {
    chunks = [],
    onUpdateDecision,
  } = $props<{
    chunks: ReviewChunk[];
    onUpdateDecision: (chunkId: string, decision: ChunkDecision) => void;
  }>();
</script>

<div class="chunk-review-container">
  <div class="review-intro">
    <div class="intro-left">
      <span class="intro-icon">📜</span>
      <div>
        <h2 class="intro-title">逐段審核與心智溯源 (Chunk Review)</h2>
        <p class="intro-desc">請逐段檢視您的原始手稿與 AI 提煉成果。您可以隨心決定各段要採納 AI、保留原話或兩者並存。</p>
      </div>
    </div>
    <div class="intro-stats">
      <span class="stat-tag total">共 {chunks.length} 個提煉段落</span>
    </div>
  </div>

  <div class="chunk-cards-stream">
    {#each chunks as chunk, idx (chunk.id)}
      <div class="chunk-card decision-{chunk.decision}">
        <!-- 卡片頂部操作標頭 -->
        <div class="chunk-card-header">
          <div class="chunk-title-group">
            <span class="chunk-index">#{idx + 1}</span>
            <span class="chunk-title">{chunk.title}</span>
          </div>

          <div class="decision-selector">
            {#if chunk.isSummary}
              <button 
                type="button"
                class="decision-btn btn-ai active"
                onclick={() => onUpdateDecision(chunk.id, 'ai')}
                title="核心概要為 AI 濃縮全篇所得之精萃，直接採納"
              >
                <span class="btn-icon">✔</span>
                <span>採納核心概要</span>
              </button>
            {:else}
              <button 
                type="button"
                class="decision-btn btn-ai {chunk.decision === 'ai' ? 'active' : ''}"
                onclick={() => onUpdateDecision(chunk.id, 'ai')}
                title="僅採納 AI 結構化結論"
              >
                <span class="btn-icon">✔</span>
                <span>採納 AI</span>
              </button>

              <button 
                type="button"
                class="decision-btn btn-both {chunk.decision === 'both' ? 'active' : ''}"
                onclick={() => onUpdateDecision(chunk.id, 'both')}
                title="兩者並存：保留 AI 提煉，並於下方附錄原始脈絡引言 (推薦)"
              >
                <span class="btn-icon">📑</span>
                <span>兩者並存 (推薦)</span>
              </button>

              <button 
                type="button"
                class="decision-btn btn-orig {chunk.decision === 'original' ? 'active' : ''}"
                onclick={() => onUpdateDecision(chunk.id, 'original')}
                title="保留原始手稿文字"
              >
                <span class="btn-icon">📜</span>
                <span>保留原文</span>
              </button>
            {/if}
          </div>
        </div>

        <!-- 內容雙欄對照區塊 -->
        <div class="chunk-card-body {chunk.isSummary ? 'is-summary-card' : ''}">
          <!-- 原始手稿區塊 -->
          <div class="text-pane original-pane {chunk.decision === 'original' ? 'is-selected' : ''}">
            <div class="pane-meta">
              <span class="pane-label origin-label">📜 原始速記手稿</span>
              <span class="pane-tip">{chunk.isSummary ? '宏觀總結無單一原句' : '最真實的心智思維與上下文'}</span>
            </div>
            <div class="pane-content origin-text">
              {#if chunk.originalText && chunk.originalText.trim()}
                <pre>{chunk.originalText.trim()}</pre>
              {:else if chunk.isSummary}
                <div class="summary-tip-box">
                  <span class="tip-icon">💡</span>
                  <div class="tip-text">
                    <strong>全篇宏觀總結</strong>
                    <p>此區塊為 AI 深度閱讀全篇筆記後提煉之最高概要，不對應單一特定原始速記段落，可直接採納。</p>
                  </div>
                </div>
              {:else}
                <div class="empty-hint">（此段屬 AI 延伸推展歸納或未檢索到單一強特徵原句）</div>
              {/if}
            </div>
          </div>

          <!-- AI 提煉區塊 -->
          <div class="text-pane ai-pane {chunk.decision === 'ai' || chunk.decision === 'both' ? 'is-selected' : ''}">
            <div class="pane-meta">
              <span class="pane-label ai-label">✨ AI 結構化提煉</span>
              <span class="pane-tip">語法梳理與規格清單</span>
            </div>
            <div class="pane-content ai-text">
              <pre>{chunk.aiText.trim()}</pre>
            </div>
          </div>
        </div>

        <!-- 底部收丹預覽提示 -->
        <div class="chunk-card-footer">
          <span class="footer-status">
            {#if chunk.decision === 'both'}
              <span class="tag-both">📑 入櫃格式：AI 提煉精華 ＋ 文末掛載原始速記脈絡引言</span>
            {:else if chunk.decision === 'ai'}
              <span class="tag-ai">✔ 入櫃格式：僅採用純淨 AI 提煉結論</span>
            {:else}
              <span class="tag-orig">📜 入櫃格式：100% 保留原始手稿，捨棄 AI 潤飾</span>
            {/if}
          </span>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .chunk-review-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
    padding: 24px 20px 60px 20px;
    overflow-y: auto;
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }

  .review-intro {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: #282828;
    border: 1px solid #3c3836;
    border-radius: 8px;
    margin-bottom: 24px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .intro-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .intro-icon {
    font-size: 2rem;
  }

  .intro-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #fabd2f;
    margin: 0 0 4px 0;
  }

  .intro-desc {
    font-size: 0.85rem;
    color: #a89984;
    margin: 0;
  }

  .stat-tag {
    font-size: 0.8rem;
    padding: 4px 10px;
    background: #1d2021;
    color: #d5c4a1;
    border: 1px solid #504945;
    border-radius: 4px;
    font-family: monospace;
  }

  .chunk-cards-stream {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* 段落卡片本體 */
  .chunk-card {
    background: #1d2021;
    border: 1.5px solid #3c3836;
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }

  .chunk-card.decision-both {
    border-color: #fabd2f;
  }

  .chunk-card.decision-ai {
    border-color: #b8bb26;
  }

  .chunk-card.decision-original {
    border-color: #fe8019;
  }

  /* 卡片頂部列 */
  .chunk-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: #282828;
    border-bottom: 1px solid #3c3836;
  }

  .chunk-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .chunk-index {
    background: #1d2021;
    color: #d79921;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-family: monospace;
    font-weight: bold;
    border: 1px solid #504945;
  }

  .chunk-title {
    font-size: 0.98rem;
    font-weight: 700;
    color: #fbf1c7;
  }

  /* 決策切換三合一按鈕 */
  .decision-selector {
    display: flex;
    align-items: center;
    background: #1d2021;
    padding: 3px;
    border-radius: 6px;
    border: 1px solid #504945;
    gap: 4px;
  }

  .decision-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #a89984;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .decision-btn:hover {
    color: #ebdbb2;
    background: #32302f;
  }

  .decision-btn.btn-ai.active {
    background: #b8bb26;
    color: #1d2021;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  }

  .decision-btn.btn-both.active {
    background: #fabd2f;
    color: #1d2021;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  }

  .decision-btn.btn-orig.active {
    background: #fe8019;
    color: #1d2021;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  }

  /* 內容上下/雙欄對照區 */
  .chunk-card-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: #3c3836;
  }

  @media (max-width: 820px) {
    .chunk-card-body {
      grid-template-columns: 1fr;
    }
  }

  .text-pane {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    min-height: 120px;
  }

  .original-pane {
    background: #1b1b1b;
  }

  .ai-pane {
    background: #191c1b;
  }

  .pane-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px dashed #32302f;
  }

  .pane-label {
    font-size: 0.8rem;
    font-weight: 700;
  }

  .origin-label {
    color: #fe8019;
  }

  .ai-label {
    color: #b8bb26;
  }

  .pane-tip {
    font-size: 0.72rem;
    color: #7c6f64;
  }

  .pane-content pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: 'Consolas', 'Fira Code', 'JetBrains Mono', monospace;
    font-size: 0.88rem;
    line-height: 1.6;
    color: #ebdbb2;
  }

  .empty-hint {
    color: #665c54;
    font-style: italic;
    font-size: 0.82rem;
    padding: 12px 0;
  }

  .summary-tip-box {
    display: flex;
    gap: 12px;
    padding: 12px 14px;
    background: rgba(250, 189, 47, 0.08);
    border: 1px dashed rgba(250, 189, 47, 0.3);
    border-radius: 6px;
    margin-top: 4px;
  }

  .summary-tip-box .tip-icon {
    font-size: 1.3rem;
  }

  .summary-tip-box .tip-text strong {
    display: block;
    font-size: 0.85rem;
    color: #fabd2f;
    margin-bottom: 2px;
  }

  .summary-tip-box .tip-text p {
    margin: 0;
    font-size: 0.78rem;
    color: #a89984;
    line-height: 1.45;
  }

  /* 卡片底部狀態列 */
  .chunk-card-footer {
    padding: 6px 16px;
    background: #18191a;
    border-top: 1px solid #282828;
    font-size: 0.76rem;
  }

  .tag-both {
    color: #fabd2f;
    font-weight: 500;
  }

  .tag-ai {
    color: #b8bb26;
    font-weight: 500;
  }

  .tag-orig {
    color: #fe8019;
    font-weight: 500;
  }
</style>
