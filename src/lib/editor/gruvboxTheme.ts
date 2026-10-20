import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Bauhaus Metaphysica（包浩斯形上學）沉陷禪風主題
export const gruvboxDarkTheme = EditorView.theme(
  {
    '&': {
      color: '#dcd7cb',
      backgroundColor: '#141615',
      fontSize: '14.5px',
      fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
      height: '100%',
    },
    '.cm-content': {
      caretColor: '#d49b35',
      // 文字上下左右間距大幅加寬，營造開闊舒適的禪風包浩斯書卷感
      padding: '28px 56px 48px 40px',
      fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
      lineHeight: '2.1',
      letterSpacing: '0.025em',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#d49b35',
      borderLeftWidth: '2px',
      boxShadow: '0 0 8px rgba(212, 155, 53, 0.7)',
    },
    // Vim Normal 模式下的方塊游標
    '&.cm-focused .cm-fat-cursor': {
      backgroundColor: '#d49b35 !important',
      color: '#141615 !important',
      outline: 'none !important',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(212, 155, 53, 0.22) !important',
    },
    '.cm-gutters': {
      backgroundColor: '#141615',
      color: '#7c6f64', // 優雅的沉穩灰，低調淡雅但邊緣輪廓清晰可辨
      border: 'none',
      borderRight: '1px solid rgba(80, 69, 52, 0.45)',
      // 行號右側間距由 14px 擴大為 22px，與文字拉開優雅距離
      paddingRight: '22px',
      paddingLeft: '14px',
      userSelect: 'none',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '12.5px',
      lineHeight: '2.1',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: '#fabd2f', // 作用行號亮起琥珀金
      fontWeight: '700',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(31, 32, 32, 0.45)',
    },
    '.cm-line': {
      padding: '0 8px',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(212, 155, 53, 0.15)',
      outline: '1px solid #d49b35',
      color: '#fabd2f !important',
    },
    '.cm-foldGutter': {
      color: '#736e63',
      width: '18px',
    },
    '.cm-foldGutter .cm-gutterElement': {
      cursor: 'pointer',
      padding: '0 2px',
      transition: 'color 0.15s ease',
    },
    '.cm-foldGutter .cm-gutterElement:hover': {
      color: '#fabd2f',
    },
    '.cm-scroller': {
      fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
      overflow: 'auto',
    },

    /* ========================================================
       任務清單互動方塊 (Markdown Interactive Task Checkbox)
    ======================================================== */
    '.gb-task-checkbox': {
      cursor: 'pointer !important',
      display: 'inline-block !important',
      fontWeight: '700 !important',
      fontFamily: "'JetBrains Mono', monospace !important",
      padding: '0 3px !important',
      margin: '0 2px !important',
      borderRadius: '4px !important',
      userSelect: 'none !important',
      transition: 'all 0.15s ease !important',
    },
    '.gb-task-open': {
      color: '#fabd2f !important', // 琥珀金
      backgroundColor: 'rgba(250, 189, 47, 0.12) !important',
      border: '1px solid rgba(250, 189, 47, 0.35) !important',
    },
    '.gb-task-open:hover': {
      backgroundColor: 'rgba(250, 189, 47, 0.25) !important',
      boxShadow: '0 0 6px rgba(250, 189, 47, 0.35) !important',
    },
    '.gb-task-done': {
      color: '#b8bb26 !important', // 竹墨翠綠
      backgroundColor: 'rgba(184, 187, 38, 0.15) !important',
      border: '1px solid rgba(184, 187, 38, 0.4) !important',
    },
    '.gb-task-done:hover': {
      backgroundColor: 'rgba(184, 187, 38, 0.28) !important',
      boxShadow: '0 0 6px rgba(184, 187, 38, 0.35) !important',
    },
    '.gb-task-done-line': {
      color: '#928374 !important', // 灰褐沉穩
      textDecoration: 'line-through !important',
      opacity: '0.65 !important',
    },

    /* ========================================================
       智慧染色 (Smart Highlight Token Styles)
       精準對齊 Stitch 設計稿中的標籤、引號、數據與超連結
    ======================================================== */
    '.gb-token-urgent': {
      backgroundColor: 'rgba(92, 36, 28, 0.55) !important',
      color: '#e6988d !important',
      border: '1px solid rgba(133, 57, 45, 0.6) !important',
      borderRadius: '3px !important',
      padding: '1px 5px !important',
      fontSize: '12px !important',
      fontWeight: '600 !important',
      letterSpacing: '0.04em !important',
    },
    '.gb-token-quote': {
      color: '#8fa382 !important', // 禪風淡綠
      backgroundColor: 'rgba(143, 163, 130, 0.08) !important',
      borderRadius: '2px !important',
      padding: '0 3px !important',
      fontWeight: '500 !important',
    },
    '.gb-token-bracket': {
      color: '#d49b35 !important', // 包浩斯琥珀金標籤
      fontWeight: '600 !important',
    },
    '.gb-token-metric': {
      color: '#b391a8 !important', // 紫羅蘭數據標記
      fontStyle: 'italic !important',
      fontWeight: '500 !important',
    },
    '.gb-token-link': {
      color: '#789d98 !important', // 青碧色超連結
      textDecoration: 'underline !important',
      textUnderlineOffset: '3px !important',
      cursor: 'pointer !important',
    },
    '.gb-token-code': {
      backgroundColor: 'rgba(212, 190, 152, 0.12) !important',
      color: '#fabd2f !important', // 琥珀金代碼
      borderRadius: '3px !important',
      padding: '0 4px !important',
      fontFamily: "'JetBrains Mono', monospace !important",
      fontSize: '0.9em !important',
    },
  },
  { dark: true }
);

export const gruvboxSyntaxHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.keyword, color: '#d49b35', fontWeight: 'bold' },
    { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: '#ece7dc' },
    { tag: [t.function(t.variableName), t.labelName], color: '#cacd39' },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#fabd2f' },
    { tag: [t.definition(t.name), t.separator], color: '#dcd7cb' },
    { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#e7ea54' },
    { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: '#d4c5ad' },
    { tag: t.meta, color: '#736e63', fontStyle: 'italic' },
    { tag: t.comment, color: '#736e63', fontStyle: 'italic' },
    { tag: t.strong, fontWeight: 'bold', color: '#ece7dc' },
    { tag: t.emphasis, fontStyle: 'italic', color: '#d4c5ad' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.link, color: '#789d98', textDecoration: 'underline' },
    { tag: t.heading, fontWeight: 'bold', color: '#d49b35' },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#c95847' },
    { tag: [t.processingInstruction, t.string, t.inserted], color: '#8fa382' },
    { tag: t.invalid, color: '#ffb4ab', backgroundColor: '#93000a' },
  ])
);

export const gruvboxExtension = [gruvboxDarkTheme, gruvboxSyntaxHighlighting];
