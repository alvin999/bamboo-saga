/**
 * SAGA AI 模型熱重載探勘模組 (Model Fetcher)
 * 負責透過使用者提供的 API Key 即時向官方端點獲取可用模型清單，
 * 支援 Google Gemini 與 Groq，提供超時保護、防抖與本機快取機制。
 */

export interface AvailableModelItem {
  id: string;          // 實際呼叫 API 時傳入的模型標識 (e.g. 'gemini-2.5-flash', 'llama-3.3-70b-versatile')
  displayName: string; // 友善的介面顯示名稱 (包含推薦標籤與說明)
  description?: string;
  isRecommended?: boolean;
}

export interface FetchModelsResult {
  success: boolean;
  models: AvailableModelItem[];
  error?: string;
  source: 'remote' | 'cache';
}

const CACHE_KEY_PREFIX = 'bamboo_cached_models_';

/**
 * 探勘 Google Gemini 支援的模型清單
 * 端點: GET https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}
 */
export async function fetchGeminiModels(apiKey: string): Promise<FetchModelsResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { success: false, models: [], error: '請輸入 Google Gemini API Key' , source: 'remote' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 秒超時保護

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errJson = await resp.json().catch(() => ({}));
      const msg = errJson.error?.message || `Google API 回應狀態碼 ${resp.status}`;
      return { success: false, models: [], error: msg, source: 'remote' };
    }

    const data = await resp.json();
    const rawModels: any[] = data.models || [];

    // 篩選：僅保留支援 generateContent 的推論模型，過濾掉純 embedding 或 aqa 模型
    const models: AvailableModelItem[] = rawModels
      .filter((m) => {
        const methods: string[] = m.supportedGenerationMethods || [];
        return methods.includes('generateContent') && !m.name.includes('embedding') && !m.name.includes('aqa');
      })
      .map((m) => {
        const rawId = m.name.replace(/^models\//, '');
        const isRec = rawId.includes('gemini-2.0-flash') || rawId.includes('gemini-1.5-flash');
        return {
          id: rawId,
          displayName: `${m.displayName || rawId}${isRec ? ' (推薦)' : ''}`,
          description: m.description || '',
          isRecommended: isRec,
        };
      })
      // 推薦模型置頂排在最前
      .sort((a, b) => (b.isRecommended ? 1 : 0) - (a.isRecommended ? 1 : 0));

    // 寫入本地快取
    saveModelsToCache('gemini', models);

    return { success: true, models, source: 'remote' };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, models: [], error: '連線逾時，請檢查網路連線狀態', source: 'remote' };
    }
    return { success: false, models: [], error: err.message || '未知錯誤', source: 'remote' };
  }
}

/**
 * 探勘 Groq 支援的模型清單
 * 端點: GET https://api.groq.com/openai/v1/models
 */
