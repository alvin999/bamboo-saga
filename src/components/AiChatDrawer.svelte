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
    Paperclip,
    Pencil,
    MessageSquare,
    RefreshCw,
    SplitSquareVertical
  } from 'lucide-svelte';
  import type { TabItem, AiProvider } from '../types/tab';
  import {
    sendChatMessage,
    type ChatMessage,
    type SendChatOptions,
    type AdvisorMode
  } from '../lib/ai/chatSession';
  import MarkdownViewer from './MarkdownViewer.svelte';

  interface AiChatDrawerProps {
    isOpen: boolean;
    activeTab: TabItem | null;
    selectionText?: string;
    groqKey: string;
    geminiKey: string;
    customKey?: string;
    customEndpoint?: string;
    selectedAiModel: AiProvider;
    selectedAiModelId: string;
    onClose: () => void;
    onSendToReview: (aiContent: string, summary: string) => void;
    onInsertToEditor: (content: string) => void;
    onReplaceTargetText?: (originalText: string, newText: string) => void;
    onShowToast?: (msg: string) => void;
  }

  let {
    isOpen = false,
    activeTab = null,
    selectionText = '',
    groqKey = '',
    geminiKey = '',
    customKey = '',
    customEndpoint = '',
    selectedAiModel = 'gemini',
    selectedAiModelId = 'gemini-1.5-flash',
    onClose,
    onSendToReview,
    onInsertToEditor,
    onReplaceTargetText,
    onShowToast
  }: AiChatDrawerProps = $props();

  // 雙模式狀態：'inquiry' (💬 問道模式) 與 'scribe' (✍️ 執筆模式)
  let advisorMode = $state<AdvisorMode>('inquiry');

  // 執筆模式手動鎖定之段落（若為 null 則動態探測游標段落或反白選取）
  let customLockedParagraph = $state<{ text: string; label: string } | null>(null);

  let messages = $state<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '閣下安好。我是您的《廣零散》隨身參謀。\n\n• **💬 問道模式**：隨時與我探討手稿構想、推演技術架構或諮詢釋疑，不干涉手稿。\n• **✍️ 執筆模式**：宛如煉丹爐，鎖定手稿段落來回 Prompt 進行雙欄對照修改與精準採納！',
      timestamp: Date.now(),
      engineUsed: '系統引導',
      mode: 'inquiry',
    },
  ]);

  let inputVal = $state('');
  let isGenerating = $state(false);
  let attachContext = $state(true);
  let messagesContainer = $state<HTMLDivElement | null>(null);
  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let copiedId = $state<string | null>(null);
  let abortController = $state<AbortController | null>(null);

  /**
   * 智慧探測當前手稿游標所在的自然段落或選取片段
   */
  function detectCurrentParagraph(tab: TabItem | null, selection?: string): { text: string; label: string } {
    if (selection && selection.trim()) {
      return {
        text: selection.trim(),
        label: '反白選取焦點',
      };
    }
    if (!tab || !tab.content) return { text: '', label: '未選取段落' };

    const lines = tab.content.split('\n');
    const curLine = Math.max(0, Math.min((tab.cursor?.line || 1) - 1, lines.length - 1));

    let start = curLine;
    while (start > 0 && lines[start - 1].trim() !== '') {
      start--;
    }

    let end = curLine;
    while (end < lines.length - 1 && lines[end + 1].trim() !== '') {
      end++;
    }

    const paragraphLines = lines.slice(start, end + 1);
    const text = paragraphLines.join('\n').trim();

    // 計算是第幾個天然段落 (P1, P2...)
    let paragraphIndex = 1;
    let inPara = false;
    for (let i = 0; i <= start; i++) {
      if (lines[i].trim() !== '') {
        if (!inPara) {
          if (i === start) break;
          paragraphIndex++;
          inPara = true;
        }
      } else {
        inPara = false;
      }
    }

    return {
      text,
      label: text ? `手稿段落 [P${paragraphIndex}]` : '游標當前位置',
    };
  }

  // 執筆模式當前聚焦的目標段落：
  // 1. 若手稿中有反白選取文字，立即以選取文字為最高優先執筆標的
  // 2. 若手動固定了段落，使用手動鎖定段落
  // 3. 否則點擊手稿任意處即同步動態追蹤該游標自然段落 (點擊即定位)
  const currentFocusParagraph = $derived.by(() => {
    if (selectionText && selectionText.trim()) {
      return {
        text: selectionText.trim(),
        label: `選取片段 (${selectionText.trim().length} 字)`,
      };
    }
    if (customLockedParagraph && customLockedParagraph.text) {
      return customLockedParagraph;
    }
    return detectCurrentParagraph(activeTab, '');
  });

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

  // 切換參謀模式
  function handleSwitchMode(mode: AdvisorMode) {
    if (advisorMode === mode) return;
    advisorMode = mode;
    if (mode === 'scribe') {
      onShowToast?.('✍️ 已進入【執筆模式】：點擊手稿段落即時定位，來回 Prompt 對照修煉！');
    } else {
      onShowToast?.('💬 已進入【問道模式】：清談論道、架構推演與答疑解惑！');
    }
    tick().then(() => textareaEl?.focus());
  }

  // 一鍵將手稿選取文字以引言格式傳入輸入框（兩種模式通用）
  function handleInsertSelectionToInput() {
    if (!selectionText || !selectionText.trim()) return;
    const cleanSel = selectionText.trim();
    const quoteFormat = `> ${cleanSel.split('\n').join('\n> ')}\n\n`;
    inputVal = inputVal ? `${quoteFormat}${inputVal}` : quoteFormat;
    onShowToast?.('📥 已將手稿選取內文帶入輸入框！');
    tick().then(() => textareaEl?.focus());
  }

  // 執筆模式：將選取片段鎖定為執筆修煉標的
  function handleLockSelectionAsTarget() {
    if (!selectionText || !selectionText.trim()) return;
    const clean = selectionText.trim();
    customLockedParagraph = {
      text: clean,
      label: `選取標的 (${clean.length} 字)`,
    };
    onShowToast?.('🎯 已將選取片段鎖定為執筆標的！');
  }

  // 解除手動鎖定，回歸點擊即定位
  function handleUnlockParagraph() {
    customLockedParagraph = null;
    onShowToast?.('🔄 已恢復點擊即定位段落');
  }

  // 重新鎖定當前段落
  function handleReanchorParagraph() {
    const fresh = detectCurrentParagraph(activeTab, selectionText);
    customLockedParagraph = fresh;
    onShowToast?.(`🎯 已重新鎖定 ${fresh.label}`);
  }

  // 抽屜按鍵監聽：支援 Escape 鍵收合抽屜
  function handleDrawerKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }

  async function handleSendMessage() {
    const text = inputVal.trim();
    if (!text || isGenerating) return;

    const targetPara = advisorMode === 'scribe' ? currentFocusParagraph : undefined;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      mode: advisorMode,
      targetOriginalText: targetPara?.text,
      paragraphLabel: targetPara?.label,
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
        customKey,
        customEndpoint,
        history: messages.filter((m) => m.id !== 'welcome'),
        userMessage: text,
        advisorMode,
        targetParagraph: targetPara && targetPara.text ? { text: targetPara.text, label: targetPara.label } : undefined,
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
          mode: advisorMode,
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
    const textToReview = msg.targetRefinedText || msg.content;
    onSendToReview(textToReview, `參謀執筆成果 (${selectedAiModel})`);
    onShowToast?.('📜 已將參謀建議送入丹道對照審核！');
  }

  // 執筆模式：一鍵採納並原地替換手稿中該段落
  function handleApplyReplace(msg: ChatMessage) {
    const orig = msg.targetOriginalText;
    const refined = msg.targetRefinedText || msg.content;
    if (!orig || !refined) {
      onShowToast?.('⚠️ 無法取得對應的原手稿段落');
      return;
    }
    if (onReplaceTargetText) {
      onReplaceTargetText(orig, refined);
    } else {
      onInsertToEditor(refined);
      onShowToast?.('➕ 已插入至游標位置');
    }
  }

  // 執筆模式：兩者並存（保留原文並在下方插入修訂稿）
  function handleApplyBoth(msg: ChatMessage) {
    const orig = msg.targetOriginalText;
    const refined = msg.targetRefinedText || msg.content;
    if (!orig || !refined) return;
    const combined = `${orig}\n\n> 💡 【參謀修訂成果】：\n${refined}`;
    if (onReplaceTargetText) {
      onReplaceTargetText(orig, combined);
      onShowToast?.('📑 已採納兩者並存格式！');
    } else {
      onInsertToEditor(combined);
    }
  }
