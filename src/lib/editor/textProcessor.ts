/**
 * textProcessor.ts
 * 廣零散純文字與行處理工具箱 (文字清洗與結構格式化引擎)
 */

export interface DuplicateOptions {
  caseSensitive?: boolean;
  preserveOrder?: boolean;
}

export interface TextProcessingStats {
  originalLines: number;
  newLines: number;
  changedLines: number;
  detail: string;
}

/**
 * 去除重複行 (Remove Duplicate Lines)
 * 支援保留順序 (preserveOrder) 與大小寫敏感度
 */
export function removeDuplicateLines(
  text: string,
  options: DuplicateOptions = { caseSensitive: true, preserveOrder: true }
): { result: string; removedCount: number } {
  const lines = text.split('\n');
  const seen = new Set<string>();
  const uniqueLines: string[] = [];
  let removedCount = 0;

  for (const line of lines) {
    const key = options.caseSensitive ? line : line.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueLines.push(line);
    } else {
      removedCount++;
    }
  }

  return {
    result: uniqueLines.join('\n'),
    removedCount,
  };
}

/**
 * 刪除空白行 (Delete Blank Lines)
 * 支援移除純空行或包含空白字元之空行
 */
export function removeBlankLines(text: string): { result: string; removedCount: number } {
  const lines = text.split('\n');
  const filtered: string[] = [];
  let removedCount = 0;

  for (const line of lines) {
    if (line.trim().length === 0) {
      removedCount++;
    } else {
      filtered.push(line);
    }
  }

  return {
    result: filtered.join('\n'),
    removedCount,
  };
}

/**
 * 修剪每行首尾空白 (Trim Leading/Trailing Whitespace)
 */
export function trimLines(
  text: string,
  mode: 'both' | 'start' | 'end' = 'both'
): { result: string; modifiedCount: number } {
  const lines = text.split('\n');
  let modifiedCount = 0;

  const processed = lines.map((line) => {
    let newLine = line;
    if (mode === 'both') {
      newLine = line.trim();
    } else if (mode === 'start') {
      newLine = line.trimStart();
    } else if (mode === 'end') {
      newLine = line.trimEnd();
    }
    if (newLine !== line) {
      modifiedCount++;
    }
    return newLine;
  });

  return {
    result: processed.join('\n'),
    modifiedCount,
  };
}

/**
 * 行排序 (Sort Lines)
 * 支援自然數字排序與反向排序
 */
export function sortLines(
  text: string,
  order: 'asc' | 'desc' = 'asc',
  natural: boolean = true
): { result: string } {
  const lines = text.split('\n');

  lines.sort((a, b) => {
    let cmp = 0;
    if (natural) {
      cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    } else {
      cmp = a < b ? -1 : a > b ? 1 : 0;
    }
    return order === 'asc' ? cmp : -cmp;
  });

  return { result: lines.join('\n') };
}

/**
 * 一鍵 JSON 格式化 (Pretty Print / Minify)
 */
export function formatJson(
  text: string,
  minify: boolean = false
): { success: boolean; result: string; error?: string } {
  try {
    const parsed = JSON.parse(text);
    const result = minify ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2);
    return { success: true, result };
  } catch (err: any) {
    return { success: false, result: text, error: err?.message || 'JSON 語法錯誤' };
  }
}

/**
 * Markdown 表格自動對齊格式化
 */
export function formatMarkdownTable(text: string): { success: boolean; result: string } {
  const lines = text.split('\n');
  let inTable = false;
  let tableBlock: string[] = [];
  const output: string[] = [];

  const flushTable = () => {
    if (tableBlock.length === 0) return;
    const formatted = formatSingleMarkdownTable(tableBlock);
    output.push(...formatted);
    tableBlock = [];
    inTable = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      tableBlock.push(line);
    } else {
      if (inTable) {
        flushTable();
      }
      output.push(line);
    }
  }

  if (inTable) {
    flushTable();
  }

  return { success: true, result: output.join('\n') };
}

/**
 * 格式化單一表格區塊
 */
