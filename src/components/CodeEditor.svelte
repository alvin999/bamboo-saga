<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, Compartment } from '@codemirror/state';
  import type { Extension } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { vim } from '@replit/codemirror-vim';
  import type { SupportedLanguage, CursorPosition, VimKeyOverrides } from '../types/tab';
  import { gruvboxExtension } from '../lib/editor/gruvboxTheme';
  import { getLanguageExtension } from '../lib/editor/languageSupport';
  import { SmearCursorRenderer } from '../lib/canvas/smearCursor';
  import { buildVimOverrideKeymap } from '../lib/editor/vimOverrides';

  let {
    content = '',
    language = 'plaintext' as SupportedLanguage,
    vimMode = false,
    vimOverrides = {
      ctrlS: true,
      ctrlC: true,
      ctrlV: true,
      ctrlA: true,
      ctrlF: true,
      imeWarning: true,
    } as VimKeyOverrides,
    cursor = { line: 1, ch: 0 },
    smearEnabled = true,
    onChange,
    onCursorChange,
    onManualSave,
    onSaveAs,
    onImeWarning,
    onAddTab,
    onCloseTab
  } = $props<{
    content: string;
    language: SupportedLanguage;
    vimMode: boolean;
    vimOverrides?: VimKeyOverrides;
    cursor: CursorPosition;
    smearEnabled?: boolean;
    onChange: (val: string) => void;
    onCursorChange: (cur: CursorPosition) => void;
    onManualSave?: () => void;
    onSaveAs?: () => void;
    onImeWarning?: (msg: string) => void;
    onAddTab?: () => void;
    onCloseTab?: () => void;
  }>();

  let editorHost: HTMLDivElement;
  let canvasHost: HTMLCanvasElement;
  let view: EditorView | null = null;
  let smearRenderer: SmearCursorRenderer | null = null;

  // Compartments 用於無縫動態熱切換語言與 Vim 模式，不重建模組實例
  const languageCompartment = new Compartment();
  const vimCompartment = new Compartment();
  const vimOverridesCompartment = new Compartment();

  onMount(() => {
    // 1. 初始化 Smear Canvas 殘影渲染器
    if (canvasHost) {
      smearRenderer = new SmearCursorRenderer(canvasHost);
    }

    // 2. 建立 CodeMirror 6 實例
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const docText = update.state.doc.toString();
        onChange(docText);
      }

      if (update.selectionSet || update.docChanged || update.geometryChanged) {
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        const cur: CursorPosition = {
          line: line.number,
          ch: head - line.from,
        };
        onCursorChange(cur);

        // 追蹤游標物理殘影
        if (smearEnabled && smearRenderer && view) {
          const coords = view.coordsAtPos(head);
          if (coords) {
            smearRenderer.updateTarget({
              left: coords.left,
              top: coords.top,
              height: coords.bottom - coords.top,
              width: 3,
            });
          }
        }
      }
    });

    const startState = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        keymap.of([
          {
            key: 'Mod-t',
            run: () => {
              onAddTab?.();
              return true;
            },
            preventDefault: true,
          },
          {
            key: 'Mod-w',
            run: () => {
              onCloseTab?.();
              return true;
            },
            preventDefault: true,
          },
          {
            key: 'Mod-s',
            run: () => {
              onManualSave?.();
              return true;
            },
            preventDefault: true,
          },
          {
            key: 'Mod-Shift-s',
            run: () => {
              onSaveAs?.();
              return true;
            },
            preventDefault: true,
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        gruvboxExtension,
        languageCompartment.of(getLanguageExtension(language)),
        vimOverridesCompartment.of(
          vimMode ? buildVimOverrideKeymap(vimOverrides, { onManualSave, onSaveAs, onImeWarning, onAddTab, onCloseTab }) : []
        ),
        vimCompartment.of(vimMode ? vim() : []),
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    view = new EditorView({
      state: startState,
      parent: editorHost,
    });

    // 視窗 resize 處理
    const handleResize = () => {
      smearRenderer?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });

  onDestroy(() => {
    smearRenderer?.destroy();
    view?.destroy();
    view = null;
  });

  // 監聽外部內容變化（分頁切換時更換 doc）
  $effect(() => {
    if (view && content !== view.state.doc.toString()) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      });
    }
  });

  // 監聽語言模式切換
  $effect(() => {
    if (view) {
      view.dispatch({
        effects: languageCompartment.reconfigure(getLanguageExtension(language)),
      });
    }
  });

  // 監聽 Vim 模式與 Override 衝突設定開關
  $effect(() => {
    if (view) {
      view.dispatch({
        effects: [
          vimCompartment.reconfigure(vimMode ? vim() : []),
          vimOverridesCompartment.reconfigure(
            vimMode ? buildVimOverrideKeymap(vimOverrides, { onManualSave, onSaveAs, onImeWarning, onAddTab, onCloseTab }) : []
          ),
        ],
      });
    }
  });
</script>

<div class="editor-container">
  <div class="editor-surface" bind:this={editorHost}></div>
  <canvas class="smear-canvas" bind:this={canvasHost}></canvas>
</div>

<style>
  .editor-container {
    position: relative;
    width: 100%;
    height: 100%;
    flex: 1;
    overflow: hidden;
    background: #1d2021;
  }

  .editor-surface {
    width: 100%;
    height: 100%;
  }

  :global(.cm-editor) {
    height: 100%;
    outline: none;
  }

  :global(.cm-scroller) {
    height: 100%;
  }

  .smear-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 99;
  }
</style>
