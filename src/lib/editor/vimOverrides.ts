import { Prec, Extension } from '@codemirror/state';
import { keymap, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { selectAll } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { VimKeyOverrides } from '../../types/tab';

export interface VimOverrideCallbacks {
  onManualSave?: () => void;
  onSaveAs?: () => void;
  onImeWarning?: (text: string) => void;
  onAddTab?: () => void;
  onCloseTab?: () => void;
}

export function buildVimOverrideKeymap(
  options: VimKeyOverrides,
  callbacks?: VimOverrideCallbacks
): Extension[] {
  const bindings: Array<{ key: string; run: (view: EditorView) => boolean; preventDefault?: boolean }> = [];

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

  // 1. Ctrl + S: 手動存檔 / 智薦歸檔
  if (options.ctrlS) {
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
  if (options.ctrlC) {
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
  if (options.ctrlV) {
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

  // 4. Ctrl + A: 全選
  if (options.ctrlA) {
    bindings.push({
      key: 'Mod-a',
      run: (view) => {
        selectAll(view);
        return true;
      },
      preventDefault: true,
    });
  }

  // 5. Ctrl + F: 呼叫搜尋列
  if (options.ctrlF) {
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

  // 6. 中文注音防誤觸外掛
  if (options.imeWarning) {
    extensions.push(
      ViewPlugin.fromClass(
        class {
          private domHandler: (e: CompositionEvent) => void;

          constructor(view: EditorView) {
            this.domHandler = (e: CompositionEvent) => {
              // 檢查編輯器是否處於 Vim Normal 模式
              const isVimActive = view.dom.classList.contains('cm-vimMode');
              // CodeMirror Vim 在 insert 模式通常有特殊的游標 class 或狀態
              const isNormalMode = !view.dom.querySelector('.cm-vim-cursor.cm-vim-insert');

              if (isVimActive && isNormalMode) {
                callbacks?.onImeWarning?.('⚠️ 目前處於 Vim Normal 指令模式，請按「i」切換為輸入模式再鍵入中文。');
              }
            };

            view.contentDOM.addEventListener('compositionstart', this.domHandler);
          }

          destroy() {
            // contentDOM 銷毀時會自動卸除
          }
        }
      )
    );
  }

  return extensions;
}
