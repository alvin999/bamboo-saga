import { RangeSetBuilder, Extension } from '@codemirror/state';
import { ViewPlugin, Decoration, DecorationSet, ViewUpdate, EditorView } from '@codemirror/view';

// 待辦方塊裝飾（未完成與已完成）
export const openBoxMark = Decoration.mark({
  class: 'gb-task-checkbox gb-task-open',
  attributes: { title: '點擊切換任務完成狀態' },
});

export const doneBoxMark = Decoration.mark({
  class: 'gb-task-checkbox gb-task-done',
  attributes: { title: '點擊切換任務未完成狀態' },
});

export const doneLineMark = Decoration.mark({
  class: 'gb-task-done-line',
});

// 正則表達式：匹配行首的任務清單（如 `- [ ]`, `* [x]`, `1. [ ]`）
const TASK_REGEX = /^(\s*(?:[-*+]|\d+\.)\s*\[)( |x|X)(\])(.*)$/;

function buildTaskDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const match = TASK_REGEX.exec(line.text);
      if (match) {
        // match[1] 是前綴包含 '['，例如 "- ["
        // match[2] 是內部狀態 ' ' 或 'x'/'X'
        // match[3] 是結尾 ']'
        // match[4] 是後續文字
        const start = line.from + match[1].length - 1; // '[' 的位置
        const end = start + 3; // ']' 的後一位（共 3 字元：[ ] 或 [x]）
        const isDone = match[2].toLowerCase() === 'x';

        // 裝飾 checkbox
        builder.add(start, end, isDone ? doneBoxMark : openBoxMark);

        // 若已完成且後續有文字，給後續文字加上沉靜淡化樣式
        if (isDone && match[4] && match[4].trim().length > 0) {
          const textStart = end;
          const textEnd = line.to;
          if (textStart < textEnd) {
            builder.add(textStart, textEnd, doneLineMark);
          }
        }
      }
      if (line.to >= view.state.doc.length) break;
      pos = line.to + 1;
    }
  }

  return builder.finish();
}

// 監聽文件變動與可見範圍，即時重繪核取方塊裝飾
export const taskHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildTaskDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildTaskDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// 監聽滑鼠點擊，實現原地零延遲狀態切換
export const taskClickPlugin = EditorView.domEventHandlers({
  mousedown(event: MouseEvent, view: EditorView) {
    // 僅響應滑鼠左鍵
    if (event.button !== 0) return false;

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return false;

    const line = view.state.doc.lineAt(pos);
    const match = TASK_REGEX.exec(line.text);
    if (!match) return false;

    const start = line.from + match[1].length - 1; // '['
    const end = start + 3; // ']'

    // 檢查點擊位置是否在方括號區間內（放寬至包含方括號）
    if (pos >= start && pos <= end) {
      event.preventDefault();
      const stateCharPos = line.from + match[1].length; // 空格或 x 的確切位置
      const isDone = match[2].toLowerCase() === 'x';
      const newChar = isDone ? ' ' : 'x';

      view.dispatch({
        changes: {
          from: stateCharPos,
          to: stateCharPos + 1,
          insert: newChar,
        },
        userEvent: 'input.taskCheckbox',
      });
      return true;
    }

    return false;
  },
});

export const taskCheckboxExtension: Extension = [
  taskHighlightPlugin,
  taskClickPlugin,
];
