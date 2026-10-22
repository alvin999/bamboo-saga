import type { DiffComparisonResult, DiffLine, SideBySideRow, SideBySideDiffResult } from '../../types/history';

/**
 * 簡易而高效的 LCS (Longest Common Subsequence) 逐行 Diff 演算法
 * 能準確輸出新增 (added)、刪除 (removed)、未變更 (unchanged) 的行陣列
 */
export function computeLineDiff(oldText: string, newText: string): DiffComparisonResult {
  if (oldText === newText) {
    const lines = (oldText ? oldText.split('\n') : []).map((text, idx) => ({
      type: 'unchanged' as const,
      oldLineNumber: idx + 1,
      newLineNumber: idx + 1,
      text,
    }));
    return {
      lines,
      additions: 0,
      deletions: 0,
      hasChanges: false,
    };
  }

  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];

  let prefixCount = 0;
  const minLen = Math.min(oldLines.length, newLines.length);

  // 1. Common Prefix Trimming（頭部相同行秒跳過）
  while (prefixCount < minLen && oldLines[prefixCount] === newLines[prefixCount]) {
    prefixCount++;
  }

  // 2. Common Suffix Trimming（尾部相同行秒跳過）
  let suffixCount = 0;
  while (
    suffixCount < minLen - prefixCount &&
    oldLines[oldLines.length - 1 - suffixCount] === newLines[newLines.length - 1 - suffixCount]
  ) {
    suffixCount++;
  }

  const trimmedOld = oldLines.slice(prefixCount, oldLines.length - suffixCount);
  const trimmedNew = newLines.slice(prefixCount, newLines.length - suffixCount);

  const m = trimmedOld.length;
  const n = trimmedNew.length;

  let middleDiff: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;

  // 門檻防護：若中間差異仍過大 (m * n > 40000)，直接走快速線性比對，保護 UI 不凍結
  if (m * n > 40000) {
    const fast = computeFastDiff(trimmedOld, trimmedNew);
    middleDiff = fast.lines.map((l) => ({
      ...l,
      oldLineNumber: l.oldLineNumber !== undefined ? l.oldLineNumber + prefixCount : undefined,
      newLineNumber: l.newLineNumber !== undefined ? l.newLineNumber + prefixCount : undefined,
    }));
    additions = fast.additions;
    deletions = fast.deletions;
  } else {
    // 建立輕量 DP 矩陣
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (trimmedOld[i - 1] === trimmedNew[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    let i = m;
    let j = n;
    const reversedMiddle: DiffLine[] = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && trimmedOld[i - 1] === trimmedNew[j - 1]) {
        reversedMiddle.push({
          type: 'unchanged',
          oldLineNumber: prefixCount + i,
          newLineNumber: prefixCount + j,
          text: trimmedOld[i - 1],
        });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        reversedMiddle.push({
          type: 'added',
          newLineNumber: prefixCount + j,
          text: trimmedNew[j - 1],
        });
        additions++;
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        reversedMiddle.push({
          type: 'removed',
          oldLineNumber: prefixCount + i,
          text: trimmedOld[i - 1],
        });
        deletions++;
        i--;
      }
    }
    middleDiff = reversedMiddle.reverse();
  }

  // 組合結果：前綴相同 + 中間差異 + 後綴相同
  const prefixLines: DiffLine[] = [];
  for (let k = 0; k < prefixCount; k++) {
    prefixLines.push({
      type: 'unchanged',
      oldLineNumber: k + 1,
      newLineNumber: k + 1,
      text: oldLines[k],
    });
  }

  const suffixLines: DiffLine[] = [];
  const oldSuffixStart = oldLines.length - suffixCount;
  const newSuffixStart = newLines.length - suffixCount;
  for (let k = 0; k < suffixCount; k++) {
    suffixLines.push({
      type: 'unchanged',
      oldLineNumber: oldSuffixStart + k + 1,
      newLineNumber: newSuffixStart + k + 1,
      text: oldLines[oldSuffixStart + k],
    });
  }

  const lines = [...prefixLines, ...middleDiff, ...suffixLines];
  return {
    lines,
    additions,
    deletions,
    hasChanges: additions > 0 || deletions > 0,
  };
}

/**
 * 快速行比對 fallback（適用於超大檔案）
 */
function computeFastDiff(oldLines: string[], newLines: string[]): DiffComparisonResult {
  const lines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let idx = 0; idx < maxLen; idx++) {
    const o = oldLines[idx];
    const n = newLines[idx];
    if (o === undefined) {
      lines.push({ type: 'added', newLineNumber: idx + 1, text: n });
      additions++;
    } else if (n === undefined) {
      lines.push({ type: 'removed', oldLineNumber: idx + 1, text: o });
      deletions++;
    } else if (o === n) {
      lines.push({ type: 'unchanged', oldLineNumber: idx + 1, newLineNumber: idx + 1, text: o });
    } else {
      lines.push({ type: 'removed', oldLineNumber: idx + 1, text: o });
      lines.push({ type: 'added', newLineNumber: idx + 1, text: n });
      additions++;
      deletions++;
    }
  }

  return {
    lines,
    additions,
    deletions,
    hasChanges: additions > 0 || deletions > 0,
  };
}

/**
 * 將單欄 DiffLine 序列轉換為對齊的左右雙欄 Side-by-Side 格式
 * 處理連續的 removed 與 added 變更區塊成對排版，並在非對稱變更時自動以 empty 補白對齊高度
 */
export function diffLinesToSideBySide(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx];

    if (line.type === 'unchanged') {
      rows.push({
        left: {
          type: 'unchanged',
          lineNumber: line.oldLineNumber,
          text: line.text,
        },
        right: {
          type: 'unchanged',
          lineNumber: line.newLineNumber,
          text: line.text,
        },
      });
      idx++;
    } else {
      // 收集連續的 removed 與 added 變更群組
      const removedChunk: DiffLine[] = [];
      const addedChunk: DiffLine[] = [];

      while (idx < lines.length && lines[idx].type !== 'unchanged') {
        if (lines[idx].type === 'removed') {
          removedChunk.push(lines[idx]);
        } else if (lines[idx].type === 'added') {
          addedChunk.push(lines[idx]);
        }
        idx++;
      }

      // 成對並排，長度不足側以 empty 補白
      const maxCount = Math.max(removedChunk.length, addedChunk.length);
      for (let r = 0; r < maxCount; r++) {
        const rem = removedChunk[r];
        const add = addedChunk[r];

        rows.push({
          left: rem
            ? {
                type: 'removed',
                lineNumber: rem.oldLineNumber,
                text: rem.text,
              }
            : {
                type: 'empty',
                text: '',
              },
          right: add
            ? {
                type: 'added',
                lineNumber: add.newLineNumber,
                text: add.text,
              }
            : {
                type: 'empty',
                text: '',
              },
        });
      }
    }
  }

  return rows;
}

/**
 * 計算左右雙欄 Git Diff 比對結果
 */
export function computeSideBySideDiff(oldText: string, newText: string): SideBySideDiffResult {
  const unified = computeLineDiff(oldText, newText);
  const rows = diffLinesToSideBySide(unified.lines);
  return {
    rows,
    additions: unified.additions,
    deletions: unified.deletions,
    hasChanges: unified.hasChanges,
  };
}
