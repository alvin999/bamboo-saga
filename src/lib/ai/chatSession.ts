import { formatIndexedPromptInput } from './refinery';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  engineUsed?: string;
}

export interface SendChatOptions {
  model: 'groq' | 'gemini';
  modelId?: string;
  groqKey: string;
  geminiKey: string;
  history: ChatMessage[];
  userMessage: string;
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
 */
function buildSystemPrompt(contextNote?: { title: string; content: string; selection?: string }): string {
  let prompt = `你是一位精通技術與修辭的隨身參謀兼知識提煉師，服務於《廣零散》（Bamboo Saga）沉浸式筆記工作台。
請遵循以下守則：
1. 一律使用正體/繁體中文（台灣習慣用語與技術名詞，如「程式碼」、「專案」、「記憶體」、「演算法」）回答。
2. 語氣兼具技術精準與文人雅趣，排版需優雅層次分明。
3. 若提供修改或潤飾文本，請使用清晰 Markdown 格式，適度使用【】標籤包裹重點。若為整篇建議，請盡量保留段落結構以利後續對照審核。
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
 * 發送對話訊息（支援 Groq 與 Gemini，保留多輪上下文）
 */
export async function sendChatMessage(options: SendChatOptions): Promise<ChatCompletionResult> {
  const { model, modelId, groqKey, geminiKey, history, userMessage, contextNote, signal } = options;
  const systemPrompt = buildSystemPrompt(contextNote);

  // 1. 若使用 Groq
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
      return {
        message: {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'assistant',
          content: answer,
          timestamp: Date.now(),
          engineUsed: `Groq (${groqModel})`,
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
      return {
        message: {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'assistant',
          content: answer,
          timestamp: Date.now(),
          engineUsed: `Gemini (${geminiModel})`,
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
  return {
    message: {
      id: `msg-sim-${Date.now()}`,
      role: 'assistant',
      content: `【參謀回報】：已收到您的心法指令「${userMessage}」。\n\n若需啟用雲端大模型深度推理，請於設定面板填入 Groq 或 Gemini API Key。\n\n若您希望將此回應送入丹道對照，可點擊下方「📜 送入丹道對照審核」將本段成果與手稿進行逐段比對！`,
      timestamp: Date.now(),
      engineUsed: '本地預覽 (Local Mock)',
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
  const indexedTargetText = formatIndexedPromptInput(targetText);

  const prompt = `你是一位敏銳且擅長知識提煉的結構化筆記師。使用者下達了具體修改指令，請依據指令將以下內容進行改寫、優化或重新組織：

【使用者的修改指令】：
${instruction}

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
