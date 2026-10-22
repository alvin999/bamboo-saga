import { Extension } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { LanguageDescription } from '@codemirror/language';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { SupportedLanguage } from '../../types/tab';
import { smartHighlightPlugin } from './smartHighlighter';
import { taskCheckboxExtension } from './taskCheckbox';
import { markdownImageExtension } from './markdownImage';

const markdownLanguages: LanguageDescription[] = [
  LanguageDescription.of({
    name: 'javascript',
    alias: ['js', 'ts', 'typescript', 'jsx', 'tsx'],
    support: javascript({ typescript: true }),
  }),
  LanguageDescription.of({
    name: 'python',
    alias: ['py'],
    support: python(),
  }),
  LanguageDescription.of({
    name: 'json',
    support: json(),
  }),
  LanguageDescription.of({
    name: 'sql',
    support: sql(),
  }),
];

export function getLanguageExtension(lang: SupportedLanguage): Extension[] {
  // 智慧染色、任務清單互動與 Markdown 圖片即時渲染作為核心筆記體驗，無條件在全語言（特別是 plaintext 與 markdown）掛載生效
  const extensions: Extension[] = [smartHighlightPlugin, taskCheckboxExtension, markdownImageExtension];

  switch (lang) {
    case 'markdown':
      extensions.push(
        markdown({
          codeLanguages: markdownLanguages,
        })
      );
      break;
    case 'javascript':
      extensions.push(javascript());
      break;
    case 'json':
      extensions.push(json());
      break;
    case 'python':
      extensions.push(python());
      break;
    case 'sql':
      extensions.push(sql());
      break;
    case 'plaintext':
    default:
      break;
  }

  return extensions;
}
