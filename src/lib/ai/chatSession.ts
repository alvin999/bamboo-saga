import type { AiProvider } from '../../types/tab';
import { normalizeEndpoint } from './modelFetcher';
import { formatIndexedPromptInput } from './refinery';
import { sanitizeForAi } from '../security/sanitizerGuard';

export type AdvisorMode = 'inquiry' | 'scribe'; // 'inquiry': 💬 問道模式, 'scribe': ✍️ 執筆模式

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  engineUsed?: string;
  mode?: AdvisorMode;
  targetOriginalText?: string;   // 執筆模式下鎖定的原始手稿段落
  targetRefinedText?: string;    // 執筆模式下的修訂成果（供對照）
  paragraphLabel?: string;       // 段落標籤，如「段落 P1」或「選取焦點」
}

export interface SendChatOptions {
  model: AiProvider;
  modelId?: string;
  groqKey: string;
  geminiKey: string;
  customKey?: string;
  customEndpoint?: string;
  history: ChatMessage[];
  userMessage: string;
  advisorMode?: AdvisorMode;      // 模式：問道 (inquiry) 或 執筆 (scribe)
  targetParagraph?: {            // 執筆模式鎖定的段落文字與標籤
    text: string;
    label?: string;
  };
  contextNote?: {
    title: string;
    content: string;
    selection?: string;
  };
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  message: ChatMessage;
  engineUsed: string;
}

/**
 * 構建帶有 Bamboo Saga 禪風與台灣繁體中文規範的系統提示詞
 * 支援「💬 問道模式（論道諮詢）」與「✍️ 執筆模式（段落修煉對照）」
 */
function buildSystemPrompt(
  advisorMode: AdvisorMode = 'inquiry',
  contextNote?: { title: string; content: string; selection?: string },
  targetParagraph?: { text: string; label?: string }
): string {
  if (advisorMode === 'scribe') {
    let prompt = `你是一位精通文字淬鍊、修辭潤墨與架構重整的隨身執筆參謀，服務於《廣零散》（Bamboo Saga）沉浸式筆記工作台。
目前處於【✍️ 執筆模式】：宛如煉丹爐鼎，專注於「段落迭代修訂與精準對照」。
使用者的指令是針對特定段落進行改寫、優化、重排版或代碼重構。

【執筆準則】：
1. 一律使用正體/繁體中文（台灣習慣用語與標準技術名詞，如「程式碼」、「專案」、「記憶體」、「演算法」）。
2. 請直接輸出修訂後的具體文本或程式碼，力求版面優雅、段落層次分明。
3. 避免過多空泛寒暄，將核心精力放在產出高品質、可直接採納替換手稿的精煉文字。
4. 當提及程式碼時，必須標明語言代號（如 \`\`\`ts, \`\`\`rust, \`\`\`python, \`\`\`sql 等）。
5. 若前幾輪對話已有上一版修訂稿，請視為迭代過程，依使用者最新指令在前版成果基礎上持續精進。`;

    if (targetParagraph && targetParagraph.text.trim()) {
      prompt += `\n\n【當前鎖定修煉之手稿段落 (${targetParagraph.label || '目標段落'})】：
"""
${targetParagraph.text}
"""`;
    } else if (contextNote?.selection) {
      prompt += `\n\n【當前反白選取之焦點片段】：
"""
${contextNote.selection}
"""`;
    }

    if (contextNote && contextNote.content.trim()) {
      prompt += `\n\n【全篇手稿背景（僅供語意與上下文參考，切勿隨意改動其他未鎖定段落）】：
篇名：${contextNote.title || '無標題素簡'}
"""
${contextNote.content.slice(0, 4000)}${contextNote.content.length > 4000 ? '\n... (節錄)' : ''}
"""`;
    }

    return prompt;
  }

  // 預設：💬 問道模式 (Inquiry)
  let prompt = `你是一位精通技術與修辭的隨身參謀兼知識提煉師，服務於《廣零散》（Bamboo Saga）沉浸式筆記工作台。
目前處於【💬 問道模式】：著重於思維推演、架構設計、技術釋疑與心法探討。
請遵循以下守則：
1. 一律使用正體/繁體中文（台灣習慣用語與技術名詞，如「程式碼」、「專案」、「記憶體」、「演算法」）回答。
2. 語氣兼具技術精準與文人雅趣，排版需優雅層次分明。
3. 重在提供觀點、解答疑惑、分析利弊，不強行改動手稿結構。
4. 當提及代碼時，必須標明語言代號（如 \`\`\`ts, \`\`\`rust, \`\`\`markdown 等）。`;

  if (contextNote && contextNote.content.trim()) {
    prompt += `\n\n【當前研讀之藥帖背景】：
篇名：${contextNote.title || '無標題素簡'}
${contextNote.selection ? `目前反白選取的焦點片段：\n"""\n${contextNote.selection}\n"""\n` : ''}
全文參考手稿：
"""
${contextNote.content.slice(0, 8000)}${contextNote.content.length > 8000 ? '\n... (其餘內容已節錄)' : ''}
"""`;
  }

  return prompt;
}

