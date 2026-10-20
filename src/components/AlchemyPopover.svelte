<script lang="ts">
  import type { AlchemyCardConfig, TabItem } from '../types/tab';
  import { getDefaultAlchemyCards } from '../lib/storage/vault';
  import { Sparkles, Plus, Trash2, Pin, PinOff, Settings, Check, ArrowRight, X, Flame, Pencil, RotateCcw, AlertCircle } from 'lucide-svelte';

  let {
    activeTab = null,
    alchemyCards = {},
    isRefining = false,
    onExecuteRefine,
    onSaveAlchemyCards,
    onOpenSettings,
    onShowToast,
    isOpen = $bindable(false)
  } = $props<{
    activeTab: TabItem | null;
    alchemyCards: Record<string, AlchemyCardConfig>;
    isRefining?: boolean;
    onExecuteRefine: (mode: string, customPrompt: string, cardPrompt?: string) => Promise<void>;
    onSaveAlchemyCards?: (cards: Record<string, AlchemyCardConfig>) => void;
    onOpenSettings?: () => void;
    onShowToast?: (msg: string) => void;
    isOpen?: boolean;
  }>();

  let isPinned = $state(false);
  let closeTimer: number | null = null;
  let customPrompt = $state('');
  let isAddingNew = $state(false);

  // 恢復預設的兩階段二次確認狀態
  let isConfirmingReset = $state(false);
  let resetConfirmTimer: number | null = null;

  // 正在編輯的丹方 ID
  let editingCardId = $state<string | null>(null);

  // 編輯/新增丹方的表單狀態
  let formTitle = $state('');
  let formTag = $state('');
  let formDesc = $state('');
  let formColor = $state('cinnabar');
  let formPrompt = $state('');

  const colorOptions = [
    { id: 'cinnabar', label: '朱砂赤', color: '#cc241d' },
    { id: 'ochre', label: '黃赭石', color: '#d79921' },
    { id: 'olive', label: '竹墨綠', color: '#98971a' },
    { id: 'sapphire', label: '青金藍', color: '#458588' },
    { id: 'amethyst', label: '紫晶檀', color: '#b16286' }
  ];

  // 取得所有丹方清單陣列
  const cardList = $derived(Object.values(alchemyCards) as AlchemyCardConfig[]);

  // 處理滑鼠進入
  function handleMouseEnter() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    isOpen = true;
  }

  // 處理滑鼠移出（延遲收合）
  function handleMouseLeave() {
    // 若處於鎖定狀態、正在新增或正在編輯丹方，不自動關閉
    if (isPinned || isAddingNew || editingCardId) return;
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      isOpen = false;
    }, 320); // 320ms 延遲收合
  }

  // 點擊觸發按鈕
  function handleTriggerClick() {
    if (!isOpen) {
      isOpen = true;
      isPinned = true;
    } else {
      if (isPinned) {
        isOpen = false;
        isPinned = false;
        isAddingNew = false;
        editingCardId = null;
      } else {
        isPinned = true;
      }
    }
  }

  // 執行提煉
  async function triggerRefine(card: AlchemyCardConfig) {
    if (editingCardId === card.id) return; // 編輯中不觸發執行
    if (!activeTab) {
      onShowToast?.('⚠️ 尚未選取任何藥帖分頁');
      return;
    }
    if (isRefining) return;

    try {
      if (!isPinned && !editingCardId && !isAddingNew) {
        isOpen = false;
      }
      await onExecuteRefine(card.id, customPrompt.trim(), card.systemPrompt);
      customPrompt = ''; // 執行後清空補充心法
    } catch (e: any) {
      onShowToast?.(`❌ 煉丹失敗：${e.message || '未知錯誤'}`);
    }
  }

  // 開啟新增丹方表單
  function handleStartAddNew() {
    editingCardId = null;
    isAddingNew = true;
    formTitle = '';
    formTag = `[ 0${cardList.length + 1} // 悟道 ]`;
    formDesc = '';
    formColor = 'cinnabar';
    formPrompt = '';
  }

  // 開啟編輯丹方表單
  function handleStartEdit(e: MouseEvent, card: AlchemyCardConfig) {
    e.stopPropagation();
    isAddingNew = false;
    editingCardId = card.id;
    formTitle = card.title;
    formTag = card.tag;
    formDesc = card.desc;
    formColor = card.colorTag || 'cinnabar';
    formPrompt = card.systemPrompt;
  }

  // 取消編輯或新增
  function handleCancelForm() {
    isAddingNew = false;
    editingCardId = null;
  }

  // 儲存丹方（新增或編輯）
  function handleSaveForm() {
    if (!formTitle.trim()) {
      onShowToast?.('請輸入丹方名稱');
      return;
    }
    if (!formPrompt.trim()) {
      onShowToast?.('請撰寫煉丹心法 (System Prompt)');
      return;
    }

    if (editingCardId) {
      // 編輯現有丹方
      const targetCard = alchemyCards[editingCardId];
      const updated = {
        ...alchemyCards,
        [editingCardId]: {
          ...targetCard,
          title: formTitle.trim(),
          tag: formTag.trim() || targetCard?.tag || '[ 丹方 ]',
          desc: formDesc.trim() || targetCard?.desc || '專屬提煉心法',
          colorTag: formColor,
          systemPrompt: formPrompt.trim(),
        }
      };
      onSaveAlchemyCards?.(updated);
      onShowToast?.(`💾 丹方「${formTitle.trim()}」心法設定已成功更新！`);
      editingCardId = null;
    } else {
      // 新增自訂丹方
      const newId = `custom_${Date.now()}`;
      const nextIndex = cardList.length + 1;
      const tagToUse = formTag.trim() || `[ 0${nextIndex} // 自訂 ]`;

      const updated = {
        ...alchemyCards,
        [newId]: {
          id: newId,
          tag: tagToUse,
          title: formTitle.trim(),
          desc: formDesc.trim() || '自訂專屬提煉心法',
          colorTag: formColor,
          systemPrompt: formPrompt.trim(),
          isCustom: true
        }
      };
      onSaveAlchemyCards?.(updated);
      onShowToast?.(`🎋 自訂丹方「${formTitle.trim()}」已成功存入櫃！`);
      isAddingNew = false;
    }
  }

  // 還原預設心法（針對內建丹方）
  function handleResetDefaultPrompt() {
    if (!editingCardId) return;
    const defaults = getDefaultAlchemyCards();
    const defaultCard = defaults[editingCardId];
    if (defaultCard) {
      formTitle = defaultCard.title;
      formTag = defaultCard.tag;
      formDesc = defaultCard.desc;
      formColor = defaultCard.colorTag;
      formPrompt = defaultCard.systemPrompt;
      onShowToast?.(`↺ 已填入「${defaultCard.title}」之原始包浩斯心法`);
    }
  }

  // 刪除自訂丹方
  function handleDeleteCard(e: MouseEvent, cardId: string, title: string) {
    e.stopPropagation();
    if (!confirm(`確定要移除丹方「${title}」嗎？`)) return;

    if (editingCardId === cardId) {
      editingCardId = null;
    }
    const updated = { ...alchemyCards };
    delete updated[cardId];
    onSaveAlchemyCards?.(updated);
    onShowToast?.(`🗑️ 已移除丹方「${title}」`);
  }

  // 恢復所有丹方為官方預設值（原地兩階段二次確認）
  function handleResetAllDefaultCards() {
    if (!isConfirmingReset) {
      isConfirmingReset = true;
      if (resetConfirmTimer) clearTimeout(resetConfirmTimer);
      resetConfirmTimer = window.setTimeout(() => {
        isConfirmingReset = false;
        resetConfirmTimer = null;
      }, 3500); // 3.5 秒內未再次點擊則自動取消
      return;
    }

    // 第二次點擊：真正執行還原
    if (resetConfirmTimer) {
      clearTimeout(resetConfirmTimer);
      resetConfirmTimer = null;
    }
    isConfirmingReset = false;

    const defaults = getDefaultAlchemyCards();
    onSaveAlchemyCards?.(defaults);
    if (editingCardId) editingCardId = null;
    if (isAddingNew) isAddingNew = false;
    onShowToast?.('↺ 已成功將所有煉丹爐丹方恢復為官方預設值！');
  }