export async function fetchGroqModels(apiKey: string): Promise<FetchModelsResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { success: false, models: [], error: '請輸入 Groq API Key', source: 'remote' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const resp = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        Authorization: `Bearer ${cleanKey}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errJson = await resp.json().catch(() => ({}));
      const msg = errJson.error?.message || `Groq API 回應狀態碼 ${resp.status}`;
      return { success: false, models: [], error: msg, source: 'remote' };
    }

    const data = await resp.json();
    const rawModels: any[] = data.data || [];

    // 篩選：僅保留 active 且名稱為常見對話模型的選項
    const models: AvailableModelItem[] = rawModels
      .filter((m) => m.active !== false && !m.id.includes('whisper') && !m.id.includes('embed'))
      .map((m) => {
        const isRec = m.id.includes('llama-3.3-70b') || m.id.includes('llama-3.1-70b');
        return {
          id: m.id,
          displayName: `${m.id}${isRec ? ' (推薦 - 毫秒級推論)' : ''}`,
          description: `由 ${m.owned_by || 'Groq'} 提供支援`,
          isRecommended: isRec,
        };
      })
      .sort((a, b) => (b.isRecommended ? 1 : 0) - (a.isRecommended ? 1 : 0));

    saveModelsToCache('groq', models);

    return { success: true, models, source: 'remote' };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, models: [], error: '連線逾時，請檢查網路連線狀態', source: 'remote' };
    }
    return { success: false, models: [], error: err.message || '未知錯誤', source: 'remote' };
  }
}

/**
 * 標準化自訂 OpenAI-Compatible 端點 URL
 */
export function normalizeEndpoint(rawUrl: string): string {
  let clean = rawUrl.trim();
  if (!clean) return 'http://localhost:11434/v1';
  // 移除結尾的斜線
  clean = clean.replace(/\/+$/, '');
  // 若未包含 /v1 或其他 api 路徑，自動補上 /v1
  if (!clean.endsWith('/v1') && !clean.includes('/v1/')) {
    clean = `${clean}/v1`;
  }
  return clean;
}

/**
 * 探勘自訂 / 本地端點支援的模型清單（支援 Ollama、LM Studio、LocalAI 等 OpenAI 相容服務）
 */
export async function fetchCustomModels(endpoint: string, apiKey?: string): Promise<FetchModelsResult> {
  const cleanEndpoint = normalizeEndpoint(endpoint);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 秒超時保護

    // 1. 優先嘗試標準 OpenAI 規範: GET ${endpoint}/models
    let modelsUrl = `${cleanEndpoint}/models`;
    let resp: Response | null = null;
    let fetchErrorMsg = '';

    try {
      resp = await fetch(modelsUrl, {
        headers,
        signal: controller.signal,
      });
    } catch (e: any) {
      fetchErrorMsg = e.message || '';
    }

    // 2. 若標準路徑失敗且可能為原生 Ollama (例如 port 11434)，嘗試原生 /api/tags
    if ((!resp || !resp.ok) && cleanEndpoint.includes('11434')) {
      try {
        const urlObj = new URL(cleanEndpoint);
        const ollamaTagsUrl = `${urlObj.origin}/api/tags`;
        const ollamaResp = await fetch(ollamaTagsUrl, { signal: controller.signal });
        if (ollamaResp.ok) {
          const tagData = await ollamaResp.json();
          const rawTagModels: any[] = tagData.models || [];
          const models: AvailableModelItem[] = rawTagModels.map((m: any) => ({
            id: m.name,
            displayName: `${m.name} (本機 Ollama 離線模型)`,
            description: `大小: ${m.size ? (m.size / (1024 * 1024 * 1024)).toFixed(1) + ' GB' : '未知'}`,
            isRecommended: true,
          }));

          clearTimeout(timeoutId);
          saveModelsToCache('custom', models);
          return { success: true, models, source: 'remote' };
        }
      } catch (ollamaErr) {
        // 忽略，繼續回報原先的錯誤
      }
    }

    clearTimeout(timeoutId);

    if (!resp) {
      return {
        success: false,
        models: [],
        error: `無法連線至本地端點 (${cleanEndpoint})，請確認 Ollama 或 LM Studio 已啟動。\n原因: ${fetchErrorMsg}`,
        source: 'remote',
      };
    }

    if (!resp.ok) {
      const errJson = await resp.json().catch(() => ({}));
      const msg = errJson.error?.message || `端點回應 HTTP ${resp.status}`;
      return { success: false, models: [], error: msg, source: 'remote' };
    }

    const data = await resp.json();
    const rawModels: any[] = data.data || data.models || [];

    if (!Array.isArray(rawModels) || rawModels.length === 0) {
      return {
        success: true,
        models: [
          { id: 'llama3.2', displayName: 'llama3.2 (自訂)', isRecommended: true },
          { id: 'mistral', displayName: 'mistral (自訂)' },
        ],
        error: '端點未回傳可用模型清單，已載入通用預設名稱',
        source: 'remote',
      };
    }

    const models: AvailableModelItem[] = rawModels.map((m: any) => {
      const id = typeof m === 'string' ? m : m.id || m.name;
      const isRec = id.includes('llama3') || id.includes('qwen') || id.includes('deepseek');
      return {
        id,
        displayName: `${id}${isRec ? ' (推薦 - 本機流暢)' : ''}`,
        description: m.owned_by ? `提供者: ${m.owned_by}` : 'OpenAI-Compatible 本機端點',
        isRecommended: isRec,
      };
    }).sort((a, b) => (b.isRecommended ? 1 : 0) - (a.isRecommended ? 1 : 0));

    saveModelsToCache('custom', models);
    return { success: true, models, source: 'remote' };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, models: [], error: `連線至 ${cleanEndpoint} 逾時，請檢查本機模型伺服器狀態`, source: 'remote' };
    }
    return { success: false, models: [], error: err.message || '未知錯誤', source: 'remote' };
  }
}

/**
 * 讀取本機快取的模型清單
 */
export function getCachedModels(provider: 'gemini' | 'groq' | 'custom'): AvailableModelItem[] {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${provider}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn(`讀取 ${provider} 模型快取失敗:`, e);
  }
  return [];
}

/**
 * 儲存模型清單至本機快取
 */
export function saveModelsToCache(provider: 'gemini' | 'groq' | 'custom', models: AvailableModelItem[]) {
  try {
    localStorage.setItem(`${CACHE_KEY_PREFIX}${provider}`, JSON.stringify(models));
  } catch (e) {
    console.warn(`寫入 ${provider} 模型快取失敗:`, e);
  }
}
