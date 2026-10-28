<script lang="ts">
  import VaultTreeItem from "./VaultTreeItem.svelte";
  import type { VaultTreeNode } from "../types/tab";

  interface VaultTreeItemProps {
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
  }

  let {
    node,
    depth = 0,
    selectedNodePath = "",
    focusedNodePath = "",
    activeFilePath = "",
    searchQuery = "",
    aiRecommendedPath = "",
    openedFilePaths = [],
    expandedPaths = new Set<string>(),
    onSelectNode,
    onOpenNode,
    onToggleFolder,
    onQuickSaveToNode,
  }: VaultTreeItemProps = $props();

  const isAiTarget = $derived(
    aiRecommendedPath &&
      (node.path === aiRecommendedPath ||
        aiRecommendedPath.startsWith(node.path)),
  );

  const isExactAiMatch = $derived(
    aiRecommendedPath && node.path === aiRecommendedPath,
  );

  const isExpanded = $derived.by(() => {
    if (searchQuery.trim().length > 0) return true;
    if (expandedPaths.has(node.path)) return true;
    if (isAiTarget) return true;
    return false;
  });

  const isOpened = $derived(
    !node.isFolder && openedFilePaths.includes(node.path),
  );
  const isActiveFile = $derived(!node.isFolder && activeFilePath === node.path);
  const isSelected = $derived(selectedNodePath === node.path);
  const isVimFocused = $derived(focusedNodePath === node.path);

  function toggleExpand(e: MouseEvent) {
    e.stopPropagation();
    onToggleFolder?.(node);
  }

  function handleNodeClick() {
    onSelectNode(node);
    if (node.isFolder) {
      onToggleFolder?.(node);
    }
  }

  function handleNodeDblClick() {
    if (!node.isFolder) {
      onOpenNode(node);
    } else {
      onToggleFolder?.(node);
    }
  }

  function highlightText(text: string, query: string) {
    if (!query.trim()) return text;
    const parts = text.split(
      new RegExp(`(${escapeRegExp(query.trim())})`, "gi"),
    );
    return parts;
  }

  function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
</script>

