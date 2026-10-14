<script lang="ts">
  import type { RefineryMode } from '../lib/ai/refinery';
  import type { VimKeyOverrides } from '../types/tab';

  let {
    isOpen = false,
    selectedModel = 'gemini' as 'groq' | 'gemini',
    groqApiKey = '',
    geminiApiKey = '',
    vimOverrides = {
      ctrlS: true,
      ctrlC: true,
      ctrlV: true,
      ctrlA: true,
      ctrlF: true,
      imeWarning: true,
    } as VimKeyOverrides,
    onClose,
    onRefine,
    onSaveSettings
  } = $props<{
    isOpen: boolean;
    selectedModel: 'groq' | 'gemini';
    groqApiKey: string;
    geminiApiKey: string;
    vimOverrides?: VimKeyOverrides;
    onClose: () => void;
    onRefine: (mode: RefineryMode, customPrompt: string) => Promise<void>;
    onSaveSettings: (
      groq: string,
      gemini: string,
      model: 'groq' | 'gemini',
      vimOverrides: VimKeyOverrides
    ) => void;
  }>();

  let activeTab = $state<'refine' | 'settings'>('refine');
  let selectedMode = $state<RefineryMode>('organize');
  let customPrompt = $state('');
  let isRefining = $state(false);
  let errorMsg = $state('');

  let inputGroqKey = $state('');
  let inputGeminiKey = $state('');
  let inputModel = $state<'groq' | 'gemini'>('gemini');
  let inputVimOverrides = $state<VimKeyOverrides>({
    ctrlS: true,
    ctrlC: true,
    ctrlV: true,
    ctrlA: true,
    ctrlF: true,
    imeWarning: true,
  });

  $effect(() => {
    inputGroqKey = groqApiKey;
    inputGeminiKey = geminiApiKey;
    inputModel = selectedModel;
    if (vimOverrides) {
      inputVimOverrides = { ...vimOverrides };
    }
  });

  async function handleExecuteSpecific(mode: RefineryMode) {
    selectedMode = mode;
    isRefining = true;
    errorMsg = '';
    try {
      await onRefine(mode, customPrompt);
      onClose();
    } catch (e: any) {
      errorMsg = e.message || '煉丹失敗，請檢查網路連線或 API 金鑰';
    } finally {
      isRefining = false;
    }
  }

  function handleSaveSettings() {
    onSaveSettings(
      inputGroqKey.trim(),
      inputGeminiKey.trim(),
      inputModel,
      $state.snapshot(inputVimOverrides)
    );
    activeTab = 'refine';
  }
</script>