</script>

{#if isOpen}
  <!-- 伴隨式側欄容器 (無阻擋穿透，徹底放行手稿編輯器點擊、游標移動與反白選字) -->
  <div 
    class="drawer-backdrop"
    onkeydown={handleDrawerKeydown}
    role="presentation"
  >
    <div class="chat-drawer mode-{advisorMode}" role="dialog" aria-modal="true" aria-label="AI 參謀問道抽屜">
      <!-- 頂部標頭 -->
      <header class="drawer-header">
        <div class="header-left">
          <Sparkles class="header-sparkle" size={17} />
          <div>
            <div class="header-title-row">
              <h2 class="header-title">竹語參謀</h2>
              <!-- 專案慣例雙模式切換膠囊 -->
              <div class="mode-toggle-pill" role="tablist" aria-label="參謀運作模式">
                <button
                  type="button"
                  class="mode-pill-btn {advisorMode === 'inquiry' ? 'active' : ''}"
                  onclick={() => handleSwitchMode('inquiry')}
                  title="💬 問道模式：純思維推演、架構設計與答疑解惑"
                >
                  <MessageSquare size={11} />
                  <span>💬 問道</span>
                </button>
                <button
                  type="button"
                  class="mode-pill-btn {advisorMode === 'scribe' ? 'active' : ''}"
                  onclick={() => handleSwitchMode('scribe')}
                  title="✍️ 執筆模式：像煉丹爐針對段落來回 Prompt 對照修改手稿"
                >
                  <Pencil size={11} />
                  <span>✍️ 執筆</span>
                </button>
              </div>
            </div>
            <div class="header-sub">
              <span class="engine-tag">{selectedAiModel.toUpperCase()} · {selectedAiModelId}</span>
              <span class="mode-tag">{advisorMode === 'scribe' ? '段落來回修煉' : '隨身論道'}</span>
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
            <span class="context-label">附帶當前研讀篇章背景</span>
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
                {#if msg.mode === 'scribe'}
                  <span class="bubble-mode-badge">✍️ 執筆</span>
                {/if}
                {#if msg.engineUsed}
                  <span class="bubble-engine">{msg.engineUsed}</span>
                {/if}
              </div>

              <!-- 執筆模式：段落對照卡片 (如煉丹爐雙欄對照) -->
              {#if msg.role === 'assistant' && msg.targetOriginalText}
                <div class="scribe-diff-card">
                  <div class="scribe-diff-meta">
                    <span class="scribe-card-tag">{msg.paragraphLabel || '段落對照修煉'}</span>
                    <span class="scribe-card-tip">支援下方輸入框持續來回 Prompt 微調</span>
                  </div>

                  <div class="scribe-diff-panes">
                    <!-- 原始手稿段落 -->
                    <div class="diff-pane origin-pane">
                      <div class="pane-header">
                        <span class="pane-icon">📜</span>
                        <span class="pane-title">原始手稿段落</span>
                      </div>
                      <div class="pane-body">
                        <pre class="origin-code">{msg.targetOriginalText}</pre>
                      </div>
                    </div>

                    <!-- 參謀執筆成果 -->
                    <div class="diff-pane refined-pane">
                      <div class="pane-header">
                        <span class="pane-icon">✨</span>
                        <span class="pane-title">參謀執筆成果</span>
                      </div>
                      <div class="pane-body">
                        <MarkdownViewer content={msg.targetRefinedText || msg.content} />
                      </div>
                    </div>
                  </div>

                  <!-- 煉丹爐級別快捷採納列 -->
                  <div class="scribe-diff-actions">
                    <button
                      type="button"
                      class="btn-scribe-action btn-apply"
                      onclick={() => handleApplyReplace(msg)}
                      title="直接以修訂稿置換手稿中的該段落 (自動建立快照保險)"
                    >
                      <Check size={13} />
                      <span>✔ 採納替換該段落</span>
                    </button>

                    <button
                      type="button"
                      class="btn-scribe-action btn-both"
                      onclick={() => handleApplyBoth(msg)}
                      title="保留原段落並在下方追加修訂成果"
                    >
                      <PlusCircle size={13} />
                      <span>📑 兩者並存</span>
                    </button>

                    <button
                      type="button"
                      class="btn-scribe-action btn-review"
                      onclick={() => handleSendReview(msg)}
                      title="將本段成果送入全篇丹道對照逐段審核"
                    >
                      <ScrollText size={13} />
                      <span>📜 送入丹道對照</span>
                    </button>

                    <button
                      type="button"
                      class="btn-scribe-action btn-copy"
                      onclick={() => copyToClipboard(msg.targetRefinedText || msg.content, msg.id)}
                      title="複製修訂成果"
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
                </div>
              {:else}
                <!-- 一般問道模式泡泡 -->
                <div class="bubble-body">
                  {#if msg.role === 'assistant'}
                    <MarkdownViewer content={msg.content} />
                  {:else}
                    <pre class="message-text">{msg.content}</pre>
                  {/if}
                </div>

                <!-- 問道模式一般操作列 -->
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
                <span>{advisorMode === 'scribe' ? '參謀掌墨修煉中 (如煉丹爐對照)...' : '參謀推演心法中...'}</span>
                <button type="button" class="btn-stop-generating" onclick={handleStop}>中斷</button>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- 底部輸入列 -->
      <footer class="drawer-footer">
        <!-- 兩種模式通用：手稿選取內文即時傳入橫幅 -->
        {#if selectionText && selectionText.trim()}
          <div class="selection-action-bar">
            <div class="sel-info">
              <span class="sel-badge">📑 已選取 {selectionText.trim().length} 字</span>
              <span class="sel-preview" title={selectionText.trim()}>
                "{selectionText.trim().slice(0, 32)}{selectionText.trim().length > 32 ? '...' : ''}"
              </span>
            </div>
            <div class="sel-actions">
              <button
                type="button"
                class="btn-sel-action btn-insert-quote"
                onclick={handleInsertSelectionToInput}
                title="將手稿反白選取的文字帶入輸入框"
              >
                <CornerDownLeft size={11} />
                <span>📥 帶入輸入框</span>
              </button>
              {#if advisorMode === 'scribe'}
                <button
                  type="button"
                  class="btn-sel-action btn-set-target"
                  onclick={handleLockSelectionAsTarget}
                  title="將此選取片段鎖定為執筆修煉標的"
                >
                  <Pencil size={11} />
                  <span>🎯 定為執筆標的</span>
                </button>
              {/if}
            </div>
          </div>
        {/if}

        <!-- 執筆模式：當前手稿段落定位條 (點擊即定位) -->
        {#if advisorMode === 'scribe'}
          <div class="target-anchor-strip">
            <div class="anchor-left">
              <span class="anchor-badge">🎯 執筆定位</span>
              <span class="anchor-label">{currentFocusParagraph.label}</span>
              <span class="anchor-preview" title={currentFocusParagraph.text}>
                {currentFocusParagraph.text.slice(0, 42)}{currentFocusParagraph.text.length > 42 ? '...' : ''}
              </span>
            </div>
            <div class="anchor-actions">
              {#if customLockedParagraph}
                <button
                  type="button"
                  class="btn-reanchor is-locked"
                  onclick={handleUnlockParagraph}
                  title="解除手動鎖定，恢復點擊手稿即時定位"
                >
                  <RefreshCw size={11} />
                  <span>🔓 恢復點擊定位</span>
                </button>
              {:else}
                <span class="anchor-tip">點擊手稿段落即同步</span>
              {/if}
            </div>
          </div>
        {/if}

        <div class="input-card">
          <textarea
            bind:this={textareaEl}
            class="chat-textarea"
            placeholder={advisorMode === 'scribe'
              ? "交代參謀執筆微調...（如：將這段改為條列式並精簡贅字。支援多輪來回 Prompt）"
              : "向參謀問道...（如：這段架構設計有何瓶頸？Enter 送出，Shift+Enter 換行）"}
            rows="3"
            bind:value={inputVal}
            onkeydown={handleKeyDown}
            disabled={isGenerating}
          ></textarea>

          <div class="input-card-bottom">
            <span class="input-hint">
              {advisorMode === 'scribe' ? '✍️ 執筆模式：來回 Prompt 產出雙欄對照' : '💬 問道模式：支援 Markdown 與架構推演'}
            </span>
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
    background: transparent;
    pointer-events: none; /* 穿透點擊：徹底放行左側手稿編輯器的游標定位與反白選字，抽屜絕不誤關！ */
    display: flex;
    justify-content: flex-end;
    animation: fadeIn 0.15s ease-out;
  }

  .chat-drawer {
    pointer-events: auto; /* 抽屜本體保留完整點擊互動 */
    width: 440px;
    max-width: 92vw;
    height: 100vh;
    background: #202224;
    border-left: 1px solid #3c3836;
    box-shadow: -8px 0 28px rgba(0, 0, 0, 0.65);
    display: flex;
    flex-direction: column;
    animation: slideLeft 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* 執筆對照模式：自動擴展寬度提供舒適的段落雙欄/對照視野 */
  .chat-drawer.mode-scribe {
    width: 540px;
  }

  .drawer-header {
    height: 54px;
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

  .header-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #ebdbb2;
    letter-spacing: 0.3px;
  }

  /* 專案慣例雙模式切換膠囊 (問道 / 執筆) */
  .mode-toggle-pill {
    display: flex;
    align-items: center;
    background: #1d2021;
    border: 1px solid #3c3836;
    border-radius: 20px;
    padding: 2px;
    gap: 2px;
  }

  .mode-pill-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    color: #928374;
    font-size: 11px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 14px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-pill-btn:hover {
    color: #ebdbb2;
  }

  .mode-pill-btn.active {
    background: #32302f;
    color: #fabd2f;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  }

  .header-sub {
    font-size: 10px;
    color: #928374;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }

  .engine-tag {
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.1);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .mode-tag {
    color: #d79921;
    background: rgba(215, 153, 33, 0.12);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .bubble-mode-badge {
    font-size: 9px;
    background: #32302f;
    color: #fabd2f;
    border: 1px solid rgba(250, 189, 47, 0.25);
    padding: 1px 4px;
    border-radius: 3px;
  }

  /* 執筆模式：段落對照卡片 (如煉丹爐風格) */
  .scribe-diff-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: #1b1d1e;
    border: 1px solid #3c3836;
    border-radius: 7px;
    padding: 12px;
    margin-top: 6px;
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.3);
  }

  .scribe-diff-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    border-bottom: 1px solid #282828;
    padding-bottom: 6px;
  }

  .scribe-card-tag {
    color: #fabd2f;
    font-weight: 600;
  }

  .scribe-card-tip {
    color: #7c6f64;
    font-size: 10px;
  }

  .scribe-diff-panes {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .diff-pane {
    border-radius: 5px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .diff-pane.origin-pane {
    background: #201f1e;
    border: 1px dashed #504945;
  }

  .diff-pane.refined-pane {
    background: #282828;
    border: 1px solid #665c54;
  }

  .pane-header {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
  }

  .origin-pane .pane-header {
    color: #d5c4a1;
  }

  .refined-pane .pane-header {
    color: #fabd2f;
  }

  .origin-code {
    margin: 0;
    font-family: monospace;
    font-size: 11.5px;
    color: #a89984;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 140px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.2);
    padding: 6px;
    border-radius: 4px;
  }

  .refined-pane .pane-body {
    font-size: 12.5px;
    color: #ebdbb2;
    max-height: 260px;
    overflow-y: auto;
  }

  /* 執筆卡片底部操作按鈕 */
  .scribe-diff-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding-top: 6px;
    border-top: 1px solid #282828;
  }

  .btn-scribe-action {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px;
    font-size: 11px;
    font-weight: 500;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid #3c3836;
    background: #282828;
    color: #d5c4a1;
    transition: all 0.15s ease;
  }

  .btn-scribe-action:hover {
    background: #32302f;
    color: #fbf1c7;
    border-color: #504945;
  }

  .btn-scribe-action.btn-apply {
    background: #b8bb26;
    color: #1d2021;
    border-color: #98971a;
    font-weight: 600;
  }

  .btn-scribe-action.btn-apply:hover {
    background: #98971a;
    color: #fbf1c7;
  }

  .btn-scribe-action.btn-both {
    background: #3c3836;
    color: #fabd2f;
    border-color: #504945;
  }

  .btn-scribe-action.btn-both:hover {
    background: #504945;
  }

  .btn-scribe-action.btn-review {
    color: #d79921;
  }

  /* 執筆模式：輸入框上方目標鎖定條 */
  .target-anchor-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #1d2021;
    border: 1px solid #3c3836;
    border-bottom: none;
    border-radius: 6px 6px 0 0;
    padding: 5px 10px;
    font-size: 11px;
    color: #a89984;
    margin-bottom: -1px;
    position: relative;
    z-index: 2;
  }

  .anchor-left {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .anchor-badge {
    background: rgba(250, 189, 47, 0.15);
    color: #fabd2f;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .anchor-label {
    color: #ebdbb2;
    font-weight: 500;
    flex-shrink: 0;
  }

  .anchor-preview {
    color: #7c6f64;
    font-size: 10.5px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .btn-reanchor {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: 1px solid #3c3836;
    color: #a89984;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .btn-reanchor:hover {
    background: #282828;
    color: #fabd2f;
    border-color: #fabd2f;
  }

  .btn-reanchor.is-locked {
    background: rgba(250, 189, 47, 0.1);
    color: #fabd2f;
    border-color: #fabd2f;
  }

  .anchor-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .anchor-tip {
    font-size: 10px;
    color: #7c6f64;
  }

  /* 兩種模式通用：選取內文即時傳入橫幅 */
  .selection-action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #1d2021;
    border: 1px solid rgba(250, 189, 47, 0.35);
    border-radius: 6px 6px 0 0;
    padding: 6px 10px;
    font-size: 11px;
    margin-bottom: -1px;
    position: relative;
    z-index: 3;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.25);
    animation: fadeIn 0.12s ease-out;
  }

  .sel-info {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .sel-badge {
    background: #fabd2f;
    color: #1d2021;
    font-weight: 700;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .sel-preview {
    color: #ebdbb2;
    font-size: 11px;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sel-actions {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }

  .btn-sel-action {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    font-size: 10.5px;
    font-weight: 600;
    border-radius: 3px;
    cursor: pointer;
    border: 1px solid #3c3836;
    background: #282828;
    color: #ebdbb2;
    transition: all 0.15s ease;
  }

  .btn-sel-action:hover {
    background: #32302f;
    border-color: #fabd2f;
    color: #fabd2f;
  }

  .btn-sel-action.btn-insert-quote {
    background: #32302f;
    color: #fabd2f;
    border-color: rgba(250, 189, 47, 0.4);
  }

  .btn-sel-action.btn-set-target {
    background: rgba(184, 187, 38, 0.15);
    color: #b8bb26;
    border-color: rgba(184, 187, 38, 0.3);
  }

  .btn-sel-action.btn-set-target:hover {
    background: #b8bb26;
    color: #1d2021;
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
