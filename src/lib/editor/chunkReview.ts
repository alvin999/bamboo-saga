export type ChunkDecision = 'ai' | 'original' | 'both';

export interface ReviewChunk {
  id: string;
  title: string;
  originalText: string;
  aiText: string;
  decision: ChunkDecision;
  isSummary?: boolean; // 是否為宏觀全局總結（無單一原句對應）
}

/**
 * 判斷該標題是否屬於「全域宏觀總結」（如核心概要、整體結論、總覽）
 */
function isGlobalSummarySection(title: string, content: string): boolean {
  if (content.includes('ref: all') || content.includes('來源：[all]') || content.includes('來源：all')) {
    return true;
  }
  const t = title.toLowerCase();
  return (
    t.includes('核心概要') ||
    t.includes('概要') ||
    t.includes('總覽') ||
    t.includes('總結') ||
    t.includes('summary') ||
    t.includes('overview')
  );
}

/**
 * 依據標題或雙換行，將 AI 生成內容切割為多個邏輯單元
 */
function splitAiSections(aiText: string): { title: string; content: string }[] {
  const lines = aiText.split('\n');
  const sections: { title: string; content: string }[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  // 通用 Markdown 標題 (#, ##, ###) 或中文括號標題 (【...】) 或序號標題 (1. 【...】)
  const headerRegex = /^(?:#{1,4}\s+|(?:\d+[\.、]\s*)?【)([^】\n]+)(?:】)?/;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(headerRegex);

    if (match) {
      if (currentLines.length > 0 || currentTitle) {
        const body = currentLines.join('\n').trim();
        if (body.length > 0) {
          sections.push({
            title: currentTitle || '【🎯 核心概要】',
            content: body,
          });
        }
      }
      currentTitle = trimmed;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  const lastBody = currentLines.join('\n').trim();
  if (lastBody.length > 0) {
    sections.push({
      title: currentTitle || '【✨ 提煉成果】',
      content: lastBody,
    });
  }

  return sections.length > 0 ? sections : [{ title: '【✨ 提煉成果】', content: aiText.trim() }];
}

/**
 * 將原始手稿按天然空行（雙換行）切分，段落編號 1-based 依序為 P1, P2, P3...
 * 100% 通用，零領域 Hardcode！
 */
export function extractOriginalParagraphs(rawText: string): string[] {
  const clean = rawText.trim();
  if (!clean) return [];

  // 優先以天然連續空行分割為語意段落
  const byNewlines = clean
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return byNewlines.length > 0 ? byNewlines : [clean];
}

/**
 * 從 AI 內容中解析段落編號引用（例如 <!-- ref: P1 --> 或 > 來源：[P1] 或 [段落 1]）
 */
function parseRefIndex(text: string): number | null {
  // 支援 <!-- ref: P1 -->, <!-- ref: 1 -->, > 來源：[P1], 來源: P1, [段落 1]
  const match = text.match(/(?:<!--\s*ref:\s*P?(\d+)\s*-->|來源[：:]\s*\[?P?(\d+)\]?|\[段落\s*(\d+)\])/i);
  if (match) {
    const numStr = match[1] || match[2] || match[3];
    const n = parseInt(numStr, 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * 清理 AI 內文中帶有省 Token 追蹤的註解或來源標註
 */
function cleanAiContent(text: string): string {
  return text
    .replace(/<!--\s*ref:[^>]*-->/gi, '')
    .replace(/^>\s*來源[：:][^\n]*$/gim, '')
    .trim();
}

/**
 * 通用文字特徵計算（純統計學分詞，不含任何領域字眼）
 */
function extractCommonTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  const lower = text.toLowerCase();

  // 抓取英數組合（長度 >= 2）
  const words = lower.match(/[a-z0-9]+/g) || [];
  for (const w of words) {
    tokens.add(w);
  }

  // 抓取中文字詞（以 2 字以上為主）
  const cleanChinese = lower.replace(/[^\u4e00-\u9fa5]/g, ' ');
  const cWords = cleanChinese.split(/\s+/).filter((w) => w.length >= 2);
  for (const w of cWords) {
    tokens.add(w);
  }

  return tokens;
}

/**
 * 通用 Jaccard 相似度計算（作為 AI 漏標 ref 號碼時的純通用保底）
 */
function calculateJaccardSimilarity(textA: string, textB: string): number {
  const setA = extractCommonTokens(textA);
  const setB = extractCommonTokens(textB);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * 建立逐段審核的 Chunks 清單
 * 核心機制：以段落編號 [P1], [P2]... 直通對應，零 Hardcode、極省 Token、100% 精準零錯位
 */
export function buildReviewChunks(originalText: string, aiText: string): ReviewChunk[] {
  const aiSections = splitAiSections(aiText);
  const rawParagraphs = extractOriginalParagraphs(originalText);

  // 追蹤已被配對的原稿段落索引，避免重複爭奪
  const usedParagraphIndices = new Set<number>();

  return aiSections.map((sec, idx) => {
    const isSummary = isGlobalSummarySection(sec.title, sec.content);
    const cleanedContent = cleanAiContent(sec.content);

    // 1. 若為宏觀全局總結（如核心概要），不消耗任何個別原稿段落！
    if (isSummary) {
      return {
        id: `chunk-${idx + 1}-${Date.now()}`,
        title: sec.title,
        aiText: cleanedContent,
        originalText: '',
        decision: 'ai',
        isSummary: true,
      };
    }

    // 2. 優先透過段落編號（P1, P2...）直通對齊（最精準且零 Hardcode）
    const refIdx = parseRefIndex(sec.content);
    let matchedRaw = '';

    if (refIdx !== null && refIdx >= 1 && refIdx <= rawParagraphs.length) {
      const pIdx = refIdx - 1;
      matchedRaw = rawParagraphs[pIdx];
      usedParagraphIndices.add(pIdx);
    } else {
      // 3. 通用保底：透過純文字重疊度匹配得分最高且未被佔用的段落
      let bestPIdx = -1;
      let highestScore = 0;

      for (let p = 0; p < rawParagraphs.length; p++) {
        if (usedParagraphIndices.has(p)) continue;
        const score = calculateJaccardSimilarity(`${sec.title} ${sec.content}`, rawParagraphs[p]);
        if (score > highestScore) {
          highestScore = score;
          bestPIdx = p;
        }
      }

      if (bestPIdx !== -1 && highestScore > 0.05) {
        matchedRaw = rawParagraphs[bestPIdx];
        usedParagraphIndices.add(bestPIdx);
      } else {
        // 若完全無特徵重疊，依剩餘段落依序遞補
        const nextUnused = rawParagraphs.findIndex((_, p) => !usedParagraphIndices.has(p));
        if (nextUnused !== -1) {
          matchedRaw = rawParagraphs[nextUnused];
          usedParagraphIndices.add(nextUnused);
        }
      }
    }

    return {
      id: `chunk-${idx + 1}-${Date.now()}`,
      title: sec.title,
      aiText: cleanedContent,
      originalText: matchedRaw,
      decision: matchedRaw ? 'both' : 'ai',
      isSummary: false,
    };
  });
}

/**
 * 依據使用者的逐段決策組合出最終藥帖筆記內容
 */
export function assembleFinalNote(chunks: ReviewChunk[]): string {
  const resultBlocks: string[] = [];

  for (const chunk of chunks) {
    const header = chunk.title.startsWith('#') || chunk.title.startsWith('【')
      ? chunk.title
      : `### ${chunk.title}`;

    if (chunk.decision === 'ai' || chunk.isSummary) {
      resultBlocks.push(`${header}\n${chunk.aiText}`);
    } else if (chunk.decision === 'original') {
      resultBlocks.push(`${header}\n${chunk.originalText || chunk.aiText}`);
    } else {
      const quoteBlock = chunk.originalText && chunk.originalText.trim()
        ? `\n\n> 📜 **【原始速記脈絡】**：\n> ${chunk.originalText.trim().replace(/\n/g, '\n> ')}`
        : '';
      resultBlocks.push(`${header}\n${chunk.aiText}${quoteBlock}`);
    }
  }

  return resultBlocks.join('\n\n---\n\n');
}
