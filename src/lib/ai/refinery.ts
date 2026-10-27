export type RefineryMode =
  | 'structure'
  | 'actions'
  | 'explain'
  | 'format'
  | 'organize'
  | 'action_items'
  | 'code_refactor';

import type { AiProvider } from '../../types/tab';
import { normalizeEndpoint } from './modelFetcher';
import { sanitizeForAi } from '../security/sanitizerGuard';
import {
  isChunkingNeeded,
  executeChunkedRefineryPipeline,
  type PipelineProgress,
} from './chunkPipeline';

export interface RefineryRequest {
  model: AiProvider;
  modelId?: string;
  groqKey: string;
  geminiKey: string;
  customKey?: string;
  customEndpoint?: string;
  mode: RefineryMode;
  content: string;
  selection?: string;
  customPrompt?: string;
  cardPrompt?: string;
  onProgress?: (progress: PipelineProgress) => void;
  signal?: AbortSignal;
}

export interface RefineryResult {
  refinedText: string;
  summary: string;
  engineUsed: string;
}

const PROMPT_TEMPLATES: Record<RefineryMode, string> = {
  structure: `你是一位敏銳且擅長知識提煉的結構化筆記師。請分析以下文字或速記片段，判斷其核心情境，並重整為層次分明、版面優雅的 Markdown 結構：

1. 【🎯 核心概要】：以精煉 1-3 句話提煉精髓或最高決策
2. 【📐 關鍵內涵】：依據內容屬性，自行劃分 2-4 個邏輯段落
3. 【⚡ 待辦與推進項目 (Action Items)】：若內容包含待辦或下一步，請以 Markdown 清單「- [ ]」輸出；若無明確行動，則列出 1-3 點潛在延伸評估

【排版與渲染規範】：
- 請一律以正體/繁體中文（台灣習慣用語）輸出。
- 重點段落標題請保留【】中文括號以觸發編輯器琥珀金高亮標籤。
- 【省 Token 溯源編號】：原文已按段落標註 [P1]、[P2]...，請在各整理段落的末端標記其對應的來源編號「<!-- ref: P1 -->」或「> 來源：[P1]」，不用重複回傳原文內容！全篇宏觀總結請標註「<!-- ref: all -->」。
- 若出現程式碼、指令或設定檔，請務必使用標準三重反引號並標明語言標籤（如 \`\`\`ts、\`\`\`python、\`\`\`json、\`\`\`sql）。
- 若提及關鍵度量衡數值（如 99.8%、42ms、16px、120ops/s）或關鍵專案術語，請保留精確數據格式以利編輯器智慧染色。

原始內容如下：
`,
  organize: `你是一位敏銳且擅長知識提煉的結構化筆記師。請分析以下文字或速記片段，判斷其核心情境，並重整為層次分明、版面優雅的 Markdown 結構：

1. 【🎯 核心概要】：以精煉 1-3 句話提煉精髓或最高決策
2. 【📐 關鍵內涵】：依據內容屬性，自行劃分 2-4 個邏輯段落
3. 【⚡ 待辦與推進項目 (Action Items)】：若內容包含待辦或下一步，請以 Markdown 清單「- [ ]」輸出；若無明確行動，則列出 1-3 點潛在延伸評估

【排版與渲染規範】：
- 請一律以正體/繁體中文（台灣習慣用語）輸出。
- 重點段落標題請保留【】中文括號以觸發編輯器琥珀金高亮標籤。
- 【省 Token 溯源編號】：原文已按段落標註 [P1]、[P2]...，請在各整理段落的末端標記其對應的來源編號「<!-- ref: P1 -->」或「> 來源：[P1]」，不用重複回傳原文內容！全篇宏觀總結請標註「<!-- ref: all -->」。
- 若出現程式碼、指令或設定檔，請務必使用標準三重反引號並標明語言標籤（如 \`\`\`ts、\`\`\`python、\`\`\`json、\`\`\`sql）。
- 若提及關鍵度量衡數值（如 99.8%、42ms、16px、120ops/s）或關鍵專案術語，請保留精確數據格式以利編輯器智慧染色。

原始內容如下：
`,
  actions: `請仔細分析以下筆記內容，提取出所有明確與隱含的待辦任務（Action Items），並以 Markdown 核取清單格式整理。

【排版與渲染規範】：
- 輸出格式請嚴格使用「- [ ] 任務名稱（標記負責人、預計時間或關鍵模組，若有）」。
- 善用警示藥囊標籤區分優先順序與性質（例如以 URGENT: 標示高急迫度任務、FIXME: 標示瑕疵修復、TODO: 標示常規任務）。
- 分組標題請使用【】括號（例如【🔥 今日緊急 URGENT】、【📌 本週待辦 TODO】、【💡 後續追蹤】）。
- 若原文有標註 [P1], [P2]...，請在各任務群組末端標註「<!-- ref: P1 -->」，不用重複輸出原文字句。
- 請一律以正體/繁體中文輸出，語意精準扼要。

原始筆記內容如下：
`,
  action_items: `請仔細分析以下筆記內容，提取出所有明確與隱含的待辦任務（Action Items），並以 Markdown 核取清單格式整理。

【排版與渲染規範】：
- 輸出格式請嚴格使用「- [ ] 任務名稱（標記負責人、預計時間或關鍵模組，若有）」。
- 善用警示藥囊標籤區分優先順序與性質（例如以 URGENT: 標示高急迫度任務、FIXME: 標示瑕疵修復、TODO: 標示常規任務）。
- 分組標題請使用【】括號（例如【🔥 今日緊急 URGENT】、【📌 本週待辦 TODO】、【💡 後續追蹤】）。
- 若原文有標註 [P1], [P2]...，請在各任務群組末端標註「<!-- ref: P1 -->」，不用重複輸出原文字句。
- 請一律以正體/繁體中文輸出，語意精準扼要。

原始筆記內容如下：
`,
  explain: `請針對選取的文字或程式碼片段進行深度解析、指出潛在問題或補充背景知識。格式簡潔扼要。內容如下：
`,
  format: `請針對選取的程式碼或文字片段，重新排版成優雅易讀的標準格式，並保持原始程式碼或文字邏輯不變。內容如下：
`,
  code_refactor: `請針對選取的程式碼或文字片段，校對語法與排版、補齊 Markdown 格式標籤並進行智能命名對齊。保持原始程式碼或文字邏輯不變。

【排版與渲染規範】：
- 程式碼區塊必須使用標準 Markdown 語法封裝，且必須在首行反引號後明確標明語言名稱（例如 \`\`\`ts、\`\`\`javascript、\`\`\`python、\`\`\`json、\`\`\`sql、\`\`\`bash 等），不可省略語言標籤。
- 行內變數或單詞若屬代碼引用，請使用單個反引號包裹。
- 若為修復或重構，可於區塊上方簡要標示【重構說明】或以 // 或 # 註解說明重構關鍵理由。
- 輸出以繁體中文與標準規範代碼呈現。

內容如下：
`,
};

