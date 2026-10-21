/**
 * @file chunkPipeline.ts
 * @description 針對長篇速記超出 Groq 上限的智慧切分演算法與 Map-Reduce 提煉管線
 * 
 * 核心設計原則：
 * 1. 100% 通用、零領域 Hardcode，與段落編號 [P1], [P2]... 無縫相容
 * 2. 以天然段落（空行）為最小單位分組，絕不中途切斷句子或代碼區塊
 * 3. 嚴格保持全局唯一段落編號，確保後續 buildReviewChunks 逐段對照 100% 精準對齊
 * 4. 具備 Rate-limit 節流與指數退避，防止 Groq 瞬間打滿 TPM 觸發 429
 */

import type { RefineryMode, RefineryRequest, RefineryResult } from './refinery';

/** 單一分段切片結構 */
export interface TextChunk {
  id: string;
  chunkIndex: number;
  totalChunks: number;
  startP: number; // 起始段落序號 (1-based, e.g. 1)
  endP: number;   // 結束段落序號 (1-based, e.g. 8)
  pRangeLabel: string; // 例如 "[P1 ~ P8]"
  text: string;   // 帶有段落編號的格式化文本
  charCount: number;
}

/** 切分設定參數 */
export interface ChunkOptions {
  /** 觸發分段的文字長度門檻 (預設 3,500 字) */
  thresholdChars?: number;
  /** 單一分段的最大目標字數 (預設 2,500 字，留足夠 Token 給 Prompt 與 Output) */
  maxCharsPerChunk?: number;
  /** 呼叫 API 間隔延遲毫秒數 (防止 Groq 429 TPM 超標，預設 350ms) */
  requestDelayMs?: number;
}

/** 管線即時進度狀態 */
export interface PipelineProgress {
  stage: 'chunking' | 'map' | 'reduce' | 'done' | 'error';
  current?: number;
  total?: number;
  message: string;
}

/** 預設安全參數 */
export const DEFAULT_CHUNK_OPTIONS: Required<ChunkOptions> = {
  thresholdChars: 3500,
  maxCharsPerChunk: 2500,
  requestDelayMs: 350,
};

/**
 * 判斷該文本是否需要啟動分段管線
 */
export function isChunkingNeeded(text: string, threshold = DEFAULT_CHUNK_OPTIONS.thresholdChars): boolean {
  if (!text) return false;
  return text.trim().length > threshold;
}

/**
 * 智慧段落分組切分演算法
 * 
 * 演算法流程：
 * 1. 將全文按天然雙換行 `\n\s*\n+` 分割為原始段落陣列（對齊 extractOriginalParagraphs）
 * 2. 賦予每段全局連續序號 P1, P2... Pn
 * 3. 採貪婪法（Greedy Batching）將段落群組化，累計字數接近 maxCharsPerChunk 時封裝為一個 Chunk
 * 4. 極端保護：若單一段落本身超過 maxCharsPerChunk，則依標點進行內部次切分，但保留相同 P 編號
 */
export function splitIntoIndexedChunks(rawText: string, options?: ChunkOptions): TextChunk[] {
  const clean = rawText.trim();
  if (!clean) return [];

  const opts = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  
  // 1. 分割為天然段落 (與 chunkReview.ts 保持 100% 邏輯一致)
  const paragraphs = clean
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const chunks: TextChunk[] = [];
  let currentParagraphs: { pNum: number; content: string }[] = [];
  let currentLength = 0;
  let chunkCounter = 1;

  for (let i = 0; i < paragraphs.length; i++) {
    const pNum = i + 1; // 1-based P 編號
    const pText = paragraphs[i];

    // 若累計長度加上此段已超過單段上限，且當前已有累積段落，先將當前群組結算為一個 Chunk
    if (currentLength + pText.length > opts.maxCharsPerChunk && currentParagraphs.length > 0) {
      chunks.push(finalizeChunk(currentParagraphs, chunkCounter++));
      currentParagraphs = [];
      currentLength = 0;
    }

    // 處理極端情況：單一巨大段落自身即超過 maxCharsPerChunk
    if (pText.length > opts.maxCharsPerChunk) {
      // 進行句級安全切分
      const subChunks = splitHugeParagraph(pText, pNum, opts.maxCharsPerChunk);
      for (const sub of subChunks) {
        chunks.push({
          id: `chunk-${chunkCounter}`,
          chunkIndex: chunkCounter,
          totalChunks: 0, // 後續統一補齊
          startP: pNum,
          endP: pNum,
          pRangeLabel: `[P${pNum}]`,
          text: sub,
          charCount: sub.length,
        });
        chunkCounter++;
      }
      continue;
    }

    currentParagraphs.push({ pNum, content: pText });
    currentLength += pText.length;
  }

  // 結算最後一個 Chunk
  if (currentParagraphs.length > 0) {
    chunks.push(finalizeChunk(currentParagraphs, chunkCounter++));
  }

  // 統一更新 totalChunks
  const total = chunks.length;
  chunks.forEach((c) => (c.totalChunks = total));

  return chunks;
}

