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
        const isRec = rawId.includes('gemini-2.5-flash') || rawId.includes('gemini-1.5-flash');
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
 * 讀取本機快取的模型清單
 */
export function getCachedModels(provider: 'gemini' | 'groq'): AvailableModelItem[] {
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
export function saveModelsToCache(provider: 'gemini' | 'groq', models: AvailableModelItem[]) {
  try {
    localStorage.setItem(`${CACHE_KEY_PREFIX}${provider}`, JSON.stringify(models));
  } catch (e) {
    console.warn(`寫入 ${provider} 模型快取失敗:`, e);
  }
}
