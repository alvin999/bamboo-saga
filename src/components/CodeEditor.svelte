<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, Compartment, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { foldGutter, foldKeymap } from '@codemirror/language';
  import { vim } from '@replit/codemirror-vim';
  import type { SupportedLanguage, CursorPosition, VimKeyOverrides } from '../types/tab';
  import { gruvboxExtension } from '../lib/editor/gruvboxTheme';
  import { getLanguageExtension } from '../lib/editor/languageSupport';
  import { SmearCursorRenderer } from '../lib/canvas/smearCursor';
  import { buildVimOverrideKeymap } from '../lib/editor/vimOverrides';
  import { createWikiLinkPlugin, createWikiLinkCompletionSource, type WikiLinkCandidate } from '../lib/editor/wikiLinks';
  import { autocompletion } from '@codemirror/autocomplete';
  import { diagnoseText } from '../lib/editor/textProcessor';
  import { search, setSearchQuery, SearchQuery } from '@codemirror/search';
  import EditorSearchBar from './EditorSearchBar.svelte';

  interface CodeEditorProps {
    content: string;
    language: SupportedLanguage;
    vimMode: boolean;
    vimOverrides?: VimKeyOverrides;
    cursor: CursorPosition;
    smearEnabled?: boolean;
    typewriterMode?: boolean;
    wikiLinkCandidates?: WikiLinkCandidate[];
    onChange: (val: string) => void;
    onCursorChange: (cur: CursorPosition) => void;
    onManualSave?: () => void;
    onSaveAs?: () => void;
    onImeWarning?: (msg: string) => void;
    onAddTab?: () => void;
    onCloseTab?: () => void;
    onSelectionChange?: (selectedText: string) => void;
    onOpenInlinePrompt?: (coords?: { x: number; y: number } | null) => void;
    onOpenWikiLink?: (target: string) => void;
    onRegisterApi?: (handle: { getParagraphScreenCoords: () => { x: number; y: number } | null; scrollToMakeRoom: () => void }) => void;
    onPasteSuggestion?: (msg: string) => void;
    onShowToast?: (msg: string) => void;
  }

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
    typewriterMode = false,
    wikiLinkCandidates = [] as WikiLinkCandidate[],
    onChange,
    onCursorChange,
    onManualSave,
    onSaveAs,
    onImeWarning,
    onAddTab,
    onCloseTab,
    onSelectionChange,
    onOpenInlinePrompt,
    onOpenWikiLink,
    onRegisterApi,
    onPasteSuggestion,
    onShowToast
  }: CodeEditorProps = $props();

  let editorHost: HTMLDivElement;
  let canvasHost: HTMLCanvasElement;
  let view: EditorView | null = null;
  let smearRenderer: SmearCursorRenderer | null = null;

  // Compartments 用於無縫動態熱切換語言與 Vim 模式，不重建模組實例
  const languageCompartment = new Compartment();
  const vimCompartment = new Compartment();
  const vimOverridesCompartment = new Compartment();

  // 專屬竹風搜尋高亮狀態與外掛 (解除官方 !panel 阻斷)
  const setSearchQueryEffect = StateEffect.define<SearchQuery | null>();

  const activeSearchQueryField = StateField.define<SearchQuery | null>({
    create() {
      return null;
    },
    update(value, tr) {
      for (const e of tr.effects) {
        if (e.is(setSearchQueryEffect)) {
          return e.value;
        }
      }
      return value;
    },
  });

  const matchMark = Decoration.mark({ class: 'cm-searchMatch' });
  const selectedMatchMark = Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' });

  const bambooSearchHighlighter = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.highlight(view);
      }
      update(update: ViewUpdate) {
        const q = update.state.field(activeSearchQueryField);
        const startQ = update.startState.field(activeSearchQueryField);
        if (
          q !== startQ ||
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged
        ) {
          this.decorations = this.highlight(update.view);
        }
      }
      highlight(view: EditorView): DecorationSet {
        const query = view.state.field(activeSearchQueryField);
        if (!query || !query.valid) {
          return Decoration.none;
        }
        const builder = new RangeSetBuilder<Decoration>();
        try {
          const compiled = query.create();
          for (const { from, to } of view.visibleRanges) {
            compiled.highlight(view.state, from, to, (mFrom: number, mTo: number) => {
              const selected = view.state.selection.ranges.some(
                (r) => r.from === mFrom && r.to === mTo
              );
              builder.add(mFrom, mTo, selected ? selectedMatchMark : matchMark);
            });
          }
        } catch (e) {
          return Decoration.none;
        }
        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );

  // 搜尋列狀態管理 (Ctrl+F 尋卷中樞)
  let isOpenSearch = $state(false);
  let searchQuery = $state('');
  let replaceQuery = $state('');
  let showReplace = $state(false);
  let caseSensitive = $state(false);
  let regexp = $state(false);
  let wholeWord = $state(false);
  let matches = $state<Array<{ from: number; to: number }>>([]);
  let currentIndex = $state(-1);

  export function openSearch(options?: { showReplace?: boolean }) {
    isOpenSearch = true;
    if (options?.showReplace !== undefined) {
      showReplace = options.showReplace;
    }
    if (view) {
      const sel = view.state.selection.main;
      if (!sel.empty && sel.to - sel.from < 120) {
        const text = view.state.sliceDoc(sel.from, sel.to);
        if (!text.includes('\n')) {
          searchQuery = text;
        }
      }
    }
    updateSearch(searchQuery);
  }

  export function closeSearch() {
    isOpenSearch = false;
    if (view) {
      view.dispatch({
        effects: [
          setSearchQueryEffect.of(null),
          setSearchQuery.of(new SearchQuery({ search: '' })),
        ],
      });
      view.focus();
    }
  }

  function updateSearch(query: string) {
    searchQuery = query;
    if (!view) return;
    try {
      const sq = new SearchQuery({
        search: query,
        caseSensitive,
        regexp,
        wholeWord,
      });
      view.dispatch({
        effects: [
          setSearchQueryEffect.of(query.trim() ? sq : null),
          setSearchQuery.of(sq),
        ],
      });

      const list: Array<{ from: number; to: number }> = [];
      if (query.trim()) {
        const cur = sq.getCursor(view.state.doc);
        let m;
        while (!(m = cur.next()).done) {
          list.push({ from: m.value.from, to: m.value.to });
          if (list.length >= 3000) break;
        }
      }
      matches = list;
      updateCurrentIndex();
    } catch (e) {
      matches = [];
      currentIndex = -1;
    }
  }

  function updateCurrentIndex() {
    if (!view || matches.length === 0) {
      currentIndex = -1;
      return;
    }
    const head = view.state.selection.main.head;
    let found = matches.findIndex((m) => m.from <= head && m.to >= head);
    if (found === -1) {
      found = matches.findIndex((m) => m.from >= head);
      if (found === -1) {
        found = matches.length - 1;
      }
    }
    currentIndex = Math.max(0, found);
  }

  function handleFindNext() {
    if (!view || matches.length === 0) {
      onShowToast?.('⚠️ 查無相符內容');
      return;
    }
    let nextIdx = currentIndex + 1;
    let didWrap = false;
    if (nextIdx >= matches.length) {
      nextIdx = 0;
      didWrap = true;
    }
    currentIndex = nextIdx;
    const target = matches[nextIdx];
    view.dispatch({
      selection: { anchor: target.from, head: target.to },
      effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
    });
    if (didWrap) {
      onShowToast?.('🔁 已重新從頭開始搜尋（折返至第 1 筆）');
    }
  }

  function handleFindPrevious() {
    if (!view || matches.length === 0) {
      onShowToast?.('⚠️ 查無相符內容');
      return;
    }
    let prevIdx = currentIndex - 1;
    let didWrap = false;
    if (prevIdx < 0) {
      prevIdx = matches.length - 1;
      didWrap = true;
    }
    currentIndex = prevIdx;
    const target = matches[prevIdx];
    view.dispatch({
      selection: { anchor: target.from, head: target.to },
      effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
    });
    if (didWrap) {
      onShowToast?.(`🔁 已折返至手稿末尾（第 ${matches.length} 筆）`);
    }
  }

  function handleReplaceNext() {
    if (!view || matches.length === 0) {
      onShowToast?.('⚠️ 查無相符內容可供取代');
      return;
    }
    let targetIdx = currentIndex;
    if (targetIdx < 0 || targetIdx >= matches.length) {
      targetIdx = 0;
    }
    const target = matches[targetIdx];
    const insertLen = replaceQuery.length;

    view.dispatch({
      changes: { from: target.from, to: target.to, insert: replaceQuery },
      selection: { anchor: target.from, head: target.from + insertLen },
    });

    updateSearch(searchQuery);

    if (matches.length === 0) {
      onShowToast?.('✨ 已完成最後一筆取代，手稿已無相符項目');
      return;
    }

    let nextIdx = targetIdx;
    let didWrap = false;
    if (nextIdx >= matches.length) {
      nextIdx = 0;
      didWrap = true;
    }
    currentIndex = nextIdx;
    const nextTarget = matches[nextIdx];
    view.dispatch({
      selection: { anchor: nextTarget.from, head: nextTarget.to },
      effects: EditorView.scrollIntoView(nextTarget.from, { y: 'center' }),
    });

    if (didWrap) {
      onShowToast?.('🔁 已取代並折返至第 1 筆');
    } else {
      onShowToast?.('✨ 已取代 1 筆內容');
    }
  }

  function handleReplaceAll() {
    if (!view || matches.length === 0) {
      onShowToast?.('⚠️ 查無相符內容可供取代');
      return;
    }
    const count = matches.length;
    const changes = matches.map((m) => ({
      from: m.from,
      to: m.to,
      insert: replaceQuery,
    }));
    view.dispatch({ changes });
    updateSearch(searchQuery);
    onShowToast?.(`✨ 已完成全部取代，共更換 ${count} 筆內容`);
  }

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
        if (isOpenSearch) {
          updateSearch(searchQuery);
        }
      }

      if (update.selectionSet || update.docChanged || update.geometryChanged) {
        const sel = update.state.selection.main;
        const head = sel.head;
        const line = update.state.doc.lineAt(head);
        const cur: CursorPosition = {
          line: line.number,
          ch: head - line.from,
        };
        onCursorChange(cur);

        if (onSelectionChange) {
          const selectedText = sel.empty ? '' : update.state.sliceDoc(sel.from, sel.to);
          onSelectionChange(selectedText);
        }

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

        // 打字機模式：保持當前游標所在行永遠平滑垂直置中 (y: 'center')
        if (typewriterMode && (update.selectionSet || update.docChanged) && view) {
          view.dispatch({
            effects: EditorView.scrollIntoView(head, { y: 'center' }),
          });
        }
      }
    });

    const startState = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        foldGutter(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        vimOverridesCompartment.of(
          vimMode ? buildVimOverrideKeymap(vimOverrides, { onManualSave, onSaveAs, onImeWarning, onAddTab, onCloseTab, onOpenInlinePrompt, onOpenSearch: () => openSearch(), onOpenReplace: () => openSearch({ showReplace: true }) }) : []
        ),
        vimCompartment.of(vimMode ? vim() : []),
        search(),
        activeSearchQueryField,
        bambooSearchHighlighter,
        keymap.of([
          {
            key: 'Mod-f',
            run: () => {
              openSearch();
              return true;
            },
            preventDefault: true,
          },
          {
            key: 'Mod-h',
            run: () => {
              openSearch({ showReplace: true });
              return true;
            },
            preventDefault: true,
          },
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
          {
            key: 'Mod-i',
            run: (v) => {
              let coords: { x: number; y: number } | null = null;
              try {
                const sel = v.state.selection.main;
                const currentLine = v.state.doc.lineAt(sel.head);
                let endLineNum = currentLine.number;
                const totalLines = v.state.doc.lines;
                while (endLineNum < totalLines) {
                  const nextLine = v.state.doc.line(endLineNum + 1);
                  if (nextLine.text.trim() === '') break;
                  endLineNum++;
                }
                const endLine = v.state.doc.line(endLineNum);
                const geo = v.coordsAtPos(endLine.to, -1) || 
                            v.coordsAtPos(endLine.from, 1) || 
                            v.coordsAtPos(sel.head, -1) ||
                            v.coordsAtPos(sel.head, 1);
                if (geo) {
                  const editorRect = v.dom?.getBoundingClientRect();
                  const dialogWidth = Math.min(680, window.innerWidth - 32);
                  const x = editorRect ? editorRect.left + (editorRect.width - dialogWidth) / 2 : geo.left;
                  coords = { x: Math.max(16, x), y: geo.bottom + 8 };
                }
              } catch (e) {}
              onOpenInlinePrompt?.(coords);
              return true;
            },
            preventDefault: true,
          },
          ...foldKeymap,
          ...defaultKeymap,
          ...historyKeymap.filter((b) => b.key !== 'Mod-u' && b.key !== 'Alt-u'),
          indentWithTab,
        ]),
        gruvboxExtension,
        languageCompartment.of(getLanguageExtension(language)),
        createWikiLinkPlugin((target) => onOpenWikiLink?.(target)),
        autocompletion({
          override: [createWikiLinkCompletionSource(() => wikiLinkCandidates)],
        }),
        updateListener,
        EditorView.domEventHandlers({
          paste(event) {
            try {
              const text = event.clipboardData?.getData('text/plain');
              if (text) {
                const lines = text.split('\n');
                if (lines.length >= 20) {
                  const diag = diagnoseText(text);
                  if (diag.hasDuplicates || diag.hasBlankLines || diag.hasUntrimmedWhitespace) {
                    onPasteSuggestion?.('偵測到貼上內容含有多餘空行/重複項，按 Ctrl+Shift+T 一鍵清理');
                  }
                }
              }
            } catch (err) {
              // 貼上監聽採被動守護，不阻斷正常貼上
            }
            return false;
          },
        }),
        EditorView.lineWrapping,
      ],
    });

    view = new EditorView({
      state: startState,
      parent: editorHost,
    });

    // 向父組件註冊命令式操作 Handle（完美適配 Svelte 5 Runes 模式）
    onRegisterApi?.({
      getParagraphScreenCoords,
      scrollToMakeRoom,
      openSearch,
      closeSearch,
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

  /**
   * 計算當前游標所在段落正下方的螢幕像素座標 (Screen Pixels)
   * 確保浮動框永遠出現在該段落文字的最下方，絕對不遮蔽當前編輯段落
   */
  export function getParagraphScreenCoords(): { x: number; y: number } | null {
    if (!view || !editorHost) return null;
    try {
      const sel = view.state.selection.main;
      const currentLine = view.state.doc.lineAt(sel.head);

      // 往下尋找該段落的末尾行（遇到空行即為段落結尾）
      let endLineNum = currentLine.number;
      const totalLines = view.state.doc.lines;
      while (endLineNum < totalLines) {
        const nextLine = view.state.doc.line(endLineNum + 1);
        if (nextLine.text.trim() === '') break;
        endLineNum++;
      }

      const endLine = view.state.doc.line(endLineNum);
      // 重要：傳入 side: -1 確保在行尾亦能精準取得幾何邊界，並有多層備援防護，保證絕不回傳 null
      const geo = view.coordsAtPos(endLine.to, -1) || 
                  view.coordsAtPos(endLine.from, 1) || 
                  view.coordsAtPos(sel.head, -1) ||
                  view.coordsAtPos(sel.head, 1);
      if (!geo) return null;

      // 取得編輯器宿主 DOM 在視窗的邊界，置中對齊於編輯器主工作台
      const editorRect = editorHost.getBoundingClientRect();
      const dialogWidth = Math.min(680, window.innerWidth - 32);
      const x = editorRect.left + (editorRect.width - dialogWidth) / 2;

      // 自動檢查下方空間：若段落底部過於貼近視窗底部（預留小於 220px 供浮動列放置），平滑向下捲動釋放視野
      const neededSpace = 220;
      if (geo.bottom + neededSpace > window.innerHeight) {
        const scrollDelta = (geo.bottom + neededSpace) - window.innerHeight + 16;
        view.scrollDOM?.scrollBy({ top: scrollDelta, behavior: 'smooth' });
      }

      return {
        x: Math.max(16, x),
        y: geo.bottom + 10, // 精確出現在段落最後一行下方 10px
      };
    } catch (e) {
      console.warn('[CodeEditor] getParagraphScreenCoords error:', e);
      return null;
    }
  }

  /**
   * 平滑向下捲動編輯器，確保段落下方有至少 220px 空間，防止浮動框貼到底部
   */
  export function scrollToMakeRoom(): void {
    if (!view) return;
    try {
      const sel = view.state.selection.main;
      const geo = view.coordsAtPos(sel.head, -1) || view.coordsAtPos(sel.head, 1);
      if (geo && geo.bottom + 220 > window.innerHeight) {
        const scrollDelta = (geo.bottom + 220) - window.innerHeight + 20;
        view.scrollDOM?.scrollBy({ top: scrollDelta, behavior: 'smooth' });
      }
    } catch (e) {}
  }

  // 監聽外部內容變化（分頁切換時更換 doc，正規化換行符避免 Windows CRLF 造成無限 dispatch 迴圈）
  $effect(() => {
    if (view && content.replace(/\r\n/g, '\n') !== view.state.doc.toString()) {
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
            vimMode ? buildVimOverrideKeymap(vimOverrides, { onManualSave, onSaveAs, onImeWarning, onAddTab, onCloseTab, onOpenInlinePrompt, onOpenSearch: () => openSearch(), onOpenReplace: () => openSearch({ showReplace: true }) }) : []
          ),
        ],
      });
    }
  });