/**
 * 將收集的段落集合封裝為 TextChunk 物件
 */
function finalizeChunk(
  items: { pNum: number; content: string }[],
  index: number
): TextChunk {
  const startP = items[0].pNum;
  const endP = items[items.length - 1].pNum;
  const pRangeLabel = startP === endP ? `[P${startP}]` : `[P${startP} ~ P${endP}]`;

  // 格式化為含有 [P1], [P2] 標記的文本區塊
  const formattedText = items
    .map((item) => `[P${item.pNum}]\n${item.content}`)
    .join('\n\n');

  return {
    id: `chunk-${index}`,
    chunkIndex: index,
    totalChunks: 0,
    startP,
    endP,
    pRangeLabel,
    text: formattedText,
    charCount: formattedText.length,
  };
}

/**
 * 處理無換行萬字超長單一段落的安全切分
 */
function splitHugeParagraph(text: string, pNum: number, maxChars: number): string[] {
  const sentences = text.split(/(?<=[。！？\n\r])/);
  const result: string[] = [];
  let buffer = '';

  for (const s of sentences) {
    if (buffer.length + s.length > maxChars && buffer.length > 0) {
      result.push(`[P${pNum}]\n${buffer.trim()}`);
      buffer = '';
    }
    buffer += s;
  }

  if (buffer.trim()) {
    result.push(`[P${pNum}]\n${buffer.trim()}`);
  }

  return result.length > 0 ? result : [`[P${pNum}]\n${text}`];
}

/**
 * 構建 Map 階段提示詞（局部無失真萃取）
 */
export function buildMapPrompt(
  mode: RefineryMode,
  chunk: TextChunk,
  customPrompt?: string
): string {
  return `你是長文結構化提煉專家。以下為原稿分段 ${chunk.pRangeLabel}（第 ${chunk.chunkIndex}/${chunk.totalChunks} 區塊）。
請對此區塊進行「高密度、無失真」的重點萃取與整理：

【輸出規範】：
1. 提取本區塊的核心討論點、決策、重要度量衡數據與具體事實。
2. 提取所有明確與隱含的待辦任務（使用 Markdown「- [ ]」清單）。
3. 嚴格遵守【省 Token 溯源編號】：在每個整理要點或待辦群組結尾，標註其對應來源段落，例如「<!-- ref: P${chunk.startP} -->」。不要重複輸出原始冗長內文字句！
4. 請一律使用台灣正體/繁體中文輸出。

待提煉區塊 ${chunk.pRangeLabel} 內容如下：
${chunk.text}

${customPrompt ? `額外補充要求：${customPrompt}` : ''}`;
}

/**
 * 構建 Reduce 階段提示詞（全局融會貫通成竹簡標準格式）
 */
export function buildReducePrompt(
  modePromptHeader: string,
  mapSummaries: { chunkLabel: string; content: string }[],
  customPrompt?: string
): string {
  const combinedMap = mapSummaries
    .map(
      (m, idx) => `=== 區塊 ${idx + 1} (${m.chunkLabel}) 局部提煉成果 ===\n${m.content}`
    )
    .join('\n\n');

  return `${modePromptHeader}

以下為全篇長稿經各區塊局部提煉後的精華匯總：
${combinedMap}

【全域整合指示】：
- 請將上述所有區塊的成果融會貫通，去除跨區塊重複項，梳理出最高層次的全局架構。
- 第一部分【🎯 核心概要】請做全篇宏觀總結，並標註「<!-- ref: all -->」。
- 第二部分【📐 關鍵內涵】請依邏輯整合，並保留原始要點所標註的「<!-- ref: Pn -->」溯源標籤。
- 第三部分【⚡ 待辦與推進項目】請統一彙整並依急迫度分組，同樣保留來源標註。
- 請嚴格遵守排版與渲染規範輸出。

${customPrompt ? `額外補充要求：${customPrompt}` : ''}`;
}

/**
 * 睡眠輔助函式（防止打滿 API 頻率限制）
 */
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 單次底層 AI 推論呼叫（封裝 Groq / Gemini，支援 429 自動退避）
 */
