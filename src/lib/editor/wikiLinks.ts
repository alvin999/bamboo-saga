/**
 * wikiLinks.ts
 * 廣零散 5.4 輕量雙向連結 (WikiLinks) 編輯器插件
 * 
 * 核心功能：
 * 1. 識別 [[藥帖名稱]] 與 [[藥帖名稱|自訂別名]] 語法。
 * 2. 智慧高亮染色與游標提示（Ctrl + 點擊跳轉）。
 * 3. 支援 Ctrl+點擊 (或 Cmd+點擊) 瞬息開卷跳轉。
 * 4. 鍵入 [[ 時提供全域藥帖與洞天檔案自動補全提示清單。
 */

import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { ViewPlugin, Decoration, type DecorationSet, type ViewUpdate, EditorView } from '@codemirror/view';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';

export interface WikiLinkCandidate {
  title: string;
  filePath?: string;
}

export const WIKILINK_REGEX = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;

export const wikiLinkMark = Decoration.mark({
  class: 'gb-wikilink',
  attributes: {
    title: 'Ctrl + 點擊以開卷跳轉',
  },
});

function buildWikiLinkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const matches: Array<{ from: number; to: number }> = [];

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    WIKILINK_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = WIKILINK_REGEX.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      if (start < end) {
        matches.push({ from: start, to: end });
      }
    }
  }

  matches.sort((a, b) => a.from - b.from);

  let lastTo = -1;
  for (const m of matches) {
    if (m.from >= lastTo && m.to <= view.state.doc.length) {
      builder.add(m.from, m.to, wikiLinkMark);
      lastTo = m.to;
    }
  }

  return builder.finish();
}

/**
 * 建立 WikiLink 點擊與渲染插件
 */
export function createWikiLinkPlugin(onOpenWikiLink: (target: string) => void): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildWikiLinkDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildWikiLinkDecorations(update.view);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        click: (e, view) => {
          if (!e.ctrlKey && !e.metaKey) return false;

          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
          if (pos === null) return false;

          // 尋找游標點擊位置所在行
          const line = view.state.doc.lineAt(pos);
          const lineText = line.text;
          const offsetInLine = pos - line.from;

          WIKILINK_REGEX.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = WIKILINK_REGEX.exec(lineText)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (offsetInLine >= start && offsetInLine <= end) {
              const target = match[1].trim();
              if (target) {
                e.preventDefault();
                e.stopPropagation();
                onOpenWikiLink(target);
                return true;
              }
            }
          }

          return false;
        },
      },
    }
  );
}

/**
 * 建立鍵入 [[ 時的候選自動補全源
 */
export function createWikiLinkCompletionSource(getCandidates: () => WikiLinkCandidate[]) {
  return (context: CompletionContext): CompletionResult | null => {
    // 匹配游標前是否剛鍵入 [[ 且尚未遇到 ]]
    const match = context.matchBefore(/\[\[([^\]\n]*)/);
    if (!match) return null;

    const query = match.text.slice(2).trim().toLowerCase();
    const candidates = getCandidates();

    // 依使用者輸入進行模糊過濾
    const filtered = candidates.filter((c) => {
      if (!query) return true;
      const titleLower = c.title.toLowerCase();
      const fileLower = (c.filePath || '').toLowerCase();
      return titleLower.includes(query) || fileLower.includes(query);
    });

    return {
      from: match.from + 2, // 替換 [[ 後方的內容
      options: filtered.slice(0, 15).map((c) => ({
        label: c.title,
        detail: c.filePath ? '📜 洞天檔案' : '📑 開啟藥帖',
        type: 'text',
        apply: `${c.title}]]`,
      })),
    };
  };
}
