import type { SupportedLanguage } from '../../types/tab';

export interface SaveRecommendationRequest {
  content: string;
  language: SupportedLanguage;
  currentTitle?: string;
  recentFolders?: string[];
  directorySkeleton?: string[]; // 本機已存在的洞天與子目錄骨架
  model?: 'groq' | 'gemini';
  modelId?: string;
  groqKey?: string;
  geminiKey?: string;
  excludeFilenames?: string[]; // 使用者不滿意或略過的歷史建議檔名
  excludeFolders?: string[];   // 略過的歷史推薦目錄
  isRetry?: boolean;          // 是否為重新分析模式
}

export interface SaveRecommendationResult {
  recommendedFilename: string;
  alternativeFilenames: string[];
  extension: string;
  recommendedFolder?: string;
  alternativeFolders?: string[]; // 備選本機目錄清單
  reason: string;
  isAiGenerated: boolean;
}

/**
 * 取得支援語言對應的標準副檔名
 */
export function getExtensionForLanguage(lang: SupportedLanguage): string {
  switch (lang) {
    case 'markdown':
      return 'md';
    case 'javascript':
      return 'ts'; // 預設推薦現代 TypeScript / JavaScript
    case 'python':
      return 'py';
    case 'sql':
      return 'sql';
    case 'json':
      return 'json';
    case 'plaintext':
    default:
      return 'md'; // 隨手筆記預設以 Markdown 格式儲存體驗最佳
  }
}

/**
 * 清理並標準化檔名（移除 Windows / Unix 不允許的非法字元，保留中括弧與可讀格式）
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // 僅移除 Windows 嚴格禁用的特殊字元
    .replace(/\s+/g, ' ')                  // 連續空白精簡為單一空格
    .trim()
    .slice(0, 90);                         // 限制檔名長度
}

/**
 * 本地啟發式推薦（當無 API Key 或離線時使用）
 */
/**
 * 依據內容主題自動推論語意化子資料夾名稱
 */
export function inferTopicSubfolder(content: string): string {
  const text = content.slice(0, 1000).toLowerCase();
  if (/藥帖|方劑|處方|病歷|中醫|經絡|草藥|煎服|脈象|本草|甘草|黃耆|當歸/.test(text)) {
    return '藥帖典藏';
  }
  if (/import\s+|export\s+|function\s+|class\s+|const\s+|fn\s+|pub\s+|impl\s+|def\s+|struct\s+|interface\s+/.test(text)) {
    return 'DevLab';
  }
  if (/會議|討論|決策|訪談|開會|紀錄|週報|月報|驗收/.test(text)) {
    return '會議記錄';
  }
  if (/待辦|清單|todo|checklist|日程|行程|計劃|規劃/.test(text)) {
    return '規劃與待辦';
  }
  return '隨手札記';
}

/**
 * 本地啟發式推薦（當無 API Key 或離線時使用）
 */
