<script lang="ts">
  import { onMount } from "svelte";
  import type {
    TabItem,
    VaultFileEntry,
    RecentFileRecord,
    RecentFolderRecord,
    VaultCave,
    VaultTreeNode,
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
  import { readVaultFile } from "../lib/storage/fsBridge";

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
    selectedAiModel?: "groq" | "gemini";
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
    onRefreshAllCaves?: () => void;
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
    selectedAiModel = "groq",
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
  let drawerWidth = $state(600); // 側欄模式寬度
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
  let focusedNodePath = $state<string>("");
  let yankToast = $state<string | null>(null);
  let yankToastTimer: number | null = null;
  let searchInputRef = $state<HTMLInputElement | null>(null);
  let lastKeyGTime = 0;

  // 6. 當前分頁與 AI 智慧推薦落點狀態
  let currentActiveTab = $derived(
    tabs.find((t) => t.id === activeTabId) || null,
  );
  // 當前連線工作區名稱與全洞天總數計算（供視野與落點說明使用）
  const currentVaultName = $derived(
    caves.find((c) => c.path === vaultFolderPath)?.name ||
    vaultFolderPath.split(/[/|\\]/).filter(Boolean).pop() ||
    "當前目錄"
  );

  const totalCavesCount = $derived(
    caves.length + (vaultFolderPath && !caves.some((c) => c.path === vaultFolderPath) ? 1 : 0)
  );

  // 初始化洞天列表
  $effect(() => {
    caves = loadVaultCaves();
  });

  // 當彈窗開啟時，觸發跨洞天背景批次更新
  $effect(() => {
    if (isOpen) {
      onRefreshAllCaves?.();
    }
  });

  // 構建藏卷洞天樹狀結構（含已授權洞天與當前未收錄之臨時工作區）
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
        const filesForUnrecorded = cavesFileCache[unrecordedCave.path] || vaultFiles;
        return [buildCaveTree(filesForUnrecorded, unrecordedCave)];
      }
      return [];
    }

    // 依選取的洞天過濾，或全部展示
    if (selectedCavePath) {
      if (unrecordedCave && selectedCavePath === unrecordedCave.path) {
        const filesForUnrecorded = cavesFileCache[unrecordedCave.path] || vaultFiles;
        return [buildCaveTree(filesForUnrecorded, unrecordedCave)];
      }
      const targetCaves = caves.filter((c) => c.path === selectedCavePath);
      return targetCaves.map((cave) => {
        const filesForCave = cavesFileCache[cave.path] || (cave.path === vaultFolderPath ? vaultFiles : []);
        return buildCaveTree(filesForCave, cave);
      });
    }

    // 諸洞天萬卷全覽模式 (selectedCavePath 為空)：所有洞天聚合展示！
    const nodes = caves.map((cave) => {
      const filesForCave = cavesFileCache[cave.path] || (cave.path === vaultFolderPath ? vaultFiles : []);
      return buildCaveTree(filesForCave, cave);
    });

    if (unrecordedCave) {
      const filesForUnrecorded = cavesFileCache[unrecordedCave.path] || vaultFiles;
      nodes.unshift(buildCaveTree(filesForUnrecorded, unrecordedCave));
    }

    return nodes;
  });

  // 樹狀即時搜尋過濾 (Tree Search)
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
      const nextSet = new Set(expandedPaths);
      for (const root of fullTreeNodes) {
        if (!nextSet.has(root.path)) {
          nextSet.add(root.path);
        }
      }
      expandedPaths = nextSet;
    }
  });

  // 計算平面的當前可見節點清單 (游標遍歷依據)
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

  // 當可見節點改變且尚未有選取焦點時，自動鎖定首項
  $effect(() => {
    if (visibleNodes.length > 0 && !focusedNodePath) {
      focusedNodePath = visibleNodes[0].path;
      handleSelectNode(visibleNodes[0]);
    }
  });

  // 切換資料夾展開/收合
  function handleToggleFolder(node: VaultTreeNode) {
    const nextSet = new Set(expandedPaths);
    if (nextSet.has(node.path)) {
      nextSet.delete(node.path);
    } else {
      nextSet.add(node.path);
    }
    expandedPaths = nextSet;
  }

  // 滾動至節點可見區域
  function scrollToNode(path: string) {
    if (typeof document === "undefined") return;
    const el = document.getElementById(
      "vault-tree-node-" + encodeURIComponent(path),
    );
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  // 尋找父資料夾節點 (供 Vim h 鍵返祖使用)
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

  // 拓印 Toast 提示
  function showYankToast(msg: string) {
    yankToast = msg;
    if (yankToastTimer) clearTimeout(yankToastTimer);
    yankToastTimer = window.setTimeout(() => {
      yankToast = null;
    }, 2200);
  }

  // 全域鍵盤監聽處理
  function handleVimKeydown(e: KeyboardEvent) {
    if (!isOpen) return;

    // 若當前焦點在文字輸入框中
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

    // 若說明彈窗開啟中，Escape 關閉說明
    if (isHelpModalOpen) {
      if (e.key === "Escape" || e.key === "?") {
        isHelpModalOpen = false;
        e.preventDefault();
      }
      return;
    }

    // 只在樹狀檢視模式下啟用 h/j/k/l 導航
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
      // 下移 (Next)
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

      // 上移 (Prev)
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

      // 深入 / 展開 (In / Expand)
      case "l":
      case "ArrowRight": {
        e.preventDefault();
        if (currentNode.isFolder) {
          if (!expandedPaths.has(currentNode.path)) {
            // 尚未展開：立即展開
            const nextSet = new Set(expandedPaths);
            nextSet.add(currentNode.path);
            expandedPaths = nextSet;
          } else if (currentNode.children && currentNode.children.length > 0) {
            // 已展開：步入第一個子節點
            const nextIdx = Math.min(currentIndex + 1, visibleNodes.length - 1);
            const targetNode = visibleNodes[nextIdx];
            focusedNodePath = targetNode.path;
            handleSelectNode(targetNode);
            scrollToNode(targetNode.path);
          }
        } else {
          // 為檔案：直接開卷載入
          handleOpenNode(currentNode);
        }
        break;
      }

      // 收合 / 返祖 (Out / Collapse)
      case "h":
      case "ArrowLeft": {
        e.preventDefault();
        if (currentNode.isFolder && expandedPaths.has(currentNode.path)) {
          // 當前資料夾已展開：立即收合
          const nextSet = new Set(expandedPaths);
          nextSet.delete(currentNode.path);
          expandedPaths = nextSet;
        } else {
          // 已收合或為檔案：跳至父資料夾
          const parentNode = findParentNode(currentNode, fullTreeNodes);
          if (parentNode) {
            focusedNodePath = parentNode.path;
            handleSelectNode(parentNode);
            scrollToNode(parentNode.path);
          }
        }
        break;
      }

      // 頂峰 (gg)
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

      // 淵底 (G)
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

      // 探尋搜尋 (/)
      case "/": {
        e.preventDefault();
        searchInputRef?.focus();
        break;
      }

      // 開卷載入 (Enter / o)
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

      // 拓印路徑 (y)
      case "y": {
        e.preventDefault();
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(currentNode.path);
          showYankToast(`📋 已拓印路徑至剪貼簿：${currentNode.name}`);
        }
        break;
      }

      // 就地封存入庫 (s 或 i)
      case "s":
      case "i": {
        if (currentNode.isFolder && currentActiveTab && onConfirmSave) {
          e.preventDefault();
          handleQuickSaveToNode(currentNode);
        }
        break;
      }

      // 開啟心法指南 (?)
      case "?": {
        e.preventDefault();
        isHelpModalOpen = !isHelpModalOpen;
        break;
      }
    }
  }

  // 當前選取洞天或諸洞天全覽之檔案集合（具備去重保護）
  const currentCaveFiles = $derived.by(() => {
    if (selectedCavePath) {
      return cavesFileCache[selectedCavePath] || (selectedCavePath === vaultFolderPath ? vaultFiles : []);
    }
    // 諸洞天萬卷全覽：聚合所有洞天檔案，依路徑去重 (避免重複顯示母子資料夾檔案)
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
    return Array.from(fileMap.values()).sort((a, b) => (b.modified || 0) - (a.modified || 0));
  });

  // 檔案扁平搜尋 (Fuse)
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

  // 分頁搜尋 (Fuse)
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

  // 點選樹狀節點（觸發右欄預覽）
  async function handleSelectNode(node: VaultTreeNode) {
    selectedNode = node;
    if (!node.isFolder) {
      // 載入檔案內容
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

  // 開啟節點入編輯器分頁
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

  // 直接儲存至樹狀上的某個資料夾節點
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

  // 快速新增藏卷洞天
  async function handleAddNewCave() {
    onPickFolder();
  }

  // 移除洞天
  function handleRemoveCave(cavePath: string) {
    if (confirm("確定要從藏卷洞天中除役此目錄嗎？（實體檔案不會被刪除）")) {
      caves = removeVaultCave(cavePath);
      onRemoveRecentFolder?.(cavePath);
      if (selectedCavePath === cavePath) selectedCavePath = "";
      onRefreshAllCaves?.();
    }
  }

  // 釘選洞天
  function handleTogglePin(cavePath: string) {
    caves = togglePinCave(cavePath);
    onTogglePinFolder?.(cavePath);
  }

  // 全卷導出
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

  function formatTime(timestamp: number) {
    if (!timestamp) return "";
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return "剛剛";
    if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
    return new Date(timestamp).toLocaleDateString();
  }

  // 拖曳調整側欄寬度
  function startResize(e: MouseEvent) {
    if (displayMode !== "drawer") return;
    isDraggingResize = true;
    const startX = e.clientX;
    const startWidth = drawerWidth;

    function onMouseMove(moveEvent: MouseEvent) {
      const delta = moveEvent.clientX - startX;
      drawerWidth = Math.min(Math.max(startWidth + delta, 420), 850);
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

<!-- 監聽全域 Vim 快捷鍵 (頂層放置) -->
<svelte:window onkeydown={handleVimKeydown} />

{#if isOpen}
  <!-- 背景遮罩 (點擊收合) -->
  <div class="vault-backdrop" onclick={onCloseDrawer} role="presentation"></div>

  <!-- 主體容器：巨幕中控模式 (modal) 或 側欄模式 (drawer) -->
  <div
    class="vault-master-container {displayMode === 'modal'
      ? 'modal-view'
      : 'drawer-view'}"
    style={displayMode === "drawer" ? `width: ${drawerWidth}px;` : ""}
    aria-label="藏卷洞天·萬卷中控台"
  >
    <!-- 頂部標頭與全域動作列 -->
    <header class="vault-header">
      <div class="header-brand-group">
        <span class="brand-scroll-icon">
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          >
            <line x1="7" y1="4" x2="17" y2="4" />
            <line x1="7" y1="20" x2="17" y2="20" />
            <path d="M7 4H4.5A1.5 1.5 0 0 0 3 5.5v13A1.5 1.5 0 0 0 4.5 20H7" />
            <path
              d="M17 4h2.5A1.5 1.5 0 0 1 21 5.5v13a1.5 1.5 0 0 1-1.5 1.5H17"
            />
            <line x1="10" y1="8.5" x2="14" y2="8.5" stroke-width="1.2" />
            <line x1="10" y1="12" x2="14" y2="12" stroke-width="1.2" />
            <line x1="10" y1="15.5" x2="13" y2="15.5" stroke-width="1.2" />
          </svg>
        </span>
        <div class="brand-text">
          <span class="main-title">藏卷洞天 · 萬卷中控台</span>
          <span class="sub-title">御風輕功樹覽 · 諸洞天萬卷全覽</span>
        </div>
      </div>

      <div class="header-controls">
        <!-- 心法說明與快捷鍵指南按鈕 (右上角簡化為問號，hover 展開洞天心法) -->
        <button
          type="button"
          class="control-btn help-btn {isHelpModalOpen ? 'active' : ''}"
          onclick={() => (isHelpModalOpen = !isHelpModalOpen)}
          title="查看藏卷洞天設計心法與鍵道輕功操作秘笈 (?)"
        >
          <span class="help-qmark">?</span>
          <span class="help-hover-text">洞天心法</span>
        </button>

        <!-- 尺寸切換按鈕 -->
        <button
          type="button"
          class="control-btn"
          onclick={() =>
            (displayMode = displayMode === "modal" ? "drawer" : "modal")}
          title={displayMode === "modal"
            ? "切換為側欄視野"
            : "展開為巨幕大中控台"}
        >
          <span>{displayMode === "modal" ? "◨ 側欄" : "⛶ 巨幕"}</span>
        </button>

        <button
          type="button"
          class="control-btn"
          onclick={handleExportAll}
          title="備份導出全卷軸 JSON"
        >
          <span>⤓ 導出全卷</span>
        </button>

        <button
          type="button"
          class="control-btn primary"
          onclick={onAddTab}
          title="新增空白素簡 (Ctrl+T)"
        >
          <span>+ 展新簡</span>
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
      <!-- 欄 1：藏卷洞天清單 (Vault Caves / Permitted Directories) -->
      <aside class="vault-caves-sidebar">
        <!-- 頂部視野分層區：全域視野 (View Scope) -->
        <div class="scope-view-section">
          <div class="scope-label">全域瀏覽視野</div>
          <button
            type="button"
            class="cave-item-btn scope-master-btn {!selectedCavePath ? 'active' : ''}"
            onclick={() => (selectedCavePath = "")}
            title={`同時聚合瀏覽所有已開放之洞天。新檔預設存入：${currentVaultName}`}
          >
            <span class="cave-icon">🪐</span>
            <div class="cave-info">
              <div class="name-line">
                <span class="cave-name">諸洞天萬卷全覽</span>
                {#if isScanningCaves}
                  <span class="active-dot scanning" title="跨洞天卷軸更新彙整中...">⏳ 彙整中</span>
                {:else if !selectedCavePath}
                  <span class="active-dot scope-active" title="目前處於全域聚合瀏覽視野">全覽中</span>
                {/if}
              </div>
              <div class="cave-scope-sub">
                <div class="scope-stat-line">已聚合 {totalCavesCount} 洞天 · 共 {currentCaveFiles.length} 卷</div>
                <div class="scope-target-line">
                  <span>📍 新檔預設存入：</span><strong class="target-name">{currentVaultName}</strong>
                </div>
              </div>
            </div>
          </button>
        </div>

        <!-- 實體洞天庫標頭 (切換工作區 / 開放新洞天) -->
        <div class="sidebar-sec-header">
          <span class="sec-title" title="點選聚焦／切換工作區">實體洞天庫 ({caves.length})</span>
          <div class="cave-header-actions">
            {#if isScanningCaves}
              <span class="scanning-badge" title="背景探尋諸洞天中...">⏳</span>
            {:else if onRefreshAllCaves}
              <button
                type="button"
                class="mini-refresh-btn"
                onclick={() => onRefreshAllCaves?.()}
                title="重新整理所有洞天掃描"
              >
                🔄
              </button>
            {/if}
            <button
              type="button"
              class="mini-add-btn"
              onclick={handleAddNewCave}
              title="授權開放電腦實體資料夾為新洞天"
            >
              + 開放洞天
            </button>
          </div>
        </div>

        <div class="caves-list">

          <!-- 當前臨時工作區（未收錄至洞天時顯示，提供手動收錄按鈕） -->
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
                <span class="temp-pill-tag">📍 當前臨時工作區</span>
                <button
                  type="button"
                  class="btn-adopt-cave"
                  onclick={() => {
                    caves = addVaultCave(vaultFolderPath);
                    selectedCavePath = vaultFolderPath;
                    onRefreshAllCaves?.();
                  }}
                  title="將此目錄正式闢建／收錄入藏卷洞天"
                >
                  + 收錄入洞天
                </button>
              </div>
              <button
                type="button"
                class="temp-folder-link"
                onclick={() => (selectedCavePath = vaultFolderPath)}
                title={`目前工作目錄：${vaultFolderPath}`}
              >
                <span class="cave-icon">📂</span>
                <div class="cave-info">
                  <span class="cave-name">{currentName}</span>
                  <span class="cave-sub" title={vaultFolderPath}
                    >{vaultFolderPath}</span
                  >
                </div>
              </button>
            </div>
          {/if}

          <!-- 個別洞天項目 -->
          {#each caves as cave (cave.path)}
            {@const isCurrentLinked = cave.path === vaultFolderPath}
            <div
              class="cave-row-container {selectedCavePath === cave.path
                ? 'selected'
                : ''}"
            >
              <button
                type="button"
                class="cave-item-btn {isCurrentLinked ? 'linked' : ''}"
                onclick={() => {
                  selectedCavePath = cave.path;
                  if (cave.path !== vaultFolderPath) {
                    onSwitchFolder?.(cave.path);
                  }
                }}
                title={isCurrentLinked
                  ? `【當前工作區】${cave.name}（新筆記預設存入此目錄）`
                  : `點擊切換為當前工作區並聚焦此洞天。路徑: ${cave.path}`}
              >
                <span class="cave-icon">{cave.isPinned ? "📌" : "🏞️"}</span>
                <div class="cave-info">
                  <div class="name-line">
                    <span class="cave-name">{cave.name}</span>
                    {#if isCurrentLinked}
                      <span class="active-dot active-workspace" title="新筆記預設存入此處，外部檔案熱監聽中"
                        >當前工作區</span
                      >
                    {/if}
                  </div>
                  <span class="cave-sub" title={cave.path}>{cave.path}</span>
                </div>
              </button>

              <div class="cave-row-actions">
                <button
                  type="button"
                  class="cave-opt-btn {cave.isPinned ? 'pinned' : ''}"
                  onclick={() => handleTogglePin(cave.path)}
                  title={cave.isPinned ? "取消釘選" : "釘選為常用洞天"}
                >
                  📌
                </button>
                <button
                  type="button"
                  class="cave-opt-btn remove"
                  onclick={() => handleRemoveCave(cave.path)}
                  title="從洞天清單除役"
                >
                  ✕
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
                📁 選擇電腦資料夾
              </button>
            </div>
          {/if}
        </div>

        <!-- 底部最近開啟與百子櫃草稿快速跳轉 -->
        <div class="sidebar-bottom-block">
          <div class="sidebar-sec-header">
            <span class="sec-title">🕒 墨痕足跡</span>
            {#if recentFiles.length > 0}
              <button
                type="button"
                class="clear-recent-text"
                onclick={onClearRecent}>清除</button
              >
            {/if}
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
      </aside>

      <!-- 欄 2：樹狀檢索核心舞台 (Hierarchical Tree Search & Navigation) -->
      <main class="vault-tree-center">
        <!-- 搜尋與視圖分頁條 -->
        <div class="tree-top-toolbar">
          <div class="search-input-wrapper">
            <span class="search-glyph">🔍</span>
            <input
              type="text"
              class="tree-search-input"
              placeholder="跨洞天層級搜尋卷軸、子閣或內文關鍵字... (按 / 聚焦，Esc 返回)"
              bind:value={searchQuery}
              bind:this={searchInputRef}
            />
            {#if searchQuery}
              <button
                type="button"
                class="clear-query-btn"
                onclick={() => (searchQuery = "")}>✕</button
              >
            {/if}
          </div>

          <div class="view-mode-tabs">
            <button
              type="button"
              class="v-tab {activeTabMode === 'tree' ? 'active' : ''}"
              onclick={() => (activeTabMode = "tree")}
              title="樹狀層級檢索 (自動展開匹配子閣，支援鍵道輕功導航)"
            >
              🌲 洞天層級樹
            </button>
            <button
              type="button"
              class="v-tab {activeTabMode === 'flat' ? 'active' : ''}"
              onclick={() => (activeTabMode = "flat")}
              title="電腦檔案扁平清單"
            >
              📁 檔案清單 ({filteredVaultFiles.length})
            </button>
            <button
              type="button"
              class="v-tab {activeTabMode === 'tabs' ? 'active' : ''}"
              onclick={() => (activeTabMode = "tabs")}
              title="當前百子櫃已開分頁"
            >
              📜 已開分頁 ({filteredTabs.length})
            </button>
          </div>
        </div>

        <!-- 樹狀檢索內容區塊 -->
        <div class="tree-scroll-viewport">
          {#if activeTabMode === "tree"}
            {#if isScanning}
              <div class="tree-loading-state">
                <span class="spinner">⏳</span>
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

            <!-- 模式 B：扁平檔案清單 -->
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
                  <span class="file-glyph"
                    >{vf.extension === "md" ? "📝" : "📄"}</span
                  >
                  <div class="file-main-info">
                    <div class="name-row">
                      <span class="file-name">{vf.name}</span>
                      {#if isOpened}<span class="badge-opened">已開</span>{/if}
                    </div>
                    <span class="file-sub-path"
                      >{vf.rel_path} · {(vf.size / 1024).toFixed(1)} KB</span
                    >
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

            <!-- 模式 C：百子櫃已開分頁清單 -->
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
                  <span class="tab-glyph">📜</span>
                  <div class="tab-info">
                    <span class="tab-title">{t.title}</span>
                    <span class="tab-meta"
                      >{t.language.toUpperCase()} · {t.content.length} 字元 {t.filePath
                        ? `· 💾 ${t.filePath}`
                        : "· (未入庫)"}</span
                    >
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
                    ✕
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </main>

      <!-- 欄 3：卷軸即時參詳與預覽 (Live Document Preview & Inspection) -->
      <aside class="vault-preview-sidebar">
        {#if selectedNode}
          <div class="preview-header">
            <span class="preview-glyph"
              >{selectedNode.isFolder ? "📁" : "📖"}</span
            >
            <div class="preview-meta-title">
              <span class="item-title" title={selectedNode.name}
                >{selectedNode.name}</span
              >
              <span class="item-path" title={selectedNode.path}
                >{selectedNode.path}</span
              >
            </div>
          </div>

          <div class="preview-stats-row">
            {#if !selectedNode.isFolder}
              <span
                >大小：{((selectedNode.size || 0) / 1024).toFixed(1)} KB</span
              >
              <span>格式：{selectedNode.extension?.toUpperCase() || "TXT"}</span
              >
            {:else}
              <span>子閣目錄</span>
              <span>包含：{selectedNode.children?.length || 0} 個項目</span>
            {/if}
          </div>

          <!-- 內文預覽區域 -->
          <div class="preview-content-box">
            {#if isLoadingPreview}
              <div class="loading-preview">⏳ 正在自洞天讀取卷軸內文...</div>
            {:else if !selectedNode.isFolder}
              <pre class="preview-code-block">{previewFileContent ||
                  selectedNode.preview ||
                  "(此卷軸為空白)"}</pre>
            {:else}
              <div class="folder-preview-hint">
                <p>此節點為洞天子閣資料夾。</p>
                <p>您可點選下方動作將當前藥帖直接封存入此目錄。</p>
              </div>
            {/if}
          </div>

          <!-- 底部動作列 -->
          <div class="preview-action-bar">
            {#if !selectedNode.isFolder}
              <button
                type="button"
                class="action-btn-main"
                onclick={() => handleOpenNode(selectedNode!)}
              >
                📜 立即開卷載入
              </button>
            {:else}
              <button
                type="button"
                class="action-btn-main"
                onclick={() => handleQuickSaveToNode(selectedNode!)}
              >
                📥 將當前藥帖歸入此閣
              </button>
            {/if}
          </div>
        {:else}
          <!-- 尚未選取任何節點時的歡迎指引 -->
          <div class="preview-empty-state">
            <span class="empty-zen-icon">📜</span>
            <h3>點選任意卷軸以參詳</h3>
            <p>
              於中欄層級樹中點選檔案或子閣，即可在此預覽其內文筆記，無需頻繁開啟分頁。
            </p>
            <div class="zen-tip-box">
              <span class="tip-sparkle">💡 洞天心法</span>
              <p>
                AI
                自動推薦之落點已標注黃金光環，點擊推薦欄「一鍵封存」即可瞬間入庫。
              </p>
            </div>
          </div>
        {/if}
      </aside>
    </div>

    <!-- 側欄模式專用之拖曳寬度把手 -->
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

    <!-- 拓印路徑短暫 Toast 提示 (y 鍵觸發) -->
    {#if yankToast}
      <div class="vault-yank-toast">
        <span>{yankToast}</span>
      </div>
    {/if}

    <!-- 洞天心法與鍵道輕功操作秘笈彈窗 (? 鍵觸發) -->
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
              <span class="help-icon">📜</span>
              <div>
                <h3 class="help-title">藏卷洞天 · 心法與操作全綱</h3>
                <span class="help-sub">御萬卷於方寸 · 參萬化於靈閣</span>
              </div>
            </div>
            <button
              type="button"
              class="help-close-btn"
              onclick={() => (isHelpModalOpen = false)}
              title="關閉 (Esc)">✕</button
            >
          </div>

          <div class="help-body">
            <!-- 區塊一：設計邏輯與心法 -->
            <section class="help-section">
              <h4 class="sec-headline">
                🌌 壹、 藏卷洞天設計心法（為何不是傳統專案？）
              </h4>
              <div class="philosophy-card">
                <p>
                  <strong>打破單一專案工作區的束縛：</strong
                  >傳統筆記軟體常逼迫使用者一次只能打開單一資料夾，使用者必須手動在樹狀深層翻找位置，徒增心智負擔。
                </p>
                <p>
                  <strong>開放目錄池概念：</strong
                  >使用者僅需授權電腦中願意開放的本機目錄（例如：<em
                    >研發洞天</em
                  >、<em>醫方經閣</em>、<em>隨手草堂</em
                  >）。其餘的層級歸類，全部交由 <strong>AI 靈識</strong>！
                </p>
                <p>
                  <strong>AI 智慧落點推薦：</strong>當前藥帖若為未存檔散帖，頂部
                  AI
                  將自動解析內容語意（程式碼、架構文檔、中醫方劑或會議記錄），秒速在諸洞天中推薦最佳存放目錄與擬定檔名，提供「一鍵封存入庫」。
                </p>
              </div>
            </section>

            <!-- 區塊二：鍵道輕功秘笈 -->
            <section class="help-section">
              <h4 class="sec-headline">⚡ 貳、 輕功操作指南 (純鍵盤遊歷)</h4>
              <p class="sec-desc">
                在中控台中無需動用滑鼠，雙手不離鍵盤即可極速穿梭樹狀層級並即時參詳右欄內文：
              </p>
              <div class="shortcut-table-wrapper">
                <table class="vim-guide-table">
                  <thead>
                    <tr>
                      <th style="width: 130px;">心法按鍵</th>
                      <th>身法動作 (輕功導航)</th>
                      <th>詳細心法</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><kbd>j</kbd> / <kbd>↓</kbd></td>
                      <td>向下穿梭</td>
                      <td>游標移至下個節點，右欄卷軸同步即時預覽</td>
                    </tr>
                    <tr>
                      <td><kbd>k</kbd> / <kbd>↑</kbd></td>
                      <td>向上穿梭</td>
                      <td>游標移至上個節點，右欄卷軸同步即時預覽</td>
                    </tr>
                    <tr>
                      <td><kbd>h</kbd> / <kbd>←</kbd></td>
                      <td>收合 / 返祖</td>
                      <td
                        >若為已展開之子閣則收合；若已收合或為檔案則直跳父目錄</td
                      >
                    </tr>
                    <tr>
                      <td><kbd>l</kbd> / <kbd>→</kbd></td>
                      <td>展開 / 步入</td>
                      <td
                        >若為子閣則展開並步入首項；若為檔案則直接開卷載入分頁</td
                      >
                    </tr>
                    <tr>
                      <td><kbd>o</kbd> / <kbd>Enter</kbd></td>
                      <td>開卷載入</td>
                      <td>直接在主要編輯器載入此藥帖（子閣則切換開合）</td>
                    </tr>
                    <tr>
                      <td><kbd>g</kbd> <kbd>g</kbd></td>
                      <td>直達頂峰</td>
                      <td>連續按下兩次 g，瞬間回歸洞天樹首</td>
                    </tr>
                    <tr>
                      <td><kbd>G</kbd></td>
                      <td>直通淵底</td>
                      <td>移至當前洞天樹最後一個節點</td>
                    </tr>
                    <tr>
                      <td><kbd>/</kbd></td>
                      <td>探尋過濾</td>
                      <td>快速聚焦至全洞天樹狀搜尋列</td>
                    </tr>
                    <tr>
                      <td><kbd>y</kbd></td>
                      <td>拓印路徑</td>
                      <td>複製當前節點之電腦絕對路徑至剪貼簿</td>
                    </tr>
                    <tr>
                      <td><kbd>s</kbd> / <kbd>i</kbd></td>
                      <td>就地封存</td>
                      <td>將當前活躍藥帖存入游標所在子閣資料夾</td>
                    </tr>
                    <tr>
                      <td><kbd>?</kbd></td>
                      <td>心法指南</td>
                      <td>隨時開啟或收合本說明秘笈</td>
                    </tr>
                    <tr>
                      <td><kbd>Esc</kbd></td>
                      <td>退回 / 關閉</td>
                      <td>自搜尋框退回 Vim 模式，或關閉洞天中控台</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div class="help-footer">
            <span class="footer-hint"
              >提示：隨時按下 <kbd>?</kbd> 鍵即可開閉此秘笈</span
            >
            <button
              type="button"
              class="btn-got-it"
              onclick={() => (isHelpModalOpen = false)}>領會心法 (Esc)</button
            >
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
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    z-index: 1000;
  }

  /* 主容器：巨幕中控 (modal-view) 或 側欄 (drawer-view) */
  .vault-master-container {
    position: fixed;
    background: #282828;
    color: #ebdbb2;
    z-index: 1001;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.7);
    border: 1px solid #3c3836;
    overflow: hidden;
  }

  /* 巨幕中控模式：88vw x 86vh 大視窗居中 */
  .vault-master-container.modal-view {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90vw;
    max-width: 1400px;
    height: 86vh;
    border-radius: 12px;
    animation: modalPop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes modalPop {
    from {
      opacity: 0;
      transform: translate(-50%, -48%) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  /* 側欄模式：貼齊左邊，可自由調寬度 */
  .vault-master-container.drawer-view {
    top: 0;
    left: 0;
    height: 100vh;
    border-radius: 0;
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

  /* 頂部標頭 */
  .vault-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: #1d2021;
    border-bottom: 1px solid #3c3836;
  }

  .header-brand-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-scroll-icon {
    display: inline-flex;
    color: #fabd2f;
    filter: drop-shadow(0 0 6px rgba(250, 189, 47, 0.3));
  }

  .brand-text {
    display: flex;
    flex-direction: column;
  }

  .main-title {
    font-size: 16px;
    font-weight: 700;
    color: #fabd2f;
    letter-spacing: 0.5px;
  }

  .sub-title {
    font-size: 11px;
    color: #a89984;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .control-btn {
    background: #3c3836;
    border: 1px solid #504945;
    color: #ebdbb2;
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .control-btn.help-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 5px 9px;
    font-weight: 700;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .help-qmark {
    font-weight: 700;
    font-size: 13px;
    line-height: 1;
  }

  .help-hover-text {
    max-width: 0;
    opacity: 0;
    overflow: hidden;
    white-space: nowrap;
    transition: max-width 0.22s ease, opacity 0.18s ease, margin 0.18s ease;
    margin-left: 0;
    font-size: 11px;
    font-weight: 600;
  }

  .control-btn.help-btn:hover .help-hover-text {
    max-width: 80px;
    opacity: 1;
    margin-left: 5px;
  }

  .control-btn:hover {
    background: #504945;
    color: #fbf1c7;
  }

  .control-btn.primary {
    background: rgba(184, 187, 38, 0.2);
    border-color: #b8bb26;
    color: #b8bb26;
    font-weight: 600;
  }

  .control-btn.primary:hover {
    background: #b8bb26;
    color: #1d2021;
  }

  .close-btn {
    background: none;
    border: none;
    color: #a89984;
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .close-btn:hover {
    background: rgba(204, 36, 29, 0.2);
    color: #fb4934;
  }

  /* 核心佈局 */
  .vault-body-layout {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  /* 欄 1：藏卷洞天側欄 */
  .vault-caves-sidebar {
    width: 260px;
    background: #1d2021;
    border-right: 1px solid #3c3836;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .sidebar-sec-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid #282828;
  }

  .sec-title {
    font-size: 12px;
    font-weight: 700;
    color: #a89984;
    text-transform: uppercase;
  }

  .cave-header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .mini-refresh-btn {
    background: #3c3836;
    border: 1px solid #504945;
    color: #ebdbb2;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mini-refresh-btn:hover {
    background: #fabd2f;
    color: #1d2021;
  }

  .scanning-badge {
    font-size: 11px;
    color: #fabd2f;
  }

  .active-dot.scanning {
    background: rgba(250, 189, 47, 0.2);
    color: #fabd2f;
    border: 1px solid rgba(250, 189, 47, 0.4);
  }

  .active-dot.active-workspace {
    background: #8ec07c;
    color: #1d2021;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 9px;
  }

  .active-dot.scope-active {
    background: rgba(250, 189, 47, 0.25);
    color: #fabd2f;
    border: 1px solid rgba(250, 189, 47, 0.5);
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .scope-view-section {
    padding: 8px;
    border-bottom: 1px solid #282828;
    background: rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: 100%;
  }

  .scope-label {
    font-size: 10px;
    font-weight: 700;
    color: #7c6f64;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 0 4px 6px;
  }

  .scope-master-btn {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid transparent;
    transition: all 0.15s ease;
  }

  .scope-master-btn.active {
    background: rgba(250, 189, 47, 0.12);
    border-color: rgba(250, 189, 47, 0.35);
  }

  .cave-scope-sub {
    font-size: 10px;
    line-height: 1.45;
    margin-top: 3px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .scope-stat-line {
    color: #928374;
    font-size: 10px;
  }

  .scope-target-line {
    color: #ebdbb2;
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .scope-target-line .target-name {
    color: #fabd2f;
    font-weight: 600;
  }


  .mini-add-btn {
    background: #3c3836;
    border: 1px solid #504945;
    color: #ebdbb2;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
  }

  .mini-add-btn:hover {
    background: #fabd2f;
    color: #1d2021;
  }

  .caves-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* 臨時工作區專用卡片 */
  .temp-workspace-card {
    background: #282828;
    border: 1px dashed #d79921;
    border-radius: 6px;
    padding: 8px 10px;
    margin-bottom: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .temp-workspace-card.selected {
    background: rgba(215, 153, 33, 0.12);
    border-color: #fabd2f;
  }

  .temp-workspace-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .temp-pill-tag {
    font-size: 10px;
    font-weight: 700;
    color: #fabd2f;
    letter-spacing: 0.5px;
  }

  .btn-adopt-cave {
    background: #3c3836;
    border: 1px solid #d79921;
    color: #fabd2f;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
  }

  .btn-adopt-cave:hover {
    background: #fabd2f;
    color: #1d2021;
    border-color: #fabd2f;
  }

  .temp-folder-link {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    color: inherit;
    padding: 2px 0;
    cursor: pointer;
    text-align: left;
    width: 100%;
  }

  .cave-row-container {
    display: flex;
    align-items: center;
    border-radius: 6px;
    position: relative;
    transition: background 0.12s;
  }

  .cave-row-container:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .cave-row-container.selected {
    background: rgba(250, 189, 47, 0.12);
  }

  .cave-item-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: none;
    border: none;
    color: #ebdbb2;
    text-align: left;
    cursor: pointer;
    border-radius: 6px;
  }

  .cave-item-btn.active {
    background: rgba(250, 189, 47, 0.12);
  }

  .cave-icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .cave-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .name-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
  }

  .cave-name {
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex-shrink: 1;
  }

  .active-dot {
    font-size: 9px;
    background: #8ec07c;
    color: #1d2021;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .cave-sub {
    font-size: 10px;
    color: #928374;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cave-row-actions {
    display: none;
    align-items: center;
    gap: 2px;
    padding-right: 6px;
  }

  .cave-row-container:hover .cave-row-actions {
    display: flex;
  }

  .cave-opt-btn {
    background: none;
    border: none;
    color: #a89984;
    font-size: 11px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
  }

  .cave-opt-btn:hover {
    color: #fabd2f;
  }

  .cave-opt-btn.remove:hover {
    color: #fb4934;
  }

  .empty-caves-notice {
    text-align: center;
    padding: 24px 12px;
    color: #928374;
    font-size: 12px;
  }

  .btn-create-first {
    margin-top: 8px;
    background: #fabd2f;
    border: none;
    color: #1d2021;
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
  }

  .sidebar-bottom-block {
    border-top: 1px solid #282828;
    padding-bottom: 8px;
  }

  .clear-recent-text {
    background: none;
    border: none;
    color: #928374;
    font-size: 11px;
    cursor: pointer;
  }

  .clear-recent-text:hover {
    color: #ebdbb2;
  }

  .recent-scroll-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 8px;
  }

  .recent-mini-pill {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: none;
    border: none;
    color: #a89984;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 4px;
    text-align: left;
    cursor: pointer;
  }

  .recent-mini-pill:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #fabd2f;
  }

  .recent-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .recent-time {
    font-size: 10px;
    color: #7c6f64;
    margin-left: 6px;
    flex-shrink: 0;
  }

  /* 欄 2：樹狀檢索核心 */
  .vault-tree-center {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: #282828;
    border-right: 1px solid #3c3836;
  }

  .tree-top-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 16px;
    background: #232526;
    border-bottom: 1px solid #3c3836;
  }

  .search-input-wrapper {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-glyph {
    position: absolute;
    left: 10px;
    font-size: 13px;
    color: #928374;
    pointer-events: none;
  }

  .tree-search-input {
    width: 100%;
    background: #1d2021;
    border: 1px solid #3c3836;
    color: #ebdbb2;
    font-size: 13px;
    padding: 6px 30px 6px 32px;
    border-radius: 6px;
    outline: none;
    transition: border-color 0.15s;
  }

  .tree-search-input:focus {
    border-color: #fabd2f;
  }

  .clear-query-btn {
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    color: #928374;
    cursor: pointer;
    font-size: 12px;
  }

  .view-mode-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #1d2021;
    padding: 3px;
    border-radius: 6px;
    border: 1px solid #3c3836;
  }

  .v-tab {
    background: none;
    border: none;
    color: #a89984;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
  }

  .v-tab.active {
    background: #3c3836;
    color: #fabd2f;
    font-weight: 600;
  }

  .tree-scroll-viewport {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px;
  }

  .tree-loading-state,
  .tree-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 16px;
    color: #928374;
    font-size: 13px;
    gap: 8px;
  }

  .reset-search-link {
    background: none;
    border: none;
    color: #fabd2f;
    cursor: pointer;
    text-decoration: underline;
    font-size: 12px;
  }

  .tree-nodes-list {
    display: flex;
    flex-direction: column;
  }

  /* 扁平清單與分頁清單樣式 */
  .flat-files-list,
  .tabs-manage-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .flat-file-row,
  .tab-manage-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: #1d2021;
    border: 1px solid #3c3836;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s;
  }

  .flat-file-row:hover,
  .tab-manage-row:hover {
    background: #32302f;
  }

  .flat-file-row.selected {
    border-color: #fabd2f;
    background: rgba(250, 189, 47, 0.1);
  }

  .file-main-info,
  .tab-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .file-name,
  .tab-title {
    font-size: 13px;
    font-weight: 600;
    color: #ebdbb2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-sub-path,
  .tab-meta {
    font-size: 11px;
    color: #928374;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge-opened {
    font-size: 10px;
    background: rgba(131, 165, 152, 0.2);
    color: #83a598;
    padding: 1px 4px;
    border-radius: 3px;
  }

  .btn-open-direct {
    background: #3c3836;
    border: 1px solid #504945;
    color: #ebdbb2;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-open-direct:hover {
    background: #fabd2f;
    color: #1d2021;
  }

  .btn-tab-close {
    background: none;
    border: none;
    color: #928374;
    cursor: pointer;
    font-size: 12px;
    padding: 4px;
  }

  .btn-tab-close:hover {
    color: #fb4934;
  }

  /* 欄 3：卷軸即時參詳預覽 */
  .vault-preview-sidebar {
    width: 360px;
    background: #1d2021;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .preview-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid #282828;
  }

  .preview-glyph {
    font-size: 20px;
    color: #fabd2f;
  }

  .preview-meta-title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item-title {
    font-size: 13px;
    font-weight: 700;
    color: #ebdbb2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-path {
    font-size: 10px;
    color: #928374;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-stats-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 16px;
    background: #282828;
    font-size: 11px;
    color: #a89984;
    border-bottom: 1px solid #3c3836;
  }

  .preview-content-box {
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px;
    background: #181a1b;
  }

  .loading-preview {
    font-size: 12px;
    color: #fabd2f;
    text-align: center;
    padding: 32px 0;
  }

  .preview-code-block {
    margin: 0;
    font-family: inherit;
    font-size: 12px;
    line-height: 1.6;
    color: #d5c4a1;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .folder-preview-hint {
    padding: 24px 8px;
    color: #a89984;
    font-size: 12px;
    line-height: 1.6;
  }

  .preview-action-bar {
    padding: 12px 16px;
    background: #1d2021;
    border-top: 1px solid #282828;
  }

  .action-btn-main {
    width: 100%;
    background: #fabd2f;
    border: none;
    color: #1d2021;
    font-size: 12px;
    font-weight: 700;
    padding: 8px 14px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn-main:hover {
    background: #d79921;
  }

  .preview-empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 24px;
    text-align: center;
    color: #928374;
  }

  .empty-zen-icon {
    font-size: 36px;
    margin-bottom: 12px;
    opacity: 0.6;
  }

  .preview-empty-state h3 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: #ebdbb2;
  }

  .preview-empty-state p {
    font-size: 12px;
    line-height: 1.6;
    margin: 0 0 20px 0;
  }

  .zen-tip-box {
    background: rgba(250, 189, 47, 0.08);
    border: 1px dashed rgba(250, 189, 47, 0.3);
    border-radius: 6px;
    padding: 10px 14px;
    text-align: left;
  }

  .tip-sparkle {
    font-size: 11px;
    font-weight: 700;
    color: #fabd2f;
    display: block;
    margin-bottom: 4px;
  }

  .zen-tip-box p {
    margin: 0;
    font-size: 11px;
    color: #a89984;
  }

  /* 側欄拖曳調整條 */
  .drawer-resize-handle {
    position: absolute;
    top: 0;
    right: 0;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    background: transparent;
    transition: background 0.15s;
  }

  .drawer-resize-handle:hover,
  .drawer-resize-handle.dragging {
    background: #fabd2f;
  }

  /* 側欄模式 (drawer-view) 下的自適應佈局微調 */
  .vault-master-container.drawer-view .vault-preview-sidebar {
    display: none; /* 側欄模式下自動隱藏右欄預覽，專注樹狀瀏覽與操作 */
  }

  .vault-master-container.drawer-view .vault-caves-sidebar {
    width: 200px;
  }

  /* 心法按鈕特殊高亮 */
  .control-btn.help-btn {
    border-color: #fabd2f;
    color: #fabd2f;
    font-weight: 600;
  }

  .control-btn.help-btn:hover,
  .control-btn.help-btn.active {
    background: #fabd2f;
    color: #1d2021;
    box-shadow: 0 0 10px rgba(250, 189, 47, 0.4);
  }

  /* 拓印 Toast 浮動氣泡 */
  .vault-yank-toast {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #fabd2f;
    color: #1d2021;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 700;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    z-index: 1050;
    animation: toastPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
  }

  @keyframes toastPop {
    from {
      opacity: 0;
      transform: translate(-50%, 10px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }
  }

  /* 洞天心法說明彈窗 */
  .help-modal-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1060;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .help-modal-card {
    width: 90%;
    max-width: 680px;
    max-height: 82vh;
    background: #1d2021;
    border: 1px solid #d79921;
    box-shadow:
      0 16px 48px rgba(0, 0, 0, 0.8),
      0 0 20px rgba(250, 189, 47, 0.15);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .help-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    background: #282828;
    border-bottom: 1px solid #3c3836;
  }

  .help-title-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .help-icon {
    font-size: 24px;
    color: #fabd2f;
  }

  .help-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: #fabd2f;
  }

  .help-sub {
    font-size: 11px;
    color: #a89984;
  }

  .help-close-btn {
    background: none;
    border: none;
    color: #a89984;
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .help-close-btn:hover {
    color: #fb4934;
  }

  .help-body {
    flex: 1;
    overflow-y: auto;
    padding: 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .help-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sec-headline {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: #ebdbb2;
    border-left: 3px solid #fabd2f;
    padding-left: 8px;
  }

  .sec-desc {
    margin: 0;
    font-size: 12px;
    color: #a89984;
    line-height: 1.5;
  }

  .philosophy-card {
    background: #282828;
    border: 1px solid #3c3836;
    border-radius: 6px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
    line-height: 1.6;
    color: #d5c4a1;
  }

  .philosophy-card strong {
    color: #fabd2f;
  }

  .shortcut-table-wrapper {
    border: 1px solid #3c3836;
    border-radius: 6px;
    overflow: hidden;
  }

  .vim-guide-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    text-align: left;
  }

  .vim-guide-table th {
    background: #282828;
    color: #a89984;
    padding: 8px 12px;
    font-weight: 600;
    border-bottom: 1px solid #3c3836;
  }

  .vim-guide-table td {
    padding: 7px 12px;
    border-bottom: 1px solid #282828;
    color: #ebdbb2;
  }

  .vim-guide-table tr:hover td {
    background: rgba(255, 255, 255, 0.03);
  }

  kbd {
    display: inline-block;
    padding: 2px 6px;
    font-family: monospace;
    font-size: 11px;
    font-weight: 700;
    color: #fabd2f;
    background: #32302f;
    border: 1px solid #504945;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .help-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: #282828;
    border-top: 1px solid #3c3836;
  }

  .footer-hint {
    font-size: 11px;
    color: #928374;
  }

  .btn-got-it {
    background: #fabd2f;
    border: none;
    color: #1d2021;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 16px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-got-it:hover {
    background: #d79921;
  }
</style>