function formatSingleMarkdownTable(tableLines: string[]): string[] {
  if (tableLines.length === 0) return [];

  // 1. 切割每個 cell
  const parsedRows = tableLines.map((line) => {
    const trimmed = line.trim();
    // 移除最外側 |
    const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    return inner.split('|').map((c) => c.trim());
  });

  // 2. 計算欄數與各欄最大字元寬度
  const maxCols = Math.max(...parsedRows.map((r) => r.length));
  const colWidths: number[] = new Array(maxCols).fill(3); // 最小寬度 3

  // 取得字元顯示寬度（考慮全形中文字寬度為 2）
  const getDisplayWidth = (str: string): number => {
    let width = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      // 中日韓字元範圍
      if (
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3400 && code <= 0x4dbf) ||
        (code >= 0x3000 && code <= 0x303f) ||
        (code >= 0xff01 && code <= 0xff60)
      ) {
        width += 2;
      } else {
        width += 1;
      }
    }
    return width;
  };

  // 3. 找出對齊列 (例如 |:---|:---:|---:|)
  let separatorIndex = -1;
  const alignments: ('left' | 'center' | 'right')[] = [];

  for (let r = 0; r < parsedRows.length; r++) {
    const row = parsedRows[r];
    const isSeparator = row.every((cell) => /^:?-+:?$/.test(cell.trim()));
    if (isSeparator && separatorIndex === -1) {
      separatorIndex = r;
      for (let c = 0; c < maxCols; c++) {
        const cell = row[c] || '---';
        const trimmed = cell.trim();
        const startColon = trimmed.startsWith(':');
        const endColon = trimmed.endsWith(':');
        if (startColon && endColon) {
          alignments[c] = 'center';
        } else if (endColon) {
          alignments[c] = 'right';
        } else {
          alignments[c] = 'left';
        }
      }
      break;
    }
  }

  // 4. 計算內容寬度
  for (let r = 0; r < parsedRows.length; r++) {
    if (r === separatorIndex) continue;
    const row = parsedRows[r];
    for (let c = 0; c < maxCols; c++) {
      const cellText = row[c] || '';
      const w = getDisplayWidth(cellText);
      if (w > colWidths[c]) {
        colWidths[c] = w;
      }
    }
  }

  // 5. 補齊與重組
  const padCell = (text: string, width: number, align: 'left' | 'center' | 'right'): string => {
    const textWidth = getDisplayWidth(text);
    const paddingNeeded = Math.max(0, width - textWidth);
    if (align === 'right') {
      return ' '.repeat(paddingNeeded) + text;
    }
    if (align === 'center') {
      const leftPad = Math.floor(paddingNeeded / 2);
      const rightPad = paddingNeeded - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    }
    return text + ' '.repeat(paddingNeeded);
  };

  const formattedLines: string[] = [];

  for (let r = 0; r < parsedRows.length; r++) {
    if (r === separatorIndex) {
      // 輸出分隔行
      const sepCells = colWidths.map((w, c) => {
        const align = alignments[c] || 'left';
        if (align === 'center') return ':' + '-'.repeat(Math.max(1, w - 2)) + ':';
        if (align === 'right') return '-'.repeat(Math.max(1, w - 1)) + ':';
        return '-'.repeat(w);
      });
      formattedLines.push('| ' + sepCells.join(' | ') + ' |');
    } else {
      const row = parsedRows[r];
      const cells = colWidths.map((w, c) => {
        const text = row[c] || '';
        const align = alignments[c] || 'left';
        return padCell(text, w, align);
      });
      formattedLines.push('| ' + cells.join(' | ') + ' |');
    }
  }

  return formattedLines;
}

export interface TextRecipeConfig {
  removeDuplicates: boolean;
  duplicateCaseSensitive: boolean;
  removeBlankLines: boolean;
  trimWhitespace: boolean;
  sortLines: boolean;
  sortOrder: 'asc' | 'desc';
  formatJson: boolean;
  formatMarkdownTable: boolean;
}

export interface TextDiagnosisResult {
  hasDuplicates: boolean;
  duplicateCount: number;
  hasBlankLines: boolean;
  blankLineCount: number;
  hasUntrimmedWhitespace: boolean;
  untrimmedCount: number;
  isJsonCandidate: boolean;
  hasMarkdownTable: boolean;
  isSortCandidate: boolean;
  recommendedRecipe: TextRecipeConfig;
  analysisSummary: string[];
}

/**
 * 智慧文本缺陷與結構診斷 (毫秒級啟發式分析)
 * 自動探勘文字中的重複項、零散空白行、首尾殘留空格、JSON 或 Markdown 表格
 */