</script>

<div 
  class="alchemy-popover-anchor"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  role="region"
  aria-label="意圖煉丹爐操作區"
>
  <!-- 觸發按鈕：極簡構成主義包浩斯微光風格 -->
  <button 
    class="alchemy-trigger-btn {isOpen ? 'active' : ''} {isRefining ? 'refining-pulse' : ''}"
    onclick={handleTriggerClick}
    title="意圖煉丹爐 (Hover 展開丹方，點擊可鎖定 / Ctrl+K)"
  >
    <span class="alchemy-icon-wrap">
      {#if isRefining}
        <Flame class="alchemy-icon spin-flame" size={15} />
      {:else}
        <Sparkles class="alchemy-icon" size={15} />
      {/if}
    </span>
    <span class="alchemy-title-text">煉丹爐</span>
    {#if isPinned}
      <span class="pin-indicator" title="目前已鎖定展開">●</span>
    {/if}
  </button>

  <!-- 展開浮層面板 -->
  {#if isOpen}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div 
      class="alchemy-dropdown-menu"
      onmouseenter={handleMouseEnter}
      onmouseleave={handleMouseLeave}
      role="menu"
      tabindex="-1"
    >
      <!-- 頂部資訊與控制列 -->
      <div class="menu-header">
        <div class="header-left">
          <span class="header-icon">🧪</span>
          <div class="header-texts">
            <span class="header-title">意圖煉丹樞紐</span>
            <span class="header-sub">
              {#if activeTab}
                作用藥帖：<strong>{activeTab.title}</strong>
              {:else}
                未選取分頁
              {/if}
            </span>
          </div>
        </div>
        <div class="header-actions">
          <button 
            class="header-tool-btn {isPinned ? 'is-pinned' : ''}" 
            onclick={() => (isPinned = !isPinned)} 
            title={isPinned ? '取消鎖定 (自動延遲收合)' : '釘選面板 (固定常開)'}
          >
            {#if isPinned}
              <Pin class="tool-icon" size={13} />
            {:else}
              <PinOff class="tool-icon" size={13} />
            {/if}
          </button>
          <button 
            class="header-tool-btn close-btn" 
            onclick={() => { isOpen = false; isPinned = false; handleCancelForm(); }} 
            title="關閉煉丹面板"
          >
            <X class="tool-icon" size={14} />
          </button>
        </div>
      </div>

      <!-- 單次補充心法輸入區 -->
      <div class="prompt-input-row">
        <input 
          type="text"
          class="custom-prompt-input"
          placeholder="單次煉丹補充指示 (如: 轉為繁中、著重資安...)"
          bind:value={customPrompt}
          onkeydown={(e) => {
            if (e.key === 'Enter' && cardList[0] && !isRefining && !editingCardId && !isAddingNew) {
              triggerRefine(cardList[0]);
            }
          }}
        />
      </div>

      <!-- 丹方卡片列表與編輯區 -->
      <div class="cards-scroll-area">
        <div class="cards-section-header">
          <span class="section-label">現有丹方 ({cardList.length})</span>
          {#if !isAddingNew && !editingCardId}
            <div class="header-btn-group">
              <button 
                class="reset-all-cards-btn {isConfirmingReset ? 'is-confirming' : ''}"
                onclick={handleResetAllDefaultCards}
                title={isConfirmingReset ? '再次點擊確認還原官方預設，或靜候 3 秒自動取消' : '將所有煉丹爐丹方還原為官方預設值'}
              >
                {#if isConfirmingReset}
                  <AlertCircle size={11} class="blink-icon" /> 確定還原？
                {:else}
                  <RotateCcw size={11} /> 恢復預設
                {/if}
              </button>
              <button 
                class="add-card-toggle-btn"
                onclick={handleStartAddNew}
              >
                <Plus size={12} /> 新增丹方
              </button>
            </div>
          {/if}
        </div>

        {#if isAddingNew || editingCardId}
          <!-- 研發/編輯丹方表單 -->
          <div class="card-edit-form">
            <div class="form-header-line">
              <span class="form-title">
                {#if editingCardId}
                  ✏️ 修訂心法：{formTitle}
                {:else}
                  🎋 研發自訂新丹方
                {/if}
              </span>
              <button class="form-cancel-icon-btn" onclick={handleCancelForm} title="取消">
                <X size={13} />
              </button>
            </div>

            <div class="form-row">
              <input 
                type="text" 
                class="form-input" 
                placeholder="丹方標題 (例：白話文精簡)" 
                bind:value={formTitle} 
              />
              <input 
                type="text" 
                class="form-input form-tag-input" 
                placeholder="標籤編號 (例：[ 04 // 悟道 ])" 
                bind:value={formTag} 
              />
            </div>

            <div class="form-row">
              <input 
                type="text" 
                class="form-input" 
                placeholder="簡短描述 (例：去除文言贅字，直取核心結論)" 
                bind:value={formDesc} 
              />
            </div>

            <div class="color-picker-row">
              <span class="color-label">丹方色標：</span>
              {#each colorOptions as opt}
                <button 
                  type="button"
                  class="color-dot-btn {formColor === opt.id ? 'active' : ''}"
                  style="background-color: {opt.color}"
                  onclick={() => (formColor = opt.id)}
                  title={opt.label}
                ></button>
              {/each}
            </div>

            <div class="form-row prompt-textarea-row">
              <div class="textarea-label-row">
                <span class="textarea-hint">煉丹心法 (System Prompt)：</span>
                {#if editingCardId && !editingCardId.startsWith('custom_')}
                  <button 
                    type="button" 
                    class="reset-default-btn" 
                    onclick={handleResetDefaultPrompt}
                    title="還原回預設心法"
                  >
                    <RotateCcw size={11} /> 還原預設
                  </button>
                {/if}
              </div>
              <textarea 
                class="form-textarea" 
                rows="6" 
                placeholder="注入心法 (System Prompt)... 描述 AI 如何對當前筆記進行結構轉換與心法昇華" 
                bind:value={formPrompt}
              ></textarea>
            </div>

            <div class="form-actions">
              <button class="form-btn cancel-btn" onclick={handleCancelForm}>
                取消
              </button>
              <button class="form-btn save-btn" onclick={handleSaveForm}>
                <Check size={13} /> 儲存心法
              </button>
            </div>
          </div>
        {/if}

        <div class="cards-grid">
          {#each cardList as card (card.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div 
              class="recipe-card color-{card.colorTag || 'cinnabar'} {isRefining ? 'disabled' : ''} {editingCardId === card.id ? 'is-editing' : ''}"
              onclick={() => triggerRefine(card)}
              role="button"
              tabindex="0"
            >
              <div class="card-top">
                <span class="card-tag">{card.tag}</span>
                <div class="card-actions">
                  <!-- 編輯丹方按鈕 -->
                  <button 
                    class="card-action-icon-btn edit-btn" 
                    onclick={(e) => handleStartEdit(e, card)} 
                    title="編輯此丹方心法與標題"
                  >
                    <Pencil size={11} />
                  </button>

                  <!-- 刪除自訂丹方按鈕 -->
                  {#if card.id.startsWith('custom_') || (card as any).isCustom}
                    <button 
                      class="card-action-icon-btn del-btn" 
                      onclick={(e) => handleDeleteCard(e, card.id, card.title)} 
                      title="移除此自訂丹方"
                    >
                      <Trash2 size={11} />
                    </button>
                  {/if}

                  <span class="card-run-indicator" title="點擊立即煉丹">
                    <ArrowRight size={13} />
                  </span>
                </div>
              </div>
              <div class="card-title">{card.title}</div>
              <div class="card-desc">{card.desc}</div>
            </div>
          {/each}
        </div>
      </div>

      <!-- 底部工具列：快速跳轉金鑰與模型設定 -->
      <div class="menu-footer">
        <span class="footer-hint">提示：點選丹方直接套用，點 ✏️ 可直接編輯心法</span>
        {#if onOpenSettings}
          <button class="footer-settings-btn" onclick={() => { isOpen = false; onOpenSettings(); }}>
            <Settings size={12} />
            <span>模型與金鑰設定</span>
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .alchemy-popover-anchor {
    position: relative;
    display: inline-block;
  }

  /* 觸發按鈕 */
  .alchemy-trigger-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    background: linear-gradient(135deg, rgba(30, 32, 30, 0.95), rgba(24, 25, 24, 0.95));
    border: 1px solid rgba(212, 155, 53, 0.35);
    border-radius: 4px;
    color: #ece7dc;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .alchemy-trigger-btn:hover,
  .alchemy-trigger-btn.active {
    background: linear-gradient(135deg, rgba(42, 45, 42, 0.98), rgba(32, 34, 32, 0.98));
    border-color: #d49b35;
    color: #d49b35;
    box-shadow: 0 0 12px rgba(212, 155, 53, 0.25);
  }

  .alchemy-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #d49b35;
  }

  .spin-flame {
    animation: flamePulse 1.2s infinite ease-in-out;
    color: #fe8019;
  }

  @keyframes flamePulse {
    0%, 100% { transform: scale(0.95); opacity: 0.8; }
    50% { transform: scale(1.15); opacity: 1; }
  }

  .pin-indicator {
    font-size: 8px;
    color: #b8bb26;
    margin-left: -2px;
  }

  /* 展開選單面板 */
  .alchemy-dropdown-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 380px;
    background: rgba(22, 24, 23, 0.96);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(212, 155, 53, 0.4);
    border-radius: 6px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6), 0 0 16px rgba(212, 155, 53, 0.15);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: dropIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes dropIn {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* 面板 Header */
  .menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: rgba(16, 18, 17, 0.85);
    border-bottom: 1px solid rgba(80, 69, 52, 0.35);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-icon {
    font-size: 16px;
  }

  .header-texts {
    display: flex;
    flex-direction: column;
  }

  .header-title {
    font-size: 13px;
    font-weight: 600;
    color: #ece7dc;
    letter-spacing: 0.5px;
  }

  .header-sub {
    font-size: 11px;
    color: #a89984;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
  }

  .header-sub strong {
    color: #fabd2f;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .header-tool-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 3px;
    background: transparent;
    border: 1px solid transparent;
    color: #a89984;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .header-tool-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ece7dc;
  }

  .header-tool-btn.is-pinned {
    color: #fabd2f;
    background: rgba(212, 155, 53, 0.15);
    border-color: rgba(212, 155, 53, 0.4);
  }

  /* 單次補充心法輸入框 */
  .prompt-input-row {
    padding: 10px 14px 6px 14px;
  }

  .custom-prompt-input {
    width: 100%;
    height: 32px;
    padding: 0 10px;
    background: rgba(14, 15, 14, 0.85);
    border: 1px solid rgba(80, 69, 52, 0.5);
    border-radius: 4px;
    color: #ece7dc;
    font-size: 12px;
    outline: none;
    transition: all 0.15s ease;
  }

  .custom-prompt-input:focus {
    border-color: #d49b35;
    background: rgba(18, 20, 18, 0.95);
    box-shadow: 0 0 8px rgba(212, 155, 53, 0.2);
  }

  /* 丹方滾動區 */
  .cards-scroll-area {
    padding: 8px 14px 12px 14px;
    max-height: 440px;
    overflow-y: auto;
  }

  .cards-scroll-area::-webkit-scrollbar {
    width: 5px;
  }
  .cards-scroll-area::-webkit-scrollbar-thumb {
    background: rgba(80, 69, 52, 0.5);
    border-radius: 3px;
  }

  .cards-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .section-label {
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    color: #a89984;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .header-btn-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .reset-all-cards-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    padding: 2px 7px;
    background: rgba(146, 131, 116, 0.12);
    border: 1px solid rgba(146, 131, 116, 0.35);
    border-radius: 3px;
    color: #a89984;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .reset-all-cards-btn:hover {
    background: rgba(204, 36, 29, 0.18);
    border-color: rgba(204, 36, 29, 0.5);
    color: #fb4934;
  }

  .reset-all-cards-btn.is-confirming {
    background: rgba(204, 36, 29, 0.28) !important;
    border-color: #cc241d !important;
    color: #fb4934 !important;
    font-weight: 600 !important;
    animation: pulseAlert 1.2s infinite ease-in-out;
  }

  @keyframes pulseAlert {
    0%, 100% {
      box-shadow: 0 0 4px rgba(204, 36, 29, 0.3);
      transform: scale(1);
    }
    50% {
      box-shadow: 0 0 10px rgba(204, 36, 29, 0.65);
      transform: scale(1.02);
    }
  }

  .add-card-toggle-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    padding: 2px 8px;
    background: rgba(212, 155, 53, 0.15);
    border: 1px solid rgba(212, 155, 53, 0.4);
    border-radius: 3px;
    color: #d49b35;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .add-card-toggle-btn:hover {
    background: rgba(212, 155, 53, 0.28);
    color: #fabd2f;
  }

  /* 丹方編輯/新增表單 */
  .card-edit-form {
    background: rgba(15, 17, 16, 0.98);
    border: 1px solid #d49b35;
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .form-header-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2px;
  }

  .form-title {
    font-size: 12px;
    font-weight: 600;
    color: #fabd2f;
  }

  .form-cancel-icon-btn {
    background: transparent;
    border: none;
    color: #928374;
    cursor: pointer;
    padding: 2px;
  }

  .form-cancel-icon-btn:hover {
    color: #ece7dc;
  }

  .form-row {
    display: flex;
    gap: 6px;
  }

  .form-input {
    flex: 1;
    height: 28px;
    padding: 0 8px;
    background: #111211;
    border: 1px solid rgba(80, 69, 52, 0.5);
    border-radius: 3px;
    color: #ece7dc;
    font-size: 11px;
    outline: none;
  }

  .form-tag-input {
    max-width: 130px;
  }

  .form-input:focus,
  .form-textarea:focus {
    border-color: #d49b35;
  }

  .color-picker-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 2px 0;
  }

  .color-label {
    font-size: 11px;
    color: #a89984;
  }

  .color-dot-btn {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .color-dot-btn:hover {
    transform: scale(1.2);
  }

  .color-dot-btn.active {
    border-color: #ece7dc;
    box-shadow: 0 0 6px currentColor;
  }

  .prompt-textarea-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .textarea-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .textarea-hint {
    font-size: 10px;
    color: #a89984;
  }

  .reset-default-btn {
    display: flex;
    align-items: center;
    gap: 3px;
    background: transparent;
    border: none;
    color: #83a598;
    font-size: 10px;
    cursor: pointer;
  }

  .reset-default-btn:hover {
    color: #b8bb26;
    text-decoration: underline;
  }

  .form-textarea {
    width: 100%;
    padding: 8px;
    background: #111211;
    border: 1px solid rgba(80, 69, 52, 0.5);
    border-radius: 3px;
    color: #ece7dc;
    font-size: 11px;
    line-height: 1.45;
    resize: vertical;
    outline: none;
    font-family: inherit;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .form-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    font-size: 11px;
    border-radius: 3px;
    cursor: pointer;
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid rgba(80, 69, 52, 0.6);
    color: #a89984;
  }

  .cancel-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ece7dc;
  }

  .save-btn {
    background: #d49b35;
    color: #1a1a1a;
    font-weight: 600;
    border: none;
  }

  .save-btn:hover {
    background: #fabd2f;
  }

  /* 丹方卡片 Grid */
  .cards-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .recipe-card {
    background: rgba(28, 30, 29, 0.85);
    border: 1px solid rgba(60, 56, 54, 0.6);
    border-left: 3px solid #cc241d;
    border-radius: 4px;
    padding: 8px 10px;
    cursor: pointer;
    transition: all 0.16s ease;
    user-select: none;
  }

  .recipe-card:hover {
    background: rgba(38, 41, 39, 0.95);
    transform: translateX(2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .recipe-card.is-editing {
    border-color: #d49b35;
    background: rgba(45, 42, 35, 0.95);
  }

  .recipe-card.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .recipe-card.color-cinnabar { border-left-color: #cc241d; }
  .recipe-card.color-ochre { border-left-color: #d79921; }
  .recipe-card.color-olive { border-left-color: #98971a; }
  .recipe-card.color-sapphire { border-left-color: #458588; }
  .recipe-card.color-amethyst { border-left-color: #b16286; }

  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2px;
  }

  .card-tag {
    font-size: 10px;
    font-family: 'JetBrains Mono', monospace;
    color: #a89984;
    letter-spacing: 0.5px;
  }

  .recipe-card.color-cinnabar .card-tag { color: #fb4934; }
  .recipe-card.color-ochre .card-tag { color: #fabd2f; }
  .recipe-card.color-olive .card-tag { color: #b8bb26; }
  .recipe-card.color-sapphire .card-tag { color: #83a598; }
  .recipe-card.color-amethyst .card-tag { color: #d3869b; }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .card-action-icon-btn {
    background: transparent;
    border: none;
    color: #928374;
    cursor: pointer;
    padding: 3px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .card-action-icon-btn:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .card-action-icon-btn.edit-btn:hover {
    color: #fabd2f;
  }

  .card-action-icon-btn.del-btn:hover {
    color: #fb4934;
    background: rgba(251, 73, 52, 0.15);
  }

  .card-run-indicator {
    color: #928374;
    transition: transform 0.15s ease, color 0.15s ease;
  }

  .recipe-card:hover .card-run-indicator {
    transform: translateX(3px);
    color: #d49b35;
  }

  .card-title {
    font-size: 13px;
    font-weight: 600;
    color: #ece7dc;
    margin-bottom: 2px;
  }

  .card-desc {
    font-size: 11px;
    color: #a89984;
    line-height: 1.35;
  }

  /* 底部列 */
  .menu-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    background: rgba(14, 16, 15, 0.9);
    border-top: 1px solid rgba(80, 69, 52, 0.35);
  }

  .footer-hint {
    font-size: 10px;
    color: #7c6f64;
  }

  .footer-settings-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #a89984;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .footer-settings-btn:hover {
    color: #d49b35;
  }
</style>