/**
 * 發送對話訊息（支援 Groq 與 Gemini，保留多輪上下文，支援問道與執筆雙模式）
 */
export async function sendChatMessage(options: SendChatOptions): Promise<ChatCompletionResult> {
  const { model, modelId, groqKey, geminiKey, customKey, customEndpoint, history, userMessage, advisorMode = 'inquiry', targetParagraph, contextNote, signal } = options;
  const isLocal = model === 'custom';

  // 5.2 / 3.6 機敏防護過濾：若研讀之筆記標記私密標籤，雲端 AI 絕對封鎖
  if (contextNote?.content) {
    const noteCheck = sanitizeForAi(contextNote.content, isLocal);
    if (noteCheck.isBlocked) {
      throw new Error(noteCheck.blockedReason || '⚠️ 該藥帖標註有私密標籤（#private），廣零散安全防護已攔截，禁止送至雲端 AI！');
    }
  }

  // 對使用者提問與段落進行正則安全脫敏
  const safeUserMessage = sanitizeForAi(userMessage, isLocal).sanitizedText;
  const safeContextNote = contextNote ? {
    ...contextNote,
    content: sanitizeForAi(contextNote.content, isLocal).sanitizedText,
    selection: contextNote.selection ? sanitizeForAi(contextNote.selection, isLocal).sanitizedText : undefined,
  } : undefined;
  const safeTargetParagraph = targetParagraph ? {
    ...targetParagraph,
    text: sanitizeForAi(targetParagraph.text, isLocal).sanitizedText,
  } : undefined;

  const systemPrompt = buildSystemPrompt(advisorMode, safeContextNote, safeTargetParagraph);

  // 1. 若使用自訂本地端點 (Ollama / LM Studio)
  if (model === 'custom') {
    const endpoint = normalizeEndpoint(customEndpoint || 'http://localhost:11434/v1');
    const customModel = modelId || 'llama3.2';

    // 只取最近 10 輪避免超過 context window
    const recentHistory = history.slice(-10).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: sanitizeForAi(m.content, isLocal).sanitizedText,
    }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: safeUserMessage },
    ];

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (customKey && customKey.trim()) {
      headers['Authorization'] = `Bearer ${customKey.trim()}`;
    }

    try {
      const resp = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: customModel,
          messages,
          temperature: 0.5,
        }),
        signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error?.message || `本地端點 API 錯誤 (${resp.status})`);
      }

      const data = await resp.json();
      const answer = data.choices?.[0]?.message?.content || '';
      const origText = targetParagraph?.text || contextNote?.selection || '';
      return {
        message: {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'assistant',
          content: answer,
          timestamp: Date.now(),
          engineUsed: `Local (${customModel})`,
          mode: advisorMode,
          targetOriginalText: advisorMode === 'scribe' ? origText : undefined,
          targetRefinedText: advisorMode === 'scribe' ? answer : undefined,
          paragraphLabel: advisorMode === 'scribe' ? (targetParagraph?.label || '當前段落') : undefined,
        },
        engineUsed: `Local (${customModel})`,
      };
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      console.warn('本地端點對話請求失敗：', e);
      throw e;
    }
  }

  // 2. 若使用 Groq
  if (model === 'groq' && groqKey) {
    const groqModel = modelId || 'llama-3.3-70b-versatile';
    
    // 只取最近 10 輪避免超過 context window
    const recentHistory = history.slice(-10).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory,
      { role: 'user', content: userMessage },
    ];

    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: groqModel,
          messages,
          temperature: 0.5,
        }),
        signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Groq API 錯誤 (${resp.status})`);
      }

      const data = await resp.json();
      const answer = data.choices?.[0]?.message?.content || '';
      const origText = targetParagraph?.text || contextNote?.selection || '';
      return {
        message: {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'assistant',
          content: answer,
          timestamp: Date.now(),
          engineUsed: `Groq (${groqModel})`,
          mode: advisorMode,
          targetOriginalText: advisorMode === 'scribe' ? origText : undefined,
          targetRefinedText: advisorMode === 'scribe' ? answer : undefined,
          paragraphLabel: advisorMode === 'scribe' ? (targetParagraph?.label || '當前段落') : undefined,
        },
        engineUsed: `Groq (${groqModel})`,
      };
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      console.warn('Groq 對話請求失敗：', e);
      throw e;
    }
  }

  // 2. 若使用 Gemini
  if (model === 'gemini' && geminiKey) {
    const rawId = modelId || 'gemini-1.5-flash';
    const geminiModel = rawId.includes('gemini-2.5-flash') || !rawId.toLowerCase().includes('gemini') ? 'gemini-1.5-flash' : rawId;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;

    // Gemini 格式：contents陣列
    const contents: any[] = [];

    // System instruction (Gemini 1.5 支援 systemInstruction，但為求相容亦可放在首個 user turn)
    // 放入近 10 輪歷史
    const recentHistory = history.slice(-10);
    for (const h of recentHistory) {
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      });
    }

    // 當前 user message
    contents.push({
      role: 'user',
      parts: [{ text: `${userMessage}` }],
    });

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents,
          generationConfig: {
            temperature: 0.5,
          },
        }),
        signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Gemini API 錯誤 (${resp.status})`);
      }

      const data = await resp.json();
      const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const origText = targetParagraph?.text || contextNote?.selection || '';
      return {
        message: {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'assistant',
          content: answer,
          timestamp: Date.now(),
          engineUsed: `Gemini (${geminiModel})`,
          mode: advisorMode,
          targetOriginalText: advisorMode === 'scribe' ? origText : undefined,
          targetRefinedText: advisorMode === 'scribe' ? answer : undefined,
          paragraphLabel: advisorMode === 'scribe' ? (targetParagraph?.label || '當前段落') : undefined,
        },
        engineUsed: `Gemini (${geminiModel})`,
      };
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      console.warn('Gemini 對話請求失敗：', e);
      throw e;
    }
  }

  // 3. 本地模擬智慧對話 (Local Heuristic Fallback)
  await new Promise((r) => setTimeout(r, 600));
  const fallbackOrig = targetParagraph?.text || contextNote?.selection || '（當前手稿無反白選取段落）';
  const simulatedAnswer = advisorMode === 'scribe'
    ? `### ✨ 參謀執筆微調成果\n依據閣下心法指令「${userMessage}」，已重鑄此段落。\n\n\`\`\`markdown\n${fallbackOrig}\n\`\`\`\n\n> 💡 填入 Groq 或 Gemini API Key 可啟動真實雲端大模型深度修煉。`
    : `【參謀回報】：已收到您的心法指令「${userMessage}」。\n\n若需啟用雲端大模型深度推理，請於設定面板填入 Groq 或 Gemini API Key。\n\n若您希望將此回應送入丹道對照，可點擊下方「📜 送入丹道對照審核」將本段成果與手稿進行逐段比對！`;

  return {
    message: {
      id: `msg-sim-${Date.now()}`,
      role: 'assistant',
      content: simulatedAnswer,
      timestamp: Date.now(),
      engineUsed: '本地預覽 (Local Mock)',
      mode: advisorMode,
      targetOriginalText: advisorMode === 'scribe' ? fallbackOrig : undefined,
      targetRefinedText: advisorMode === 'scribe' ? simulatedAnswer : undefined,
      paragraphLabel: advisorMode === 'scribe' ? (targetParagraph?.label || '當前段落') : undefined,
    },
    engineUsed: '本地預覽',
  };
}