export function diagnoseText(text: string): TextDiagnosisResult {
  const lines = text.split('\n');
  const totalLines = lines.length;

  // 1. 重複行偵測
  const seen = new Set<string>();
  let duplicateCount = 0;
  for (const line of lines) {
    if (line.trim().length > 0) {
      if (seen.has(line)) {
        duplicateCount++;
      } else {
        seen.add(line);
      }
    }
  }

  // 2. 空白行偵測
  let blankLineCount = 0;
  let consecutiveBlankCount = 0;
  let hasConsecutiveBlanks = false;
  for (const line of lines) {
    if (line.trim().length === 0) {
      blankLineCount++;
      consecutiveBlankCount++;
      if (consecutiveBlankCount >= 2) {
        hasConsecutiveBlanks = true;
      }
    } else {
      consecutiveBlankCount = 0;
    }
  }

  // 3. 首尾未修剪空白偵測
  let untrimmedCount = 0;
  for (const line of lines) {
    if (line !== line.trim() && line.trim().length > 0) {
      untrimmedCount++;
    }
  }

  // 4. JSON 候選偵測
  let isJsonCandidate = false;
  const trimmedText = text.trim();
  if (
    (trimmedText.startsWith('{') && trimmedText.endsWith('}')) ||
    (trimmedText.startsWith('[') && trimmedText.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmedText);
      isJsonCandidate = true;
    } catch {
      isJsonCandidate = false;
    }
  }

  // 5. Markdown 表格偵測
  let markdownTableLines = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length >= 3) {
      markdownTableLines++;
    }
  }
  const hasMarkdownTable = markdownTableLines >= 2;

  // 6. 是否適合排序 (純文字多行列表，且無明顯結構化語法)
  const isSortCandidate =
    totalLines >= 3 &&
    !isJsonCandidate &&
    !hasMarkdownTable &&
    duplicateCount === 0 &&
    lines.every((l) => l.trim().length < 120);

  // 產生推薦配方
  const recommendedRecipe: TextRecipeConfig = {
    removeDuplicates: duplicateCount >= 1,
    duplicateCaseSensitive: true,
    removeBlankLines: hasConsecutiveBlanks || blankLineCount >= 2,
    trimWhitespace: untrimmedCount >= 1,
    sortLines: false, // 排序通常影響語義順序，預設不自動勾選，由使用者主動勾選
    sortOrder: 'asc',
    formatJson: isJsonCandidate,
    formatMarkdownTable: hasMarkdownTable,
  };

  const analysisSummary: string[] = [];
  if (duplicateCount > 0) {
    analysisSummary.push(`發現 ${duplicateCount} 處重複行`);
  }
  if (blankLineCount > 0) {
    analysisSummary.push(`發現 ${blankLineCount} 行多餘空白行`);
  }
  if (untrimmedCount > 0) {
    analysisSummary.push(`發現 ${untrimmedCount} 行首尾殘留空格`);
  }
  if (isJsonCandidate) {
    analysisSummary.push('檢測為有效 JSON 數據');
  }
  if (hasMarkdownTable) {
    analysisSummary.push(`檢測到 ${markdownTableLines} 行 Markdown 表格`);
  }
  if (analysisSummary.length === 0) {
    analysisSummary.push('文字結構整齊，無明顯多餘冗餘');
  }

  return {
    hasDuplicates: duplicateCount > 0,
    duplicateCount,
    hasBlankLines: blankLineCount > 0,
    blankLineCount,
    hasUntrimmedWhitespace: untrimmedCount > 0,
    untrimmedCount,
    isJsonCandidate,
    hasMarkdownTable,
    isSortCandidate,
    recommendedRecipe,
    analysisSummary,
  };
}

/**
 * 依據配方管線一次套用處理
 */
export function applyRecipe(
  text: string,
  recipe: TextRecipeConfig
): { result: string; changeLog: string[] } {
  let current = text;
  const changeLog: string[] = [];

  // 1. 首尾空白修剪
  if (recipe.trimWhitespace) {
    const res = trimLines(current, 'both');
    if (res.modifiedCount > 0) {
      current = res.result;
      changeLog.push(`修剪 ${res.modifiedCount} 行首尾空格`);
    }
  }

  // 2. 清除空白行
  if (recipe.removeBlankLines) {
    const res = removeBlankLines(current);
    if (res.removedCount > 0) {
      current = res.result;
      changeLog.push(`清除 ${res.removedCount} 行空白行`);
    }
  }

  // 3. 剔除重複行
  if (recipe.removeDuplicates) {
    const res = removeDuplicateLines(current, {
      caseSensitive: recipe.duplicateCaseSensitive,
      preserveOrder: true,
    });
    if (res.removedCount > 0) {
      current = res.result;
      changeLog.push(`剔除 ${res.removedCount} 行重複項`);
    }
  }

  // 4. 自然排序
  if (recipe.sortLines) {
    const res = sortLines(current, recipe.sortOrder, true);
    current = res.result;
    changeLog.push(`已按${recipe.sortOrder === 'asc' ? '升冪' : '降冪'}排序`);
  }

  // 5. JSON 格式化
  if (recipe.formatJson) {
    const res = formatJson(current, false);
    if (res.success) {
      current = res.result;
      changeLog.push('JSON 結構美化排版');
    }
  }

  // 6. Markdown 表格對齊
  if (recipe.formatMarkdownTable) {
    const res = formatMarkdownTable(current);
    if (res.success) {
      current = res.result;
      changeLog.push('Markdown 表格欄位對齊');
    }
  }

  return {
    result: current,
    changeLog,
  };
}