{#if isOpen}
  <div class="modal-backdrop" onclick={onClose} role="presentation">
    <div 
      class="modal-box" 
      onclick={(e) => e.stopPropagation()} 
      role="dialog" 
      aria-modal="true" 
      tabindex="-1"
      onkeydown={(e) => e.key === 'Escape' && onClose()}
    >
      <!-- 包浩斯形上學頂部導航 -->
      <header class="modal-header">
        <div class="header-left">
          <span class="pulse-cinnabar"></span>
          <span class="engine-title">煉丹爐 // SAGATECH ENGINE</span>
          <span class="engine-badge">DOT-SYS v2.5</span>
        </div>

        <div class="header-nav">
          <button 
            class="tab-btn {activeTab === 'refine' ? 'active' : ''}" 
            onclick={() => (activeTab = 'refine')}
          >
            煉丹樞紐
          </button>
          <button 
            class="tab-btn {activeTab === 'settings' ? 'active' : ''}" 
            onclick={() => (activeTab = 'settings')}
          >
            金鑰與偏好
          </button>
          <button class="esc-btn" onclick={onClose} title="關閉視窗 (ESC)">
            [ ESC ]
          </button>
        </div>
      </header>

      {#if errorMsg}
        <div class="error-banner">
          <span>⚠️ {errorMsg}</span>
        </div>
      {/if}

      {#if activeTab === 'refine'}
        <div class="modal-body refine-body">
          <p class="philosophy-quote">
            「無須複雜旋鈕，AI 智能感應全文上下文，萃取結論、待辦事項與核心代碼架構。」
          </p>

          <!-- Bauhaus Metaphysica 三欄矩陣卡片 -->
          <div class="matrix-grid">
            <div 
              class="matrix-card {selectedMode === 'organize' ? 'selected' : ''}"
              onclick={() => handleExecuteSpecific('organize')}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && handleExecuteSpecific('organize')}
            >
              <div class="card-head">
                <span class="step-tag tag-cinnabar">[ 01 // 凝練 ]</span>
                <h4 class="card-title">結構化結論</h4>
              </div>
              <p class="card-desc">自動提煉會議要點、脈絡綱領與決策結論</p>
            </div>

            <div 
              class="matrix-card {selectedMode === 'action_items' ? 'selected' : ''}"
              onclick={() => handleExecuteSpecific('action_items')}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && handleExecuteSpecific('action_items')}
            >
              <div class="card-head">
                <span class="step-tag tag-ochre">[ 02 // 析理 ]</span>
                <h4 class="card-title">待辦矩陣化</h4>
              </div>
              <p class="card-desc">識別 TODO、FIXME 與行動項目，轉換為排程工單</p>
            </div>

            <div 
              class="matrix-card {selectedMode === 'code_refactor' ? 'selected' : ''}"
              onclick={() => handleExecuteSpecific('code_refactor')}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && handleExecuteSpecific('code_refactor')}
            >
              <div class="card-head">
                <span class="step-tag tag-olive">[ 03 // 淨心 ]</span>
                <h4 class="card-title">代碼語法補正</h4>
              </div>
              <p class="card-desc">排版校對、Markdown 標籤補齊與智能命名對齊</p>
            </div>
          </div>

          <!-- 自訂指令輸入框 -->
          <div class="custom-prompt-section">
            <label class="prompt-label" for="custom-input">自訂煉丹心法 (可選)：</label>
            <input 
              id="custom-input"
              type="text" 
              class="prompt-input" 
              placeholder="例：改以古風駢文總結 / 著重在資安漏洞分析..." 
              bind:value={customPrompt}
            />
          </div>

          <!-- 底部指標與全自動成丹 -->
          <footer class="modal-footer">
            <div class="telemetry">
              <span class="telemetry-dot"></span>
              <span class="telemetry-text">LATENCY: 42MS • SAGA-CORE ({selectedModel.toUpperCase()})</span>
            </div>

            <button 
              class="auto-refine-btn" 
              disabled={isRefining}
              onclick={() => handleExecuteSpecific(selectedMode)}
            >
              {#if isRefining}
                <span class="spinner">⏳</span>
                <span>煉丹運算中...</span>
              {:else}
                <span class="fire-dot"></span>
                <span>一鍵全自動成丹</span>
              {/if}
            </button>
          </footer>
        </div>
      {:else}
        <!-- 偏好設定與金鑰配置 -->
        <div class="modal-body settings-body">
          <div class="form-group">
            <label class="form-label" for="model-select">核心推論引擎</label>
            <select id="model-select" class="form-select" bind:value={inputModel}>
              <option value="gemini">Google Gemini 1.5 Flash (大文本上下文推薦)</option>
              <option value="groq">Groq Llama 3 70B (超極速推論)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="gemini-key">Gemini API Key</label>
            <input 
              id="gemini-key"
              type="password" 
              class="form-input" 
              placeholder="AIzaSy..." 
              bind:value={inputGeminiKey} 
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="groq-key">Groq API Key</label>
            <input 
              id="groq-key"
              type="password" 
              class="form-input" 
              placeholder="gsk_..." 
              bind:value={inputGroqKey} 
            />
          </div>

          <div class="form-group">
            <span class="form-label">Vim 模式快捷鍵攔截覆蓋 (避免與常用系統鍵衝突)</span>
            <div class="overrides-grid">
              <label class="override-item">
                <input type="checkbox" bind:checked={inputVimOverrides.ctrlS} />
                <span>Ctrl+S 立即存檔</span>
              </label>
              <label class="override-item">
                <input type="checkbox" bind:checked={inputVimOverrides.ctrlC} />
                <span>Ctrl+C 系統剪貼簿</span>
              </label>
              <label class="override-item">
                <input type="checkbox" bind:checked={inputVimOverrides.ctrlV} />
                <span>Ctrl+V 系統貼上</span>
              </label>
              <label class="override-item">
                <input type="checkbox" bind:checked={inputVimOverrides.ctrlA} />
                <span>Ctrl+A 全選</span>
              </label>
              <label class="override-item">
                <input type="checkbox" bind:checked={inputVimOverrides.ctrlF} />
                <span>Ctrl+F 搜尋</span>
              </label>
              <label class="override-item">
                <input type="checkbox" bind:checked={inputVimOverrides.imeWarning} />
                <span>中文注音防呆告警</span>
              </label>
            </div>
          </div>

          <footer class="modal-footer">
            <button class="save-settings-btn" onclick={handleSaveSettings}>
              💾 保存偏好設定
            </button>
          </footer>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .modal-box {
    width: 100%;
    max-width: 680px;
    background: #141615;
    border: 1px solid #504534;
    border-radius: 8px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.9);
    overflow: hidden;
    font-family: var(--font-mono, monospace);
    animation: modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes modal-pop {
    from { transform: scale(0.96); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  .modal-header {
    height: 50px;
    padding: 0 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(80, 69, 52, 0.45);
    background: #191c1a;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pulse-cinnabar {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #c95847;
    box-shadow: 0 0 8px #c95847;
    animation: pulse 1s infinite alternate;
  }

  @keyframes pulse {
    from { opacity: 0.4; }
    to { opacity: 1; }
  }

  .engine-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: #ece7dc;
    letter-spacing: 0.08em;
  }

  .engine-badge {
    font-size: 0.65rem;
    padding: 1px 6px;
    border-radius: 3px;
    background: #242220;
    color: #b59e72;
    border: 1px solid #504534;
  }

  .header-nav {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tab-btn {
    padding: 4px 10px;
    border-radius: 4px;
    background: transparent;
    border: 1px solid transparent;
    color: #938c80;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab-btn:hover {
    color: #ece7dc;
  }

  .tab-btn.active {
    background: #242220;
    border-color: #504534;
    color: #d49b35;
    font-weight: 600;
  }

  .esc-btn {
    padding: 2px 7px;
    background: #0e0e0e;
    border: 1px solid #504534;
    border-radius: 4px;
    color: #938c80;
    font-size: 0.68rem;
    cursor: pointer;
  }

  .esc-btn:hover {
    color: #ece7dc;
    border-color: #d49b35;
  }

  .error-banner {
    padding: 8px 18px;
    background: rgba(201, 88, 71, 0.18);
    border-bottom: 1px solid #c95847;
    color: #ffb4ab;
    font-size: 0.75rem;
  }

  .modal-body {
    padding: 20px 22px;
  }

  .philosophy-quote {
    color: #b59e72;
    font-size: 0.78rem;
    line-height: 1.6;
    margin: 0 0 16px 0;
    font-style: italic;
  }

  /* 三欄矩陣卡片 */
  .matrix-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 18px;
  }

  .matrix-card {
    background: #1f2020;
    border: 1px solid #504534;
    border-radius: 6px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .matrix-card:hover {
    background: #292a2a;
    border-color: #d49b35;
    transform: translateY(-1px);
  }

  .matrix-card.selected {
    border-color: #d49b35;
    background: rgba(212, 155, 53, 0.12);
  }

  .card-head {
    margin-bottom: 8px;
  }

  .step-tag {
    font-size: 0.68rem;
    font-weight: 700;
    display: block;
    margin-bottom: 4px;
  }

  .tag-cinnabar { color: #c95847; }
  .tag-ochre { color: #d49b35; }
  .tag-olive { color: #869b74; }

  .card-title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: #ece7dc;
  }

  .card-desc {
    margin: 0;
    font-size: 0.68rem;
    color: #938c80;
    line-height: 1.5;
  }

  .custom-prompt-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 20px;
  }

  .prompt-label {
    font-size: 0.72rem;
    color: #938c80;
  }

  .prompt-input {
    width: 100%;
    height: 34px;
    background: #0e0e0e;
    border: 1px solid #504534;
    border-radius: 4px;
    padding: 0 10px;
    color: #ece7dc;
    font-size: 0.78rem;
    font-family: var(--font-mono, monospace);
    outline: none;
  }

  .prompt-input:focus {
    border-color: #d49b35;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 14px;
    border-top: 1px solid rgba(80, 69, 52, 0.35);
  }

  .telemetry {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.68rem;
    color: #868074;
  }

  .telemetry-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #c95847;
  }

  .auto-refine-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 16px;
    background: #d49b35;
    border: 1px solid #d49b35;
    border-radius: 20px;
    color: #141615;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .auto-refine-btn:hover:not(:disabled) {
    background: #fabd2f;
    box-shadow: 0 0 14px rgba(212, 155, 53, 0.6);
  }

  .fire-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #c95847;
  }

  /* 設定頁籤樣式 */
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }

  .form-label {
    font-size: 0.72rem;
    color: #ece7dc;
  }

  .form-input, .form-select {
    height: 34px;
    background: #0e0e0e;
    border: 1px solid #504534;
    border-radius: 4px;
    padding: 0 10px;
    color: #ece7dc;
    font-size: 0.78rem;
    font-family: var(--font-mono, monospace);
    outline: none;
  }

  .form-input:focus, .form-select:focus {
    border-color: #d49b35;
  }

  .overrides-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-top: 4px;
  }

  .override-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.72rem;
    color: #938c80;
    cursor: pointer;
  }

  .save-settings-btn {
    width: 100%;
    height: 34px;
    background: #1f2020;
    border: 1px solid #d49b35;
    color: #d49b35;
    border-radius: 4px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
  }

  .save-settings-btn:hover {
    background: #d49b35;
    color: #141615;
  }
</style>
