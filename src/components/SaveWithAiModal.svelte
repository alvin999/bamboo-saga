<script lang="ts">
  import { tick } from 'svelte';
  import { Save, Folder, Sparkles, X, Check, Loader2, RefreshCw } from 'lucide-svelte';
  import type { TabItem } from '../types/tab';
  import {
    recommendSaveLocation,
    generateHeuristicRecommendation,
    type SaveRecommendationResult
  } from '../lib/ai/saveRecommender';
  import { pickVaultFolder } from '../lib/storage/fsBridge';

  let {
    isOpen = false,
    tab = null,
    recentFolders = [],
    groqKey = '',
    geminiKey = '',
    modelPreference = 'groq',
    modelId = '',
    onConfirmSave,
    onClose
  } = $props<{
    isOpen: boolean;
    tab: TabItem | null;
    recentFolders: string[];
    groqKey: string;
    geminiKey: string;
    modelPreference?: 'groq' | 'gemini';
    modelId?: string;
    onConfirmSave: (targetDir: string, fileName: string) => Promise<void>;
    onClose: () => void;
  }>();

  let targetFileName = $state('');
  let targetFolder = $state('');
  let isAnalyzing = $state(false);
  let isSaving = $state(false);
  let recommendation = $state<SaveRecommendationResult | null>(null);
  let hasUserEditedName = $state(false);

  let inputEl = $state<HTMLInputElement | null>(null);

  // 當彈窗開啟時，啟動 AI 推薦流程
  $effect(() => {
    if (isOpen && tab) {
      hasUserEditedName = false;
      isSaving = false;

      // 1. 立即以本地啟發式預設檔名與路徑（零延遲，使用者可立即敲 Enter 存檔）
      const heuristic = generateHeuristicRecommendation(tab.content, tab.language, recentFolders);
      targetFileName = tab.title && tab.title !== '新散帖' && !tab.title.startsWith('散帖 #')
        ? (tab.title.includes('.') ? tab.title : `${tab.title}.${heuristic.extension}`)
        : heuristic.recommendedFilename;
      targetFolder = recentFolders.length > 0 ? recentFolders[0] : '';
      recommendation = heuristic;

      // 自動選取檔名文字（不包含副檔名），方便直接手打覆蓋
      tick().then(() => {
        if (inputEl) {
          inputEl.focus();
          const dotIdx = targetFileName.lastIndexOf('.');
          if (dotIdx > 0) {
            inputEl.setSelectionRange(0, dotIdx);
          } else {
            inputEl.select();
          }
        }
      });

      // 2. 若有設定 AI Key，在背景極速提煉更精確的語意檔名
      if (groqKey || geminiKey) {
        fetchAiRecommendation();
      }
    }
  });

  async function fetchAiRecommendation() {
    if (!tab) return;
    isAnalyzing = true;
    try {
      const res = await recommendSaveLocation({
        content: tab.content,
        language: tab.language,
        currentTitle: tab.title,
        recentFolders,
        model: modelPreference,
        modelId,
        groqKey,
        geminiKey,
      });

      recommendation = res;
      // 若使用者尚未自行手動修改過檔名，則平滑更新為 AI 推薦的更精確檔名
      if (!hasUserEditedName) {
        targetFileName = res.recommendedFilename;
        if (res.recommendedFolder && !targetFolder) {
          targetFolder = res.recommendedFolder;
        }
      }
    } catch (err) {
      console.warn('[SaveWithAiModal] AI 推薦失敗，保留本地啟發式檔名：', err);
    } finally {
      isAnalyzing = false;
    }
  }

  function handleSelectAlternative(name: string) {
    targetFileName = name;
    hasUserEditedName = true;
    inputEl?.focus();
  }

  async function handleBrowseFolder() {
    try {
      const selected = await pickVaultFolder();
      if (selected) {
        targetFolder = selected;
      }
    } catch (err) {
      console.error('[SaveWithAiModal] 挑選資料夾失敗:', err);
    }
  }

  async function handleConfirm() {
    if (!targetFileName.trim() || isSaving) return;
    if (!targetFolder.trim()) {
      alert('請先指定或瀏覽選取儲存目錄！');
      return;
    }

    isSaving = true;
    try {
      await onConfirmSave(targetFolder.trim(), targetFileName.trim());
      onClose();
    } catch (err: any) {
      alert(`存檔失敗：${err?.message || err}`);
    } finally {
      isSaving = false;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }
</script>

{#if isOpen}
  <div
    class="modal-backdrop"
    onclick={onClose}
    onkeydown={handleKeyDown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal-card"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="document"
      tabindex="-1"
    >
      <div class="modal-header">
        <div class="title-wrap">
          <Save size={18} class="header-icon" />
          <h3>存為本機檔案 (AI 智薦歸檔)</h3>
          {#if isAnalyzing}
            <span class="ai-badge pulse">
              <Loader2 size={12} class="spin" />
              AI 提煉命名中...
            </span>
          {:else if recommendation?.isAiGenerated}
            <span class="ai-badge">
              <Sparkles size={12} />
              AI 最佳命名
            </span>
          {/if}
        </div>
        <button class="close-btn" onclick={onClose} title="關閉 (Esc)">
          <X size={16} />
        </button>
      </div>

      <p class="subtitle">
        將此隨手散帖落實為本機實體檔案。按下 <kbd>Enter</kbd> 即可立即保存並納入即時同步追蹤。
      </p>

      <div class="form-body">
        <!-- 檔名輸入區 -->
        <div class="form-group">
          <div class="label-row">
            <label for="save-filename">檔案名稱</label>
            {#if isAnalyzing}
              <span class="tip-text">正在分析脈絡...</span>
            {:else if recommendation?.reason}
              <span class="reason-text" title={recommendation.reason}>
                💡 {recommendation.reason}
              </span>
            {/if}
          </div>
          <div class="input-wrap">
            <input
              id="save-filename"
              bind:this={inputEl}
              type="text"
              bind:value={targetFileName}
              oninput={() => { hasUserEditedName = true; }}
              onkeydown={handleKeyDown}
              placeholder="例如：2026-10-16_meeting_notes.md"
            />
          </div>

          <!-- 候選檔名 Chips -->
          {#if recommendation && recommendation.alternativeFilenames.length > 0}
            <div class="alternatives-row">
              <span class="alt-label">備選建議：</span>
              {#each recommendation.alternativeFilenames as alt}
                <button
                  type="button"
                  class="alt-chip"
                  onclick={() => handleSelectAlternative(alt)}
                  title="點擊套用此檔名"
                >
                  {alt}
                </button>
              {/each}
              {#if !isAnalyzing && (groqKey || geminiKey)}
                <button
                  type="button"
                  class="retry-btn"
                  onclick={fetchAiRecommendation}
                  title="重新呼叫 AI 提煉命名"
                >
                  <RefreshCw size={11} />
                </button>
              {/if}
            </div>
          {/if}
        </div>

        <!-- 儲存資料夾路徑 -->
        <div class="form-group">
          <label for="save-folder">儲存目標目錄</label>
          <div class="folder-row">
            <div class="input-wrap folder-input-wrap">
              <Folder size={15} class="folder-icon" />
              <input
                id="save-folder"
                type="text"
                bind:value={targetFolder}
                placeholder="例如：C:\Users\xd\DevLab\docs"
                onkeydown={handleKeyDown}
              />
            </div>
            <button
              type="button"
              class="btn-browse"
              onclick={handleBrowseFolder}
              title="挑選本機資料夾"
            >
              📂 瀏覽...
            </button>
          </div>

          <!-- 最近資料夾捷徑 -->
          {#if recentFolders && recentFolders.length > 0}
            <div class="recent-folders-chips">
              <span class="alt-label">常用目錄：</span>
              {#each recentFolders.slice(0, 3) as folder}
                <button
                  type="button"
                  class="folder-chip"
                  class:active={targetFolder === folder}
                  onclick={() => { targetFolder = folder; }}
                  title={folder}
                >
                  {folder.split(/[/\\]/).filter(Boolean).pop() || folder}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-cancel" onclick={onClose} disabled={isSaving}>取消 (Esc)</button>
        <button
          class="btn-confirm"
          onclick={handleConfirm}
          disabled={!targetFileName.trim() || !targetFolder.trim() || isSaving}
        >
          {#if isSaving}
            <Loader2 size={15} class="spin" />
            寫入硬碟中...
          {:else}
            <Check size={15} />
            確認存檔 (Enter)
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(29, 32, 33, 0.82);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1200;
  }

  .modal-card {
    background: #282828;
    border: 1px solid #504945;
    border-radius: 8px;
    width: 540px;
    max-width: 92vw;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
    padding: 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  :global(.header-icon) {
    color: #fabd2f;
  }

  h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: #ebdbb2;
  }

  .ai-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    padding: 2px 7px;
    border-radius: 4px;
    background: rgba(184, 187, 38, 0.15);
    color: #b8bb26;
    border: 1px solid rgba(184, 187, 38, 0.3);
  }

  .ai-badge.pulse {
    background: rgba(250, 189, 47, 0.15);
    color: #fabd2f;
    border-color: rgba(250, 189, 47, 0.3);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #a89984;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .close-btn:hover {
    color: #ebdbb2;
    background: #3c3836;
  }

  .subtitle {
    margin: 0;
    font-size: 0.82rem;
    color: #a89984;
    line-height: 1.45;
  }

  kbd {
    background: #3c3836;
    border: 1px solid #504945;
    border-radius: 3px;
    padding: 1px 5px;
    font-family: inherit;
    font-size: 0.78rem;
    color: #fabd2f;
  }

  .form-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.8rem;
  }

  label {
    font-weight: 500;
    color: #d5c4a1;
  }

  .reason-text {
    color: #b8bb26;
    font-size: 0.75rem;
    max-width: 320px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tip-text {
    color: #fabd2f;
    font-size: 0.75rem;
  }

  .input-wrap {
    background: #1d2021;
    border: 1px solid #504945;
    border-radius: 5px;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .input-wrap:focus-within {
    border-color: #fabd2f;
  }

  input[type='text'] {
    width: 100%;
    background: transparent;
    border: none;
    padding: 9px 12px;
    color: #ebdbb2;
    font-size: 0.88rem;
    outline: none;
    font-family: inherit;
    box-sizing: border-box;
  }

  .alternatives-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 3px;
  }

  .alt-label {
    font-size: 0.72rem;
    color: #928374;
  }

  .alt-chip {
    background: #32302f;
    border: 1px solid #504945;
    color: #d5c4a1;
    font-size: 0.73rem;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .alt-chip:hover {
    background: #3c3836;
    color: #fabd2f;
    border-color: #fabd2f;
  }

  .retry-btn {
    background: transparent;
    border: none;
    color: #928374;
    cursor: pointer;
    padding: 2px 4px;
    display: flex;
    align-items: center;
    border-radius: 3px;
  }

  .retry-btn:hover {
    color: #ebdbb2;
    background: #3c3836;
  }

  .folder-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .folder-input-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    padding-left: 10px;
  }

  :global(.folder-icon) {
    color: #d79921;
    flex-shrink: 0;
  }

  .btn-browse {
    background: #3c3836;
    border: 1px solid #504945;
    color: #ebdbb2;
    padding: 8px 12px;
    border-radius: 5px;
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .btn-browse:hover {
    background: #504945;
    color: #fbf1c7;
    border-color: #665c54;
  }

  .recent-folders-chips {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 3px;
  }

  .folder-chip {
    background: #32302f;
    border: 1px solid #504945;
    color: #a89984;
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .folder-chip:hover, .folder-chip.active {
    background: #3c3836;
    color: #fabd2f;
    border-color: #d79921;
  }

  .modal-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 4px;
  }

  .btn-cancel {
    background: #3c3836;
    border: 1px solid #504945;
    color: #d5c4a1;
    padding: 8px 14px;
    border-radius: 5px;
    font-size: 0.82rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-cancel:hover {
    background: #504945;
    color: #ebdbb2;
  }

  .btn-confirm {
    background: #cc241d;
    border: 1px solid #9d0006;
    color: #fbf1c7;
    padding: 8px 16px;
    border-radius: 5px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s;
  }

  .btn-confirm:hover:not(:disabled) {
    background: #fb4934;
    box-shadow: 0 0 10px rgba(251, 73, 52, 0.35);
  }

  .btn-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global(.spin) {
    animation: rotate 1s linear infinite;
  }

  @keyframes rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
