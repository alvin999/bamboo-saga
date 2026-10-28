<script lang="ts">
  import { onMount } from "svelte";
  import type {
    TabItem,
    VaultFileEntry,
    RecentFileRecord,
    RecentFolderRecord,
    VaultCave,
    VaultTreeNode,
    AiProvider,
  } from "../types/tab";
  import Fuse from "fuse.js";
  import VaultTreeItem from "./VaultTreeItem.svelte";
  import {
    loadVaultCaves,
    addVaultCave,
    removeVaultCave,
    togglePinCave,
    renameCave,
    buildCaveTree,
    filterTreeNode,
    normalizePath,
    joinPaths,
    extractDirectorySkeleton,
  } from "../lib/storage/vaultCaves";
  import { readVaultFile, trashVaultFile } from "../lib/storage/fsBridge";

  interface FileBrowserDrawerProps {
    isOpen: boolean;
    tabs: TabItem[];
    activeTabId: string;
    vaultFolderPath: string;
    vaultFiles: VaultFileEntry[];
    cavesFileCache?: Record<string, VaultFileEntry[]>;
    isScanningCaves?: boolean;
    recentFiles: RecentFileRecord[];
    recentFolders?: RecentFolderRecord[];
    isScanning: boolean;
    groqApiKey?: string;
    geminiApiKey?: string;
    customApiKey?: string;
    customEndpoint?: string;
    selectedAiModel?: AiProvider;
    selectedAiModelId?: string;
    onSelectTab: (id: string) => void;
    onAddTab: () => void;
    onCloseTab: (id: string) => void;
    onCloseDrawer: () => void;
    onPickFolder: () => void;
    onSwitchFolder?: (folderPath: string) => void;
    onTogglePinFolder?: (folderPath: string) => void;
    onRemoveRecentFolder?: (folderPath: string) => void;
    onRefreshFolder: () => void;
    onRefreshAllCaves?: (force?: boolean) => void;
    onOpenVaultFile: (file: VaultFileEntry) => void;
    onOpenFuzzyModal: (initialMode?: "fuzzy" | "ai") => void;
    onClearRecent: () => void;
    onConfirmSave?: (targetDir: string, fileName: string) => Promise<void>;
  }

  let {
    isOpen = false,
    tabs = [],
    activeTabId = "",
    vaultFolderPath = "",
    vaultFiles = [],
    cavesFileCache = {},
    isScanningCaves = false,
    recentFiles = [],
    recentFolders = [],
    isScanning = false,
    groqApiKey = "",
    geminiApiKey = "",
    customApiKey = "",
    customEndpoint = "",
    selectedAiModel = "gemini",
    selectedAiModelId = "",
    onSelectTab,
    onAddTab,
    onCloseTab,
    onCloseDrawer,
    onPickFolder,
    onSwitchFolder,
    onTogglePinFolder,
    onRemoveRecentFolder,
    onRefreshFolder,
    onRefreshAllCaves,
    onOpenVaultFile,
    onOpenFuzzyModal,
    onClearRecent,
    onConfirmSave,
  }: FileBrowserDrawerProps = $props();

  // 1. 畫面形態模式：'modal' (巨幕中控台) 或 'drawer' (側欄模式)
  let displayMode = $state<"modal" | "drawer">("modal");
  let drawerWidth = $state(620);
  let isDraggingResize = $state(false);

  // 2. 視圖分頁切換
  let activeTabMode = $state<"tree" | "flat" | "tabs">("tree");
  let searchQuery = $state("");

  // 3. 藏卷洞天管理狀態
  let caves = $state<VaultCave[]>([]);
  let selectedCavePath = $state<string>(""); // 空字串代表「全部洞天合併」

  // 4. 樹狀選取節點與右欄預覽
  let selectedNode = $state<VaultTreeNode | null>(null);
  let previewFileContent = $state<string>("");
  let isLoadingPreview = $state(false);

  // 5. 鍵盤導航與心法說明狀態
  let isHelpModalOpen = $state(false);
  let expandedPaths = $state<Set<string>>(new Set());
  let initializedRootPaths = new Set<string>();
  let focusedNodePath = $state<string>("");
  let yankToast = $state<string | null>(null);
  let yankToastTimer: number | null = null;
  let searchInputRef = $state<HTMLInputElement | null>(null);
  let lastKeyGTime = 0;

  // 6. 當前分頁與工作區名稱
  let currentActiveTab = $derived(
    tabs.find((t) => t.id === activeTabId) || null,
  );

  const currentVaultName = $derived(
    caves.find((c) => c.path === vaultFolderPath)?.name ||
      vaultFolderPath
        .split(/[/|\\]/)
        .filter(Boolean)
        .pop() ||
      "當前目錄",
  );

  const totalCavesCount = $derived(
    caves.length +
      (vaultFolderPath && !caves.some((c) => c.path === vaultFolderPath)
        ? 1
        : 0),
  );

  $effect(() => {
    caves = loadVaultCaves();
  });

  $effect(() => {
    if (isOpen) {
      onRefreshAllCaves?.(false);
    }
  });

  // 構建藏卷洞天樹狀結構
  const fullTreeNodes = $derived.by(() => {
    const unrecordedCave: VaultCave | null =
      vaultFolderPath && !caves.some((c) => c.path === vaultFolderPath)
        ? {
            id: "temp-current-workspace",
            name: `${
              vaultFolderPath
                .split(/[/|\\]/)
                .filter(Boolean)
                .pop() || "當前目錄"
            } (臨時)`,
            path: vaultFolderPath,
            lastOpened: Date.now(),
          }
        : null;

    if (caves.length === 0) {
      if (unrecordedCave) {
        const filesForUnrecorded =
          cavesFileCache[unrecordedCave.path] || vaultFiles;
        return [buildCaveTree(filesForUnrecorded, unrecordedCave)];
      }
      return [];
    }

    if (selectedCavePath) {
      if (unrecordedCave && selectedCavePath === unrecordedCave.path) {
        const filesForUnrecorded =
          cavesFileCache[unrecordedCave.path] || vaultFiles;
        return [buildCaveTree(filesForUnrecorded, unrecordedCave)];
      }
      const targetCaves = caves.filter((c) => c.path === selectedCavePath);
      return targetCaves.map((cave) => {
        const filesForCave =
          cavesFileCache[cave.path] ||
          (cave.path === vaultFolderPath ? vaultFiles : []);
        return buildCaveTree(filesForCave, cave);
      });
    }

    const nodes = caves.map((cave) => {
      const filesForCave =
        cavesFileCache[cave.path] ||
        (cave.path === vaultFolderPath ? vaultFiles : []);
      return buildCaveTree(filesForCave, cave);
    });

    if (unrecordedCave) {
      const filesForUnrecorded =
        cavesFileCache[unrecordedCave.path] || vaultFiles;
      nodes.unshift(buildCaveTree(filesForUnrecorded, unrecordedCave));
    }

    return nodes;
  });

  // 樹狀即時搜尋過濾
  const filteredTreeNodes = $derived.by(() => {
    if (!searchQuery.trim()) return fullTreeNodes;
    const results: VaultTreeNode[] = [];
    for (const root of fullTreeNodes) {
      const res = filterTreeNode(root, searchQuery);
      if (res.node) {
        results.push(res.node);
      }
    }
    return results;
  });

  // 自動展開各洞天根目錄
  $effect(() => {
    if (fullTreeNodes.length > 0) {
      let hasNewRoots = false;
      const nextSet = new Set(expandedPaths);
      for (const root of fullTreeNodes) {
        if (!initializedRootPaths.has(root.path)) {
          initializedRootPaths.add(root.path);
          if (!nextSet.has(root.path)) {
            nextSet.add(root.path);
            hasNewRoots = true;
          }
        }
      }
      if (hasNewRoots) {
        expandedPaths = nextSet;
      }
    }
  });

  // 計算平面的當前可見節點清單
  const visibleNodes = $derived.by(() => {
    const list: VaultTreeNode[] = [];
    function walk(node: VaultTreeNode) {
      list.push(node);
      const isFolderOpen =
        expandedPaths.has(node.path) || searchQuery.trim().length > 0;
      if (node.isFolder && isFolderOpen && node.children) {
        for (const child of node.children) {
          walk(child);
        }
      }
    }
    for (const root of filteredTreeNodes) {
      walk(root);
    }
    return list;
  });

  $effect(() => {
    if (visibleNodes.length > 0 && !focusedNodePath) {
      focusedNodePath = visibleNodes[0].path;
      handleSelectNode(visibleNodes[0]);
    }
  });

  function handleToggleFolder(node: VaultTreeNode) {
    const nextSet = new Set(expandedPaths);
    if (nextSet.has(node.path)) {
      nextSet.delete(node.path);
    } else {
      nextSet.add(node.path);
    }
    expandedPaths = nextSet;
  }

  function scrollToNode(path: string) {
    if (typeof document === "undefined") return;
    const el = document.getElementById(
      "vault-tree-node-" + encodeURIComponent(path),
    );
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function findParentNode(
    target: VaultTreeNode,
    roots: VaultTreeNode[],
  ): VaultTreeNode | null {
    for (const root of roots) {
      if (root.children && root.children.some((c) => c.path === target.path)) {
        return root;
      }
      if (root.children) {
        const found = findParentNode(target, root.children);
        if (found) return found;
      }
    }
    return null;
  }

  function showYankToast(msg: string) {
    yankToast = msg;
    if (yankToastTimer) clearTimeout(yankToastTimer);
    yankToastTimer = window.setTimeout(() => {
      yankToast = null;
    }, 2200);
  }

  function handleVimKeydown(e: KeyboardEvent) {
    if (!isOpen) return;

    const activeElem = document.activeElement;
    const isInputFocused =
      activeElem &&
      (activeElem.tagName === "INPUT" || activeElem.tagName === "TEXTAREA");

    if (isInputFocused) {
      if (e.key === "Escape") {
        searchInputRef?.blur();
        e.preventDefault();
      }
      return;
    }

    if (isHelpModalOpen) {
      if (e.key === "Escape" || e.key === "?") {
        isHelpModalOpen = false;
        e.preventDefault();
      }
      return;
    }

    if (activeTabMode !== "tree" || visibleNodes.length === 0) {
      if (e.key === "?") {
        e.preventDefault();
        isHelpModalOpen = !isHelpModalOpen;
      }
      return;
    }

    let currentIndex = visibleNodes.findIndex(
      (n) => n.path === focusedNodePath,
    );
    if (currentIndex === -1) currentIndex = 0;
    const currentNode = visibleNodes[currentIndex];

    switch (e.key) {
      case "j":
      case "ArrowDown": {
        e.preventDefault();
        const nextIdx = Math.min(currentIndex + 1, visibleNodes.length - 1);
        const targetNode = visibleNodes[nextIdx];
        focusedNodePath = targetNode.path;
        handleSelectNode(targetNode);
        scrollToNode(targetNode.path);
        break;
      }
      case "k":
      case "ArrowUp": {
        e.preventDefault();
        const prevIdx = Math.max(currentIndex - 1, 0);
        const targetNode = visibleNodes[prevIdx];
        focusedNodePath = targetNode.path;
        handleSelectNode(targetNode);
        scrollToNode(targetNode.path);
        break;
      }
      case "l":
      case "ArrowRight": {
        e.preventDefault();
        if (currentNode.isFolder) {
          if (!expandedPaths.has(currentNode.path)) {
            const nextSet = new Set(expandedPaths);
            nextSet.add(currentNode.path);
            expandedPaths = nextSet;
          } else if (currentNode.children && currentNode.children.length > 0) {
            const nextIdx = Math.min(currentIndex + 1, visibleNodes.length - 1);
            const targetNode = visibleNodes[nextIdx];
            focusedNodePath = targetNode.path;
            handleSelectNode(targetNode);
            scrollToNode(targetNode.path);
          }
        } else {
          handleOpenNode(currentNode);
        }
        break;
      }
      case "h":
      case "ArrowLeft": {
        e.preventDefault();
        if (currentNode.isFolder && expandedPaths.has(currentNode.path)) {
          const nextSet = new Set(expandedPaths);
          nextSet.delete(currentNode.path);
          expandedPaths = nextSet;
        } else {
          const parentNode = findParentNode(currentNode, fullTreeNodes);
          if (parentNode) {
            focusedNodePath = parentNode.path;
            handleSelectNode(parentNode);
            scrollToNode(parentNode.path);
          }
        }
        break;
      }
      case "g": {
        const now = Date.now();
        if (now - lastKeyGTime < 450) {
          e.preventDefault();
          if (visibleNodes.length > 0) {
            const targetNode = visibleNodes[0];
            focusedNodePath = targetNode.path;
            handleSelectNode(targetNode);
            scrollToNode(targetNode.path);
          }
          lastKeyGTime = 0;
        } else {
          lastKeyGTime = now;
        }
        break;
      }
      case "G": {
        e.preventDefault();
        if (visibleNodes.length > 0) {
          const targetNode = visibleNodes[visibleNodes.length - 1];
          focusedNodePath = targetNode.path;
          handleSelectNode(targetNode);
          scrollToNode(targetNode.path);
        }
        break;
      }
      case "/": {
        e.preventDefault();
        searchInputRef?.focus();
        break;
      }
      case "o":
      case "Enter": {
        e.preventDefault();
        if (currentNode.isFolder) {
          handleToggleFolder(currentNode);
        } else {
          handleOpenNode(currentNode);
        }
        break;
      }
      case "y": {
        e.preventDefault();
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(currentNode.path);
          showYankToast(`已拓印路徑：${currentNode.name}`);
        }
        break;
      }
      case "s":
      case "i": {
        if (currentNode.isFolder && currentActiveTab && onConfirmSave) {
          e.preventDefault();
          handleQuickSaveToNode(currentNode);
        }
        break;
      }
      case "?": {
        e.preventDefault();
        isHelpModalOpen = !isHelpModalOpen;
        break;
      }
    }
  }

  const currentCaveFiles = $derived.by(() => {
    if (selectedCavePath) {
      return (
        cavesFileCache[selectedCavePath] ||
        (selectedCavePath === vaultFolderPath ? vaultFiles : [])
      );
    }
    const fileMap = new Map<string, VaultFileEntry>();
    for (const fileList of Object.values(cavesFileCache)) {
      for (const f of fileList) {
        if (!fileMap.has(f.path)) {
          fileMap.set(f.path, f);
        }
      }
    }
    if (fileMap.size === 0) {
      return vaultFiles;
    }
    return Array.from(fileMap.values()).sort(
      (a, b) => (b.modified || 0) - (a.modified || 0),
    );
  });

  const fileFuse = $derived(
    new Fuse(currentCaveFiles, {
      keys: [
        { name: "name", weight: 0.6 },
        { name: "rel_path", weight: 0.25 },
        { name: "preview", weight: 0.15 },
      ],
      threshold: 0.45,
    }),
  );

  const filteredVaultFiles = $derived.by(() => {
    if (!searchQuery.trim()) return currentCaveFiles;
    return fileFuse.search(searchQuery).map((r) => r.item);
  });

  const tabFuse = $derived(
    new Fuse(tabs, {
      keys: [
        { name: "title", weight: 0.7 },
        { name: "content", weight: 0.3 },
      ],
      threshold: 0.45,
    }),
  );

  const filteredTabs = $derived.by(() => {
    if (!searchQuery.trim()) return tabs;
    return tabFuse.search(searchQuery).map((r) => r.item);
  });

  async function handleSelectNode(node: VaultTreeNode) {
    selectedNode = node;
    focusedNodePath = node.path;
    if (!node.isFolder) {
      isLoadingPreview = true;
      try {
        const content = await readVaultFile(node.path);
        previewFileContent = content;
      } catch (err) {
        previewFileContent = node.preview || "(預覽載入失敗)";
      } finally {
        isLoadingPreview = false;
      }
    } else {
      previewFileContent = "";
    }
  }

  function handleDrillDownFolder(folderNode: VaultTreeNode) {
    const nextSet = new Set(expandedPaths);
    nextSet.add(folderNode.path);
    expandedPaths = nextSet;
    handleSelectNode(folderNode);
    scrollToNode(folderNode.path);
  }

  function handleOpenNode(node: VaultTreeNode) {
    if (!node.isFolder) {
      const vf: VaultFileEntry = {
        path: node.path,
        name: node.name,
        rel_path: node.rel_path,
        size: node.size || 0,
        modified: node.modified || Date.now(),
        preview: node.preview || "",
        extension: node.extension || "md",
      };
      onOpenVaultFile(vf);
    }
  }

  async function handleQuickSaveToNode(node: VaultTreeNode) {
    if (!node.isFolder || !currentActiveTab || !onConfirmSave) return;
    const fileName =
      currentActiveTab.title && !currentActiveTab.title.startsWith("散帖 #")
        ? currentActiveTab.title
        : "新卷軸.md";

    try {
      await onConfirmSave(node.path, fileName);
      onRefreshFolder();
    } catch (err: any) {
      alert(`存檔失敗：${err?.message || err}`);
    }
  }

  async function handleAddNewCave() {
    onPickFolder();
  }

  function handleRemoveCave(cavePath: string) {
    if (confirm("確定要從藏卷洞天中除役此目錄嗎？（實體檔案不會被刪除）")) {
      caves = removeVaultCave(cavePath);
      onRemoveRecentFolder?.(cavePath);
      if (selectedCavePath === cavePath) selectedCavePath = "";
      onRefreshAllCaves?.(true);
    }
  }

  function handleTogglePin(cavePath: string) {
    caves = togglePinCave(cavePath);
    onTogglePinFolder?.(cavePath);
  }

  function handleExportAll() {
    const backupData = JSON.stringify(tabs, null, 2);
    const blob = new Blob([backupData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bamboo-saga-vault-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function showDrawerToast(msg: string) {
    yankToast = msg;
    if (yankToastTimer) clearTimeout(yankToastTimer);
    yankToastTimer = window.setTimeout(() => {
      yankToast = null;
    }, 2500);
  }

  async function handleTrashNode(node: VaultTreeNode) {
    if (node.isFolder) {
      alert("目前僅支援將單一藥帖檔案移至回收桶");
      return;
    }
    const confirmMsg = `確定要將《${node.name}》移至系統資源回收桶嗎？\n（檔案可隨時從資源回收桶還原）`;
    if (!confirm(confirmMsg)) return;

    try {
      await trashVaultFile(node.path);
      selectedNode = null;
      previewFileContent = "";
      onRefreshFolder();
      onRefreshAllCaves?.(true);
      showDrawerToast(`已將《${node.name}》移至資源回收桶`);
    } catch (err: any) {
      alert(`移至回收桶失敗：${err?.message || err}`);
    }
  }

  function formatTime(timestamp: number) {
    if (!timestamp) return "";
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return "剛剛";
    if (diff < 3600) return `${Math.floor(diff / 60)} 分前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 時前`;
    return new Date(timestamp).toLocaleDateString();
  }

  function startResize(e: MouseEvent) {
    if (displayMode !== "drawer") return;
    isDraggingResize = true;
    const startX = e.clientX;
    const startWidth = drawerWidth;

    function onMouseMove(moveEvent: MouseEvent) {
      const delta = moveEvent.clientX - startX;
      drawerWidth = Math.min(Math.max(startWidth + delta, 440), 860);
    }

    function onMouseUp() {
      isDraggingResize = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }
</script>

<svelte:window onkeydown={handleVimKeydown} />

{#if isOpen}
  <!-- 背景遮罩 -->
  <div class="vault-backdrop" onclick={onCloseDrawer} role="presentation"></div>

  <!-- 主體容器 -->
  <div
    class="vault-master-container {displayMode === 'modal'
      ? 'modal-view'
      : 'drawer-view'}"
    style={displayMode === "drawer" ? `width: ${drawerWidth}px;` : ""}
    aria-label="藏卷洞天"
  >
    <!-- 頂部標頭：精簡洗鍊、將預設落點移至頂部一目了然 -->
    <header class="vault-header">
      <div class="header-left">
        <span class="brand-glyph">◫</span>
        <span class="main-title">藏卷洞天</span>
        <span class="header-divider"></span>
        <span class="target-capsule" title="新筆記預設存入此目錄">
          <span class="target-dot"></span>
          <span class="target-label">預設落點：</span>
          <strong class="target-vault">{currentVaultName}</strong>
        </span>
      </div>

      <div class="header-controls">
        <div class="control-dock">
          <button
            type="button"
            class="dock-btn"
            onclick={() =>
              (displayMode = displayMode === "modal" ? "drawer" : "modal")}
            title={displayMode === "modal"
              ? "切換為側欄視野"
              : "展開為巨幕中控台"}
          >
            <span class="glyph-mono">{displayMode === "modal" ? "◧" : "⛶"}</span
            >
            <span>{displayMode === "modal" ? "側欄" : "巨幕"}</span>
          </button>

          <button
            type="button"
            class="dock-btn"
            onclick={handleExportAll}
            title="備份導出全卷軸 JSON"
          >
            <span class="glyph-mono">⊼</span>
            <span>全卷備份</span>
          </button>
        </div>

        <button
          type="button"
          class="primary-action-btn"
          onclick={onAddTab}
          title="新增空白素簡 (Ctrl+T)"
        >
          <span>+ 添新素簡</span>
        </button>

        <button
          type="button"
          class="close-btn"
          onclick={onCloseDrawer}
          title="關閉 (Esc)"
        >
          ✕
        </button>
      </div>
    </header>

    <!-- 核心三欄內容主體 -->
    <div class="vault-body-layout">
      <!-- 欄 1：藏卷洞天清單 (精簡寬鬆側欄) -->
      <aside class="vault-caves-sidebar">
        <!-- 全域聚合入口：濃縮為乾淨的焦點卡片 -->
        <div class="scope-section">
          <button
            type="button"
            class="scope-hero-card {!selectedCavePath ? 'active' : ''}"
            onclick={() => (selectedCavePath = "")}
            title={`同時聚合瀏覽所有洞天。新檔預設存入：${currentVaultName}`}
          >
            <div class="scope-top">
              <div class="scope-title-wrap">
                <span class="scope-glyph">◎</span>
                <span class="scope-name">諸洞天全覽</span>
              </div>
              {#if isScanningCaves}
                <span class="scope-badge scanning">彙整中</span>
              {:else}
                <span class="scope-count">{currentCaveFiles.length} 卷</span>
              {/if}
            </div>
            <span class="scope-desc">聚合 {totalCavesCount} 處開放目錄</span>
          </button>
        </div>

        <!-- 實體洞天庫標頭 -->
        <div class="sidebar-sec-header">
          <span class="sec-title">實體洞天 ({caves.length})</span>
          <div class="cave-header-actions">
            {#if onRefreshAllCaves && !isScanningCaves}
              <button
                type="button"
                class="icon-ghost-btn"
                onclick={() => onRefreshAllCaves?.(true)}
                title="重新掃描所有洞天"
              >
                ↻
              </button>
            {/if}
            <button
              type="button"
              class="text-add-btn"
              onclick={handleAddNewCave}
              title="授權開放電腦實體資料夾為新洞天"
            >
              + 開放目錄
            </button>
          </div>
        </div>

        <!-- 洞天列表：隱藏冗長路徑，放大主標題與呼吸空間 -->
        <div class="caves-list">
          {#if vaultFolderPath && !caves.some((c) => c.path === vaultFolderPath)}
            {@const currentName =
              vaultFolderPath
                .split(/[/|\\]/)
                .filter(Boolean)
                .pop() || "當前目錄"}
            <div
              class="temp-workspace-card {selectedCavePath === vaultFolderPath
                ? 'selected'
                : ''}"
            >
              <div class="temp-workspace-top">
                <span class="temp-pill-tag">臨時工作區</span>
                <button
                  type="button"
                  class="btn-adopt-cave"
                  onclick={() => {
                    caves = addVaultCave(vaultFolderPath);
                    selectedCavePath = vaultFolderPath;
                    onRefreshAllCaves?.(true);
                  }}
                >
                  + 收錄
                </button>
              </div>
              <button
                type="button"
                class="temp-folder-link"
                onclick={() => (selectedCavePath = vaultFolderPath)}
                title={vaultFolderPath}
              >
                <span class="cave-glyph">◇</span>
                <span class="cave-name">{currentName}</span>
              </button>
            </div>
          {/if}

          {#each caves as cave (cave.path)}
            {@const isCurrentLinked = cave.path === vaultFolderPath}
            <div
              class="cave-row {selectedCavePath === cave.path
                ? 'selected'
                : ''}"
              title={`${cave.name}\n路徑：${cave.path}${isCurrentLinked ? "\n(當前預設存入工作區)" : ""}`}
            >
              <button
                type="button"
                class="cave-item-btn"
                onclick={() => {
                  selectedCavePath = cave.path;
                  if (cave.path !== vaultFolderPath) {
                    onSwitchFolder?.(cave.path);
                  }
                }}
              >
                <span class="cave-glyph {cave.isPinned ? 'pinned' : ''}">
                  {cave.isPinned ? "❖" : "◈"}
                </span>
                <span class="cave-name">{cave.name}</span>
                {#if isCurrentLinked}
                  <span class="linked-dot" title="當前工作區"></span>
                {/if}
              </button>

              <div class="cave-row-actions">
                <button
                  type="button"
                  class="cave-opt-btn {cave.isPinned ? 'is-pinned' : ''}"
                  onclick={() => handleTogglePin(cave.path)}
                  title={cave.isPinned ? "取消釘選" : "釘選洞天"}
                >
                  ❖
                </button>
                <button
                  type="button"
                  class="cave-opt-btn remove"
                  onclick={() => handleRemoveCave(cave.path)}
                  title="從清單除役"
                >
                  ×
                </button>
              </div>
            </div>
          {/each}

          {#if caves.length === 0}
            <div class="empty-caves-notice">
              <p>尚未闢建藏卷洞天</p>
              <button
                type="button"
                class="btn-create-first"
                onclick={handleAddNewCave}
              >
                + 選擇電腦資料夾
              </button>
            </div>
          {/if}
        </div>

        <!-- 底部最近開啟足跡 -->
        {#if recentFiles.length > 0}
          <div class="sidebar-bottom-block">
            <div class="sidebar-sec-header">
              <span class="sec-title">近期足跡</span>
              <button
                type="button"
                class="clear-recent-text"
                onclick={onClearRecent}>清除</button
              >
            </div>
            <div class="recent-scroll-list">
              {#each recentFiles.slice(0, 4) as rf}
                <button
                  type="button"
                  class="recent-mini-pill"
                  onclick={() => {
                    const vf = vaultFiles.find((f) => f.path === rf.path);
                    if (vf) onOpenVaultFile(vf);
                    else {
                      const t = tabs.find((x) => x.filePath === rf.path);
                      if (t) onSelectTab(t.id);
                    }
                  }}
                  title={rf.path}
                >
                  <span class="recent-title">{rf.title}</span>
                  <span class="recent-time">{formatTime(rf.lastOpened)}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- 側欄底端：心法指南 -->
        <div class="sidebar-footer-bar">
          <button
            type="button"
            class="sidebar-help-btn {isHelpModalOpen ? 'active' : ''}"
            onclick={() => (isHelpModalOpen = !isHelpModalOpen)}
          >
            <span class="help-label">
              <span class="glyph-mono">☵</span>
              <span>洞天心法與輕功指南</span>
            </span>
            <span class="key-badge">?</span>
          </button>
        </div>
      </aside>

      <!-- 欄 2：樹狀檢索核心舞台 -->
      <main class="vault-tree-center">
        <!-- 乾淨寬鬆的搜尋與視圖切換條 -->
        <div class="tree-top-toolbar">
          <div class="search-input-wrapper">
            <span class="search-glyph">◎</span>
            <input
              type="text"
              class="tree-search-input"
              placeholder="探尋卷軸、子閣或內文關鍵字..."
              bind:value={searchQuery}
              bind:this={searchInputRef}
            />
            {#if searchQuery}
              <button
                type="button"
                class="clear-query-btn"
                onclick={() => (searchQuery = "")}>✕</button
              >
            {:else}
              <span class="search-key-hint">/</span>
            {/if}
          </div>

          <div class="view-mode-tabs">
            <button
              type="button"
              class="v-tab {activeTabMode === 'tree' ? 'active' : ''}"
              onclick={() => (activeTabMode = "tree")}
              title="樹狀層級檢索 (支援 h/j/k/l 鍵道導航)"
            >
              層級
            </button>
            <button
              type="button"
              class="v-tab {activeTabMode === 'flat' ? 'active' : ''}"
              onclick={() => (activeTabMode = "flat")}
              title="扁平檔案清單"
            >
              全卷 <span class="tab-count">{filteredVaultFiles.length}</span>
            </button>
            <button
              type="button"
              class="v-tab {activeTabMode === 'tabs' ? 'active' : ''}"
              onclick={() => (activeTabMode = "tabs")}
              title="當前已開分頁"
            >
              分頁 <span class="tab-count">{filteredTabs.length}</span>
            </button>
          </div>
        </div>

        <!-- 樹狀檢索內容區塊 -->
        <div class="tree-scroll-viewport">
          {#if activeTabMode === "tree"}
            {#if isScanning}
              <div class="tree-loading-state">
                <span class="glyph-mono">◈</span>
                <span>正在探尋諸洞天之卷軸結構...</span>
              </div>
            {:else if filteredTreeNodes.length === 0}
              <div class="tree-empty-state">
                <p>未探尋到相符的卷軸或子閣</p>
                {#if searchQuery}
                  <button
                    type="button"
                    class="reset-search-link"
                    onclick={() => (searchQuery = "")}
                  >
                    清除搜尋條件
                  </button>
                {/if}
              </div>
            {:else}
              <div class="tree-nodes-list">
                {#each filteredTreeNodes as rootNode (rootNode.id)}
                  <VaultTreeItem
                    node={rootNode}
                    depth={0}
                    selectedNodePath={selectedNode?.path || ""}
                    {focusedNodePath}
                    activeFilePath={currentActiveTab?.filePath || ""}
                    {searchQuery}
                    aiRecommendedPath=""
                    openedFilePaths={tabs
                      .map((t) => t.filePath)
                      .filter(Boolean) as string[]}
                    {expandedPaths}
                    onSelectNode={handleSelectNode}
                    onOpenNode={handleOpenNode}
                    onToggleFolder={handleToggleFolder}
                    onQuickSaveToNode={handleQuickSaveToNode}
                  />
                {/each}
              </div>
            {/if}

            <!-- 模式 B：去框化的舒適扁平清單 -->
          {:else if activeTabMode === "flat"}
            <div class="flat-files-list">
              {#each filteredVaultFiles as vf (vf.path)}
                {@const isOpened = tabs.some((t) => t.filePath === vf.path)}
                <div
                  class="flat-file-row {selectedNode?.path === vf.path
                    ? 'selected'
                    : ''}"
                  onclick={() =>
                    handleSelectNode({
                      id: vf.path,
                      name: vf.name,
                      path: vf.path,
                      rel_path: vf.rel_path,
                      isFolder: false,
                      extension: vf.extension,
                      size: vf.size,
                      modified: vf.modified,
                      preview: vf.preview,
                    })}
                  ondblclick={() => onOpenVaultFile(vf)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === "Enter" && onOpenVaultFile(vf)}
                >
                  <span class="file-glyph">
                    {vf.extension === "md" ? "◈" : "◇"}
                  </span>
                  <div class="file-main-info">
                    <div class="name-row">
                      <span class="file-name">{vf.name}</span>
                      {#if isOpened}<span class="badge-opened">已開</span>{/if}
                    </div>
                    <span class="file-sub-path">
                      {vf.rel_path} · {((vf.size || 0) / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <button
                    type="button"
                    class="btn-open-direct"
                    onclick={(e) => {
                      e.stopPropagation();
                      onOpenVaultFile(vf);
                    }}
                  >
                    開卷
                  </button>
                </div>
              {/each}
            </div>

            <!-- 模式 C：已開分頁清單 -->
          {:else if activeTabMode === "tabs"}
            <div class="tabs-manage-list">
              {#each filteredTabs as t (t.id)}
                <div
                  class="tab-manage-row {t.id === activeTabId
                    ? 'active-tab'
                    : ''}"
                  onclick={() => {
                    onSelectTab(t.id);
                    onCloseDrawer();
                  }}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === "Enter" && onSelectTab(t.id)}
                >
                  <span class="file-glyph">▢</span>
                  <div class="tab-info">
                    <span class="tab-title">{t.title}</span>
                    <span class="tab-meta">
                      {t.language.toUpperCase()} · {t.content.length} 字 {t.filePath
                        ? `· ${t.filePath}`
                        : "· 未入庫"}
                    </span>
                  </div>
                  <button
                    type="button"
                    class="btn-tab-close"
                    onclick={(e) => {
                      e.stopPropagation();
                      onCloseTab(t.id);
                    }}
                    title="收合此藥帖"
                  >
                    ×
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </main>

      <!-- 欄 3：卷軸即時參詳與預覽 (寬鬆閱讀面板) -->
      <aside class="vault-preview-sidebar">
        {#if selectedNode}
          <!-- 合併精簡的文稿抬頭 -->
          <div class="preview-header">
            <div class="preview-title-row">
              <span class="preview-glyph">
                {selectedNode.isFolder ? "◫" : "◈"}
              </span>
              <span class="item-title" title={selectedNode.name}>
                {selectedNode.name}
              </span>
            </div>
            <div class="preview-meta-sub">
              {#if !selectedNode.isFolder}
                <span class="meta-tag"
                  >{selectedNode.extension?.toUpperCase() || "TXT"}</span
                >
                <span>{((selectedNode.size || 0) / 1024).toFixed(1)} KB</span>
                <span class="meta-sep">·</span>
                <span class="item-path" title={selectedNode.path}
                  >{selectedNode.rel_path || selectedNode.path}</span
                >
              {:else}
                <span class="meta-tag">子閣目錄</span>
                <span>共 {selectedNode.children?.length || 0} 項</span>
              {/if}
            </div>
          </div>

          <!-- 內文預覽區域 -->
          <div class="preview-content-box">
            {#if isLoadingPreview}
              <div class="loading-preview">正在讀取卷軸內文...</div>
            {:else if !selectedNode.isFolder}
              <pre class="preview-code-block">{previewFileContent ||
                  selectedNode.preview ||
                  "(此卷軸為空白)"}</pre>
            {:else}
              {@const parentNode = findParentNode(selectedNode, fullTreeNodes)}
              <div class="folder-preview-container">
                {#if parentNode}
                  <button
                    type="button"
                    class="folder-nav-parent-btn"
                    onclick={() => handleDrillDownFolder(parentNode)}
                  >
                    <span class="nav-arrow">←</span>
                    <span>返回上層 ({parentNode.name})</span>
                  </button>
                {/if}

                {#if selectedNode.children && selectedNode.children.length > 0}
                  <div class="folder-children-list">
                    <div class="folder-children-header">
                      子閣收納 ({selectedNode.children.length})
                    </div>
                    {#each selectedNode.children as child (child.id || child.path)}
                      {@const isOpened = tabs.some(
                        (t) => t.filePath === child.path,
                      )}
                      <div
                        class="folder-child-item {child.isFolder
                          ? 'is-folder'
                          : 'is-file'}"
                        onclick={() => {
                          if (child.isFolder) {
                            handleDrillDownFolder(child);
                          } else {
                            handleSelectNode(child);
                          }
                        }}
                        ondblclick={() => {
                          if (!child.isFolder) {
                            handleOpenNode(child);
                          } else {
                            handleDrillDownFolder(child);
                          }
                        }}
                        role="button"
                        tabindex="0"
                        onkeydown={(e) => {
                          if (e.key === "Enter") {
                            if (child.isFolder) {
                              handleDrillDownFolder(child);
                            } else {
                              handleOpenNode(child);
                            }
                          }
                        }}
                      >
                        <span class="child-icon">
                          {child.isFolder ? "◫" : "◈"}
                        </span>
                        <div class="child-meta">
                          <div class="child-title-row">
                            <span class="child-name" title={child.name}>
                              {child.name}
                            </span>
                            {#if isOpened}
                              <span class="badge-opened">已開</span>
                            {/if}
                          </div>
                          <span class="child-desc">
                            {#if child.isFolder}
                              {child.children?.length || 0} 項
                            {:else}
                              {((child.size || 0) / 1024).toFixed(1)} KB
                            {/if}
                          </span>
                        </div>
                        <button
                          type="button"
                          class="child-action-btn"
                          onclick={(e) => {
                            e.stopPropagation();
                            if (child.isFolder) handleDrillDownFolder(child);
                            else handleOpenNode(child);
                          }}
                        >
                          {child.isFolder ? "進入" : "開卷"}
                        </button>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="folder-empty-hint">
                    <span class="empty-icon">◇</span>
                    <p class="empty-title">此子閣目前為空目錄</p>
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <!-- 底部動作列 -->
          {#if !selectedNode.isFolder}
            <div class="preview-action-bar">
              <button
                type="button"
                class="action-btn-main"
                onclick={() => handleOpenNode(selectedNode!)}
              >
                開卷載入 (Enter)
              </button>
              <button
                type="button"
                class="action-btn-trash"
                onclick={() => handleTrashNode(selectedNode!)}
                title="移至系統資源回收桶"
              >
                移至回收桶
              </button>
            </div>
          {/if}
        {:else}
          <div class="preview-empty-state">
            <span class="empty-zen-icon">◫</span>
            <h3>點選任意卷軸以參詳</h3>
            <p>
              於左側層級樹中游移或點選檔案，即可在此靜心預覽內文，無需頻繁開啟分頁。
            </p>
          </div>
        {/if}
      </aside>
    </div>

    <!-- 側欄模式拖曳把手 -->
    {#if displayMode === "drawer"}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="drawer-resize-handle {isDraggingResize ? 'dragging' : ''}"
        onmousedown={startResize}
        role="separator"
        aria-label="調整抽屜寬度"
        aria-orientation="vertical"
        aria-valuenow={drawerWidth}
        title="拖曳以調整寬度"
      ></div>
    {/if}

    <!-- 拓印 Toast -->
    {#if yankToast}
      <div class="vault-yank-toast">
        <span>{yankToast}</span>
      </div>
    {/if}

    <!-- 洞天心法說明彈窗 -->
    {#if isHelpModalOpen}
      <div
        class="help-modal-overlay"
        onclick={() => (isHelpModalOpen = false)}
        role="presentation"
      >
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="help-modal-card"
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="洞天心法指南"
          tabindex="-1"
        >
          <div class="help-header">
            <div class="help-title-group">
              <span class="help-icon">☵</span>
              <div>
                <h3 class="help-title">藏卷洞天 · 鍵道輕功指南</h3>
                <span class="help-sub">雙手不離鍵盤，極速穿梭萬卷</span>
              </div>
            </div>
            <button
              type="button"
              class="close-btn"
              onclick={() => (isHelpModalOpen = false)}
              title="關閉 (Esc)">✕</button
            >
          </div>

          <div class="help-body">
            <div class="shortcut-table-wrapper">
              <table class="vim-guide-table">
                <thead>
                  <tr>
                    <th style="width: 120px;">按鍵</th>
                    <th style="width: 130px;">動作</th>
                    <th>說明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><kbd>j</kbd> / <kbd>↓</kbd></td>
                    <td>向下移動</td>
                    <td>移至下個節點，右欄同步即時預覽</td>
                  </tr>
                  <tr>
                    <td><kbd>k</kbd> / <kbd>↑</kbd></td>
                    <td>向上移動</td>
                    <td>移至上個節點，右欄同步即時預覽</td>
                  </tr>
                  <tr>
                    <td><kbd>h</kbd> / <kbd>←</kbd></td>
                    <td>收合 / 返祖</td>
                    <td>收合當前已展開子閣，或直接跳回父目錄</td>
                  </tr>
                  <tr>
                    <td><kbd>l</kbd> / <kbd>→</kbd></td>
                    <td>展開 / 開卷</td>
                    <td>展開子閣並步入首項；若為檔案則直接載入分頁</td>
                  </tr>
                  <tr>
                    <td><kbd>o</kbd> / <kbd>Enter</kbd></td>
                    <td>開卷載入</td>
                    <td>在編輯器開啟此卷軸（子閣則切換開合）</td>
                  </tr>
                  <tr>
                    <td><kbd>g</kbd> <kbd>g</kbd> / <kbd>G</kbd></td>
                    <td>頂峰 / 淵底</td>
                    <td>瞬間跳至樹狀列表首項或末項</td>
                  </tr>
                  <tr>
                    <td><kbd>/</kbd></td>
                    <td>探尋過濾</td>
                    <td>聚焦至搜尋框進行即時過濾</td>
                  </tr>
                  <tr>
                    <td><kbd>y</kbd></td>
                    <td>拓印路徑</td>
                    <td>複製當前節點之絕對路徑至剪貼簿</td>
                  </tr>
                  <tr>
                    <td><kbd>s</kbd> / <kbd>i</kbd></td>
                    <td>就地封存</td>
                    <td>將當前編輯器分頁直接存入游標所在的子閣</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* 遮罩背景 */
  .vault-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.68);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: 1000;
  }

  /* 主容器：統一為 Apothecary Gruvbox 通透深色調 */
  .vault-master-container {
    position: fixed;
    background: rgba(20, 22, 21, 0.98);
    color: #e6dfd5;
    z-index: 1001;
    display: flex;
    flex-direction: column;
    box-shadow:
      0 24px 60px rgba(0, 0, 0, 0.78),
      0 0 0 1px rgba(250, 189, 47, 0.08);
    border: 1px solid rgba(100, 86, 66, 0.4);
    overflow: hidden;
  }

  .vault-master-container.modal-view {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 88vw;
    max-width: 1360px;
    height: 84vh;
    border-radius: 12px;
    animation: modalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes modalPop {
    from {
      opacity: 0;
      transform: translate(-50%, -48%) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  .vault-master-container.drawer-view {
    top: 0;
    left: 0;
    height: 100vh;
    border-radius: 0;
    border-left: none;
    border-top: none;
    border-bottom: none;
    animation: drawerSlide 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes drawerSlide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .glyph-mono {
    font-family: "JetBrains Mono", monospace;
    line-height: 1;
  }

  /* 頂部標頭：單行寬鬆設計 */
  .vault-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    padding: 0 20px;
    background: rgba(16, 18, 17, 0.9);
    border-bottom: 1px solid rgba(100, 86, 66, 0.25);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-glyph {
    font-family: "JetBrains Mono", monospace;
    font-size: 18px;
    color: #fabd2f;
  }

  .main-title {
    font-size: 15px;
    font-weight: 600;
    color: #ebdbb2;
    letter-spacing: 0.04em;
  }

  .header-divider {
    width: 1px;
    height: 16px;
    background: rgba(100, 86, 66, 0.3);
  }

  .target-capsule {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #8c8273;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.025);
    border-radius: 6px;
  }

  .target-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #8ec07c;
  }

  .target-vault {
    color: #d5c4a1;
    font-weight: 500;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .control-dock {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(100, 86, 66, 0.22);
    border-radius: 7px;
  }

  .dock-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    background: transparent;
    border: none;
    border-radius: 5px;
    color: #a89984;
    font-size: 12.5px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .dock-btn:hover {
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.08);
  }

  .primary-action-btn {
    height: 32px;
    padding: 0 12px;
    background: rgba(250, 189, 47, 0.1);
    border: 1px solid rgba(250, 189, 47, 0.3);
    color: #fabd2f;
    font-size: 12.5px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .primary-action-btn:hover {
    background: rgba(250, 189, 47, 0.2);
    border-color: rgba(250, 189, 47, 0.5);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #7c7365;
    font-size: 15px;
    width: 30px;
    height: 30px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .close-btn:hover {
    background: rgba(251, 73, 52, 0.14);
    color: #fb4934;
  }

  /* 核心三欄佈局 */
  .vault-body-layout {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  /* 欄 1：藏卷洞天側欄 */
  .vault-caves-sidebar {
    width: 248px;
    background: rgba(16, 18, 17, 0.65);
    border-right: 1px solid rgba(100, 86, 66, 0.22);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .scope-section {
    padding: 12px 12px 6px 12px;
  }

  .scope-hero-card {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(100, 86, 66, 0.28);
    border-radius: 8px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .scope-hero-card:hover {
    background: rgba(250, 189, 47, 0.06);
    border-color: rgba(250, 189, 47, 0.3);
  }

  .scope-hero-card.active {
    background: rgba(250, 189, 47, 0.09);
    border-color: rgba(250, 189, 47, 0.4);
  }

  .scope-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .scope-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .scope-glyph {
    font-family: "JetBrains Mono", monospace;
    font-size: 15px;
    color: #fabd2f;
  }

  .scope-name {
    font-size: 13.5px;
    font-weight: 600;
    color: #ebdbb2;
  }

  .scope-hero-card.active .scope-name {
    color: #fabd2f;
  }

  .scope-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: #8c8273;
  }

  .scope-badge.scanning {
    font-size: 10px;
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.15);
    padding: 1px 6px;
    border-radius: 4px;
  }

  .scope-desc {
    font-size: 11.5px;
    color: #7c7365;
    padding-left: 23px;
  }

  .sidebar-sec-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 4px 14px;
  }

  .sec-title {
    font-size: 11px;
    font-weight: 600;
    color: #7c7365;
    letter-spacing: 0.06em;
  }

  .cave-header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .icon-ghost-btn {
    background: transparent;
    border: none;
    color: #7c7365;
    font-size: 13px;
    cursor: pointer;
    padding: 2px 5px;
    border-radius: 4px;
    transition: all 0.14s ease;
  }

  .icon-ghost-btn:hover {
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.1);
  }

  .text-add-btn {
    background: transparent;
    border: none;
    color: #a89984;
    font-size: 11.5px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    transition: all 0.14s ease;
  }

  .text-add-btn:hover {
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.08);
  }

  .caves-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* 臨時工作區卡片 */
  .temp-workspace-card {
    background: rgba(250, 189, 47, 0.05);
    border: 1px dashed rgba(250, 189, 47, 0.35);
    border-radius: 7px;
    padding: 8px 10px;
    margin-bottom: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .temp-workspace-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .temp-pill-tag {
    font-size: 10.5px;
    color: #fabd2f;
  }

  .btn-adopt-cave {
    background: rgba(250, 189, 47, 0.15);
    border: none;
    color: #fabd2f;
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 4px;
    cursor: pointer;
  }

  .temp-folder-link {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    color: #ebdbb2;
    padding: 2px 0;
    cursor: pointer;
    text-align: left;
  }

  /* 單行清爽洞天項目 */
  .cave-row {
    display: flex;
    align-items: center;
    border-radius: 6px;
    transition: all 0.14s ease;
  }

  .cave-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .cave-row.selected {
    background: rgba(250, 189, 47, 0.09);
  }

  .cave-item-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    background: none;
    border: none;
    color: #d5c4a1;
    text-align: left;
    cursor: pointer;
  }

  .cave-row.selected .cave-item-btn {
    color: #fabd2f;
    font-weight: 500;
  }

  .cave-glyph {
    font-family: "JetBrains Mono", monospace;
    font-size: 13px;
    color: #7c7365;
    flex-shrink: 0;
  }

  .cave-glyph.pinned,
  .cave-row.selected .cave-glyph {
    color: #fabd2f;
  }

  .cave-name {
    font-size: 13.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .linked-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #8ec07c;
    box-shadow: 0 0 6px rgba(142, 192, 124, 0.6);
    flex-shrink: 0;
  }

  .cave-row-actions {
    display: none;
    align-items: center;
    gap: 2px;
    padding-right: 6px;
  }

  .cave-row:hover .cave-row-actions {
    display: flex;
  }

  .cave-opt-btn {
    background: none;
    border: none;
    color: #7c7365;
    font-size: 12px;
    cursor: pointer;
    padding: 3px 5px;
    border-radius: 4px;
  }

  .cave-opt-btn:hover,
  .cave-opt-btn.is-pinned {
    color: #fabd2f;
  }

  .cave-opt-btn.remove:hover {
    color: #fb4934;
  }

  .empty-caves-notice {
    text-align: center;
    padding: 24px 12px;
    color: #7c7365;
    font-size: 12.5px;
  }

  .btn-create-first {
    margin-top: 8px;
    background: rgba(250, 189, 47, 0.14);
    border: 1px solid rgba(250, 189, 47, 0.35);
    color: #fabd2f;
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
  }

  /* 近期足跡 */
  .sidebar-bottom-block {
    border-top: 1px solid rgba(100, 86, 66, 0.2);
    padding-bottom: 6px;
  }

  .clear-recent-text {
    background: none;
    border: none;
    color: #7c7365;
    font-size: 11px;
    cursor: pointer;
  }

  .clear-recent-text:hover {
    color: #d5c4a1;
  }

  .recent-scroll-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 2px 10px;
  }

  .recent-mini-pill {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: none;
    border: none;
    color: #9c8f7a;
    font-size: 12.5px;
    padding: 6px 8px;
    border-radius: 5px;
    text-align: left;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .recent-mini-pill:hover {
    background: rgba(255, 255, 255, 0.04);
    color: #fabd2f;
  }

  .recent-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .recent-time {
    font-size: 11px;
    color: #665c54;
    margin-left: 8px;
    flex-shrink: 0;
  }

  /* 側欄底端心法按鈕 */
  .sidebar-footer-bar {
    border-top: 1px solid rgba(100, 86, 66, 0.2);
    padding: 10px 12px;
  }

  .sidebar-help-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(100, 86, 66, 0.25);
    border-radius: 6px;
    padding: 7px 10px;
    color: #9c8f7a;
    font-size: 12.5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sidebar-help-btn:hover,
  .sidebar-help-btn.active {
    background: rgba(250, 189, 47, 0.08);
    border-color: rgba(250, 189, 47, 0.35);
    color: #fabd2f;
  }

  .sidebar-help-btn .help-label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .key-badge {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: #7c7365;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.04);
  }

  /* 欄 2：樹狀檢索核心舞台 */
  .vault-tree-center {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: transparent;
    border-right: 1px solid rgba(100, 86, 66, 0.22);
  }

  .tree-top-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 18px;
    border-bottom: 1px solid rgba(100, 86, 66, 0.2);
  }

  .search-input-wrapper {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-glyph {
    position: absolute;
    left: 11px;
    font-family: "JetBrains Mono", monospace;
    font-size: 13px;
    color: #7c7365;
    pointer-events: none;
  }

  .tree-search-input {
    width: 100%;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(100, 86, 66, 0.32);
    color: #ebdbb2;
    font-size: 13.5px;
    padding: 7px 32px 7px 32px;
    border-radius: 7px;
    outline: none;
    transition: all 0.15s ease;
  }

  .tree-search-input::placeholder {
    color: #665c54;
  }

  .tree-search-input:focus {
    border-color: rgba(250, 189, 47, 0.55);
    background: rgba(0, 0, 0, 0.4);
  }

  .search-key-hint {
    position: absolute;
    right: 10px;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: #665c54;
    pointer-events: none;
  }

  .clear-query-btn {
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    color: #7c7365;
    cursor: pointer;
    font-size: 12px;
  }

  .view-mode-tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    background: rgba(0, 0, 0, 0.25);
    padding: 3px;
    border-radius: 7px;
    border: 1px solid rgba(100, 86, 66, 0.25);
  }

  .v-tab {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    color: #8c8273;
    font-size: 12.5px;
    padding: 5px 10px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.14s ease;
    white-space: nowrap;
  }

  .v-tab:hover {
    color: #d5c4a1;
  }

  .v-tab.active {
    background: rgba(250, 189, 47, 0.12);
    color: #fabd2f;
    font-weight: 500;
  }

  .tab-count {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    opacity: 0.75;
  }

  .tree-scroll-viewport {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
  }

  .tree-loading-state,
  .tree-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 56px 16px;
    color: #7c7365;
    font-size: 13.5px;
    gap: 10px;
  }

  .reset-search-link {
    background: none;
    border: none;
    color: #fabd2f;
    cursor: pointer;
    font-size: 12.5px;
  }

  .tree-nodes-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  /* 去框化的扁平清單與分頁清單 */
  .flat-files-list,
  .tabs-manage-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .flat-file-row,
  .tab-manage-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 7px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .flat-file-row:hover,
  .tab-manage-row:hover {
    background: rgba(255, 255, 255, 0.035);
  }

  .flat-file-row.selected,
  .tab-manage-row.active-tab {
    background: rgba(250, 189, 47, 0.08);
    border-color: rgba(250, 189, 47, 0.25);
  }

  .file-glyph {
    font-family: "JetBrains Mono", monospace;
    font-size: 14px;
    color: #fabd2f;
    flex-shrink: 0;
  }

  .file-main-info,
  .tab-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .file-name,
  .tab-title {
    font-size: 13.5px;
    font-weight: 500;
    color: #e6dfd5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .flat-file-row:hover .file-name,
  .tab-manage-row:hover .tab-title {
    color: #fabd2f;
  }

  .file-sub-path,
  .tab-meta {
    font-size: 11.5px;
    color: #7c7365;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge-opened {
    font-size: 10.5px;
    background: rgba(142, 192, 124, 0.14);
    color: #8ec07c;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .btn-open-direct {
    background: rgba(250, 189, 47, 0.1);
    border: 1px solid rgba(250, 189, 47, 0.25);
    color: #fabd2f;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 5px;
    cursor: pointer;
    opacity: 0;
    transition: all 0.14s ease;
  }

  .flat-file-row:hover .btn-open-direct,
  .flat-file-row.selected .btn-open-direct {
    opacity: 1;
  }

  .btn-open-direct:hover {
    background: #fabd2f;
    color: #1d2021;
  }

  .btn-tab-close {
    background: none;
    border: none;
    color: #7c7365;
    cursor: pointer;
    font-size: 15px;
    padding: 4px 6px;
    border-radius: 4px;
  }

  .btn-tab-close:hover {
    color: #fb4934;
    background: rgba(251, 73, 52, 0.12);
  }

  /* 欄 3：卷軸即時參詳預覽 (寬鬆舒適閱讀區) */
  .vault-preview-sidebar {
    width: 380px;
    background: rgba(16, 18, 17, 0.45);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .preview-header {
    padding: 16px 20px 12px 20px;
    border-bottom: 1px solid rgba(100, 86, 66, 0.2);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .preview-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .preview-glyph {
    font-family: "JetBrains Mono", monospace;
    font-size: 16px;
    color: #fabd2f;
  }

  .item-title {
    font-size: 15px;
    font-weight: 600;
    color: #ebdbb2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-meta-sub {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
    color: #7c7365;
    min-width: 0;
  }

  .meta-tag {
    font-family: "JetBrains Mono", monospace;
    font-size: 10.5px;
    color: #d49b35;
    background: rgba(212, 155, 53, 0.12);
    padding: 1px 6px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .item-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-content-box {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .loading-preview {
    font-size: 13px;
    color: #8c8273;
    text-align: center;
    padding: 40px 0;
  }

  .preview-code-block {
    margin: 0;
    font-family: inherit;
    font-size: 13.5px;
    line-height: 1.75;
    color: #d5c4a1;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* 子閣資料夾瀏覽 */
  .folder-preview-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .folder-nav-parent-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(100, 86, 66, 0.28);
    color: #d5c4a1;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12.5px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .folder-nav-parent-btn:hover {
    border-color: rgba(250, 189, 47, 0.4);
    color: #fabd2f;
  }

  .folder-children-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .folder-children-header {
    font-size: 11px;
    font-weight: 600;
    color: #7c7365;
    padding: 4px 6px;
  }

  .folder-child-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .folder-child-item:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .folder-child-item .child-icon {
    font-family: "JetBrains Mono", monospace;
    font-size: 14px;
    color: #fabd2f;
    flex-shrink: 0;
  }

  .folder-child-item .child-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .folder-child-item .child-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .folder-child-item .child-name {
    font-size: 13px;
    color: #e6dfd5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .folder-child-item .child-desc {
    font-size: 11px;
    color: #7c7365;
  }

  .child-action-btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(100, 86, 66, 0.3);
    color: #b8ac99;
    font-size: 11.5px;
    padding: 3px 9px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .child-action-btn:hover {
    background: rgba(250, 189, 47, 0.14);
    color: #fabd2f;
    border-color: rgba(250, 189, 47, 0.4);
  }

  .folder-empty-hint {
    padding: 40px 16px;
    text-align: center;
    color: #7c7365;
  }

  .folder-empty-hint .empty-icon {
    font-family: "JetBrains Mono", monospace;
    font-size: 24px;
    color: #665c54;
  }

  .folder-empty-hint .empty-title {
    font-size: 13px;
    margin-top: 8px;
  }

  /* 預覽底部動作列 */
  .preview-action-bar {
    padding: 12px 20px;
    border-top: 1px solid rgba(100, 86, 66, 0.2);
    display: flex;
    gap: 8px;
  }

  .action-btn-main {
    flex: 1;
    background: rgba(250, 189, 47, 0.14);
    border: 1px solid rgba(250, 189, 47, 0.38);
    color: #fabd2f;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 14px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn-main:hover {
    background: #fabd2f;
    color: #1d2021;
  }

  .action-btn-trash {
    background: transparent;
    border: 1px solid rgba(100, 86, 66, 0.28);
    color: #8c8273;
    font-size: 12.5px;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn-trash:hover {
    background: rgba(251, 73, 52, 0.12);
    color: #fb4934;
    border-color: rgba(251, 73, 52, 0.35);
  }

  .preview-empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    text-align: center;
    color: #7c7365;
  }

  .empty-zen-icon {
    font-family: "JetBrains Mono", monospace;
    font-size: 28px;
    color: #fabd2f;
    opacity: 0.45;
    margin-bottom: 12px;
  }

  .preview-empty-state h3 {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 500;
    color: #d5c4a1;
  }

  .preview-empty-state p {
    font-size: 12.5px;
    line-height: 1.65;
    margin: 0;
  }

  /* 側欄拖曳調整條 */
  .drawer-resize-handle {
    position: absolute;
    top: 0;
    right: 0;
    width: 5px;
    height: 100%;
    cursor: col-resize;
    background: transparent;
    transition: background 0.15s;
  }

  .drawer-resize-handle:hover,
  .drawer-resize-handle.dragging {
    background: rgba(250, 189, 47, 0.6);
  }

  .vault-master-container.drawer-view .vault-preview-sidebar {
    display: none;
  }

  .vault-master-container.drawer-view .vault-caves-sidebar {
    width: 210px;
  }

  /* 拓印 Toast */
  .vault-yank-toast {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(22, 24, 23, 0.96);
    border: 1px solid rgba(250, 189, 47, 0.45);
    color: #fabd2f;
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 13px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
    z-index: 1050;
    pointer-events: none;
  }

  /* 洞天心法說明彈窗 */
  .help-modal-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1060;
  }

  .help-modal-card {
    width: 90%;
    max-width: 600px;
    background: rgba(22, 24, 23, 0.98);
    border: 1px solid rgba(100, 86, 66, 0.45);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .help-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(100, 86, 66, 0.25);
  }

  .help-title-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .help-icon {
    font-family: "JetBrains Mono", monospace;
    font-size: 20px;
    color: #fabd2f;
  }

  .help-title {
    margin: 0;
    font-size: 14.5px;
    font-weight: 600;
    color: #ebdbb2;
  }

  .help-sub {
    font-size: 12px;
    color: #8c8273;
  }

  .help-body {
    padding: 16px 20px 22px 20px;
    overflow-y: auto;
  }

  .shortcut-table-wrapper {
    border: 1px solid rgba(100, 86, 66, 0.28);
    border-radius: 8px;
    overflow: hidden;
  }

  .vim-guide-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    text-align: left;
  }

  .vim-guide-table th {
    background: rgba(255, 255, 255, 0.03);
    color: #8c8273;
    padding: 9px 14px;
    font-size: 12px;
    font-weight: 500;
    border-bottom: 1px solid rgba(100, 86, 66, 0.25);
  }

  .vim-guide-table td {
    padding: 9px 14px;
    border-bottom: 1px solid rgba(100, 86, 66, 0.14);
    color: #d5c4a1;
  }

  kbd {
    display: inline-block;
    padding: 2px 6px;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.1);
    border: 1px solid rgba(250, 189, 47, 0.25);
    border-radius: 4px;
  }
</style>