/**
 * 專為行內浮動指令（Inline Prompt）設計的單次改寫請求
 * 自動注入段落索引 [P1], [P2]... 以利後續 100% 精準對照審核
 */
export async function executeInlinePromptRefine(options: {
  instruction: string;
  content: string;
  selection?: string;
  model: 'groq' | 'gemini';
  modelId?: string;
  groqKey: string;
  geminiKey: string;
  signal?: AbortSignal;
}): Promise<{ refinedText: string; summary: string; engineUsed: string }> {
  const { instruction, content, selection, model, modelId, groqKey, geminiKey, signal } = options;
  const targetText = selection && selection.trim() ? selection : content;
  const isLocal = (model as any) === 'custom';

  // 5.2 / 3.6 機敏資訊防護濾網
  const sanitizeRes = sanitizeForAi(targetText, isLocal);
  if (sanitizeRes.isBlocked) {
    throw new Error(sanitizeRes.blockedReason || '⚠️ 此筆記標註有私密標籤（#private），廣零散安全防護已攔截，禁止送至雲端 AI！');
  }
  const safeTargetText = sanitizeRes.sanitizedText;
  const safeInstruction = sanitizeForAi(instruction, isLocal).sanitizedText;
  const indexedTargetText = formatIndexedPromptInput(safeTargetText);

  const prompt = `你是一位敏銳且擅長知識提煉的結構化筆記師。使用者下達了具體修改指令，請依據指令將以下內容進行改寫、優化或重新組織：

【使用者的修改指令】：
${safeInstruction}

【排版與渲染規範】：
- 請一律以正體/繁體中文（台灣習慣用語）輸出。
- 重點段落標題請保留【】中文括號以觸發編輯器琥珀金高亮標籤。
- 【省 Token 溯源編號】：原文已按段落標註 [P1]、[P2]...，請在各整理段落的末端標記其對應的來源編號「<!-- ref: P1 -->」或「> 來源：[P1]」，不用重複回傳原文內容！全篇宏觀總結請標註「<!-- ref: all -->」。
- 若出現程式碼、指令或設定檔，請務必使用標準三重反引號並標明語言標籤（如 \`\`\`ts、\`\`\`python、\`\`\`json、\`\`\`sql）。

原始內容如下：
${indexedTargetText}
`;

  // 1. Groq
  if (model === 'groq' && groqKey) {
    const groqModel = modelId || 'llama-3.3-70b-versatile';
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: groqModel,
        messages: [
          { role: 'system', content: '你是《廣零散》筆記工作台的 AI 提煉師。請輸出繁體中文，注重排版美學與精準度。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
      signal,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Groq API 錯誤 (${resp.status})`);
    }

    const data = await resp.json();
    return {
      refinedText: data.choices?.[0]?.message?.content || '',
      summary: `指令修煉: ${instruction.slice(0, 15)}...`,
      engineUsed: `Groq (${groqModel})`,
    };
  }

  // 2. Gemini
  if (model === 'gemini' && geminiKey) {
    const rawId = modelId || 'gemini-1.5-flash';
    const geminiModel = rawId.includes('gemini-2.5-flash') || !rawId.toLowerCase().includes('gemini') ? 'gemini-1.5-flash' : rawId;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
      signal,
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API 錯誤 (${resp.status})`);
    }

    const data = await resp.json();
    return {
      refinedText: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      summary: `指令修煉: ${instruction.slice(0, 15)}...`,
      engineUsed: `Gemini (${geminiModel})`,
    };
  }

  // 3. Fallback
  await new Promise((r) => setTimeout(r, 600));
  return {
    refinedText: `【🎯 核心概要】\n依據指令「${instruction}」提煉完成。<!-- ref: all -->\n\n【📐 改寫內容】\n${targetText}\n\n> 來源：[P1]`,
    summary: `指令修煉 (本地模擬)`,
    engineUsed: '本地預覽',
  };
}