<div class="tree-item-wrapper">
  <!-- 節點本體列 -->
  <div
    id={"vault-tree-node-" + encodeURIComponent(node.path)}
    class="tree-node-row {isSelected ? 'selected' : ''} {isVimFocused
      ? 'vim-focused'
      : ''} {isExactAiMatch ? 'ai-recommended' : ''} {node.isFolder
      ? 'folder-row'
      : 'file-row'}"
    style="padding-left: {depth * 18 + 10}px;"
    onclick={handleNodeClick}
    ondblclick={handleNodeDblClick}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === "Enter" && handleNodeClick()}
    title={node.path}
  >
    <!-- 左側折疊指示與古典幾何符號 -->
    {#if node.isFolder}
      <button
        type="button"
        class="folder-toggle-btn {isExpanded ? 'expanded' : ''}"
        onclick={toggleExpand}
        title={isExpanded ? "收合子閣" : "展開子閣"}
      >
        <span class="arrow-icon">▸</span>
      </button>
      <span class="node-glyph folder-glyph {isExpanded ? 'open' : ''}">
        {isExpanded ? "◫" : "▢"}
      </span>
    {:else}
      <span class="file-indent-spacer"></span>
      <span class="node-glyph file-glyph {node.extension === 'md' ? 'md' : ''}">
        {node.extension === "md" ? "◈" : "◇"}
      </span>
    {/if}

    <!-- 節點名稱 -->
    <span class="node-name {isActiveFile ? 'is-active-file' : ''}">
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

    <!-- 右側狀態與快速動作區 -->
    <div class="right-meta-zone">
      <!-- 浮動快速操作按鈕 (Hover 時優雅取代常規計數) -->
      <div class="node-hover-actions">
        {#if !node.isFolder}
          <button
            type="button"
            class="quick-action-btn"
            title="立即開卷載入分頁 (Enter)"
            onclick={(e) => {
              e.stopPropagation();
              onOpenNode(node);
            }}
          >
            開卷
          </button>
        {:else if onQuickSaveToNode}
          <button
            type="button"
            class="quick-action-btn save-here"
            title="將當前分頁封存至此子閣 (按 s)"
            onclick={(e) => {
              e.stopPropagation();
              onQuickSaveToNode(node);
            }}
          >
            封存至此
          </button>
        {/if}
      </div>

      <!-- 常駐輕量徽章 -->
      <div class="badge-cluster">
        {#if isExactAiMatch}
          <span class="ai-badge" title="AI 智慧推薦此存儲落點">❖ 推薦</span>
        {/if}

        {#if isOpened}
          <span class="opened-badge" title="已載入百子櫃分頁">已開</span>
        {/if}

        {#if node.isFolder && node.children && node.children.length > 0}
          <span class="child-count">{node.children.length}</span>
        {/if}
      </div>
    </div>
  </div>

  <!-- 子節點遞迴清單（附帶淡雅垂直縮排導引線） -->
  {#if node.isFolder && isExpanded && node.children && node.children.length > 0}
    <div class="tree-children-container">
      <span class="indent-guide-line" style="left: {depth * 18 + 17}px;"></span>
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

  /* 寬鬆舒適的單行節點 */
  .tree-node-row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 33px;
    padding-right: 10px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13.5px;
    color: #d5c4a1;
    border: 1px solid transparent;
    transition: all 0.13s ease;
    position: relative;
    white-space: nowrap;
    overflow: hidden;
  }

  .tree-node-row.folder-row {
    color: #e6dfd5;
    font-weight: 500;
  }

  .tree-node-row:hover {
    background: rgba(255, 255, 255, 0.04);
    color: #ebdbb2;
  }

  /* 點選預覽狀態 */
  .tree-node-row.selected {
    background: rgba(250, 189, 47, 0.08);
    color: #fabd2f;
  }

  /* Vim 鍵盤游標焦點：去除刺眼外框，改用左側琥珀金光標線與溫潤底色 */
  .tree-node-row.vim-focused {
    background: rgba(250, 189, 47, 0.13);
    border-color: rgba(250, 189, 47, 0.28);
    box-shadow: inset 2.5px 0 0 #fabd2f;
    color: #fbf1c7;
    font-weight: 500;
  }

  /* AI 推薦落點 */
  .tree-node-row.ai-recommended {
    background: rgba(142, 192, 124, 0.1);
    border: 1px dashed rgba(142, 192, 124, 0.45);
  }

  /* 折疊小箭頭 */
  .folder-toggle-btn {
    background: none;
    border: none;
    color: #7c7365;
    cursor: pointer;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    transition: color 0.15s ease;
  }

  .tree-node-row:hover .folder-toggle-btn {
    color: #b8ac99;
  }

  .folder-toggle-btn.expanded .arrow-icon {
    transform: rotate(90deg);
    color: #fabd2f;
  }

  .arrow-icon {
    display: inline-block;
    transition: transform 0.16s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .file-indent-spacer {
    width: 14px;
    flex-shrink: 0;
  }

  /* 古典單色幾何符號 */
  .node-glyph {
    font-family: "JetBrains Mono", monospace;
    font-size: 13.5px;
    line-height: 1;
    flex-shrink: 0;
    transition: color 0.14s ease;
  }

  .folder-glyph {
    color: #d49b35;
  }

  .folder-glyph.open,
  .tree-node-row.selected .node-glyph,
  .tree-node-row.vim-focused .node-glyph {
    color: #fabd2f;
  }

  .file-glyph {
    color: #7c7365;
  }

  .file-glyph.md {
    color: #8ec07c;
    opacity: 0.85;
  }

  /* 節點文字 */
  .node-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }

  .node-name.is-active-file {
    color: #fabd2f;
    font-weight: 500;
  }

  .search-highlight {
    background: rgba(250, 189, 47, 0.28);
    color: #fbf1c7;
    border-radius: 3px;
    padding: 0 3px;
    font-weight: 600;
  }

  /* 右側徽章與懸停按鈕區 */
  .right-meta-zone {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    flex-shrink: 0;
  }

  .badge-cluster {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .ai-badge {
    font-size: 10.5px;
    background: rgba(142, 192, 124, 0.16);
    color: #8ec07c;
    border: 1px solid rgba(142, 192, 124, 0.35);
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 500;
  }

  .opened-badge {
    font-size: 10.5px;
    background: rgba(142, 192, 124, 0.12);
    color: #8ec07c;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .child-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: #665c54;
    padding: 0 2px;
  }

  /* 懸停時顯示操作鈕，並固定高度不撐開列高 */
  .node-hover-actions {
    display: none;
    align-items: center;
  }

  .tree-node-row:hover .node-hover-actions {
    display: inline-flex;
  }

  /* 當滑鼠懸停顯示「封存至此」時，暫時隱藏子項目數量避免擁擠 */
  .tree-node-row.folder-row:hover .child-count {
    display: none;
  }

  .quick-action-btn {
    background: rgba(250, 189, 47, 0.12);
    border: 1px solid rgba(250, 189, 47, 0.3);
    color: #fabd2f;
    font-size: 11px;
    height: 22px;
    padding: 0 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .quick-action-btn:hover {
    background: #fabd2f;
    color: #1d2021;
    border-color: #fabd2f;
  }

  .quick-action-btn.save-here {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(100, 86, 66, 0.35);
    color: #b8ac99;
  }

  .quick-action-btn.save-here:hover {
    background: rgba(142, 192, 124, 0.2);
    border-color: rgba(142, 192, 124, 0.5);
    color: #8ec07c;
  }

  /* 遞迴子容器與垂直縮排導引線 */
  .tree-children-container {
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .indent-guide-line {
    position: absolute;
    top: 2px;
    bottom: 6px;
    width: 1px;
    background: rgba(100, 86, 66, 0.22);
    pointer-events: none;
    transition: background 0.15s ease;
  }

  .tree-item-wrapper:hover > .tree-children-container > .indent-guide-line {
    background: rgba(250, 189, 47, 0.28);
  }
</style>
