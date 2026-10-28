<script lang="ts">
  import { tick } from "svelte";
  import {
    Send,
    X,
    Trash2,
    Copy,
    Check,
    Loader2,
    CornerDownLeft,
    ScrollText,
    PlusCircle,
    RefreshCw,
  } from "lucide-svelte";
  import type { TabItem, AiProvider } from "../types/tab";
  import {
    sendChatMessage,
    type ChatMessage,
    type SendChatOptions,
    type AdvisorMode,
  } from "../lib/ai/chatSession";
  import MarkdownViewer from "./MarkdownViewer.svelte";

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
    selectionText = "",
    groqKey = "",
    geminiKey = "",
    customKey = "",
    customEndpoint = "",
    selectedAiModel = "gemini",
    selectedAiModelId = "gemini-1.5-flash",
    onClose,
    onSendToReview,
    onInsertToEditor,
    onReplaceTargetText,
    onShowToast,
  }: AiChatDrawerProps = $props();

  // 雙模式狀態：'inquiry' (問道模式) 與 'scribe' (執筆模式)
  let advisorMode = $state<AdvisorMode>("inquiry");

  // 執筆模式手動鎖定之段落
  let customLockedParagraph = $state<{ text: string; label: string } | null>(
    null,
  );

  let messages = $state<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "閣下安好，我是《廣零散》隨身參謀。\n\n• **◎ 問道模式**：探討手稿構想、推演技術架構或諮詢釋疑，不干涉手稿。\n• **❖ 執筆模式**：鎖定手稿當前段落，透過多輪對話進行對照潤飾與原地採納。",
      timestamp: Date.now(),
      engineUsed: "系統引導",
      mode: "inquiry",
    },
  ]);

  let inputVal = $state("");
  let isGenerating = $state(false);
  let attachContext = $state(true);
  let messagesContainer = $state<HTMLDivElement | null>(null);
  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let copiedId = $state<string | null>(null);
  let abortController = $state<AbortController | null>(null);

  /**
   * 智慧探測當前手稿游標所在的自然段落或選取片段
   */
  function detectCurrentParagraph(
    tab: TabItem | null,
    selection?: string,
  ): { text: string; label: string } {
    if (selection && selection.trim()) {
      return {
        text: selection.trim(),
        label: "反白選取焦點",
      };
    }
    if (!tab || !tab.content) return { text: "", label: "未選取段落" };

    const lines = tab.content.split("\n");
    const curLine = Math.max(
      0,
      Math.min((tab.cursor?.line || 1) - 1, lines.length - 1),
    );

    let start = curLine;
    while (start > 0 && lines[start - 1].trim() !== "") {
      start--;
    }

    let end = curLine;
    while (end < lines.length - 1 && lines[end + 1].trim() !== "") {
      end++;
    }

    const paragraphLines = lines.slice(start, end + 1);
    const text = paragraphLines.join("\n").trim();

    let paragraphIndex = 1;
    let inPara = false;
    for (let i = 0; i <= start; i++) {
      if (lines[i].trim() !== "") {
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
      label: text ? `段落 [P${paragraphIndex}]` : "游標當前位置",
    };
  }

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
    return detectCurrentParagraph(activeTab, "");
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

  function handleSwitchMode(mode: AdvisorMode) {
    if (advisorMode === mode) return;
    advisorMode = mode;
    if (mode === "scribe") {
      onShowToast?.("已進入【執筆模式】：點擊手稿段落即時定位，對照修煉");
    } else {
      onShowToast?.("已進入【問道模式】：清談論道、架構推演與答疑解惑");
    }
    tick().then(() => textareaEl?.focus());
  }

  function handleInsertSelectionToInput() {
    if (!selectionText || !selectionText.trim()) return;
    const cleanSel = selectionText.trim();
    const quoteFormat = `> ${cleanSel.split("\n").join("\n> ")}\n\n`;
    inputVal = inputVal ? `${quoteFormat}${inputVal}` : quoteFormat;
    onShowToast?.("已將手稿選取內文帶入輸入框");
    tick().then(() => textareaEl?.focus());
  }

  function handleLockSelectionAsTarget() {
    if (!selectionText || !selectionText.trim()) return;
    const clean = selectionText.trim();
    customLockedParagraph = {
      text: clean,
      label: `鎖定標的 (${clean.length} 字)`,
    };
    onShowToast?.("已將選取片段鎖定為執筆標的");
  }

  function handleUnlockParagraph() {
    customLockedParagraph = null;
    onShowToast?.("已恢復點擊即定位段落");
  }

  function handleDrawerKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }

  async function handleSendMessage() {
    const text = inputVal.trim();
    if (!text || isGenerating) return;

    const targetPara =
      advisorMode === "scribe" ? currentFocusParagraph : undefined;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
      mode: advisorMode,
      targetOriginalText: targetPara?.text,
      paragraphLabel: targetPara?.label,
    };

    messages = [...messages, userMsg];
    inputVal = "";
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
        history: messages.filter((m) => m.id !== "welcome"),
        userMessage: text,
        advisorMode,
        targetParagraph:
          targetPara && targetPara.text
            ? { text: targetPara.text, label: targetPara.label }
            : undefined,
        signal: abortController.signal,
        contextNote:
          attachContext && activeTab
            ? {
                title: activeTab.title,
                content: activeTab.content,
                selection: selectionText || undefined,
              }
            : undefined,
      };

      const res = await sendChatMessage(options);
      messages = [...messages, res.message];
      await tick();
      scrollToBottom();
    } catch (err: any) {
      if (err.name !== "AbortError") {
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `生成遇到阻礙：${err.message || "未知錯誤"}。請檢查 API Key 或網路連線。`,
          timestamp: Date.now(),
          engineUsed: "錯誤警示",
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
      onShowToast?.("已中斷回答生成");
    }
  }

  function handleClearHistory() {
    messages = [
      {
        id: "welcome",
        role: "assistant",
        content: "對話記錄已清空。請問有什麼想與參謀一同參悟的？",
        timestamp: Date.now(),
        engineUsed: "系統引導",
      },
    ];
    onShowToast?.("已清空參謀對話紀錄");
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      onShowToast?.("已複製內容至剪貼簿");
      setTimeout(() => {
        if (copiedId === id) copiedId = null;
      }, 2000);
    } catch (e) {
      onShowToast?.("複製失敗，請手動選取");
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  function handleSendReview(msg: ChatMessage) {
    const textToReview = msg.targetRefinedText || msg.content;
    onSendToReview(textToReview, `參謀執筆成果 (${selectedAiModel})`);
    onShowToast?.("已將參謀建議送入丹道對照審核");
  }

  function handleApplyReplace(msg: ChatMessage) {
    const orig = msg.targetOriginalText;
    const refined = msg.targetRefinedText || msg.content;
    if (!orig || !refined) {
      onShowToast?.("無法取得對應的原手稿段落");
      return;
    }
    if (onReplaceTargetText) {
      onReplaceTargetText(orig, refined);
    } else {
      onInsertToEditor(refined);
      onShowToast?.("已插入至游標位置");
    }
  }

  function handleApplyBoth(msg: ChatMessage) {
    const orig = msg.targetOriginalText;
    const refined = msg.targetRefinedText || msg.content;
    if (!orig || !refined) return;
    const combined = `${orig}\n\n> 【參謀修訂成果】：\n${refined}`;
    if (onReplaceTargetText) {
      onReplaceTargetText(orig, combined);
      onShowToast?.("已採納兩者並存格式");
    } else {
      onInsertToEditor(combined);
    }
  }
</script>

{#if isOpen}
  <!-- 伴隨式側欄容器 (無阻擋穿透，放行左側手稿編輯器點擊與選字) -->
  <div
    class="drawer-backdrop"
    onkeydown={handleDrawerKeydown}
    role="presentation"
  >
    <div
      class="chat-drawer mode-{advisorMode}"
      role="dialog"
      aria-modal="true"
      aria-label="竹語參謀抽屜"
    >
      <!-- 頂部標頭：單行精簡寬鬆設計 -->
      <header class="drawer-header">
        <div class="header-left">
          <span class="brand-glyph">◈</span>
          <div class="title-cluster">
            <h2 class="header-title">竹語參謀</h2>
            <span
              class="model-whisper"
              title="{selectedAiModel.toUpperCase()} · {selectedAiModelId}"
            >
              {selectedAiModelId}
            </span>
          </div>
        </div>

        <div class="header-right">
          <!-- 雙模式切換膠囊 -->
          <div
            class="mode-toggle-dock"
            role="tablist"
            aria-label="參謀運作模式"
          >
            <button
              type="button"
              class="mode-dock-btn {advisorMode === 'inquiry' ? 'active' : ''}"
              onclick={() => handleSwitchMode("inquiry")}
              title="問道模式：思維推演、架構設計與答疑解惑"
            >
              <span class="glyph-mono">◎</span>
              <span>問道</span>
            </button>
            <button
              type="button"
              class="mode-dock-btn {advisorMode === 'scribe' ? 'active' : ''}"
              onclick={() => handleSwitchMode("scribe")}
              title="執筆模式：針對手稿段落來回微調與對照替換"
            >
              <span class="glyph-mono">❖</span>
              <span>執筆</span>
            </button>
          </div>

          <div class="header-actions">
            <button
              type="button"
              class="action-icon-btn"
              onclick={handleClearHistory}
              title="清空對話紀錄"
            >
              <Trash2 size={14} />
            </button>
            <button
              type="button"
              class="action-icon-btn close-btn"
              onclick={onClose}
              title="收合參謀 (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </header>

      <!-- 當前脈絡附加條：去框化輕量設計 -->
      {#if activeTab}
        <div class="context-bar">
          <label class="context-toggle">
            <input type="checkbox" bind:checked={attachContext} />
            <span class="context-label">附帶當前手稿脈絡</span>
          </label>
          <div
            class="context-file"
            title="{activeTab.title} ({activeTab.content.length} 字)"
          >
            <span class="glyph-mono file-dot">◇</span>
            <span class="file-title">{activeTab.title}</span>
            <span class="file-words">{activeTab.content.length} 字</span>
          </div>
        </div>
      {/if}

      <!-- 對話訊息列表：無頭像框干擾、寬鬆文稿流 -->
      <div class="messages-container" bind:this={messagesContainer}>
        {#each messages as msg (msg.id)}
          <div class="message-block role-{msg.role}">
            <!-- 訊息抬頭 -->
            <div class="msg-meta-header">
              <span class="msg-glyph">
                {msg.role === "user" ? "◇" : "◈"}
              </span>
              <span class="msg-sender"
                >{msg.role === "user" ? "閣下" : "竹語參謀"}</span
              >
              {#if msg.mode === "scribe"}
                <span class="msg-badge scribe">❖ 執筆</span>
              {/if}
              {#if msg.engineUsed && msg.id !== "welcome"}
                <span class="msg-engine">{msg.engineUsed}</span>
              {/if}
            </div>

            <!-- 執筆模式：清透段落對照席 -->
            {#if msg.role === "assistant" && msg.targetOriginalText}
              <div class="scribe-diff-card">
                <div class="scribe-diff-meta">
                  <span class="scribe-card-tag"
                    >◬ {msg.paragraphLabel || "段落對照修煉"}</span
                  >
                  <span class="scribe-card-tip">可於下方持續輸入指令微調</span>
                </div>

                <div class="scribe-diff-panes">
                  <!-- 原始手稿段落 -->
                  <div class="diff-pane origin-pane">
                    <div class="pane-header">
                      <span class="glyph-mono">▢</span>
                      <span>原始段落</span>
                    </div>
                    <pre class="origin-code">{msg.targetOriginalText}</pre>
                  </div>

                  <!-- 參謀執筆成果 -->
                  <div class="diff-pane refined-pane">
                    <div class="pane-header">
                      <span class="glyph-mono">◈</span>
                      <span>參謀修訂稿</span>
                    </div>
                    <div class="pane-body">
                      <MarkdownViewer
                        content={msg.targetRefinedText || msg.content}
                      />
                    </div>
                  </div>
                </div>

                <!-- 溫潤膠囊採納列 -->
                <div class="scribe-diff-actions">
                  <button
                    type="button"
                    class="btn-scribe-action btn-apply"
                    onclick={() => handleApplyReplace(msg)}
                    title="直接以修訂稿置換手稿中的該段落"
                  >
                    <Check size={13} />
                    <span>採納替換</span>
                  </button>

                  <button
                    type="button"
                    class="btn-scribe-action btn-both"
                    onclick={() => handleApplyBoth(msg)}
                    title="保留原段落並在下方追加修訂成果"
                  >
                    <PlusCircle size={13} />
                    <span>兩者並存</span>
                  </button>

                  <button
                    type="button"
                    class="btn-scribe-action"
                    onclick={() => handleSendReview(msg)}
                    title="送入全篇雙欄對照審核"
                  >
                    <ScrollText size={13} />
                    <span>雙欄審核</span>
                  </button>

                  <button
                    type="button"
                    class="btn-scribe-action"
                    onclick={() =>
                      copyToClipboard(
                        msg.targetRefinedText || msg.content,
                        msg.id,
                      )}
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
              <!-- 一般問道模式內容區 -->
              <div class="msg-body">
                {#if msg.role === "assistant"}
                  <MarkdownViewer content={msg.content} />
                {:else}
                  <pre class="message-text">{msg.content}</pre>
                {/if}
              </div>

              <!-- 問道模式操作列 -->
              {#if msg.role === "assistant" && msg.id !== "welcome"}
                <div class="msg-actions">
                  <button
                    type="button"
                    class="btn-action primary-hint"
                    onclick={() => handleSendReview(msg)}
                    title="將本段建議與當前手稿送入逐段對照審核"
                  >
                    <ScrollText size={12} />
                    <span>送入對照審核</span>
                  </button>

                  <button
                    type="button"
                    class="btn-action"
                    onclick={() => {
                      onInsertToEditor(msg.content);
                      onShowToast?.("已插入至游標位置");
                    }}
                    title="直接插入至當前編輯器游標處"
                  >
                    <PlusCircle size={12} />
                    <span>插入游標處</span>
                  </button>

                  <button
                    type="button"
                    class="btn-action"
                    onclick={() => copyToClipboard(msg.content, msg.id)}
                    title="複製內容"
                  >
                    {#if copiedId === msg.id}
                      <Check size={12} class="icon-check" />
                      <span>已複製</span>
                    {:else}
                      <Copy size={12} />
                      <span>複製</span>
                    {/if}
                  </button>
                </div>
              {/if}
            {/if}
          </div>
        {/each}

        {#if isGenerating}
          <div class="thinking-bar">
            <Loader2 size={15} class="spin" />
            <span
              >{advisorMode === "scribe"
                ? "參謀正在推敲修訂段落..."
                : "參謀正在推演心法..."}</span
            >
            <button
              type="button"
              class="btn-stop-generating"
              onclick={handleStop}>中斷</button
            >
          </div>
        {/if}
      </div>

      <!-- 底部一體化輸入艙 -->
      <footer class="drawer-footer">
        <div class="composer-box">
          <!-- 附加上下文橫欄：選取文字或執筆定位（整合於輸入框頂部，無多餘接縫） -->
          {#if selectionText && selectionText.trim()}
            <div class="composer-context-strip selection-strip">
              <div class="strip-left">
                <span class="strip-badge warm"
                  >已選取 {selectionText.trim().length} 字</span
                >
                <span class="strip-preview" title={selectionText.trim()}>
                  {selectionText.trim().slice(0, 36)}
                </span>
              </div>
              <div class="strip-actions">
                <button
                  type="button"
                  class="strip-btn"
                  onclick={handleInsertSelectionToInput}
                  title="以引言格式帶入輸入框"
                >
                  <CornerDownLeft size={11} />
                  <span>帶入引言</span>
                </button>
                {#if advisorMode === "scribe"}
                  <button
                    type="button"
                    class="strip-btn highlight"
                    onclick={handleLockSelectionAsTarget}
                    title="鎖定為執筆修煉標的"
                  >
                    <span>定為標的</span>
                  </button>
                {/if}
              </div>
            </div>
          {:else if advisorMode === "scribe"}
            <div class="composer-context-strip anchor-strip">
              <div class="strip-left">
                <span class="strip-badge">◬ {currentFocusParagraph.label}</span>
                <span class="strip-preview" title={currentFocusParagraph.text}>
                  {currentFocusParagraph.text || "（當前段落空白）"}
                </span>
              </div>
              <div class="strip-actions">
                {#if customLockedParagraph}
                  <button
                    type="button"
                    class="strip-btn highlight"
                    onclick={handleUnlockParagraph}
                    title="解除手動鎖定，恢復點擊手稿即時定位"
                  >
                    <RefreshCw size={10} />
                    <span>解除鎖定</span>
                  </button>
                {:else}
                  <span class="strip-whisper">點擊手稿自動同步</span>
                {/if}
              </div>
            </div>
          {/if}

          <!-- 輸入文字框 -->
          <div class="textarea-wrapper">
            <textarea
              bind:this={textareaEl}
              class="chat-textarea"
              placeholder={advisorMode === "scribe"
                ? "交代執筆修訂方向（例如：精簡贅字、改為條列式）..."
                : "向參謀問道（Enter 送出，Shift+Enter 換行）..."}
              rows="3"
              bind:value={inputVal}
              onkeydown={handleKeyDown}
              disabled={isGenerating}></textarea>

            <div class="composer-bottom">
              <span class="composer-hint">
                {advisorMode === "scribe"
                  ? "❖ 針對鎖定段落進行雙欄對照修訂"
                  : "◎ 自由問答與架構推演"}
              </span>

              {#if isGenerating}
                <button
                  type="button"
                  class="btn-send is-stop"
                  onclick={handleStop}
                >
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
                  <Send size={12} />
                </button>
              {/if}
            </div>
          </div>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 998;
    background: transparent;
    pointer-events: none;
    display: flex;
    justify-content: flex-end;
  }

  .glyph-mono {
    font-family: "JetBrains Mono", monospace;
    line-height: 1;
  }

  /* 抽屜主體：Apothecary Gruvbox 寬鬆通透感 */
  .chat-drawer {
    pointer-events: auto;
    width: 480px;
    max-width: 94vw;
    height: 100vh;
    background: rgba(20, 22, 21, 0.98);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-left: 1px solid rgba(100, 86, 66, 0.35);
    box-shadow: -20px 0 50px rgba(0, 0, 0, 0.75);
    display: flex;
    flex-direction: column;
    animation: slideLeft 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    transition: width 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .chat-drawer.mode-scribe {
    width: 600px;
  }

  /* 頂部標頭：單行清爽佈局 */
  .drawer-header {
    height: 54px;
    padding: 0 18px;
    background: rgba(16, 18, 17, 0.9);
    border-bottom: 1px solid rgba(100, 86, 66, 0.22);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .brand-glyph {
    font-family: "JetBrains Mono", monospace;
    font-size: 16px;
    color: #fabd2f;
  }

  .title-cluster {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .header-title {
    margin: 0;
    font-size: 14.5px;
    font-weight: 600;
    color: #ebdbb2;
    letter-spacing: 0.03em;
    white-space: nowrap;
  }

  .model-whisper {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: #7c7365;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 130px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  /* 雙模式膠囊底座 */
  .mode-toggle-dock {
    display: flex;
    align-items: center;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(100, 86, 66, 0.25);
    border-radius: 7px;
    padding: 2px;
    gap: 2px;
  }

  .mode-dock-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: none;
    color: #8c8273;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .mode-dock-btn:hover {
    color: #d5c4a1;
  }

  .mode-dock-btn.active {
    background: rgba(250, 189, 47, 0.12);
    color: #fabd2f;
    font-weight: 500;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .action-icon-btn {
    background: transparent;
    border: none;
    color: #7c7365;
    cursor: pointer;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.14s ease;
  }

  .action-icon-btn:hover {
    color: #ebdbb2;
    background: rgba(255, 255, 255, 0.05);
  }

  .action-icon-btn.close-btn:hover {
    color: #fb4934;
    background: rgba(251, 73, 52, 0.12);
  }

  /* 當前篇章背景條 */
  .context-bar {
    background: rgba(16, 18, 17, 0.45);
    border-bottom: 1px solid rgba(100, 86, 66, 0.18);
    padding: 7px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: #7c7365;
    flex-shrink: 0;
  }

  .context-toggle {
    display: flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    user-select: none;
    color: #9c8f7a;
  }

  .context-toggle input {
    accent-color: #fabd2f;
    cursor: pointer;
  }

  .context-file {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #b8ac99;
    max-width: 220px;
    overflow: hidden;
    white-space: nowrap;
    font-size: 11.5px;
  }

  .file-dot {
    color: #fabd2f;
    font-size: 11px;
  }

  .file-title {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-words {
    color: #665c54;
    font-size: 11px;
    flex-shrink: 0;
  }

  /* 訊息列表：寬鬆無頭像框干擾 */
  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .messages-container::-webkit-scrollbar {
    width: 5px;
  }

  .messages-container::-webkit-scrollbar-thumb {
    background: rgba(100, 86, 66, 0.3);
    border-radius: 3px;
  }

  .message-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
    animation: fadeIn 0.15s ease-out;
  }

  .message-block.role-user {
    align-items: flex-end;
  }

  .msg-meta-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: #7c7365;
    padding: 0 2px;
  }

  .msg-glyph {
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    color: #fabd2f;
  }

  .role-user .msg-glyph {
    color: #a89984;
  }

  .msg-sender {
    font-weight: 500;
    color: #b8ac99;
  }

  .msg-badge.scribe {
    font-size: 10.5px;
    color: #8ec07c;
    background: rgba(142, 192, 124, 0.1);
    padding: 0.5px 6px;
    border-radius: 4px;
  }

  .msg-engine {
    font-family: "JetBrains Mono", monospace;
    font-size: 10.5px;
    color: #665c54;
  }

  /* 問道內容區：參謀回覆採清透寬鬆排版，使用者提問採溫潤琥珀膠囊 */
  .msg-body {
    font-size: 13.5px;
    line-height: 1.7;
    color: #e6dfd5;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(100, 86, 66, 0.22);
    border-radius: 9px;
    max-width: 100%;
  }

  .role-user .msg-body {
    background: rgba(250, 189, 47, 0.08);
    border-color: rgba(250, 189, 47, 0.24);
    color: #fbf1c7;
    max-width: 88%;
  }

  .message-text {
    margin: 0;
    font-family: inherit;
    font-size: 13.5px;
    line-height: 1.65;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* 訊息下方輕量操作列 */
  .msg-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    flex-wrap: wrap;
  }

  .btn-action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: 1px solid rgba(100, 86, 66, 0.25);
    color: #8c8273;
    font-size: 11.5px;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .btn-action:hover {
    background: rgba(255, 255, 255, 0.04);
    color: #ebdbb2;
    border-color: rgba(250, 189, 47, 0.35);
  }

  .btn-action.primary-hint {
    color: #d49b35;
    border-color: rgba(212, 155, 53, 0.3);
    background: rgba(250, 189, 47, 0.05);
  }

  .btn-action.primary-hint:hover {
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.12);
  }

  :global(.icon-check) {
    color: #8ec07c;
  }

  /* 執筆模式：清透段落對照席 */
  .scribe-diff-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(100, 86, 66, 0.3);
    border-radius: 10px;
    padding: 14px 16px;
  }

  .scribe-diff-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11.5px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(100, 86, 66, 0.18);
  }

  .scribe-card-tag {
    color: #fabd2f;
    font-weight: 500;
  }

  .scribe-card-tip {
    color: #665c54;
    font-size: 11px;
  }

  .scribe-diff-panes {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .diff-pane {
    border-radius: 7px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .diff-pane.origin-pane {
    background: rgba(0, 0, 0, 0.25);
    border-left: 2px solid rgba(140, 130, 115, 0.4);
  }

  .diff-pane.refined-pane {
    background: rgba(250, 189, 47, 0.04);
    border-left: 2.5px solid #fabd2f;
  }

  .pane-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 500;
    color: #8c8273;
  }

  .refined-pane .pane-header {
    color: #fabd2f;
  }

  .origin-code {
    margin: 0;
    font-family: inherit;
    font-size: 12.5px;
    color: #9c8f7a;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 130px;
    overflow-y: auto;
    line-height: 1.6;
  }

  .refined-pane .pane-body {
    font-size: 13.5px;
    color: #ebdbb2;
    max-height: 260px;
    overflow-y: auto;
    line-height: 1.7;
  }

  /* 執筆卡片採納列 */
  .scribe-diff-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding-top: 8px;
    border-top: 1px solid rgba(100, 86, 66, 0.18);
  }

  .btn-scribe-action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 11px;
    font-size: 12px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid rgba(100, 86, 66, 0.28);
    background: transparent;
    color: #b8ac99;
    transition: all 0.14s ease;
  }

  .btn-scribe-action:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ebdbb2;
    border-color: rgba(250, 189, 47, 0.35);
  }

  .btn-scribe-action.btn-apply {
    background: rgba(142, 192, 124, 0.14);
    color: #8ec07c;
    border-color: rgba(142, 192, 124, 0.38);
    font-weight: 500;
  }

  .btn-scribe-action.btn-apply:hover {
    background: #8ec07c;
    color: #1d2021;
  }

  .btn-scribe-action.btn-both {
    background: rgba(250, 189, 47, 0.08);
    color: #fabd2f;
    border-color: rgba(250, 189, 47, 0.28);
  }

  .btn-scribe-action.btn-both:hover {
    background: rgba(250, 189, 47, 0.16);
  }

  /* 思考中狀態條 */
  .thinking-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(250, 189, 47, 0.05);
    border: 1px solid rgba(250, 189, 47, 0.22);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 12.5px;
    color: #fabd2f;
  }

  .btn-stop-generating {
    background: rgba(251, 73, 52, 0.12);
    border: 1px solid rgba(251, 73, 52, 0.3);
    color: #fb4934;
    border-radius: 5px;
    padding: 2px 9px;
    font-size: 11.5px;
    cursor: pointer;
    margin-left: auto;
  }

  /* 底部一體化輸入艙 */
  .drawer-footer {
    padding: 12px 18px 18px 18px;
    background: rgba(16, 18, 17, 0.9);
    border-top: 1px solid rgba(100, 86, 66, 0.2);
    flex-shrink: 0;
  }

  .composer-box {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(100, 86, 66, 0.34);
    border-radius: 10px;
    overflow: hidden;
    transition: all 0.16s ease;
  }

  .composer-box:focus-within {
    border-color: rgba(250, 189, 47, 0.5);
    background: rgba(0, 0, 0, 0.42);
  }

  /* 輸入艙內嵌上下文頂欄 */
  .composer-context-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 12px;
    background: rgba(255, 255, 255, 0.025);
    border-bottom: 1px solid rgba(100, 86, 66, 0.2);
    font-size: 11.5px;
  }

  .strip-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .strip-badge {
    font-size: 11px;
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.1);
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 500;
    flex-shrink: 0;
  }

  .strip-badge.warm {
    background: rgba(250, 189, 47, 0.18);
  }

  .strip-preview {
    color: #8c8273;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .strip-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .strip-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    font-size: 11px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid rgba(100, 86, 66, 0.3);
    background: transparent;
    color: #b8ac99;
    transition: all 0.14s ease;
  }

  .strip-btn:hover,
  .strip-btn.highlight {
    color: #fabd2f;
    border-color: rgba(250, 189, 47, 0.35);
    background: rgba(250, 189, 47, 0.08);
  }

  .strip-whisper {
    font-size: 11px;
    color: #665c54;
  }

  .textarea-wrapper {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .chat-textarea {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: #ebdbb2;
    font-size: 13.5px;
    font-family: inherit;
    resize: none;
    line-height: 1.6;
  }

  .chat-textarea::placeholder {
    color: #665c54;
  }

  .composer-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 2px;
  }

  .composer-hint {
    font-size: 11.5px;
    color: #665c54;
  }

  .btn-send {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(250, 189, 47, 0.14);
    color: #fabd2f;
    border: 1px solid rgba(250, 189, 47, 0.38);
    border-radius: 6px;
    padding: 5px 14px;
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-send:hover:not(:disabled) {
    background: #fabd2f;
    color: #1d2021;
  }

  .btn-send:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .btn-send.is-stop {
    background: rgba(251, 73, 52, 0.14);
    border-color: rgba(251, 73, 52, 0.4);
    color: #fb4934;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
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
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
