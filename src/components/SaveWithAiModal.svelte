<script lang="ts">
  import { tick } from 'svelte';
  import { Save, Folder, Sparkles, X, Check, Loader2, RefreshCw } from 'lucide-svelte';
  import type { TabItem, AiProvider } from '../types/tab';
  import {
    recommendSaveLocation,
    generateHeuristicRecommendation,
    type SaveRecommendationResult
  } from '../lib/ai/saveRecommender';
  import { pickVaultFolder } from '../lib/storage/fsBridge';
  import { loadSecureKeys } from '../lib/security/keyVault';

  interface SaveWithAiModalProps {
    isOpen: boolean;
    tab: TabItem | null;
    recentFolders: string[];
    directorySkeleton?: string[];
    groqKey: string;
    geminiKey: string;
    customKey?: string;
    customEndpoint?: string;
    modelPreference?: AiProvider;
    modelId?: string;
    onConfirmSave: (targetDir: string, fileName: string) => Promise<void>;
    onClose: () => void;
  }

  let {
    isOpen = false,
    tab = null,
    recentFolders = [],
    directorySkeleton = [],
    groqKey = '',
    geminiKey = '',
    customKey = '',
    customEndpoint = '',
    modelPreference = 'groq',
    modelId = '',
    onConfirmSave,
    onClose
  }: SaveWithAiModalProps = $props();


  let targetFileName = $state('');
  let targetFolder = $state('');
  let isAnalyzing = $state(false);
  let isSaving = $state(false);
  let recommendation = $state<SaveRecommendationResult | null>(null);
  let hasUserEditedName = $state(false);
  let hasUserEditedFolder = $state(false);
  let rejectedFilenames = $state<string[]>([]);
  let rejectedFolders = $state<string[]>([]);

  let inputEl = $state<HTMLInputElement | null>(null);
  let prevIsOpen = false;

  // 當彈窗剛由關閉轉為開啟時，僅初始化一次 AI 推薦流程（防止 Svelte 5 effect 循環觸發）
  $effect(() => {
    if (isOpen && !prevIsOpen && tab) {
      hasUserEditedName = false;
      hasUserEditedFolder = false;
      isSaving = false;
      rejectedFilenames = [];
      rejectedFolders = [];

      // 1. 立即以本地啟發式預設檔名與路徑（零延遲，使用者可立即敲 Enter 存檔）
      const heuristic = generateHeuristicRecommendation(tab.content, tab.language, recentFolders);
      targetFileName = tab.title && tab.title !== '新散帖' && !tab.title.startsWith('散帖 #')
        ? (tab.title.includes('.') ? tab.title : `${tab.title}.${heuristic.extension}`)
        : heuristic.recommendedFilename;
      targetFolder = recentFolders.length > 0 ? recentFolders[0].replace(/\\+/g, '/') : '';
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

      // 2. 啟動背景 AI 推薦（若有金鑰或可從保險庫異步讀取）
      fetchAiRecommendation(false);
    }
    prevIsOpen = isOpen;
  });

  async function handleRetryRecommendation() {
    if (isAnalyzing || !tab) return;

    // 將前次建議的主檔名、備選檔名與當前輸入欄位納入排除清單
    if (recommendation) {
      const candidates = [
        recommendation.recommendedFilename,
        ...(recommendation.alternativeFilenames || []),
        targetFileName.trim()
      ].filter(Boolean);
      rejectedFilenames = Array.from(new Set([...rejectedFilenames, ...candidates]));

      if (recommendation.recommendedFolder) {
        rejectedFolders = Array.from(new Set([...rejectedFolders, recommendation.recommendedFolder]));
      }
    }

    // 重新分析時重置編輯標記，使全新 AI 建議能直接套入
    hasUserEditedName = false;
    await fetchAiRecommendation(true);
  }

  async function fetchAiRecommendation(isRetry = false) {
    if (!tab) return;

    let activeGroq = groqKey;
    let activeGemini = geminiKey;
    let activeCustomKey = customKey;
    let activeCustomEndpoint = customEndpoint;
    let activeModel: AiProvider = modelPreference;
    let activeModelId = modelId;

    // 若傳入的金鑰為空，主動從本機安全保險庫異步讀取一次，消除時序差
    if (!activeGroq && !activeGemini && activeModel !== 'custom') {
      try {
        const sec = await loadSecureKeys();
        if (sec.groqKey) activeGroq = sec.groqKey;
        if (sec.geminiKey) activeGemini = sec.geminiKey;
        if (sec.customKey) activeCustomKey = sec.customKey;
        if (sec.customEndpoint) activeCustomEndpoint = sec.customEndpoint;
        if (sec.selectedModel) activeModel = sec.selectedModel;
        if (sec.selectedModelId) activeModelId = sec.selectedModelId;
      } catch (e) {
        console.warn('[SaveWithAiModal] 讀取保險庫金鑰備援失敗：', e);
      }
    }

    if (!activeGroq && !activeGemini && activeModel !== 'custom') {
      return; // 確實未設定金鑰且非本地端點，維持本地啟發式推薦
    }

    isAnalyzing = true;
    try {
      const res = await recommendSaveLocation({
        content: tab.content,
        language: tab.language,
        currentTitle: tab.title,
        recentFolders,
        directorySkeleton,
        model: activeModel,
        modelId: activeModelId,
        groqKey: activeGroq,
        geminiKey: activeGemini,
        customKey: activeCustomKey,
        customEndpoint: activeCustomEndpoint,
        excludeFilenames: rejectedFilenames,
        excludeFolders: rejectedFolders,
        isRetry,
      });

      recommendation = res;
      // 若使用者尚未自行手動修改過檔名或資料夾，自動採用 AI 智薦結果
      if (!hasUserEditedName) {
        targetFileName = res.recommendedFilename;
      }
      if (!hasUserEditedFolder && res.recommendedFolder) {
        targetFolder = res.recommendedFolder.replace(/\\+/g, '/');
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

  function handleSelectFolder(folderPath: string) {
    targetFolder = folderPath.replace(/\\+/g, '/');
    hasUserEditedFolder = true;
  }

  async function handleBrowseFolder() {
    try {
      const selected = await pickVaultFolder();
      if (selected) {
        targetFolder = selected.replace(/\\+/g, '/');
        hasUserEditedFolder = true;
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
            <div class="label-left">
              <label for="save-filename">檔案名稱</label>
              {#if isAnalyzing}
                <span class="tip-text">✨ 正在分析脈絡與最佳落點...</span>
              {:else if recommendation?.reason}
                <span class="reason-text" title={recommendation.reason}>
                  💡 {recommendation.reason}
                </span>
              {/if}
            </div>
            <button
              type="button"
              class="btn-retry-analysis"
              onclick={handleRetryRecommendation}
              disabled={isAnalyzing}
              title="排除先前建議，重新呼叫 AI 提煉新命名與落點目錄"
            >
              <RefreshCw size={13} class={isAnalyzing ? 'spin' : ''} />
              <span>{isAnalyzing ? '分析中...' : '重新 AI 分析'}</span>
            </button>
          </div>
          <div class="input-wrap">
            <input
              id="save-filename"
              bind:this={inputEl}
              type="text"
              bind:value={targetFileName}
              oninput={() => { hasUserEditedName = true; }}
              onkeydown={handleKeyDown}
              placeholder="例如：[藥帖] - 定志清心散配伍要訣.md"
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

          <!-- AI 推薦本機備選目錄 -->
          {#if recommendation?.alternativeFolders && recommendation.alternativeFolders.length > 0}
            <div class="recent-folders-chips ai-alt-folders">
              <span class="alt-label">✨ AI 候選子閣：</span>
              {#each recommendation.alternativeFolders as altDir}
                <button
                  type="button"
                  class="folder-chip ai-chip"
                  class:active={targetFolder === altDir}
                  onclick={() => handleSelectFolder(altDir)}
                  title={`切換存入此目錄：${altDir}`}
                >
                  📁 {altDir.split(/[/\\]/).filter(Boolean).pop() || altDir}
                </button>
              {/each}
            </div>
          {/if}

          <!-- 最近常用洞天目錄捷徑 -->
          {#if recentFolders && recentFolders.length > 0}
            <div class="recent-folders-chips">
              <span class="alt-label">常用洞天：</span>
              {#each recentFolders.slice(0, 3) as folder}
                <button
                  type="button"
                  class="folder-chip"
                  class:active={targetFolder === folder.replace(/\\+/g, '/')}
                  onclick={() => handleSelectFolder(folder)}
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
    gap: 8px;
    font-size: 0.8rem;
  }

  .label-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .btn-retry-analysis {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: rgba(250, 189, 47, 0.12);
    border: 1px solid rgba(250, 189, 47, 0.35);
    color: #fabd2f;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 0.74rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .btn-retry-analysis:hover:not(:disabled) {
    background: rgba(250, 189, 47, 0.25);
    border-color: #fabd2f;
    transform: translateY(-1px);
  }

  .btn-retry-analysis:disabled {
    opacity: 0.55;
    cursor: not-allowed;
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

  .folder-chip.ai-chip {
    background: rgba(184, 187, 38, 0.12);
    border-color: rgba(184, 187, 38, 0.4);
    color: #b8bb26;
    font-weight: 600;
  }

  .folder-chip.ai-chip:hover, .folder-chip.ai-chip.active {
    background: #b8bb26;
    color: #1d2021;
    border-color: #b8bb26;
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