/**
 * 將原稿按天然段落（空行）切分並標註段落編號 [P1], [P2]... 送入 AI
 * 完全通用，零 Hardcode，有效節省 Token 並實現 100% 精準對照
 */
export function formatIndexedPromptInput(text: string): string {
  const clean = text.trim();
  if (!clean) return '';

  const paragraphs = clean.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= 1) {
    return clean;
  }

  return paragraphs
    .map((p, idx) => `[P${idx + 1}]\n${p}`)
    .join('\n\n');
}

export async function refineNotes(req: RefineryRequest): Promise<RefineryResult> {
  const targetText = req.selection && req.selection.trim() ? req.selection : req.content;
  const promptHeader = req.cardPrompt && req.cardPrompt.trim() ? req.cardPrompt : PROMPT_TEMPLATES[req.mode];

  // 5.2 / 3.6 機敏資訊防護濾網 (Sanitizer Guard)
  const isLocal = req.model === 'custom';
  const sanitizeRes = sanitizeForAi(targetText, isLocal);
  if (sanitizeRes.isBlocked) {
    throw new Error(sanitizeRes.blockedReason || '⚠️ 此筆記標註有私密標籤（#private），廣零散安全防護已攔截，禁止上傳至雲端 AI！');
  }
  const safeTargetText = sanitizeRes.sanitizedText;
  if (sanitizeRes.redactedCount > 0) {
    console.info(`[SanitizerGuard] 已安全脫敏 ${sanitizeRes.redactedCount} 處敏感資料 (${sanitizeRes.redactedTypes.join(', ')})`);
  }

  // 若原稿內容龐大（超出門檻，如預設 3,500 字），自動分流進入 Map-Reduce 分段管線處理
  if (isChunkingNeeded(safeTargetText)) {
    return await executeChunkedRefineryPipeline(
      { ...req, content: safeTargetText, selection: undefined },
      promptHeader,
      undefined,
      req.onProgress,
      req.signal
    );
  }

  const indexedTargetText = formatIndexedPromptInput(safeTargetText);
  const fullPrompt = `${promptHeader}\n${indexedTargetText}\n\n${req.customPrompt ? `額外補充要求：${req.customPrompt}` : ''}`;

  // 1. 如果選用自訂本地端點 (Ollama / LM Studio)
  if (req.model === 'custom') {
    const endpoint = normalizeEndpoint(req.customEndpoint || 'http://localhost:11434/v1');
    const customModel = req.modelId || 'llama3.2';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (req.customKey && req.customKey.trim()) {
      headers['Authorization'] = `Bearer ${req.customKey.trim()}`;
    }

    try {
      const resp = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: customModel,
          messages: [
            { role: 'system', content: '你是《廣零散》筆記工作台的 AI 提煉師。請輸出正體/繁體中文，注重排版美學與精準度。' },
            { role: 'user', content: fullPrompt },
          ],
          temperature: 0.3,
        }),
        signal: req.signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error?.message || `本地端點回應 HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const answer = data.choices?.[0]?.message?.content || '';
      return {
        refinedText: answer,
        summary: getModeSummary(req.mode),
        engineUsed: `Local (${customModel})`,
      };
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      console.warn('本地端點推論失敗：', e);
      throw e;
    }
  }

  // 2. 如果有 Groq API Key 且選中 Groq
  if (req.model === 'groq' && req.groqKey) {
    const groqModel = req.modelId || 'llama-3.3-70b-versatile';
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${req.groqKey}`,
        },
        body: JSON.stringify({
          model: groqModel,
          messages: [
            { role: 'system', content: '你是《廣零散》筆記工作台的 AI 提煉師。請輸出繁體中文，注重排版美學與精準度。' },
            { role: 'user', content: fullPrompt },
          ],
          temperature: 0.3,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Groq API 錯誤 (${resp.status})`);
      }

      const data = await resp.json();
      const answer = data.choices?.[0]?.message?.content || '';
      return {
        refinedText: answer,
        summary: getModeSummary(req.mode),
        engineUsed: `Groq (${groqModel})`,
      };
    } catch (e: any) {
      console.warn('Groq 推論失敗，改用備援或拋出：', e);
      throw e;
    }
  }

  // 2. 如果有 Gemini API Key 且選中 Gemini
  if (req.model === 'gemini' && req.geminiKey) {
    const rawId = req.modelId || 'gemini-1.5-flash';
    const geminiModel = rawId.includes('gemini-2.5-flash') || !rawId.toLowerCase().includes('gemini') ? 'gemini-1.5-flash' : rawId;
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${req.geminiKey}`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: 0.3,
          },
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Gemini API 錯誤 (${resp.status})`);
      }

      const data = await resp.json();
      const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return {
        refinedText: answer,
        summary: getModeSummary(req.mode),
        engineUsed: `Gemini (${geminiModel})`,
      };
    } catch (e: any) {
      console.warn('Gemini 請求失敗：', e);
      throw e;
    }
  }

  // 3. 尚未填寫 API Key 時的本地智慧模擬煉丹（Local Heuristic Fallback）
  await new Promise((r) => setTimeout(r, 600)); // 模擬毫秒級推論

  let simulatedOutput = '';
  if (req.mode === 'structure') {
    simulatedOutput = `# 🎯 核心結論與決定事項\n- 已統整原始 ${targetText.split('\n').length} 行速記片段。\n- 系統一致性與秒存機制運作良好。\n\n# 📐 技術規格重點\n\`\`\`markdown\n${targetText}\n\`\`\`\n\n# ⚡ 待辦清單 (Action Items)\n- [ ] 於設定面板填入 Groq 或 Gemini API Key 以啟動雲端雙引擎\n- [ ] 驗收 Smear Cursor 與百子櫃多頁切換\n- [ ] 執行斷電/重開機不滅狀態測試`;
  } else if (req.mode === 'actions') {
    simulatedOutput = `### ⚡ 提煉待辦事項 (Action Items)\n- [ ] 填入個人專屬 API Key（支援 Groq 毫秒響應與 Gemini 長文處理）\n- [ ] 嘗試雙擊分頁名稱重新命名藥帖\n- [ ] 測試在純文字模式下輸入 TODO、http:// 與「發言引號」即時染色效果`;
  } else {
    simulatedOutput = `> 💡 【本地速覽解析】\n${targetText}\n\n（提示：於右上角「⚙️ 設定」填入 Groq 或 Gemini API Key 即可解鎖完整雙引擎深度推論）`;
  }

  return {
    refinedText: simulatedOutput,
    summary: `${getModeSummary(req.mode)} (示範推論 - 可配置 API Key)`,
    engineUsed: 'Local Heuristic Engine',
  };
}

