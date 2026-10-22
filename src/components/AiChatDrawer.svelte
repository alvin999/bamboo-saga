<script lang="ts">
  import { tick } from 'svelte';
  import {
    Sparkles,
    Send,
    X,
    Trash2,
    Copy,
    Check,
    FileText,
    ArrowUpRight,
    Loader2,
    CornerDownLeft,
    ScrollText,
    PlusCircle,
    Bot,
    User,
    Paperclip
  } from 'lucide-svelte';
  import type { TabItem } from '../types/tab';
  import {
    sendChatMessage,
    type ChatMessage,
    type SendChatOptions
  } from '../lib/ai/chatSession';
  import MarkdownViewer from './MarkdownViewer.svelte';

  interface AiChatDrawerProps {
    isOpen: boolean;
    activeTab: TabItem | null;
    selectionText?: string;
    groqKey: string;
    geminiKey: string;
    selectedAiModel: 'groq' | 'gemini';
    selectedAiModelId: string;
    onClose: () => void;
    onSendToReview: (aiContent: string, summary: string) => void;
    onInsertToEditor: (content: string) => void;
    onShowToast?: (msg: string) => void;
  }

  let {
    isOpen = false,
    activeTab = null,
    selectionText = '',
    groqKey = '',
    geminiKey = '',
    selectedAiModel = 'gemini',
    selectedAiModelId = 'gemini-1.5-flash',
    onClose,
    onSendToReview,
    onInsertToEditor,
    onShowToast
  }: AiChatDrawerProps = $props();

  let messages = $state<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '閣下安好。我是您的《廣零散》隨身參謀。隨時與我探討手稿構想、推演架構，或讓我為您潤飾字句。在我的回覆下方，點擊「📜 送入丹道對照」即可將心法轉入工作台逐段比對！',
      timestamp: Date.now(),
      engineUsed: '系統引導',
    },
  ]);

  let inputVal = $state('');
  let isGenerating = $state(false);
  let attachContext = $state(true);
  let messagesContainer = $state<HTMLDivElement | null>(null);
  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let copiedId = $state<string | null>(null);
  let abortController = $state<AbortController | null>(null);

  $effect(() => {
    if (isOpen) {
      tick().then(() => {
        scrollToBottom();
        textareaEl?.focus();
      });
    }
  });

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  async function handleSendMessage() {
    const text = inputVal.trim();
    if (!text || isGenerating) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    messages = [...messages, userMsg];
    inputVal = '';
    isGenerating = true;
    abortController = new AbortController();

    await tick();
    scrollToBottom();

    try {
      const options: SendChatOptions = {
        model: selectedAiModel,
        modelId: selectedAiModelId,
        groqKey,
        geminiKey,
        history: messages.filter((m) => m.id !== 'welcome'),
        userMessage: text,
        signal: abortController.signal,
        contextNote: attachContext && activeTab ? {
          title: activeTab.title,
          content: activeTab.content,
          selection: selectionText || undefined,
        } : undefined,
      };

      const res = await sendChatMessage(options);
      messages = [...messages, res.message];
      await tick();
      scrollToBottom();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ 生成遇到阻礙：${err.message || '未知錯誤'}。請檢查 API Key 或網路連線。`,
          timestamp: Date.now(),
          engineUsed: '錯誤警示',
        };
        messages = [...messages, errorMsg];
        await tick();
        scrollToBottom();
      }
    } finally {
      isGenerating = false;
      abortController = null;
    }
  }

  function handleStop() {
    if (abortController) {
      abortController.abort();
      isGenerating = false;
      abortController = null;
      onShowToast?.('⏹️ 已中斷回答生成');
    }
  }

  function handleClearHistory() {
    messages = [
      {
        id: 'welcome',
        role: 'assistant',
        content: '對話記錄已清空。請問有什麼想與參謀一同參悟的？',
        timestamp: Date.now(),
        engineUsed: '系統引導',
      },
    ];
    onShowToast?.('🧹 已清空參謀對話紀錄');
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      onShowToast?.('📋 已複製內容至剪貼簿');
      setTimeout(() => {
        if (copiedId === id) copiedId = null;
      }, 2000);
    } catch (e) {
      onShowToast?.('複製失敗，請手動選取');
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  function handleSendReview(msg: ChatMessage) {
    onSendToReview(msg.content, `參謀心法 (${selectedAiModel})`);
    onShowToast?.('📜 已將參謀建議送入丹道對照審核！');
  }
</script>

{#if isOpen}
  <!-- 抽屜側邊半透明遮罩 -->
  <div 
    class="drawer-backdrop"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
    role="presentation"
  >
    <div class="chat-drawer" role="dialog" aria-modal="true" aria-label="AI 參謀問道抽屜">
      <!-- 頂部標頭 -->
      <header class="drawer-header">
        <div class="header-left">
          <Sparkles class="header-sparkle" size={17} />
          <div>
            <h2 class="header-title">竹語參謀 (AI 問道)</h2>
            <div class="header-sub">
              <span class="engine-tag">{selectedAiModel.toUpperCase()} · {selectedAiModelId}</span>
            </div>
          </div>
        </div>

        <div class="header-actions">
          <button 
            type="button" 
            class="action-icon-btn" 
            onclick={handleClearHistory} 
            title="清空對話紀錄"
          >
            <Trash2 size={15} />
          </button>
          <button 
            type="button" 
            class="action-icon-btn" 
            onclick={onClose} 
            title="收合抽屜 (ESC)"
          >
            <X size={17} />
          </button>
        </div>
      </header>

      <!-- 當前脈絡附加提示 (Context Bar) -->
      {#if activeTab}
        <div class="context-bar">
          <label class="context-toggle">
            <input type="checkbox" bind:checked={attachContext} />
            <Paperclip size={13} class="icon-clip" />
            <span class="context-label">附帶當前研讀篇章作為背景</span>
          </label>
          <div class="context-file" title={activeTab.title}>
            <FileText size={12} />
            <span class="file-title">{activeTab.title}</span>
            <span class="file-words">({activeTab.content.length} 字)</span>
          </div>
        </div>
      {/if}

      <!-- 對話訊息列表 -->
      <div class="messages-container" bind:this={messagesContainer}>
        {#each messages as msg (msg.id)}
          <div class="message-row role-{msg.role}">
            <div class="avatar-cell">
              {#if msg.role === 'user'}
                <div class="avatar user-avatar"><User size={14} /></div>
              {:else}
                <div class="avatar bot-avatar"><Bot size={14} /></div>
              {/if}
            </div>

            <div class="bubble-cell">
              <div class="bubble-header">
                <span class="bubble-sender">{msg.role === 'user' ? '您' : '竹語參謀'}</span>
                {#if msg.engineUsed}
                  <span class="bubble-engine">{msg.engineUsed}</span>
                {/if}
              </div>

              <div class="bubble-body">
                {#if msg.role === 'assistant'}
                  <MarkdownViewer content={msg.content} />
                {:else}
                  <pre class="message-text">{msg.content}</pre>
                {/if}
              </div>

              <!-- AI 專屬操作列：送入丹道對照 / 插入游標 / 複製 -->
              {#if msg.role === 'assistant' && msg.id !== 'welcome'}
                <div class="bubble-actions">
                  <button
                    type="button"
                    class="btn-action btn-review"
                    onclick={() => handleSendReview(msg)}
                    title="將本段建議與當前手稿送入逐段對照審核"
                  >
                    <ScrollText size={13} />
                    <span>送入丹道對照審核</span>
                  </button>

                  <button
                    type="button"
                    class="btn-action btn-insert"
                    onclick={() => {
                      onInsertToEditor(msg.content);
                      onShowToast?.('➕ 已插入至游標位置');
                    }}
                    title="直接插入至當前編輯器游標處"
                  >
                    <PlusCircle size={13} />
                    <span>插入游標處</span>
                  </button>

                  <button
                    type="button"
                    class="btn-action btn-copy"
                    onclick={() => copyToClipboard(msg.content, msg.id)}
                    title="複製內容"
                  >
                    {#if copiedId === msg.id}
                      <Check size={13} class="icon-check" />
                      <span>已複製</span>
                    {:else}
                      <Copy size={13} />
                      <span>複製</span>
                    {/if}
                  </button>
                </div>
              {/if}
            </div>
          </div>
        {/each}

        {#if isGenerating}
          <div class="message-row role-assistant is-thinking">
            <div class="avatar-cell">
              <div class="avatar bot-avatar"><Bot size={14} /></div>
            </div>
            <div class="bubble-cell">
              <div class="thinking-box">
                <Loader2 size={16} class="spin" />
                <span>參謀推演心法中...</span>
                <button type="button" class="btn-stop-generating" onclick={handleStop}>中斷</button>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- 底部輸入列 -->
      <footer class="drawer-footer">
        <div class="input-card">
          <textarea
            bind:this={textareaEl}
            class="chat-textarea"
            placeholder="向參謀問道...（Enter 送出，Shift+Enter 換行）"
            rows="3"
            bind:value={inputVal}
            onkeydown={handleKeyDown}
            disabled={isGenerating}
          ></textarea>

          <div class="input-card-bottom">
            <span class="input-hint">支援 Markdown 與代碼分析</span>
            {#if isGenerating}
              <button type="button" class="btn-send is-stop" onclick={handleStop}>
                <span>停止</span>
              </button>
            {:else}
              <button
                type="button"
                class="btn-send"
                onclick={handleSendMessage}
                disabled={!inputVal.trim()}
                title="送出 (Enter)"
              >
                <span>送出</span>
                <Send size={13} />
              </button>
            {/if}
          </div>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 998;
    background: rgba(18, 20, 21, 0.4);
    display: flex;
    justify-content: flex-end;
    animation: fadeIn 0.15s ease-out;
  }

  .chat-drawer {
    width: 440px;
    max-width: 90vw;
    height: 100vh;
    background: #202224;
    border-left: 1px solid #3c3836;
    box-shadow: -8px 0 28px rgba(0, 0, 0, 0.65);
    display: flex;
    flex-direction: column;
    animation: slideLeft 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .drawer-header {
    height: 52px;
    padding: 0 16px;
    background: #282828;
    border-bottom: 1px solid #3c3836;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  :global(.header-sparkle) {
    color: #fabd2f;
  }

  .header-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #ebdbb2;
    letter-spacing: 0.3px;
  }

  .header-sub {
    font-size: 10px;
    color: #928374;
  }

  .engine-tag {
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.1);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .action-icon-btn {
    background: transparent;
    border: none;
    color: #a89984;
    cursor: pointer;
    padding: 6px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .action-icon-btn:hover {
    color: #ebdbb2;
    background: #32302f;
  }

  .context-bar {
    background: #1d2021;
    border-bottom: 1px solid #2d3032;
    padding: 6px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: #928374;
    flex-shrink: 0;
  }

  .context-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
  }

  .context-toggle input {
    accent-color: #fabd2f;
  }

  :global(.icon-clip) {
    color: #fabd2f;
  }

  .context-file {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #d5c4a1;
    max-width: 170px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .file-title {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-words {
    color: #7c6f64;
    font-size: 10px;
  }

  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .message-row {
    display: flex;
    gap: 10px;
    animation: fadeIn 0.15s ease-out;
  }

  .role-user {
    flex-direction: row-reverse;
  }

  .avatar-cell {
    flex-shrink: 0;
  }

  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .user-avatar {
    background: #3c3836;
    color: #ebdbb2;
    border: 1px solid #504945;
  }

  .bot-avatar {
    background: rgba(250, 189, 47, 0.15);
    color: #fabd2f;
    border: 1px solid rgba(250, 189, 47, 0.3);
  }

  .bubble-cell {
    max-width: 86%;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .bubble-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #7c6f64;
  }

  .role-user .bubble-header {
    justify-content: flex-end;
  }

  .bubble-sender {
    font-weight: 500;
  }

  .bubble-engine {
    font-size: 10px;
    color: #fabd2f;
  }

  .bubble-body {
    background: #282828;
    border: 1px solid #3c3836;
    border-radius: 8px;
    padding: 10px 12px;
    color: #ebdbb2;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .role-user .bubble-body {
    background: #32302f;
    border-color: #504945;
    color: #fbf1c7;
  }

  .message-text {
    margin: 0;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .bubble-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    flex-wrap: wrap;
  }

  .btn-action {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #1d2021;
    border: 1px solid #3c3836;
    color: #a89984;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-action:hover {
    background: #32302f;
    color: #ebdbb2;
  }

  .btn-review {
    border-color: rgba(250, 189, 47, 0.4);
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.08);
  }

  .btn-review:hover {
    background: #fabd2f;
    color: #282828;
    font-weight: 600;
  }

  :global(.icon-check) {
    color: #b8bb26;
  }

  .thinking-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #282828;
    border: 1px dashed #504945;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
    color: #fabd2f;
  }

  .btn-stop-generating {
    background: #3c3836;
    border: 1px solid #504945;
    color: #fb4934;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 11px;
    cursor: pointer;
    margin-left: auto;
  }

  .drawer-footer {
    padding: 12px 16px;
    background: #242628;
    border-top: 1px solid #3c3836;
    flex-shrink: 0;
  }

  .input-card {
    background: #1d2021;
    border: 1px solid #3c3836;
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: border-color 0.15s ease;
  }

  .input-card:focus-within {
    border-color: #fabd2f;
    box-shadow: 0 0 0 2px rgba(250, 189, 47, 0.1);
  }

  .chat-textarea {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: #fbf1c7;
    font-size: 13px;
    font-family: inherit;
    resize: none;
    line-height: 1.45;
  }

  .chat-textarea::placeholder {
    color: #7c6f64;
  }

  .input-card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 2px;
  }

  .input-hint {
    font-size: 10px;
    color: #7c6f64;
  }

  .btn-send {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #fabd2f;
    color: #282828;
    border: none;
    border-radius: 5px;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-send:hover:not(:disabled) {
    background: #fe8019;
  }

  .btn-send:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn-send.is-stop {
    background: #fb4934;
    color: #ebdbb2;
  }

  @keyframes slideLeft {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
