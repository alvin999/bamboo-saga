import { Prec, Extension } from '@codemirror/state';
import { keymap, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { selectAll, cursorCharLeft, cursorCharRight } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { getCM, Vim } from '@replit/codemirror-vim';
import { VimKeyOverrides } from '../../types/tab';

/**
 * 檢查 CodeMirror 是否處於 Vim Normal 指令模式 (非 Insert / Visual / Replace 模式)
 */
function isVimNormalMode(view: EditorView): boolean {
  const cm = getCM(view);
  if (cm?.state?.vim) {
    return !cm.state.vim.insertMode && !cm.state.vim.visualMode;
  }
  // 兜底備援：@replit/codemirror-vim 會在 Normal 模式將 cm-vimMode 賦予在 scrollDOM
  return view.scrollDOM?.classList?.contains('cm-vimMode') ?? false;
}

export interface VimOverrideCallbacks {
  onManualSave?: () => void;
  onSaveAs?: () => void;
  onImeWarning?: (text: string) => void;
  onAddTab?: () => void;
  onCloseTab?: () => void;
  onOpenInlinePrompt?: (coords?: { x: number; y: number } | null) => void;
}

export function buildVimOverrideKeymap(
  options: VimKeyOverrides,
  callbacks?: VimOverrideCallbacks
): Extension[] {
  const bindings: Array<{ key: string; run: (view: EditorView) => boolean; preventDefault?: boolean }> = [];

  // -1. Ctrl + I / Cmd + I: 喚出行內 AI 浮動修煉指令框（定位於當前段落下方）
  bindings.push({
    key: 'Mod-i',
    run: (view) => {
      let coords: { x: number; y: number } | null = null;
      try {
        const sel = view.state.selection.main;
        const currentLine = view.state.doc.lineAt(sel.head);
        let endLineNum = currentLine.number;
        const totalLines = view.state.doc.lines;
        while (endLineNum < totalLines) {
          const nextLine = view.state.doc.line(endLineNum + 1);
          if (nextLine.text.trim() === '') break;
          endLineNum++;
        }
        const endLine = view.state.doc.line(endLineNum);
        // 重要：使用 side: -1 保證行尾亦能精準取得幾何邊界，並以行首 (side: 1) 與游標雙重兜底
        const geo = view.coordsAtPos(endLine.to, -1) || 
                    view.coordsAtPos(endLine.from, 1) || 
                    view.coordsAtPos(sel.head, -1) ||
                    view.coordsAtPos(sel.head, 1);
        if (geo) {
          const editorRect = view.dom?.getBoundingClientRect();
          const dialogWidth = Math.min(680, window.innerWidth - 32);
          const x = editorRect ? editorRect.left + (editorRect.width - dialogWidth) / 2 : geo.left;
          coords = { x: Math.max(16, x), y: geo.bottom + 8 };
        }
      } catch (e) {}
      callbacks?.onOpenInlinePrompt?.(coords);
      return true;
    },
    preventDefault: true,
  });

  // 0. Ctrl + T / Cmd + T: 添新簡 (新增分頁)
  bindings.push({
    key: 'Mod-t',
    run: () => {
      callbacks?.onAddTab?.();
      return true;
    },
    preventDefault: true,
  });

  // 0.1 Ctrl + W / Cmd + W: 收合新簡 (關閉分頁)
  bindings.push({
    key: 'Mod-w',
    run: () => {
      callbacks?.onCloseTab?.();
      return true;
    },
    preventDefault: true,
  });

  // 0.2 Backspace: 在 Vim Normal 模式下等同於 "h" (左移一格)，嚴禁刪除文字；Insert 模式正常放行刪除
  bindings.push({
    key: 'Backspace',
    run: (view) => {
      if (isVimNormalMode(view)) {
        cursorCharLeft(view);
        return true;
      }
      return false;
    },
  });

  // 0.3 Delete: 在 Vim Normal 模式下等同於 "l" (右移一格)，嚴禁刪除文字；Insert 模式正常放行刪除
  bindings.push({
    key: 'Delete',
    run: (view) => {
      if (isVimNormalMode(view)) {
        cursorCharRight(view);
        return true;
      }
      return false;
    },
  });

  // 1. Ctrl + S: 手動存檔 / 智薦歸檔
  if (options.ctrlS !== false) {
    bindings.push({
      key: 'Mod-s',
      run: () => {
        callbacks?.onManualSave?.();
        return true;
      },
      preventDefault: true,
    });
  }

  // 1.1 Ctrl + Shift + S: 另存新檔 (Save As)
  bindings.push({
    key: 'Mod-Shift-s',
    run: () => {
      callbacks?.onSaveAs?.();
      return true;
    },
    preventDefault: true,
  });

  // 2. Ctrl + C: 複製選取文字到系統剪貼簿
  if (options.ctrlC !== false) {
    bindings.push({
      key: 'Mod-c',
      run: (view) => {
        const sel = view.state.selection.main;
        if (!sel.empty) {
          const selectedText = view.state.sliceDoc(sel.from, sel.to);
          navigator.clipboard?.writeText(selectedText);
          return true;
        }
        return false;
      },
    });
  }

  // 3. Ctrl + V: 貼上系統剪貼簿
  if (options.ctrlV !== false) {
    bindings.push({
      key: 'Mod-v',
      run: (view) => {
        navigator.clipboard?.readText().then((text) => {
          if (text) {
            const sel = view.state.selection.main;
            view.dispatch({
              changes: { from: sel.from, to: sel.to, insert: text },
              selection: { anchor: sel.from + text.length },
            });
          }
        }).catch((err) => {
          console.warn('[Vim Override] Clipboard read failed:', err);
        });
        return true;
      },
    });
  }

  // 4. Ctrl + A: 全選 (Vim 模式切換至 VISUAL LINE 全選，標準模式調用 selectAll)
  if (options.ctrlA !== false) {
    bindings.push({
      key: 'Mod-a',
      run: (view) => {
        const cm = getCM(view);
        if (cm && !cm.state?.vim?.insertMode) {
          // Vim 模式 (Normal 或 Visual)：透過 Vim 狀態機進入 VISUAL LINE 全選 (ggVG)
          cm.operation(() => {
            if (cm.state?.vim?.visualMode) {
              Vim.handleKey(cm, '<Esc>', 'user');
            }
            Vim.handleKey(cm, 'g', 'user');
            Vim.handleKey(cm, 'g', 'user');
            Vim.handleKey(cm, 'V', 'user');
            Vim.handleKey(cm, 'G', 'user');
          });
        } else {
          // 標準模式或 Vim Insert 模式：調用 CodeMirror 標準全選
          selectAll(view);
        }
        return true;
      },
      preventDefault: true,
    });
  }

  // 5. Ctrl + F: 呼叫搜尋列
  if (options.ctrlF !== false) {
    bindings.push({
      key: 'Mod-f',
      run: (view) => {
        openSearchPanel(view);
        return true;
      },
      preventDefault: true,
    });
  }

  const extensions: Extension[] = [];
  if (bindings.length > 0) {
    extensions.push(Prec.highest(keymap.of(bindings)));
  }

  // 6. 中文注音防誤觸外掛 (支援新酷音、微軟注音、日文等全系列 IME)
  if (options.imeWarning) {
    let lastWarningTime = 0;
    const triggerWarning = () => {
      const now = Date.now();
      if (now - lastWarningTime > 2000) {
        lastWarningTime = now;
        callbacks?.onImeWarning?.('⚠️ 目前處於中文輸入模式，請按「i」切換為 Vim 輸入模式再鍵入中文。');
      }
    };

    extensions.push(
      ViewPlugin.fromClass(
        class {
          private compHandler: (e: CompositionEvent) => void;
          private beforeInputHandler: (e: InputEvent) => void;
          private keyHandler: (e: KeyboardEvent) => void;
          private view: EditorView;

          constructor(view: EditorView) {
            this.view = view;

            // 1. 監聽組字開始 (微軟注音、新酷音等 IME 開啟組字時)
            this.compHandler = () => {
              if (isVimNormalMode(this.view)) {
                triggerWarning();
              }
            };

            // 2. 核心架構防禦：攔截所有 DOM beforeinput 文字寫入 (純事件邏輯，不依賴 hardcode 字元集)
            // 在 Vim Normal 指令模式下，任何企圖向 DOM 插入文字的行為一律嚴格阻止，徹底杜絕注音外溢寫入
            this.beforeInputHandler = (e: InputEvent) => {
              if (isVimNormalMode(this.view)) {
                e.preventDefault();
                triggerWarning();
              }
            };

            // 3. 監聽 keydown 狀態 (標準 IME 鍵位時主動提醒)
            this.keyHandler = (e: KeyboardEvent) => {
              if (!isVimNormalMode(this.view)) return;
              if (e.ctrlKey || e.altKey || e.metaKey) return;

              if (e.isComposing || e.key === 'Process' || e.keyCode === 229) {
                triggerWarning();
              }
            };

            view.contentDOM.addEventListener('compositionstart', this.compHandler);
            view.contentDOM.addEventListener('beforeinput', this.beforeInputHandler as EventListener, true);
            view.contentDOM.addEventListener('keydown', this.keyHandler, true);
          }

          destroy() {
            this.view.contentDOM.removeEventListener('compositionstart', this.compHandler);
            this.view.contentDOM.removeEventListener('beforeinput', this.beforeInputHandler as EventListener, true);
            this.view.contentDOM.removeEventListener('keydown', this.keyHandler, true);
          }
        }
      )
    );
  }

  return extensions;
}
