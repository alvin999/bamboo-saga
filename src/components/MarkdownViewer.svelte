<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  interface MarkdownViewerProps {
    content: string;
  }

  let { content = '' }: MarkdownViewerProps = $props();

  // 配置 marked 支援 GFM 與換行
  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  const parsedHtml = $derived.by(() => {
    if (!content) return '';
    try {
      const rawHtml = marked.parse(content) as string;
      return DOMPurify.sanitize(rawHtml, {
        ADD_ATTR: ['target', 'rel'],
      });
    } catch (e) {
      console.warn('[MarkdownViewer] Parse error:', e);
      return content;
    }
  });

  function handleContainerClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    // 支援代碼區塊複製功能
    if (target && target.classList.contains('code-copy-btn')) {
      const pre = target.closest('.code-block-wrapper')?.querySelector('pre');
      if (pre) {
        const text = pre.innerText || '';
        navigator.clipboard.writeText(text);
        target.innerText = '✔ 已複製';
        setTimeout(() => {
          target.innerText = '📋 複製';
        }, 2000);
      }
    }
  }
</script>

<div class="markdown-body">
  {@html parsedHtml}
</div>

<style>
  .markdown-body {
    font-size: 13px;
    line-height: 1.65;
    color: #ebdbb2;
    word-break: break-word;
    font-family: inherit;
  }

  /* 標題層級 */
  :global(.markdown-body h1),
  :global(.markdown-body h2),
  :global(.markdown-body h3),
  :global(.markdown-body h4) {
    color: #fbf1c7;
    font-weight: 600;
    margin-top: 14px;
    margin-bottom: 8px;
    line-height: 1.35;
  }

  :global(.markdown-body h1:first-child),
  :global(.markdown-body h2:first-child),
  :global(.markdown-body h3:first-child) {
    margin-top: 0;
  }

  :global(.markdown-body h1) {
    font-size: 17px;
    border-bottom: 1px solid #3c3836;
    padding-bottom: 6px;
  }

  :global(.markdown-body h2) {
    font-size: 15px;
    border-bottom: 1px dashed rgba(250, 189, 47, 0.25);
    padding-bottom: 4px;
    color: #fabd2f;
  }

  :global(.markdown-body h3) {
    font-size: 13.5px;
    color: #fe8019;
  }

  :global(.markdown-body h4) {
    font-size: 13px;
    color: #ebdbb2;
  }

  /* 段落與文字 */
  :global(.markdown-body p) {
    margin-top: 0;
    margin-bottom: 10px;
  }

  :global(.markdown-body strong) {
    color: #fbf1c7;
    font-weight: 600;
  }

  :global(.markdown-body em) {
    color: #d5c4a1;
    font-style: italic;
  }

  /* GFM 表格美學（針對抽屜寬度優化橫向滾動與斑馬紋） */
  :global(.markdown-body table) {
    display: block;
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 12px;
    border-radius: 6px;
    border: 1px solid #3c3836;
    background: #1d2021;
  }

  :global(.markdown-body thead) {
    background: #282828;
    border-bottom: 2px solid #504945;
  }

  :global(.markdown-body th) {
    padding: 7px 11px;
    text-align: left;
    font-weight: 600;
    color: #fabd2f;
    border-right: 1px solid #3c3836;
    white-space: nowrap;
    letter-spacing: 0.3px;
  }

  :global(.markdown-body th:last-child) {
    border-right: none;
  }

  :global(.markdown-body td) {
    padding: 7px 11px;
    border-top: 1px solid #2d3032;
    border-right: 1px solid #2d3032;
    color: #ebdbb2;
    line-height: 1.45;
  }

  :global(.markdown-body td:last-child) {
    border-right: none;
  }

  :global(.markdown-body tr:nth-child(even)) {
    background: #222426;
  }

  :global(.markdown-body tr:hover) {
    background: #2a2c2e;
  }

  /* 引用區塊 (Blockquote) */
  :global(.markdown-body blockquote) {
    margin: 10px 0;
    padding: 8px 12px;
    border-left: 3px solid #fabd2f;
    background: rgba(250, 189, 47, 0.05);
    color: #d5c4a1;
    border-radius: 0 4px 4px 0;
    font-size: 12.5px;
  }

  :global(.markdown-body blockquote p:last-child) {
    margin-bottom: 0;
  }

  /* 行內代碼 */
  :global(.markdown-body :not(pre) > code) {
    background: rgba(250, 189, 47, 0.12);
    color: #fabd2f;
    padding: 1px 5px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
    font-size: 11.5px;
    border: 1px solid rgba(250, 189, 47, 0.2);
  }

  /* 多行程式碼區塊 */
  :global(.markdown-body pre) {
    background: #181a1b;
    border: 1px solid #3c3836;
    border-radius: 6px;
    padding: 10px 12px;
    overflow-x: auto;
    margin: 10px 0;
    font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
    font-size: 12px;
    line-height: 1.45;
    color: #ebdbb2;
  }

  :global(.markdown-body pre code) {
    background: transparent;
    padding: 0;
    border: none;
    color: inherit;
    font-size: inherit;
  }

  /* 清單樣式 */
  :global(.markdown-body ul),
  :global(.markdown-body ol) {
    margin: 8px 0;
    padding-left: 20px;
  }

  :global(.markdown-body li) {
    margin-bottom: 4px;
  }

  /* 分割線 */
  :global(.markdown-body hr) {
    border: none;
    border-top: 1px solid #3c3836;
    margin: 14px 0;
  }

  /* 連結 */
  :global(.markdown-body a) {
    color: #83a598;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  :global(.markdown-body a:hover) {
    color: #b8bb26;
  }
</style>
