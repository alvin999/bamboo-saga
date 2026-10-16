<script lang="ts">
  import VaultTreeItem from './VaultTreeItem.svelte';
  import type { VaultTreeNode } from '../types/tab';

  let {
    node,
    depth = 0,
    selectedNodePath = '',
    focusedNodePath = '',
    activeFilePath = '',
    searchQuery = '',
    aiRecommendedPath = '',
    openedFilePaths = [],
    expandedPaths = new Set<string>(),
    onSelectNode,
    onOpenNode,
    onToggleFolder,
    onQuickSaveToNode,
  } = $props<{
    node: VaultTreeNode;
    depth?: number;
    selectedNodePath?: string;
    focusedNodePath?: string;
    activeFilePath?: string;
    searchQuery?: string;
    aiRecommendedPath?: string;
    openedFilePaths?: string[];
    expandedPaths?: Set<string>;
    onSelectNode: (node: VaultTreeNode) => void;
    onOpenNode: (node: VaultTreeNode) => void;
    onToggleFolder?: (node: VaultTreeNode) => void;
    onQuickSaveToNode?: (node: VaultTreeNode) => void;
  }>();

  const isAiTarget = $derived(
    aiRecommendedPath && (node.path === aiRecommendedPath || aiRecommendedPath.startsWith(node.path))
  );

  const isExactAiMatch = $derived(aiRecommendedPath && node.path === aiRecommendedPath);

  const isExpanded = $derived.by(() => {
    if (searchQuery.trim().length > 0) return true;
    if (expandedPaths.has(node.path)) return true;
    if (isAiTarget) return true;
    return depth === 0;
  });

  const isOpened = $derived(!node.isFolder && openedFilePaths.includes(node.path));
  const isSelected = $derived(selectedNodePath === node.path);
  const isVimFocused = $derived(focusedNodePath === node.path);

  function toggleExpand(e: MouseEvent) {
    e.stopPropagation();
    onToggleFolder?.(node);
  }

  function handleNodeClick() {
    onSelectNode(node);
  }

  function handleNodeDblClick() {
    if (!node.isFolder) {
      onOpenNode(node);
    }
  }

  // 高亮搜尋匹配文字
  function highlightText(text: string, query: string) {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${escapeRegExp(query.trim())})`, 'gi'));
    return parts;
  }

  function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
</script>

<div class="tree-item-wrapper">
  <!-- 節點本體列 -->
  <div
    id={"vault-tree-node-" + encodeURIComponent(node.path)}
    class="tree-node-row {isSelected ? 'selected' : ''} {isVimFocused ? 'vim-focused' : ''} {isExactAiMatch ? 'ai-recommended' : ''} {node.isFolder ? 'folder-row' : 'file-row'}"
    style="padding-left: {depth * 14 + 8}px;"
    onclick={handleNodeClick}
    ondblclick={handleNodeDblClick}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === 'Enter' && handleNodeClick()}
    title={node.path}
  >
    <!-- 折疊箭頭（資料夾專用） -->
    {#if node.isFolder}
      <button 
        type="button" 
        class="folder-toggle-btn {isExpanded ? 'expanded' : ''}" 
        onclick={toggleExpand}
        title={isExpanded ? '收合子閣' : '展開子閣'}
      >
        <span class="arrow-icon">▸</span>
      </button>
      <span class="folder-glyph">{isExpanded ? '📂' : '📁'}</span>
    {:else}
      <span class="file-indent-spacer"></span>
      <span class="file-glyph">{node.extension === 'md' ? '📝' : '📄'}</span>
    {/if}

    <!-- 節點名稱（支援搜尋關鍵字高亮） -->
    <span class="node-name">
      {#if searchQuery.trim()}
        {#each highlightText(node.name, searchQuery) as part}
          {#if part.toLowerCase() === searchQuery.trim().toLowerCase()}
            <mark class="search-highlight">{part}</mark>
          {:else}
            <span>{part}</span>
          {/if}
        {/each}
      {:else}
        {node.name}
      {/if}
    </span>

    <!-- 狀態徽章 -->
    <div class="badge-cluster">
      {#if isExactAiMatch}
        <span class="ai-badge" title="AI 智慧推薦此存儲落點">✨ 靈光推薦</span>
      {/if}

      {#if isOpened}
        <span class="opened-badge" title="已載入百子櫃分頁">已開</span>
      {/if}

      {#if node.isFolder && node.children}
        <span class="child-count">({node.children.length})</span>
      {/if}
    </div>

    <!-- 浮動快速操作按鈕 -->
    <div class="node-hover-actions">
      {#if node.isFolder && onQuickSaveToNode}
        <button
          type="button"
          class="quick-action-btn"
          title="將當前藥帖存入此資料夾"
          onclick={(e) => {
            e.stopPropagation();
            onQuickSaveToNode(node);
          }}
        >
          📥 存入
        </button>
      {:else if !node.isFolder}
        <button
          type="button"
          class="quick-action-btn"
          title="立即載入分頁"
          onclick={(e) => {
            e.stopPropagation();
            onOpenNode(node);
          }}
        >
          開卷
        </button>
      {/if}
    </div>
  </div>

  <!-- 子節點遞迴清單 -->
  {#if node.isFolder && isExpanded && node.children && node.children.length > 0}
    <div class="tree-children-container">
      {#each node.children as childNode (childNode.id)}
        <VaultTreeItem
          node={childNode}
          depth={depth + 1}
          {selectedNodePath}
          {focusedNodePath}
          {activeFilePath}
          {searchQuery}
          {aiRecommendedPath}
          {openedFilePaths}
          {expandedPaths}
          {onSelectNode}
          {onOpenNode}
          {onToggleFolder}
          {onQuickSaveToNode}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .tree-item-wrapper {
    display: flex;
    flex-direction: column;
    user-select: none;
  }

  .tree-node-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 4px;
    padding-bottom: 4px;
    padding-right: 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    color: #ebdbb2;
    transition: background-color 0.12s ease;
    position: relative;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tree-node-row:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .tree-node-row.selected {
    background: rgba(250, 189, 47, 0.15);
    color: #fabd2f;
    font-weight: 500;
  }

  .tree-node-row.vim-focused {
    outline: 1.5px solid #fabd2f;
    outline-offset: -1px;
    background: rgba(250, 189, 47, 0.22) !important;
    box-shadow: inset 3px 0 0 #fabd2f;
    color: #fbf1c7;
    font-weight: 600;
  }

  .tree-node-row.ai-recommended {
    background: rgba(184, 187, 38, 0.2);
    border: 1px dashed rgba(184, 187, 38, 0.6);
    box-shadow: 0 0 10px rgba(184, 187, 38, 0.2);
  }

  .folder-toggle-btn {
    background: none;
    border: none;
    color: #a89984;
    cursor: pointer;
    padding: 0 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    width: 14px;
    height: 14px;
    transition: transform 0.15s ease;
  }

  .folder-toggle-btn.expanded .arrow-icon {
    transform: rotate(90deg);
  }

  .arrow-icon {
    display: inline-block;
    transition: transform 0.15s ease;
  }

  .file-indent-spacer {
    width: 14px;
    display: inline-block;
  }

  .folder-glyph,
  .file-glyph {
    font-size: 13px;
    line-height: 1;
    flex-shrink: 0;
  }

  .node-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-highlight {
    background: #d79921;
    color: #1d2021;
    border-radius: 2px;
    padding: 0 2px;
    font-weight: bold;
  }

  .badge-cluster {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    flex-shrink: 0;
  }

  .ai-badge {
    font-size: 10px;
    background: #b8bb26;
    color: #1d2021;
    padding: 1px 5px;
    border-radius: 8px;
    font-weight: bold;
    animation: pulseGlow 1.8s infinite alternate;
  }

  @keyframes pulseGlow {
    from { box-shadow: 0 0 2px #b8bb26; }
    to { box-shadow: 0 0 8px #b8bb26; }
  }

  .opened-badge {
    font-size: 10px;
    background: rgba(131, 165, 152, 0.25);
    color: #83a598;
    padding: 1px 4px;
    border-radius: 4px;
  }

  .child-count {
    font-size: 11px;
    color: #928374;
  }

  .node-hover-actions {
    display: none;
    align-items: center;
    gap: 4px;
    margin-left: 6px;
    flex-shrink: 0;
  }

  .tree-node-row:hover .node-hover-actions {
    display: flex;
  }

  .quick-action-btn {
    background: #3c3836;
    border: 1px solid #504945;
    color: #ebdbb2;
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .quick-action-btn:hover {
    background: #fabd2f;
    color: #1d2021;
    border-color: #fabd2f;
  }

  .tree-children-container {
    display: flex;
    flex-direction: column;
  }
</style>
