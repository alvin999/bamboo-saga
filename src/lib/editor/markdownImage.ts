import { RangeSetBuilder, Extension } from '@codemirror/state';
import { ViewPlugin, Decoration, DecorationSet, ViewUpdate, EditorView, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

/**
 * 圖片 Widget 渲染節點
 * 支援行內圖標（如標題內的微型竹簡圖示）與獨立畫卷圖片（文章內的插圖）
 */
class MarkdownImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly isInline: boolean
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = this.isInline ? 'gb-img-wrap-inline' : 'gb-img-wrap-block';

    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.alt;
    img.title = this.alt || this.src;
    img.className = this.isInline ? 'gb-img-inline' : 'gb-img-block';
    img.loading = 'lazy';

    // 容錯防護：若本機路徑或外部連結失效，顯示優雅的占位提示
    img.onerror = () => {
      wrap.innerHTML = `<span class="gb-img-fallback">🖼️ 圖片未尋得 [${this.alt || this.src}]</span>`;
    };

    wrap.appendChild(img);
    return wrap;
  }

  eq(other: MarkdownImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt && other.isInline === this.isInline;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// 嚴格匹配標準 Markdown 圖片語法：![說明文字](圖片網址或路徑)
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;

/**
 * 收集全篇文檔中所有不可渲染圖片的區間（HTML 註解、程式碼區塊、行內程式碼）
 */
function getIgnoredRanges(docText: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const ignorePatterns = [
    /<!--[\s\S]*?-->/g,    // HTML 註解 <!-- ... -->
    /```[\s\S]*?```/g,     // Fenced 代碼區塊
    /`[^`\n]+`/g,          // 行內代碼 `...`
  ];

  for (const reg of ignorePatterns) {
    reg.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = reg.exec(docText)) !== null) {
      ranges.push([m.index, m.index + m[0].length]);
    }
  }

  return ranges;
}

function buildImageDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const sel = view.state.selection.main;
  const docText = view.state.doc.toString();
  const ignoredRanges = getIgnoredRanges(docText);
  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;

      MARKDOWN_IMAGE_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = MARKDOWN_IMAGE_REGEX.exec(text)) !== null) {
        const alt = match[1];
        const src = match[2];
        const start = line.from + match.index;
        const end = start + match[0].length;

        // 【規則 1：過濾 HTML 註解、程式碼區塊與行內代碼】
        const inIgnoredRange = ignoredRanges.some(([s, e]) => start >= s && start < e);
        if (inIgnoredRange) {
          continue;
        }

        // 【規則 2：語法樹 AST 次級驗證（若屬於 Comment 或 Code 節點則跳過）】
        if (tree) {
          let node: any = tree.resolveInner(start, 1);
          let isCodeOrComment = false;
          while (node) {
            const name = node.name;
            if (
              name.includes('Comment') ||
              name.includes('Code') ||
              name.includes('HTML')
            ) {
              isCodeOrComment = true;
              break;
            }
            node = node.parent;
          }
          if (isCodeOrComment) {
            continue;
          }
        }

        // 【規則 3：Live Preview 游標交互防護】
        // 若使用者游標落在該圖片語法範圍內，不替換為 Widget，露出 Markdown 原始碼供編輯
        const isCursorInside = sel.from <= end && sel.to >= start;

        if (!isCursorInside) {
          // 判斷是否為行內小圖（行內還有其他文字，例如標題 `# ![alt](src) 標題`）
          const isInline = text.trim() !== match[0].trim();

          const deco = Decoration.replace({
            widget: new MarkdownImageWidget(src, alt, isInline),
          });
          builder.add(start, end, deco);
        }
      }

      if (line.to >= view.state.doc.length) break;
      pos = line.to + 1;
    }
  }

  return builder.finish();
}

/**
 * CodeMirror ViewPlugin：即時監聽可見視窗、文件變更與游標位移，動態渲染圖片
 */
export const markdownImagePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildImageDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildImageDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export const markdownImageExtension: Extension = [markdownImagePlugin];