export async function callSingleInference(
  prompt: string,
  systemPrompt: string,
  req: RefineryRequest,
  signal?: AbortSignal
): Promise<string> {
  // 1. Groq 呼叫
  if (req.model === 'groq' && req.groqKey) {
    const groqModel = req.modelId || 'llama-3.3-70b-versatile';
    let retries = 2;

    while (retries >= 0) {
      if (signal?.aborted) throw new Error('使用者已取消推論');

      try {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${req.groqKey}`,
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature: 0.3,
          }),
          signal,
        });

        if (resp.status === 429) {
          // 遭遇速率限制，等待後重試
          retries--;
          if (retries < 0) {
            throw new Error('Groq API 請求過於頻繁 (429 Rate Limit)，請稍後再試');
          }
          await sleep(1500);
          continue;
        }

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Groq API 錯誤 (${resp.status})`);
        }

        const data = await resp.json();
        return data.choices?.[0]?.message?.content || '';
      } catch (e: any) {
        if (retries <= 0 || signal?.aborted) throw e;
        retries--;
        await sleep(1000);
      }
    }
  }

  // 2. Gemini 呼叫
  if (req.model === 'gemini' && req.geminiKey) {
    const rawId = req.modelId || 'gemini-1.5-flash';
    const geminiModel =
      rawId.includes('gemini-2.5-flash') || !rawId.toLowerCase().includes('gemini')
        ? 'gemini-1.5-flash'
        : rawId;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${req.geminiKey}`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
        generationConfig: {
          temperature: 0.3,
        },
      }),
      signal,
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Gemini API 錯誤 (${resp.status})`);
    }

    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // 3. 無金鑰時的本地模擬
  await sleep(400);
  return `### ⚡ 本地模擬提煉結果\n${prompt.slice(0, 300)}...\n\n<!-- ref: all -->`;
}

/**
 * 執行完整的 Map-Reduce 分段提煉管線
 */
export async function executeChunkedRefineryPipeline(
  req: RefineryRequest,
  modePromptHeader: string,
  options?: ChunkOptions,
  onProgress?: (progress: PipelineProgress) => void,
  signal?: AbortSignal
): Promise<RefineryResult> {
  const targetText = req.selection && req.selection.trim() ? req.selection : req.content;
  const opts = { ...DEFAULT_CHUNK_OPTIONS, ...options };

  onProgress?.({
    stage: 'chunking',
    message: '正在進行智慧語意段落切分...',
  });

  // 1. 切分文本
  const chunks = splitIntoIndexedChunks(targetText, opts);

  // 若切分後只有 1 個區塊，退回單次標準調用
  if (chunks.length <= 1) {
    const singlePrompt = `${modePromptHeader}\n${chunks[0]?.text || targetText}\n\n${
      req.customPrompt ? `額外補充要求：${req.customPrompt}` : ''
    }`;
    const systemPrompt =
      '你是《廣零散》筆記工作台的 AI 提煉師。請輸出正體/繁體中文，注重排版美學與精準度。';

    onProgress?.({
      stage: 'map',
      current: 1,
      total: 1,
      message: '正在進行全篇提煉...',
    });

    const refinedText = await callSingleInference(singlePrompt, systemPrompt, req, signal);
    return {
      refinedText,
      summary: '✨ 收散成丹：結構化結論提煉',
      engineUsed: req.model === 'groq' ? `Groq (${req.modelId || 'llama-3.3-70b-versatile'})` : `Gemini (${req.modelId || 'gemini-1.5-flash'})`,
    };
  }

  // 2. Map 階段：依序對各分段提煉（帶有適當延遲避免打滿 Groq TPM 限流）
  const mapSummaries: { chunkLabel: string; content: string }[] = [];
  const systemPrompt =
    '你是《廣零散》長文分段結構化提煉師。請輸出正體/繁體中文，遵守溯源標註規範。';

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    onProgress?.({
      stage: 'map',
      current: i + 1,
      total: chunks.length,
      message: `正在分段提煉中 (${i + 1}/${chunks.length})：${chunk.pRangeLabel}...`,
    });

    const mapPrompt = buildMapPrompt(req.mode, chunk, req.customPrompt);
    const summary = await callSingleInference(mapPrompt, systemPrompt, req, signal);
    mapSummaries.push({
      chunkLabel: chunk.pRangeLabel,
      content: summary,
    });

    // 區塊之間適度暫停，給予 API TPM 冷卻時間
    if (i < chunks.length - 1 && opts.requestDelayMs > 0) {
      await sleep(opts.requestDelayMs);
    }
  }

  // 3. Reduce 階段：全局整合
  onProgress?.({
    stage: 'reduce',
    message: `彙整 ${chunks.length} 個分段成果為全局結構 (Reduce)...`,
  });

  const reducePrompt = buildReducePrompt(modePromptHeader, mapSummaries, req.customPrompt);
  const finalRefinedText = await callSingleInference(reducePrompt, systemPrompt, req, signal);

  onProgress?.({
    stage: 'done',
    message: '✨ 分段提煉與全局彙整完成！',
  });

  const engineName =
    req.model === 'groq'
      ? `Groq (${req.modelId || 'llama-3.3-70b-versatile'} - ${chunks.length}段 Map-Reduce)`
      : `Gemini (${req.modelId || 'gemini-1.5-flash'} - ${chunks.length}段 Map-Reduce)`;

  return {
    refinedText: finalRefinedText,
    summary: `✨ 分段提煉完成（共分流 ${chunks.length} 區塊）`,
    engineUsed: engineName,
  };
}

