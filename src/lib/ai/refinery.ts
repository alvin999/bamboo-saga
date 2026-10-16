export type RefineryMode = 
  | 'structure' 
  | 'actions' 
  | 'explain' 
  | 'format' 
  | 'organize' 
  | 'action_items' 
  | 'code_refactor';

export interface RefineryRequest {
  model: 'groq' | 'gemini';
  modelId?: string;
  groqKey: string;
  geminiKey: string;
  mode: RefineryMode;
  content: string;
  selection?: string;
  customPrompt?: string;
  cardPrompt?: string;
}

export interface RefineryResult {
  refinedText: string;
  summary: string;
  engineUsed: string;
}

const PROMPT_TEMPLATES: Record<RefineryMode, string> = {
  structure: `你是一位資深會議記錄與技術筆記整理師。請將以下零散速記（包含口語、中英夾雜、時間點或片段思緒），重整為清晰優雅的 Markdown 結構：
1. 【🎯 核心結論與決定事項】
2. 【📐 技術規格與討論細節】
3. 【⚡ 待辦清單與負責人 (Action Items)】（使用 - [ ] 格式）

原始速記內容如下：
`,
  organize: `你是一位資深會議記錄與技術筆記整理師。請將以下零散速記（包含口語、中英夾雜、時間點或片段思緒），重整為清晰優雅的 Markdown 結構：
1. 【🎯 核心結論與決定事項】
2. 【📐 技術規格與討論細節】
3. 【⚡ 待辦清單與負責人 (Action Items)】（使用 - [ ] 格式）

原始速記內容如下：
`,
  actions: `請仔細分析以下筆記內容，提取出所有明確與隱含的待辦任務（Action Items），並以 Markdown 核取清單格式整理：
- [ ] 任務名稱（標記負責人或預計時間，若有）

原始筆記內容如下：
`,
  action_items: `請仔細分析以下筆記內容，提取出所有明確與隱含的待辦任務（Action Items），並以 Markdown 核取清單格式整理：
- [ ] 任務名稱（標記負責人或預計時間，若有）

原始筆記內容如下：
`,
  explain: `請針對選取的文字或程式碼片段進行深度解析、指出潛在問題或補充背景知識。格式簡潔扼要。內容如下：
`,
  format: `請針對選取的程式碼或文字片段，重新排版成優雅易讀的標準格式，並保持原始程式碼或文字邏輯不變。內容如下：
`,
  code_refactor: `請針對選取的程式碼或文字片段，校對語法與排版、補齊 Markdown 格式標籤並進行智能命名對齊。內容如下：
`,
};

export async function refineNotes(req: RefineryRequest): Promise<RefineryResult> {
  const targetText = req.selection && req.selection.trim() ? req.selection : req.content;
  const promptHeader = req.cardPrompt && req.cardPrompt.trim() ? req.cardPrompt : PROMPT_TEMPLATES[req.mode];
  const fullPrompt = `${promptHeader}\n${targetText}\n\n${req.customPrompt ? `額外補充要求：${req.customPrompt}` : ''}`;

  // 1. 如果有 Groq API Key 且選中 Groq
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
  model: 'groq' | 'gemini';
  groqKey: string;
  geminiKey: string;
}

/**
 * 使用 AI 對話與語意理解協助在全庫/資料夾中精準尋找藥帖
 */
export async function searchVaultWithAi(req: AiSearchRequest): Promise<AiSearchResultItem[]> {
  const { query, candidates, model, groqKey, geminiKey } = req;
  if (!query.trim() || candidates.length === 0) return [];

  // 取前 35 筆候選檔案摘要
  const sampleList = candidates.slice(0, 35).map((c, idx) => ({
    index: idx + 1,
    id: c.id,
    title: c.title,
    path: c.path || '',
    snippet: c.preview.slice(0, 200).replace(/\s+/g, ' '),
  }));

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

  const userPrompt = `使用者查詢需求：「${query}」\n\n候選筆記與檔案清單：\n${JSON.stringify(sampleList, null, 2)}`;

  // 1. Groq 呼叫
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
