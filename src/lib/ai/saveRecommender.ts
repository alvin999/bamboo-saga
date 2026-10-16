import type { SupportedLanguage } from '../../types/tab';

export interface SaveRecommendationRequest {
  content: string;
  language: SupportedLanguage;
  currentTitle?: string;
  recentFolders?: string[];
  model?: 'groq' | 'gemini';
  modelId?: string;
  groqKey?: string;
  geminiKey?: string;
}

export interface SaveRecommendationResult {
  recommendedFilename: string;
  alternativeFilenames: string[];
  extension: string;
  recommendedFolder?: string;
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
    baseName = `隨手筆記_${today}`;
  }

  const primaryName = baseName.startsWith('[') ? `${baseName}.${ext}` : `[草稿] - ${baseName}.${ext}`;
  const alternatives = [
    `${baseName}.${ext}`,
    `[記錄] - ${today}_${baseName}.${ext}`,
  ];

  return {
    recommendedFilename: primaryName,
    alternativeFilenames: alternatives.slice(0, 2),
    extension: ext,
    recommendedFolder: recentFolders.length > 0 ? recentFolders[0] : undefined,
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

  const systemPrompt = `你是一位高階開發者與知識管理架構師。請分析使用者的筆記或程式碼內容，自動推論其核心屬性、語意檔名與電腦中最適合的歸檔路徑。
今天的日期是：${today}。
偏好副檔名：.${ext}。

使用者電腦中可用或最近使用的專案/資料夾路徑清單：
${recentFolders.length > 0 ? recentFolders.map((f, i) => `[${i + 1}] ${f}`).join('\n') : '(無最近紀錄，請依筆記主題推論合理的專案或工作區路徑)'}

【命名規範】
1. 格式一律採用：[類型] - 語意檔名.${ext}
   例如：[架構] - 竹子傳奇後端API規格.md、[會議] - 2026-10-16_登入授權決策.md、[待辦] - 上線前驗收清單.md、[除錯] - SQLite併發排查.md
2. 由你依據情境自由決定是否包含日期或版本，語意清楚、好檢索優先。
3. 若內文為程式碼，直接給予標準程式碼檔名（如 jwtAuth.ts, schema.sql）。

【目錄推薦規範】
從上述清單比對最契合的專案目錄；若筆記屬於規格/文檔/會議，可主動在該專案下附加子目錄（例如 /docs 或 /specs 或 /notes），後端會自動為使用者遞迴建立該目錄。

請一律以嚴格的 JSON 格式回應，不得包含任何 Markdown 代碼框或額外文字。JSON 規格如下：
{
  "recommendedFilename": "[類型] - 語意檔名.${ext}",
  "alternativeFilenames": ["[備選類型] - 簡潔檔名.${ext}", "英文kebab-case檔名.${ext}"],
  "recommendedFolder": "推薦的電腦絕對路徑（若無合適則回傳空字串）",
  "reason": "以 20 字以內說明此分類與檔名的推薦原因"
}`;

  // 1. Groq 極速推論 (首選，回應時間約 200~400ms)
  // 1. Groq 極速推論 (首選，回應時間約 200~400ms)
  if (req.model === 'groq' && req.groqKey) {
    const groqModel = req.modelId || 'llama-3.3-70b-versatile';
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
          temperature: 0.2,
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        console.warn(`[saveRecommender] Groq (${groqModel}) API 錯誤 (${resp.status}):`, errBody);
      } else {
        const data = await resp.json();
        const contentStr = data.choices?.[0]?.message?.content || '';
        const parsed = extractJsonPayload(contentStr);
        if (parsed && parsed.recommendedFilename) {
          return {
            recommendedFilename: sanitizeFilenameWithExt(parsed.recommendedFilename, ext),
            alternativeFilenames: (parsed.alternativeFilenames || []).map((n: string) => sanitizeFilenameWithExt(n, ext)),
            extension: ext,
            recommendedFolder: parsed.recommendedFolder || (recentFolders[0] ?? undefined),
            reason: parsed.reason || `AI (${groqModel}) 依據筆記核心脈絡智慧命名`,
            isAiGenerated: true,
          };
        }
      }
    } catch (err) {
      console.warn('[saveRecommender] Groq 推論網路失敗：', err);
    }
  }

  // 2. Gemini 深度推論備援
  if (req.geminiKey) {
    const geminiModel = req.modelId || 'gemini-2.5-flash';
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${req.geminiKey.trim()}`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n內容如下：\n${snippet}` }] }],
          generationConfig: {
            temperature: 0.2,
          },
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        console.warn(`[saveRecommender] Gemini (${geminiModel}) API 錯誤 (${resp.status}):`, errBody);
      } else {
        const data = await resp.json();
        const contentStr = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = extractJsonPayload(contentStr);
        if (parsed && parsed.recommendedFilename) {
          return {
            recommendedFilename: sanitizeFilenameWithExt(parsed.recommendedFilename, ext),
            alternativeFilenames: (parsed.alternativeFilenames || []).map((n: string) => sanitizeFilenameWithExt(n, ext)),
            extension: ext,
            recommendedFolder: parsed.recommendedFolder || (recentFolders[0] ?? undefined),
            reason: parsed.reason || 'Gemini 依據筆記脈絡智慧命名',
            isAiGenerated: true,
          };
        }
      }
    } catch (err) {
      console.warn('[saveRecommender] Gemini 推論網路失敗：', err);
    }
  }

  // 降級為本地啟發式推薦
  return generateHeuristicRecommendation(req.content, req.language, recentFolders);
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