function getModeSummary(mode: RefineryMode): string {
  switch (mode) {
    case 'structure':
    case 'organize':
      return '✨ 收散成丹：結構化結論提煉';
    case 'actions':
    case 'action_items':
      return '☑️ 待辦清單矩陣化';
    case 'explain':
      return '💬 智慧選取解讀';
    case 'format':
      return '🧹 代碼與格式自動排版';
    case 'code_refactor':
      return '🔧 代碼語法與命名補正';
  }
}

export interface AiSearchCandidate {
  id: string;
  title: string;
  path?: string;
  preview: string;
}

export interface AiSearchResultItem {
  id: string;
  title: string;
  path?: string;
  reason: string;
  matchedSnippet: string;
}

export interface AiSearchRequest {
  query: string;
  candidates: AiSearchCandidate[];
  model: AiProvider;
  groqKey: string;
  geminiKey: string;
  customKey?: string;
  customEndpoint?: string;
}

/**
 * 使用 AI 對話與語意理解協助在全庫/資料夾中精準尋找藥帖
 */
export async function searchVaultWithAi(req: AiSearchRequest): Promise<AiSearchResultItem[]> {
  const { query, candidates, model, groqKey, geminiKey, customKey, customEndpoint } = req;
  const isLocal = model === 'custom';
  const cleanQuery = sanitizeForAi(query, isLocal).sanitizedText;

  // 雲端查詢時，自動排除標記有私密標籤之候選檔案；同時對摘要進行脫敏
  const safeCandidates = candidates.filter((c) => {
    if (!isLocal) {
      const check = sanitizeForAi(c.preview, false, { checkPrivateTags: true });
      if (check.isBlocked) return false;
    }
    return true;
  });

  // 取前 35 筆候選檔案摘要
  const sampleList = safeCandidates.slice(0, 35).map((c, idx) => {
    const sanitizedSnippet = sanitizeForAi(c.preview.slice(0, 200), isLocal).sanitizedText;
    return {
      index: idx + 1,
      id: c.id,
      title: c.title,
      path: c.path || '',
      snippet: sanitizedSnippet.replace(/\s+/g, ' '),
    };
  });

  const systemPrompt = `你是一位專業的筆記檢索助理。使用者正在筆記庫中尋找資料，請根據使用者的提問意圖，從候選清單中挑選最符合的 1 到 3 個筆記或檔案。
請只輸出合法的 JSON 陣列，不得包含 Markdown 標籤或其餘非 JSON 內容：
[
  {
    "id": "候選清單中的 id",
    "title": "筆記標題",
    "path": "檔案路徑或空字串",
    "reason": "為什麼推薦這篇筆記的一句話繁體中文理由",
    "matchedSnippet": "匹配或推測相關的重點字句片段"
  }
]`;

  const userPrompt = `使用者查詢需求：「${cleanQuery}」\n\n候選筆記與檔案清單：\n${JSON.stringify(sampleList, null, 2)}`;

  // 1. 本地 Ollama / Custom 端點呼叫
  if (model === 'custom') {
    const endpoint = normalizeEndpoint(customEndpoint || 'http://localhost:11434/v1');
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
          model: 'llama3.2',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || '[]';
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : (parsed.results || parsed.matches || []);
      }
    } catch (err) {
      console.warn('[AI Search] 本地端點檢索失敗，切換至備援：', err);
    }
  }

  // 2. Groq 呼叫
  if (model === 'groq' && groqKey) {
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || '[]';
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : (parsed.results || parsed.matches || []);
    } catch (err) {
      console.warn('[AI Search] Groq 檢索失敗，切換至備援：', err);
    }
  }

  // 2. Gemini 呼叫
  if (model === 'gemini' && geminiKey) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `${systemPrompt}\n\n${userPrompt}` }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            }
          }),
        }
      );
      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : (parsed.results || parsed.matches || []);
    } catch (err) {
      console.warn('[AI Search] Gemini 檢索失敗，切換至備援：', err);
    }
  }

  // 3. 本地智慧關鍵字加權模擬（無 API Key 時的 Fallback）
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = candidates.map((c) => {
    let score = 0;
    const full = (c.title + ' ' + c.preview).toLowerCase();
    for (const term of terms) {
      if (c.title.toLowerCase().includes(term)) score += 3;
      if (full.includes(term)) score += 1;
    }
    return { candidate: c, score };
  });

  const best = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  return best.map(({ candidate }) => ({
    id: candidate.id,
    title: candidate.title,
    path: candidate.path,
    reason: `命中相關關鍵字（在標題或內容前段發現與「${query}」關聯的詞彙）`,
    matchedSnippet: candidate.preview.slice(0, 100),
  }));
}

/**
 * 濾除 Markdown 中由 AI 逐段標註的「> 📜 原文脈絡：...」引言區塊
 * 當使用者選擇「僅收 AI 精華」時調用此函式，產生純淨的結構化筆記
 */
export function stripOriginalContextQuotes(markdownText: string): string {
  if (!markdownText) return '';
  // 濾除單行或跨行的 > 📜 原文脈絡 引言區塊，以及緊隨其後多餘的空行
  return markdownText
    .replace(/^>\s*📜\s*原文脈絡[：:].*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