</script>

<div class="editor-container" class:is-typewriter={typewriterMode}>
  <EditorSearchBar
    isOpen={isOpenSearch}
    {showReplace}
    {searchQuery}
    {replaceQuery}
    totalMatches={matches.length}
    {currentIndex}
    {caseSensitive}
    {regexp}
    {wholeWord}
    onQueryChange={(q) => updateSearch(q)}
    onReplaceQueryChange={(r) => (replaceQuery = r)}
    onToggleReplace={() => (showReplace = !showReplace)}
    onToggleCaseSensitive={() => { caseSensitive = !caseSensitive; updateSearch(searchQuery); }}
    onToggleRegexp={() => { regexp = !regexp; updateSearch(searchQuery); }}
    onToggleWholeWord={() => { wholeWord = !wholeWord; updateSearch(searchQuery); }}
    onFindNext={handleFindNext}
    onFindPrevious={handleFindPrevious}
    onReplaceNext={handleReplaceNext}
    onReplaceAll={handleReplaceAll}
    onClose={closeSearch}
  />
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

  /* 打字機捲動模式：保留下方 45vh 留白，確保文末打字依然能置中捲動 */
  .editor-container.is-typewriter :global(.cm-content) {
    padding-bottom: 45vh !important;
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

  /* 5.4 輕量 WikiLinks 雙向連結高亮與 Hover 特效 (Gruvbox 青碧靈泉水色) */
  :global(.cm-content .gb-wikilink) {
    color: #8ec07c !important;
    text-decoration: underline dashed rgba(142, 192, 124, 0.45);
    text-underline-offset: 3px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  :global(.cm-content .gb-wikilink:hover) {
    color: #b8bb26 !important;
    background: rgba(142, 192, 124, 0.12);
    text-decoration: underline solid #b8bb26;
    border-radius: 2px;
  }
</style>
