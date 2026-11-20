import { Prec, Extension } from '@codemirror/state';
import { keymap, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { selectAll, cursorCharLeft, cursorCharRight } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { getCM, Vim } from '@replit/codemirror-vim';
import { invoke } from '@tauri-apps/api/core';
import { VimKeyOverrides } from '../../types/tab';
import { isTauriEnvironment } from '../storage/fsBridge';

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
  onAddTab?: () => void;
  onCloseTab?: () => void;
  onOpenInlinePrompt?: (coords?: { x: number; y: number } | null) => void;
  onOpenSearch?: () => void;
  onOpenReplace?: () => void;
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
      } catch (e) { }
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

  // 0.1 Ctrl + W / Cmd + W: 收合新簡 (關閉分頁)，若取消覆蓋則保留 Vim <C-w> (Insert 刪詞 / Normal 視窗指令)
  if (options.ctrlW !== false) {
    bindings.push({
      key: 'Mod-w',
      run: () => {
        callbacks?.onCloseTab?.();
        return true;
      },
      preventDefault: true,
    });
  }

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

  // 0.4 Ctrl + U: 強制轉交給 Vim (<C-u> 向上捲動半頁 / Insert 模式刪除至行首)，防止被 CodeMirror historyKeymap 的 Mod-u (undoSelection) 攔截導致誤觸還原或退回上一行
  bindings.push({
    key: 'Mod-u',
    run: (view) => {
      const cm = getCM(view);
      if (cm?.state?.vim) {
        Vim.multiSelectHandleKey(cm, '<C-u>', 'user');
        return true;
      }
      return false;
    },
    preventDefault: true,
  });

  // 0.5 Ctrl + D: 強制轉交給 Vim (<C-d> 向下捲動半頁 / Insert 模式減少縮排)，確保與 Ctrl + U 行為對稱一致
  bindings.push({
    key: 'Mod-d',
    run: (view) => {
      const cm = getCM(view);
      if (cm?.state?.vim) {
        Vim.multiSelectHandleKey(cm, '<C-d>', 'user');
        return true;
      }
      return false;
    },
    preventDefault: true,
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

  // 3. Ctrl + V: 貼上系統剪貼簿 (若瀏覽器不支援 Clipboard API 則交由原生 paste 事件處理)
  if (options.ctrlV !== false) {
    bindings.push({
      key: 'Mod-v',
      run: (view) => {
        if (!navigator.clipboard?.readText) {
          return false;
        }
        navigator.clipboard.readText().then((text) => {
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

  // 3.1 Ctrl + X: 剪下選取文字到系統剪貼簿 (無選取時放行)
  if (options.ctrlX !== false) {
    bindings.push({
      key: 'Mod-x',
      run: (view) => {
        const sel = view.state.selection.main;
        if (!sel.empty) {
          const selectedText = view.state.sliceDoc(sel.from, sel.to);
          navigator.clipboard?.writeText(selectedText);
          view.dispatch({
            changes: { from: sel.from, to: sel.to, insert: '' },
            selection: { anchor: sel.from },
          });
          return true;
        }
        return false;
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

  // 5. Ctrl + F: 呼叫搜尋列 (優先喚起竹風自訂尋卷條)
  if (options.ctrlF !== false) {
    bindings.push({
      key: 'Mod-f',
      run: (view) => {
        if (callbacks?.onOpenSearch) {
          callbacks.onOpenSearch();
        } else {
          openSearchPanel(view);
        }
        return true;
      },
      preventDefault: true,
    });
  }

  // 5.1. Ctrl + H: 呼叫取代列 (若覆蓋選項啟用)
  if (options.ctrlH !== false) {
    bindings.push({
      key: 'Mod-h',
      run: (view) => {
        if (callbacks?.onOpenReplace) {
          callbacks.onOpenReplace();
          return true;
        }
        return false;
      },
      preventDefault: true,
    });
  }

  const extensions: Extension[] = [];
  if (bindings.length > 0) {
    extensions.push(Prec.highest(keymap.of(bindings)));
  }

  // 6. 原生 IME 自動切換與靜默防誤觸外掛 (支援 Linux WebKitGTK / Windows IMM32 / macOS HIToolbox)
  if (options.imeAutoSwitch !== false) {
    const syncNativeIme = (enabled: boolean) => {
      if (!isTauriEnvironment()) return;
      invoke('set_ime_enabled', { enabled }).catch((err) => {
        console.warn('[Vim IME] set_ime_enabled failed:', err);
      });
    };

    const shouldDisableImeForView = (targetView: EditorView): boolean => {
      if (!targetView.hasFocus) return false;
      const cm = getCM(targetView);
      if (cm?.state?.vim) {
        return !cm.state.vim.insertMode;
      }
      return isVimNormalMode(targetView);
    };

    extensions.push(
      ViewPlugin.fromClass(
        class {
          private beforeInputHandler: (e: InputEvent) => void;
          private focusHandler: () => void;
          private blurHandler: () => void;
          private modeChangeHandler: () => void;
          private cmInstance: any = null;
          private lastImeEnabled: boolean | null = null;
          private view: EditorView;

          constructor(view: EditorView) {
            this.view = view;

            const updateImeState = () => {
              // 僅在編輯器取得焦點且處於 Vim Normal / Visual 模式時停用原生輸入法
              const shouldDisable = shouldDisableImeForView(this.view);
              const targetEnabled = !shouldDisable;
              if (targetEnabled !== this.lastImeEnabled) {
                this.lastImeEnabled = targetEnabled;
                syncNativeIme(targetEnabled);
              }
            };

            this.modeChangeHandler = () => {
              updateImeState();
            };

            this.focusHandler = () => {
              this.attachCmModeListener();
              updateImeState();
            };

            this.blurHandler = () => {
              // 焦點離開編輯器（例如點進搜尋列或 AI 對話框）時立即恢復輸入法
              if (this.lastImeEnabled === false) {
                this.lastImeEnabled = true;
                syncNativeIme(true);
              }
            };

            // 核心架構防禦：靜默攔截所有 DOM beforeinput 文字寫入，杜絕切換瞬間的注音外溢寫入
            this.beforeInputHandler = (e: InputEvent) => {
              if (isVimNormalMode(this.view)) {
                e.preventDefault();
              }
            };

            view.contentDOM.addEventListener('beforeinput', this.beforeInputHandler as EventListener, true);
            view.contentDOM.addEventListener('focus', this.focusHandler);
            view.contentDOM.addEventListener('blur', this.blurHandler);

            this.attachCmModeListener();
            updateImeState();
          }

          private attachCmModeListener() {
            if (this.cmInstance) return;
            const cm = getCM(this.view);
            if (cm?.on) {
              this.cmInstance = cm;
              cm.on('vim-mode-change', this.modeChangeHandler);
            }
          }

          update(_update: ViewUpdate) {
            this.attachCmModeListener();
            const shouldDisable = shouldDisableImeForView(this.view);
            const targetEnabled = !shouldDisable;
            if (targetEnabled !== this.lastImeEnabled) {
              this.lastImeEnabled = targetEnabled;
              syncNativeIme(targetEnabled);
            }
          }

          destroy() {
            this.view.contentDOM.removeEventListener('beforeinput', this.beforeInputHandler as EventListener, true);
            this.view.contentDOM.removeEventListener('focus', this.focusHandler);
            this.view.contentDOM.removeEventListener('blur', this.blurHandler);
            if (this.cmInstance?.off) {
              this.cmInstance.off('vim-mode-change', this.modeChangeHandler);
            }
            if (this.lastImeEnabled === false) {
              syncNativeIme(true);
            }
          }
        }
      )
    );

    // 前端最後一道防線：靜默攔截未被 codemirror-vim 消費的非 Vim 文字輸入 (如 WebKitGTK 不可取消的 IME 組字寫入)
    extensions.push(
      Prec.low(
        EditorView.inputHandler.of((view) => {
          const cm = getCM(view);
          if (isVimNormalMode(view) && !cm?.curOp?.isVimOp) {
            return true;
          }
          return false;
        })
      )
    );
  }

  return extensions;
}