export function generateHeuristicRecommendation(
  content: string,
  language: SupportedLanguage,
  recentFolders: string[] = []
): SaveRecommendationResult {
  const ext = getExtensionForLanguage(language);
  const today = new Date().toISOString().slice(0, 10);

  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  let baseName = '';

  if (lines.length > 0) {
    const firstLine = lines[0].replace(/^#+\s*/, '').trim();
    if (firstLine) {
      baseName = sanitizeFilename(firstLine);
    }
  }

  if (!baseName) {
    baseName = `素簡札記_${today}`;
  }

  const primaryName = baseName.startsWith('[') ? `${baseName}.${ext}` : `[草稿] - ${baseName}.${ext}`;
  const alternatives = [
    `${baseName}.${ext}`,
    `[記錄] - ${today}_${baseName}.${ext}`,
  ];

  // 智能推論目錄：避免檔案直落個人根目錄 (如 C:/Users/xd)
  const baseDir = recentFolders.length > 0 ? recentFolders[0].replace(/\\+/g, '/') : '';
  const topicSub = inferTopicSubfolder(content);
  let recommendedFolder = baseDir;
  const altFolders: string[] = [];

  if (baseDir) {
    // 若為根目錄，推薦具備層級深度的主題子目錄
    recommendedFolder = `${baseDir}/${topicSub}`.replace(/\/+/g, '/');
    altFolders.push(baseDir);
    if (recentFolders.length > 1) {
      altFolders.push(recentFolders[1].replace(/\\+/g, '/'));
    }
    altFolders.push(`${baseDir}/隨手札記`.replace(/\/+/g, '/'));
  }

  return {
    recommendedFilename: primaryName,
    alternativeFilenames: alternatives.slice(0, 2),
    extension: ext,
    recommendedFolder,
    alternativeFolders: Array.from(new Set(altFolders.filter((f) => f && f !== recommendedFolder))).slice(0, 3),
    reason: '本地啟發式推論（可設定 AI 金鑰以啟動全域語意分析）',
    isAiGenerated: false,
  };
}

/**
 * 結合 Groq / Gemini AI 推薦最佳本機儲存檔名與目標路徑
 */
export async function recommendSaveLocation(
  req: SaveRecommendationRequest
): Promise<SaveRecommendationResult> {
  const ext = getExtensionForLanguage(req.language);
  const recentFolders = req.recentFolders || [];

  // 若兩者金鑰皆未提供，直接降級為本地啟發式推薦
  if (!req.groqKey && !req.geminiKey) {
    return generateHeuristicRecommendation(req.content, req.language, recentFolders);
  }

  const today = new Date().toISOString().slice(0, 10);
  const snippet = req.content.slice(0, 1500);

  // 整理精煉之本機洞天目錄骨架（嚴格限制在最多 30 個目錄，不超過 200 Tokens）
  const skeletonList = (req.directorySkeleton && req.directorySkeleton.length > 0)
    ? req.directorySkeleton
    : recentFolders;

  const skeletonText = skeletonList.length > 0
    ? skeletonList.map((f, i) => `[${i + 1}] ${f.replace(/\\+/g, '/')}`).join('\n')
    : '(無本機目錄清單，請依筆記主題推論合理的專案或工作區路徑)';

  const excludeFilenamesText = req.excludeFilenames && req.excludeFilenames.length > 0
    ? `\n【排除清單：使用者已看過但不滿意的先前檔名（請絕對避免重複或僅做微幅變換，必須從不同語意角度或維度重新命名）】\n${req.excludeFilenames.map((f) => `- ${f}`).join('\n')}\n`
    : '';

  const excludeFoldersText = req.excludeFolders && req.excludeFolders.length > 0
    ? `\n【排除清單：使用者不考慮的存放路徑（請改選其他合適的子目錄）】\n${req.excludeFolders.map((f) => `- ${f}`).join('\n')}\n`
    : '';

  const systemPrompt = `你是一位高階知識管理架構師。請分析使用者的筆記或程式碼內容，自動推論其核心屬性、語意檔名與電腦中最適合的本機存放路徑。
今天的日期是：${today}。
偏好副檔名：.${ext}。

【使用者電腦中真實存在的本機洞天與資料夾路徑清單】
${skeletonText}
${excludeFilenamesText}${excludeFoldersText}
【命名規範】
1. 格式一律採用：[類型] - 語意檔名.${ext}
2. 語意清晰、好搜尋優先。

【目錄推薦規範】
1. 請避免直接放置於根目錄，優先挑選清單中與內文主題最契合的現存子目錄。
2. 若清單中僅有頂層目錄，可依主題在合適的洞天路徑下建議合理的結構化子目錄（例如附加適當的主題分類名稱）。
3. 請提供 2~3 個合理的備選路徑填入 alternativeFolders。

請一律以嚴格的 JSON 格式回應，不得包含任何 Markdown 代碼框或額外文字。JSON 規格如下：
{
  "recommendedFilename": "[類型] - 語意檔名.${ext}",
  "alternativeFilenames": ["[備選類型] - 簡潔檔名.${ext}", "英文kebab-case檔名.${ext}"],
  "recommendedFolder": "推薦的電腦絕對路徑",
  "alternativeFolders": ["備選路徑1", "備選路徑2", "備選路徑3"],
  "reason": "以 20 字以內說明此分類與檔名的推薦原因"
}`;

  // 模型名稱智能清洗與容錯校正，防止 cross-model 或錯誤版本號造成 404
  const sanitizeModelId = (provider: 'groq' | 'gemini', rawId?: string): string => {
    if (!rawId) {
      return provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gemini-1.5-flash';
    }
    const clean = rawId.trim();
    if (provider === 'gemini') {
      // 官方不存在 gemini-2.5-flash，若為 2.5-flash 或是 groq/llama 系列模型名稱，安全重定向至 gemini-1.5-flash
      if (clean.includes('gemini-2.5-flash') || clean.includes('llama') || !clean.toLowerCase().includes('gemini')) {
        return 'gemini-1.5-flash';
      }
      return clean;
    } else {
      // 若為 Groq 但傳入 gemini 名稱，自動重定向至 Groq 預設最強模型
      if (clean.toLowerCase().includes('gemini') || !clean) {
        return 'llama-3.3-70b-versatile';
      }
      return clean;
    }
  };

  const groqModel = sanitizeModelId('groq', req.modelId);
  const geminiModel = sanitizeModelId('gemini', req.modelId);

  // 初次推薦保持 0.2（嚴謹符合規範）；重新分析或有排除項時提高到 0.7（激發更多語意創意）
  const temperature = req.isRetry || (req.excludeFilenames && req.excludeFilenames.length > 0) ? 0.7 : 0.2;

  let lastApiError: string | null = null;

  // 封裝 Groq 呼叫
  const callGroq = async (): Promise<SaveRecommendationResult | null> => {
    if (!req.groqKey) return null;
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${req.groqKey.trim()}`,
        },
        body: JSON.stringify({
          model: groqModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `以下為筆記前段內容：\n${snippet}` },
          ],
          temperature,
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        lastApiError = `Groq API 狀態碼 ${resp.status}`;
        console.warn(`[saveRecommender] Groq (${groqModel}) API 錯誤 (${resp.status}):`, errBody);
        return null;
      }

      const data = await resp.json();
      const contentStr = data.choices?.[0]?.message?.content || '';
      const parsed = extractJsonPayload(contentStr);
      if (parsed && parsed.recommendedFilename) {
        const recFolder = parsed.recommendedFolder || (skeletonList[0] ?? undefined);
        const altFolders = Array.isArray(parsed.alternativeFolders)
          ? parsed.alternativeFolders.filter((f: string) => f && f !== recFolder).slice(0, 3)
          : skeletonList.filter((f) => f !== recFolder).slice(0, 2);

        return {
          recommendedFilename: sanitizeFilenameWithExt(parsed.recommendedFilename, ext),
          alternativeFilenames: (parsed.alternativeFilenames || []).map((n: string) => sanitizeFilenameWithExt(n, ext)),
          extension: ext,
          recommendedFolder: recFolder ? recFolder.replace(/\\+/g, '/') : undefined,
          alternativeFolders: altFolders.map((f: string) => f.replace(/\\+/g, '/')),
          reason: parsed.reason || `Groq (${groqModel}) 語意分析智能落點`,
          isAiGenerated: true,
        };
      }
    } catch (err: any) {
      lastApiError = `Groq 連線失敗: ${err?.message || err}`;
      console.warn('[saveRecommender] Groq 推論網路失敗：', err);
    }
    return null;
  };

  // 封裝 Gemini 呼叫
  const callGemini = async (): Promise<SaveRecommendationResult | null> => {
    if (!req.geminiKey) return null;
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${req.geminiKey.trim()}`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n內容如下：\n${snippet}` }] }],
          generationConfig: {
            temperature,
          },
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        lastApiError = `Gemini API 狀態碼 ${resp.status}`;
        console.warn(`[saveRecommender] Gemini (${geminiModel}) API 錯誤 (${resp.status}):`, errBody);
        return null;
      }

      const data = await resp.json();
      const contentStr = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = extractJsonPayload(contentStr);
      if (parsed && parsed.recommendedFilename) {
        const recFolder = parsed.recommendedFolder || (skeletonList[0] ?? undefined);
        const altFolders = Array.isArray(parsed.alternativeFolders)
          ? parsed.alternativeFolders.filter((f: string) => f && f !== recFolder).slice(0, 3)
          : skeletonList.filter((f) => f !== recFolder).slice(0, 2);

        return {
          recommendedFilename: sanitizeFilenameWithExt(parsed.recommendedFilename, ext),
          alternativeFilenames: (parsed.alternativeFilenames || []).map((n: string) => sanitizeFilenameWithExt(n, ext)),
          extension: ext,
          recommendedFolder: recFolder ? recFolder.replace(/\\+/g, '/') : undefined,
          alternativeFolders: altFolders.map((f: string) => f.replace(/\\+/g, '/')),
          reason: parsed.reason || `Gemini (${geminiModel}) 語意分析智能落點`,
          isAiGenerated: true,
        };
      }
    } catch (err: any) {
      lastApiError = `Gemini 連線失敗: ${err?.message || err}`;
      console.warn('[saveRecommender] Gemini 推論網路失敗：', err);
    }
    return null;
  };

  // 優先嘗試使用者偏好之模型，失敗則自動無縫走備援模型
  let res: SaveRecommendationResult | null = null;
  if (req.model === 'groq') {
    res = await callGroq();
    if (!res && req.geminiKey) {
      console.log('[saveRecommender] Groq 無法回傳，自動切換至 Gemini 備援推論');
      res = await callGemini();
    }
  } else {
    // 預設或指定 gemini
    res = await callGemini();
    if (!res && req.groqKey) {
      console.log('[saveRecommender] Gemini 無法回傳，自動切換至 Groq 備援推論');
      res = await callGroq();
    }
  }

  if (res) {
    return res;
  }

  // 若所有 AI 供應商皆調用失敗，降級為本地啟發式推薦，並清楚告知使用者原因
  const fallback = generateHeuristicRecommendation(req.content, req.language, recentFolders);
  if (lastApiError) {
    fallback.reason = `本地啟發式推論 (AI 呼叫失敗: ${lastApiError})`;
  }
  return fallback;
}

function extractJsonPayload(text: string): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function sanitizeFilenameWithExt(rawName: string, defaultExt: string): string {
  if (!rawName) return `note_${Date.now()}.${defaultExt}`;
  const clean = sanitizeFilename(rawName.trim());
  return clean.toLowerCase().endsWith(`.${defaultExt.toLowerCase()}`) ? clean : `${clean}.${defaultExt}`;
}
