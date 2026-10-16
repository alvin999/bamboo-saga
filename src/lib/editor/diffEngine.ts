import type { DiffComparisonResult, DiffLine, SideBySideRow, SideBySideDiffResult } from '../../types/history';

/**
 * 簡易而高效的 LCS (Longest Common Subsequence) 逐行 Diff 演算法
 * 能準確輸出新增 (added)、刪除 (removed)、未變更 (unchanged) 的行陣列
 */
export function computeLineDiff(oldText: string, newText: string): DiffComparisonResult {
  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];

  const m = oldLines.length;
  const n = newLines.length;

  // 動態規劃矩陣，限制過大矩陣以防百萬字元崩潰
  if (m * n > 250000) {
    return computeFastDiff(oldLines, newLines);
  }

  // 建立 DP 矩陣
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯構造 Diff 序列
  let i = m;
  let j = n;
  const reversedDiff: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      reversedDiff.push({
        type: 'unchanged',
        oldLineNumber: i,
        newLineNumber: j,
        text: oldLines[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      reversedDiff.push({
        type: 'added',
        newLineNumber: j,
        text: newLines[j - 1],
      });
      additions++;
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      reversedDiff.push({
        type: 'removed',
        oldLineNumber: i,
        text: oldLines[i - 1],
      });
      deletions++;
      i--;
    }
  }

  const lines = reversedDiff.reverse();
  const hasChanges = additions > 0 || deletions > 0;

  return {
    lines,
    additions,
    deletions,
    hasChanges,
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
