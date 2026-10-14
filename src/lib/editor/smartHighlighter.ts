import { RangeSetBuilder } from '@codemirror/state';
import { ViewPlugin, Decoration, DecorationSet, ViewUpdate, EditorView } from '@codemirror/view';

// 定義各類別的樣式 Decoration
export const urgentMark = Decoration.mark({ class: 'gb-token-urgent' });
export const quoteMark = Decoration.mark({ class: 'gb-token-quote' });
export const bracketMark = Decoration.mark({ class: 'gb-token-bracket' });
export const metricMark = Decoration.mark({ class: 'gb-token-metric' });
export const linkMark = Decoration.mark({ class: 'gb-token-link' });

// 智慧匹配規則（依優先序與語意）
export const tokenPatterns = [
  // 1. 警示與待辦 (TODO/FIXME/BUG/ERROR/URGENT/ACTION/WARN/FATAL)
  { regex: /\b(TODO|FIXME|BUG|ERROR|URGENT|ACTION|WARN|WARNING|FATAL)\b/gi, deco: urgentMark },
  // 2. 超連結
  { regex: /https?:\/\/[^\s<>'")]+(?:\.[^\s<>'")]+)*/gi, deco: linkMark },
  // 3. 中文引號（「」『』）與英數引號
  { regex: /(?:「[^」]*」|『[^』]*』|"[^"\n]*"|'[^'\n]*')/g, deco: quoteMark },
  // 4. 括號與模組標籤（【】、[]、()）
  { regex: /(?:【[^】]*】|\[[^\]\n]*\]|\([^\)\n]*\))/g, deco: bracketMark },
  // 5. 時間、百分比、單位指標數據 (例如 14:30、42ms、99.8%)
  { regex: /\b\d{1,2}:\d{2}(?::\d{2})?\b|\b\d+(?:\.\d+)?(?:ms|s|%|px|rem|KB|MB|GB|ops\/s|fps)\b/gi, deco: metricMark }
];

function buildSmartDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const matches: Array<{ from: number; to: number; deco: Decoration }> = [];

  // 跨可見視窗收集所有匹配項
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);

    for (const { regex, deco } of tokenPatterns) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const start = from + match.index;
        const end = start + match[0].length;
        if (start < end) {
          matches.push({ from: start, to: end, deco });
        }
      }
    }
  }

  // 嚴格依照 from 升序排序，若相同則依 to 排序
  matches.sort((a, b) => a.from - b.from || a.to - b.to);

  // 消除重疊區間，確保 RangeSetBuilder 嚴格單調遞增
  let lastTo = -1;
  for (const m of matches) {
    if (m.from >= lastTo && m.to <= view.state.doc.length) {
      builder.add(m.from, m.to, m.deco);
      lastTo = m.to;
    }
  }

  return builder.finish();
}

export const smartHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildSmartDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildSmartDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