export interface TextActionProposal {
  id: 'trim' | 'blank' | 'dedup' | 'sort' | 'json' | 'md_table';
  title: string;
  badge: string;
  badgeType: 'warning' | 'info' | 'success' | 'tip';
  description: string;
  recommended: boolean; // 是否為系統主動診斷推薦
  selected: boolean;    // 使用者是否勾選要應用
  impactCount: number;  // 影響的行數或處數
  category: 'cleanup' | 'format';
}

/**
 * 依據文本特徵產生具體可選之行動提案清單 (Action Proposals)
 * 供使用者自主勾選要應用哪些具體項目
 */
export function generateActionProposals(text: string): TextActionProposal[] {
  const diag = diagnoseText(text);
  const proposals: TextActionProposal[] = [];

  // 1. 剔除重複行
  if (diag.duplicateCount > 0) {
    proposals.push({
      id: 'dedup',
      title: '剔除重複內容行',
      badge: `${diag.duplicateCount} 處重複`,
      badgeType: 'warning',
      description: `保留首次出現位置，消除 ${diag.duplicateCount} 行重複冗餘行`,
      recommended: true,
      selected: true,
      impactCount: diag.duplicateCount,
      category: 'cleanup',
    });
  }

  // 2. 清除空白行
  if (diag.blankLineCount > 0) {
    proposals.push({
      id: 'blank',
      title: '清除多餘空白行',
      badge: `${diag.blankLineCount} 行空行`,
      badgeType: 'info',
      description: `移除 ${diag.blankLineCount} 行分散的無效空白行`,
      recommended: true,
      selected: true,
      impactCount: diag.blankLineCount,
      category: 'cleanup',
    });
  }

  // 3. 修剪行首尾空格
  if (diag.untrimmedCount > 0) {
    proposals.push({
      id: 'trim',
      title: '修剪行首尾空格',
      badge: `${diag.untrimmedCount} 行含殘留空格`,
      badgeType: 'info',
      description: `消除 ${diag.untrimmedCount} 行多餘的行首與行尾空格`,
      recommended: true,
      selected: true,
      impactCount: diag.untrimmedCount,
      category: 'cleanup',
    });
  }

  // 4. Markdown 表格對齊
  if (diag.hasMarkdownTable) {
    proposals.push({
      id: 'md_table',
      title: '對齊 Markdown 表格',
      badge: '檢測到表格',
      badgeType: 'success',
      description: '依中英文字元寬度自動補齊空格，讓表格縱向對齊',
      recommended: true,
      selected: true,
      impactCount: 1,
      category: 'format',
    });
  }

  // 5. JSON 格式化
  if (diag.isJsonCandidate) {
    proposals.push({
      id: 'json',
      title: '美化排版 JSON 結構',
      badge: '有效 JSON',
      badgeType: 'success',
      description: '自動將 JSON 展開為易讀的 2 格標準縮排',
      recommended: true,
      selected: true,
      impactCount: 1,
      category: 'format',
    });
  }

  // 6. 自然排序 (選配建議：若為多行清單則提供，預設不強制勾選)
  const lines = text.split('\n');
  if (lines.length >= 3) {
    proposals.push({
      id: 'sort',
      title: '自然數值排序行 (A → Z)',
      badge: diag.isSortCandidate ? '適合列表排序' : '可選排序',
      badgeType: diag.isSortCandidate ? 'tip' : 'info',
      description: '依照自然字母與數值 (1, 2, 10) 重新排列每行順序',
      recommended: diag.isSortCandidate,
      selected: false, // 排序影響語意，預設保留由使用者主動勾選
      impactCount: lines.length,
      category: 'format',
    });
  }

  // 若文本完全乾淨無任何瑕疵，補充提示
  if (proposals.length === 0) {
    proposals.push({
      id: 'trim',
      title: '全文修剪首尾空格',
      badge: '常規整理',
      badgeType: 'info',
      description: '確保整份手稿無看不見的空白字元',
      recommended: false,
      selected: false,
      impactCount: 0,
      category: 'cleanup',
    });
  }

  return proposals;
}

/**
 * 依據使用者勾選選中的提案清單套用處理
 */
export function applySelectedProposals(
  text: string,
  proposals: TextActionProposal[],
  options: { caseSensitive?: boolean; sortOrder?: 'asc' | 'desc' } = {}
): { result: string; changeLog: string[] } {
  const selectedMap = new Set(proposals.filter((p) => p.selected).map((p) => p.id));
  const recipe: TextRecipeConfig = {
    trimWhitespace: selectedMap.has('trim'),
    removeBlankLines: selectedMap.has('blank'),
    removeDuplicates: selectedMap.has('dedup'),
    duplicateCaseSensitive: options.caseSensitive ?? true,
    sortLines: selectedMap.has('sort'),
    sortOrder: options.sortOrder ?? 'asc',
    formatJson: selectedMap.has('json'),
    formatMarkdownTable: selectedMap.has('md_table'),
  };

  return applyRecipe(text, recipe);
}


