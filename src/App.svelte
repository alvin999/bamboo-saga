<script lang="ts">
  import { onMount } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import type { AppState, TabItem, SupportedLanguage, CursorPosition, VimKeyOverrides, AlchemyCardConfig, LayoutConfig, NativeRoutePayload, AiProvider } from './types/tab';
  import { loadVaultState, saveVaultState, INITIAL_WELCOME_CONTENT } from './lib/storage/vault';
  import { refineNotes, stripOriginalContextQuotes } from './lib/ai/refinery';
  import type { RefineryMode } from './lib/ai/refinery';
  import { computeSideBySideDiff } from './lib/editor/diffEngine';
  import AiChunkReviewView from './components/AiChunkReviewView.svelte';
  import { buildReviewChunks, assembleFinalNote, type ReviewChunk, type ChunkDecision } from './lib/editor/chunkReview';

  import PrimaryTopBar from './components/PrimaryTopBar.svelte';
  import SecondaryAlchemyBar from './components/SecondaryAlchemyBar.svelte';
  import FileBrowserDrawer from './components/FileBrowserDrawer.svelte';
  import CodeEditor from './components/CodeEditor.svelte';
  import AiReviewBar from './components/AiReviewBar.svelte';
  import AiModal from './components/AiModal.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import FuzzyFindModal from './components/FuzzyFindModal.svelte';
  import LocalHistoryModal from './components/LocalHistoryModal.svelte';
  import PutLabelModal from './components/PutLabelModal.svelte';
  import SaveWithAiModal from './components/SaveWithAiModal.svelte';
  import AiInlinePrompt from './components/AiInlinePrompt.svelte';
  import AiChatDrawer from './components/AiChatDrawer.svelte';
  import TextToolsModal from './components/TextToolsModal.svelte';
  import { executeInlinePromptRefine } from './lib/ai/chatSession';

  import type { VaultFileEntry, RecentFileRecord, RecentFolderRecord } from './types/tab';
  import { 
    pickVaultFolder, 
    scanVaultFolder, 
    scanMultipleVaultFolders,
    readVaultFile, 
    writeVaultFile,
    backupVaultToOneDrive,
    getInitialRouteTarget,
    setWatchedFiles,
    loadCavesCache,
    saveCavesCache,
    type ExternalFileChangePayload
  } from './lib/storage/fsBridge';
  import { 
    loadRecentFiles, 
    recordFileOpened, 
    clearRecentFiles,
    loadRecentFolders,
    recordFolderOpened,
    togglePinFolder,
    removeRecentFolder
  } from './lib/storage/recent';
  import { recordSnapshot, pruneOldSnapshots } from './lib/storage/localHistory';
  import type { SnapshotReason } from './types/history';
  import { loadSecureKeys, saveSecureKeys, type SecurityMode } from './lib/security/keyVault';
  import { 
    extractDirectorySkeleton, 
    loadVaultCaves,
    loadCachedCavesFiles,
    getLastCavesScanTime,
    areCavesCacheEqual
  } from './lib/storage/vaultCaves';

  // 核心應用狀態
  let state: AppState = $state(loadVaultState());
  let isAiModalOpen = $state(false);
  let isAlchemyOpen = $state(false);
  let aiModalTab = $state<'refine' | 'keys' | 'keybindings' | 'onedrive' | 'settings' | 'layout' | 'system'>('refine');
  let isFileBrowserOpen = $state(false);
  let isFuzzyModalOpen = $state(false);
  let isLocalHistoryOpen = $state(false);
  let isPutLabelOpen = $state(false);
  let isSaveModalOpen = $state(false);
  let isTextToolsOpen = $state(false);
  let isExportOpen = $state(false);
  let fuzzyInitialMode = $state<'fuzzy' | 'ai'>('fuzzy');
  let showDiffView = $state(false);
  let smearEnabled = $state(true);
  let isSavingIndicator = $state(true);
  let isRefining = $state(false); // AI 提煉中的動態過場狀態
  let reviewChunks = $state<ReviewChunk[]>([]); // 逐段審核的對照段落卡片清單
  let isInlineAiPromptOpen = $state(false); // 行內浮動指令框 (Ctrl+I)
  let isAiChatDrawerOpen = $state(false); // AI 參謀問道抽屜 (Ctrl+Shift+I)
  let isInlineExecuting = $state(false); // 行內修煉執行狀態
  let currentSelectionText = $state(''); // 編輯器目前選取的文字片段
  let inlinePromptCoords = $state<{ x: number; y: number } | null>(null); // 行內指令框精準定位座標
  let codeEditorRef = $state<any>(null); // 編輯器實例引用（供計算段落座標）
  let editorApi = $state<{ getParagraphScreenCoords: () => { x: number; y: number } | null; scrollToMakeRoom: () => void } | null>(null); // 編輯器 API Handle

  // 4.2 / 5.3 竹林靜心 (True Zen Mode) 專注模式與打字機模式狀態
  let isZenFocusMode = $state(false);

  function toggleZenFocusMode(explicit?: boolean) {
    isZenFocusMode = explicit !== undefined ? explicit : !isZenFocusMode;
    showToast(isZenFocusMode ? '🎋 已進入竹林靜心（按 Esc 或 F11 退出）' : '🍃 已退出竹林靜心');
  }

  function toggleTypewriterMode() {
    if (!state.layoutConfig) {
      state.layoutConfig = {
        workbenchWidth: 'zen',
        autoDiffOnAi: true,
        scrollSync: true,
        fontSize: '14px',
        smearCursor: true,
        typewriterMode: true,
        zenFocusMode: false,
      };
    } else {
      state.layoutConfig.typewriterMode = !state.layoutConfig.typewriterMode;
    }
    saveVaultState(state, true);
    showToast(state.layoutConfig.typewriterMode ? '📜 已開啟打字機置中捲動模式' : '📜 已關閉打字機置中捲動模式');
  }

  // 外部檔案衝突協調狀態
  interface FileConflictInfo {
    tabId: string;
    tabTitle: string;
    filePath: string;
    externalContent: string;
  }
  let activeConflict = $state<FileConflictInfo | null>(null);

  // 本地歷史自動快照狀態
  let historyDebounceTimer: number | null = null;
  const lastRecordedSnapshotMap = new Map<string, string>();

  // OneDrive 背景自動鏡像備份計時狀態
  let lastAutoBackupTime = Date.now();

  async function performSilentOneDriveBackup() {
    if (!state.autoOneDriveBackup || !state.selectedOneDrivePath) return;
    try {
      const safeTabs = state.tabs || [];
      const markdownFiles = safeTabs.map((t, idx) => ({
        file_name: t.title || `藥帖_${idx + 1}`,
        content: t.content,
      }));
      const vaultJson = JSON.stringify({
        exportedAt: new Date().toISOString(),
        tabCount: safeTabs.length,
        tabs: safeTabs,
      }, null, 2);

      await backupVaultToOneDrive({
        onedriveFolderPath: state.selectedOneDrivePath,
        vaultJson,
        markdownFiles,
        enablePeriodic: state.enablePeriodicBackup ?? true,
      });
      lastAutoBackupTime = Date.now();
    } catch (err) {
      console.warn('[AutoBackup] 靜默背景備份失敗:', err);
    }
  }

  // 諸洞天萬卷全覽：跨洞天檔案快取池（冷啟動自本機持久化空間秒開載入）
  const initialCavesCache = loadCachedCavesFiles();
  let cavesFileCache = $state<Record<string, VaultFileEntry[]>>(initialCavesCache);
  let lastCavesScanTime = getLastCavesScanTime();
  const CAVES_CACHE_TTL_MS = 3 * 60 * 1000; // 3 分鐘 TTL 快取時效

  // 本機資料夾與最近開啟狀態（優先使用快取保底以防初次開啟白屏閃爍）
  let vaultFiles = $state<VaultFileEntry[]>(
    state.vaultFolderPath && initialCavesCache[state.vaultFolderPath]
      ? initialCavesCache[state.vaultFolderPath]
      : []
  );
  let recentFiles = $state<RecentFileRecord[]>(loadRecentFiles());
  let recentFolders = $state<RecentFolderRecord[]>(loadRecentFolders());
  let isScanningFolder = $state(false);
  let isScanningAllCaves = $state(false);

  // 跨平台檔案拖曳 (Drag & Drop) 狀態
  let isDraggingOver = $state(false);
  let dragCounter = 0;

  // 當前作用中分頁
  const activeTab = $derived(
    state.tabs.find((t) => t.id === state.activeTabId) || state.tabs[0]
  );

  // AI 煉丹前 vs 煉丹後的 Git Diff 比對結果
  const aiDiffResult = $derived.by(() => {
    if (!activeTab?.preAiSnapshot || !activeTab.isAiDraft) {
      return { rows: [], additions: 0, deletions: 0, hasChanges: false };
    }
    return computeSideBySideDiff(activeTab.preAiSnapshot.content, activeTab.content);
  });

  // 精煉本機洞天目錄骨架（供 AI 推論時精準鎖定已存在的資料夾，嚴格限額 Token，聚合所有洞天檔案）
  const directorySkeleton = $derived.by(() => {
    const allScannedFiles = Object.values(cavesFileCache).flat();
    const sourceFiles = allScannedFiles.length > 0 ? allScannedFiles : vaultFiles;
    return extractDirectorySkeleton(sourceFiles, loadVaultCaves(state.vaultFolderPath));
  });

  // 5.4 WikiLinks 雙向連結候選清單（聚合所有開啟中分頁與洞天實體檔案）
  const wikiLinkCandidates = $derived.by(() => {
    const list: Array<{ title: string; filePath?: string }> = [];
    const seen = new Set<string>();

    for (const tab of state.tabs) {
      if (tab.title && !seen.has(tab.title)) {
        seen.add(tab.title);
        list.push({ title: tab.title, filePath: tab.filePath });
      }
    }

    const allScanned = Object.values(cavesFileCache).flat();
    const sourceFiles = allScanned.length > 0 ? allScanned : vaultFiles;
    for (const f of sourceFiles) {
      if (f.name && !seen.has(f.name)) {
        seen.add(f.name);
        list.push({ title: f.name, filePath: f.path });
      }
    }

    return list;
  });

  // 5.4 雙向連結開卷跳轉 (WikiLink Navigation)
  async function handleOpenWikiLink(targetName: string) {
    if (!targetName.trim()) return;
    const cleanTarget = targetName.trim();
    const cleanTargetNoExt = cleanTarget.replace(/\.(md|txt)$/i, '');

    // 1. 先在現有分頁中比對
    const matchedTab = state.tabs.find((t) => {
      const tabTitle = t.title.trim();
      const tabTitleNoExt = tabTitle.replace(/\.(md|txt)$/i, '');
      return tabTitle === cleanTarget || tabTitleNoExt === cleanTargetNoExt;
    });

    if (matchedTab) {
      selectTab(matchedTab.id);
      showToast(`📑 已跳轉至藥帖：${matchedTab.title}`);
      return;
    }

    // 2. 在洞天檔案庫中比對實體檔案
    const allScanned = Object.values(cavesFileCache).flat();
    const sourceFiles = allScanned.length > 0 ? allScanned : vaultFiles;
    const matchedFile = sourceFiles.find((f) => {
      const fileName = f.name.trim();
      const fileNameNoExt = fileName.replace(/\.(md|txt)$/i, '');
      return fileName === cleanTarget || fileNameNoExt === cleanTargetNoExt;
    });

    if (matchedFile && matchedFile.path) {
      await handleDirectOpenFile(matchedFile.path);
      return;
    }

    // 3. 若均不存在，靈感即時延展：自動建立新藥帖並開卷
    const newTitle = cleanTarget.endsWith('.md') ? cleanTarget : `${cleanTarget}.md`;
    const newTab: TabItem = {
      id: `tab-wiki-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: newTitle,
      content: `# ${cleanTargetNoExt}\n\n> 來自 [[${activeTab?.title || '藥帖'}]] 的雙向靈感衍生...\n\n`,
      language: 'markdown',
      cursor: { line: 5, ch: 0 },
      lastModified: Date.now(),
      preAiSnapshot: null,
      isAiDraft: false,
      deck: 'primary',
      isDirty: true,
    };
    state.tabs.push(newTab);
    state.activeTabId = newTab.id;
    saveVaultState(state, true);
    showToast(`🎋 雙向開卷：已納入新藥帖「${newTitle}」`);
  }

  // 當狀態有任何細微變更時（包含 VIM 模式切換、分頁內容等），建立快照並觸發毫秒級持久化
  $effect(() => {
    const snapshot = $state.snapshot(state);
    saveVaultState(snapshot);
  });

  // 即時將所有已連結實體檔案的分頁路徑同步至 Rust Watcher 監聽器
  $effect(() => {
    const filePaths = state.tabs
      .map((t) => t.filePath)
      .filter(Boolean) as string[];
    setWatchedFiles(filePaths);
  });

  // 直接開啟實體檔案並建立/切換至分頁
  async function handleDirectOpenFile(filePath: string) {
    if (!filePath) return;
    const normalized = filePath.replace(/\\/g, '/');
    const existing = state.tabs.find((t) => t.filePath && t.filePath.replace(/\\/g, '/') === normalized);
    if (existing) {
      selectTab(existing.id);
      showToast(`📑 已切換至已開啟的藥帖：${existing.title}`);
      return;
    }

    try {
      const content = await readVaultFile(filePath);
      const fileName = normalized.split('/').pop() || '未命名藥帖';
      const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : '';

      const newTab: TabItem = {
        id: `tab-native-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: fileName,
        content,
        language: detectLanguageByExtension(ext),
        cursor: { line: 1, ch: 0 },
        lastModified: Date.now(),
        preAiSnapshot: null,
        isAiDraft: false,
        deck: 'primary',
        filePath,
        isDirty: false,
      };

      state.tabs.push(newTab);
      state.activeTabId = newTab.id;
      showToast(`🎋 已納入新簡：${fileName}`);

      recentFiles = recordFileOpened({
        path: filePath,
        title: fileName,
        preview: content.slice(0, 150),
        language: newTab.language,
        isLocalFile: true,
      });
    } catch (err: any) {
      showToast(`⚠️ 開啟檔案失敗: ${err.message || err}`);
    }
  }

  // 處理原生路由傳入（檔案或資料夾）
  async function handleNativeRoute(payload: NativeRoutePayload) {
    if (!payload || !payload.path) return;
    if (payload.is_directory) {
      state.vaultFolderPath = payload.path;
      recentFolders = recordFolderOpened(payload.path);
      saveVaultState(state, true);
      await refreshVaultFiles(payload.path);
      const folderName = payload.path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || payload.path;
      showToast(`📜 已切換至藥卷庫：${folderName}`);
    } else {
      await handleDirectOpenFile(payload.path);
    }
  }

  // 全域拖曳事件處理
  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounter++;
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
      isDraggingOver = true;
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      isDraggingOver = false;
      dragCounter = 0;
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = false;
    dragCounter = 0;

    if (!e.dataTransfer || e.dataTransfer.files.length === 0) return;

    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      // 若在桌面 WebView 環境，可讀取原生路徑
      const nativePath = (file as any).path;
      if (nativePath) {
        await handleDirectOpenFile(nativePath);
      } else {
        // 瀏覽器純文字 Fallback
        const text = await file.text();
        const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() || '' : '';
        const newTab: TabItem = {
          id: `tab-drop-${Date.now()}-${i}`,
          title: file.name,
          content: text,
          language: detectLanguageByExtension(ext),
          cursor: { line: 1, ch: 0 },
          lastModified: file.lastModified || Date.now(),
          preAiSnapshot: null,
          isAiDraft: false,
          deck: 'primary',
          isDirty: false,
        };
        state.tabs.push(newTab);
        state.activeTabId = newTab.id;
        showToast(`🎋 已納入新簡：${file.name}`);
      }
    }
  }

  onMount(() => {
    // 監聽視窗關閉或重載，強制立即同步寫入並執行關閉前鏡像備份
    const handleBeforeUnload = () => {
      saveVaultState(state, true);
      if (state.autoOneDriveBackup && state.selectedOneDrivePath) {
        performSilentOneDriveBackup();
      }
    };

    // 1. 冷啟動路由檢查：若是開機直接由右鍵或檔案關聯開啟，主動載入目標
    getInitialRouteTarget().then((target) => {
      if (target) {
        handleNativeRoute(target);
      }
    });

    // 2. 熱傳遞單一實例（Single-Instance）事件監聽
    let unlistenNativeRoute: (() => void) | null = null;
    listen<NativeRoutePayload>('native-route-open', (event) => {
      if (event.payload) {
        handleNativeRoute(event.payload);
      }
    }).then((unlisten) => {
      unlistenNativeRoute = unlisten;
    });

    // 2.1 外部檔案變更即時熱重載監聽 (File Watcher 事件)
    let unlistenFileWatch: (() => void) | null = null;
    listen<ExternalFileChangePayload>('vault-file-changed-externally', (event) => {
      if (event.payload) {
        handleExternalFileChanged(event.payload);
      }
    }).then((unlisten) => {
      unlistenFileWatch = unlisten;
    });

    // 2.2 冷啟動秒載原生磁碟快取（突破 LocalStorage 5MB 配額限制，提供 8 萬筆以上毫秒級秒開）
    loadCavesCache().then(({ cache, timestamp }) => {
      if (cache && Object.keys(cache).length > 0) {
        cavesFileCache = cache;
        if (timestamp) lastCavesScanTime = timestamp;
        if (state.vaultFolderPath && cache[state.vaultFolderPath] && vaultFiles.length === 0) {
          vaultFiles = cache[state.vaultFolderPath];
        }
      }

      // 若先前已連結過資料夾，自動重新整理檔案清單並記錄到常用資料夾
      if (state.vaultFolderPath) {
        recentFolders = recordFolderOpened(state.vaultFolderPath);
        refreshVaultFiles(state.vaultFolderPath);
        refreshAllCaves(); // 若快取在 3 分鐘有效期內直接命中，絕不重跑磁碟
      }
    });

    // 3. 從本機安全保險庫載入加密金鑰 (支援方案 3 與方案 2+1，100% 本機)
    loadSecureKeys().then((keys) => {
      if (keys.groqKey) state.groqApiKey = keys.groqKey;
      if (keys.geminiKey) state.geminiApiKey = keys.geminiKey;
      if (keys.customKey !== undefined) state.customApiKey = keys.customKey;
      if (keys.customEndpoint) state.customEndpoint = keys.customEndpoint;
      if (keys.selectedModel) state.selectedAiModel = keys.selectedModel;
      if (keys.selectedModelId) state.selectedAiModelId = keys.selectedModelId;
      if (keys.securityMode) state.securityMode = keys.securityMode;
    });

    // 背景定時鏡像備份輪詢（每 60 秒檢查一次間隔）
    const backupIntervalTimer = window.setInterval(() => {
      if (state.autoOneDriveBackup && state.selectedOneDrivePath) {
        const intervalMs = (state.oneDriveBackupIntervalMinutes || 30) * 60 * 1000;
        if (Date.now() - lastAutoBackupTime >= intervalMs) {
          performSilentOneDriveBackup();
        }
      }
    }, 60 * 1000);

    // 全域快速鍵：
    // Ctrl+K: AI 煉丹爐
    // Ctrl+B: 檔案總管抽屜
    // Ctrl+P / Cmd+P: 全域 Fuzzy Find 模糊跳轉與 AI 助查
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      // F11 或 Alt+Z: 切換竹林靜心 (True Zen Mode)；Esc: 退出靜心模式
      if (e.key === 'F11' || (e.altKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        toggleZenFocusMode();
        return;
      } else if (isZenFocusMode && e.key === 'Escape') {
        e.preventDefault();
        toggleZenFocusMode(false);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        fuzzyInitialMode = 'fuzzy';
        isFuzzyModalOpen = !isFuzzyModalOpen;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        isAlchemyOpen = !isAlchemyOpen;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        isFileBrowserOpen = !isFileBrowserOpen;
      } else if (e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        isLocalHistoryOpen = !isLocalHistoryOpen;
      } else if (e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        isPutLabelOpen = !isPutLabelOpen;
      } else if (e.altKey && e.key.toLowerCase() === 'i') {
        // Alt+I: 喚起 AI 參謀問道抽屜（與 Alt+H, Alt+L 一致，避開 Edge DevTools 原生衝突）
        e.preventDefault();
        isAiChatDrawerOpen = !isAiChatDrawerOpen;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        // Ctrl+J: 常用抽屜面板快捷鍵
        e.preventDefault();
        isAiChatDrawerOpen = !isAiChatDrawerOpen;
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        // Ctrl+Shift+T: 喚起行處理解藥包
        e.preventDefault();
        e.stopPropagation();
        isTextToolsOpen = !isTextToolsOpen;
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        // Ctrl+Shift+E: 快速開啟單一藥帖匯出選單
        e.preventDefault();
        e.stopPropagation();
        isExportOpen = !isExportOpen;
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          isAiChatDrawerOpen = !isAiChatDrawerOpen;
        } else {
          // 精確透過 CodeEditor 註冊的 API Handle 取得游標當前段落正下方的幾何座標
          const coords = editorApi?.getParagraphScreenCoords() || codeEditorRef?.getParagraphScreenCoords();
          inlinePromptCoords = coords || null;
          isInlineAiPromptOpen = !isInlineAiPromptOpen;
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleGlobalKeydown, true);

    return () => {
      if (unlistenNativeRoute) unlistenNativeRoute();
      if (unlistenFileWatch) unlistenFileWatch();
      window.clearInterval(backupIntervalTimer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleGlobalKeydown, true);
    };
  });

  // 記錄前端近期主動寫入實體磁碟的時間戳（以防 File Watcher 反向誤判為外部程式修改而引發無限熱重載迴圈）
  const recentSelfWrites = new Map<string, number>();

  function normalizeNewlines(str: string): string {
    return str ? str.replace(/\r\n/g, '\n') : '';
  }

  // 外部檔案變更與衝突協調處理
  function handleExternalFileChanged(payload: ExternalFileChangePayload) {
    if (!payload || !payload.path) return;
    const normalized = payload.path.replace(/\\/g, '/').toLowerCase();
    const targetTab = state.tabs.find(
      (t) => t.filePath && t.filePath.replace(/\\/g, '/').toLowerCase() === normalized
    );
    if (!targetTab) return;

    // 核心防護 1：正規化換行符比對，若內容實質一致，完全無需處理
    if (normalizeNewlines(targetTab.content) === normalizeNewlines(payload.content)) {
      return;
    }

    // 核心防護 2：若此檔案在 2.5 秒內剛由自己寫入，忽略 Watcher 回音事件避免無限循環
    const lastSelfWrite = recentSelfWrites.get(normalized) || 0;
    if (Date.now() - lastSelfWrite < 2500) {
      return;
    }

    // 1. 若分頁處於潔淨狀態 (未髒污，沒有尚未寫入磁碟的修改)：直接自動熱重載
    if (!targetTab.isDirty) {
      targetTab.content = payload.content;
      targetTab.lastModified = Date.now();
      saveVaultState(state, true);
      showToast(`⚡ 外部程式已修改，自動熱重載：${targetTab.title}`);
      return;
    }

    // 2. 若分頁處於髒污狀態（有尚未落盤的修改），保護使用者內容，彈出衝突協調提示
    activeConflict = {
      tabId: targetTab.id,
      tabTitle: targetTab.title,
      filePath: payload.path,
      externalContent: payload.content,
    };
  }

  function resolveConflictReload() {
    if (!activeConflict) return;
    const tab = state.tabs.find((t) => t.id === activeConflict!.tabId);
    if (tab) {
      tab.content = activeConflict.externalContent;
      tab.isDirty = false;
      tab.lastModified = Date.now();
      saveVaultState(state, true);
      showToast(`🔄 已重新載入外部最新版本：${tab.title}`);
    }
    activeConflict = null;
  }

  function resolveConflictKeep() {
    if (!activeConflict) return;
    const tab = state.tabs.find((t) => t.id === activeConflict!.tabId);
    if (tab) {
      syncToDisk(tab, true);
      showToast(`🛡️ 已保留廣零散草稿並覆蓋實體檔案：${tab.title}`);
    }
    activeConflict = null;
  }

  function detectLanguageByExtension(ext: string): SupportedLanguage {
    switch (ext.toLowerCase()) {
      case 'md':
      case 'markdown':
        return 'markdown';
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
        return 'javascript';
      case 'py':
        return 'python';
      case 'json':
        return 'json';
      case 'sql':
        return 'sql';
      default:
        return 'plaintext';
    }
  }

  async function handlePickFolder() {
    try {
      const folder = await pickVaultFolder();
      if (folder) {
        state.vaultFolderPath = folder;
        recentFolders = recordFolderOpened(folder);
        saveVaultState(state, true);
        await refreshVaultFiles(folder);
        refreshAllCaves(undefined, true);
        showToast(`📁 已連接電腦資料夾：${folder.split(/[/|\\]/).pop()}`);
      }
    } catch (err: any) {
      showToast(`⚠️ 連接資料夾失敗: ${err.message || err}`);
    }
  }

  async function handleSwitchFolder(folderPath: string) {
    if (!folderPath || folderPath === state.vaultFolderPath) return;
    try {
      state.vaultFolderPath = folderPath;
      recentFolders = recordFolderOpened(folderPath);
      saveVaultState(state, true);
      await refreshVaultFiles(folderPath);
      refreshAllCaves(undefined, true);
      const folderName = folderPath.split(/[/|\\]/).filter(Boolean).pop() || folderPath;
      showToast(`📂 已切換至：${folderName}`);
    } catch (err: any) {
      showToast(`⚠️ 切換資料夾失敗: ${err.message || err}`);
    }
  }

  function handleTogglePinFolder(folderPath: string) {
    recentFolders = togglePinFolder(folderPath);
  }

  function handleRemoveRecentFolder(folderPath: string) {
    recentFolders = removeRecentFolder(folderPath);
    showToast('🗑️ 已從歷史清單移除');
  }

  async function refreshVaultFiles(folderPath: string) {
    if (!folderPath) return;
    isScanningFolder = true;
    try {
      const files = await scanVaultFolder(folderPath);
      vaultFiles = files;
    } catch (err) {
      console.error('[App] Failed to scan vault folder:', err);
    } finally {
      isScanningFolder = false;
    }
  }

  /**
   * 背景非同步掃描所有藏卷洞天（具備母子資料夾去重優化、TTL 快取節流與靜默防閃爍）
   * @param targetCavePaths 指定掃描的洞天路徑清單（若未指定則讀取所有授權洞天）
   * @param force 是否強制略過 TTL 檢查立即重掃硬碟（手動點選重整、增刪洞天時傳入 true）
   */
  async function refreshAllCaves(targetCavePaths?: string[], force = false) {
    const hasExistingCache = Object.keys(cavesFileCache).length > 0;
    const now = Date.now();

    // 方案 1: TTL 節流機制。若非強制掃描、快取已有資料且尚未過期，直接沿用現有記憶體快取秒開
    if (!force && hasExistingCache && (now - lastCavesScanTime < CAVES_CACHE_TTL_MS)) {
      return;
    }

    isScanningAllCaves = true;
    try {
      let paths = targetCavePaths;
      if (!paths || paths.length === 0) {
        const caves = loadVaultCaves(state.vaultFolderPath);
        paths = caves.map((c) => c.path);
        if (state.vaultFolderPath && !paths.includes(state.vaultFolderPath)) {
          paths.unshift(state.vaultFolderPath);
        }
      }

      if (paths.length > 0) {
        const cacheMap = await scanMultipleVaultFolders(paths);

        // 方案 2: 靜默防閃爍。比對新舊快取是否有實質內容變動
        const isIdentical = areCavesCacheEqual(cavesFileCache, cacheMap);
        if (!isIdentical) {
          cavesFileCache = cacheMap;
          // 方案 3: 本機持久化快取（原生磁碟快取，突破 5MB 配額限制）
          saveCavesCache(cacheMap);
        } else {
          // 檔案內容無變動，僅刷新持久化時間戳，不重設 Svelte 物件參照以防止畫面樹狀節點重新計算閃爍
          saveCavesCache(cavesFileCache);
        }

        lastCavesScanTime = now;

        // 若當前工作目錄在快取中，同步保險更新 vaultFiles
        if (state.vaultFolderPath && cacheMap[state.vaultFolderPath]) {
          vaultFiles = cacheMap[state.vaultFolderPath];
        }
      }
    } catch (err) {
      console.warn('[App] 跨洞天背景批次掃描失敗：', err);
    } finally {
      isScanningAllCaves = false;
    }
  }

  async function handleOpenVaultFile(file: VaultFileEntry) {
    // 1. 檢查是否已經開啟為 Tab
    const existing = state.tabs.find((t) => t.filePath === file.path);
    if (existing) {
      selectTab(existing.id);
      return;
    }

    // 2. 讀取實體檔案內容
    try {
      const content = await readVaultFile(file.path);
      const newTab: TabItem = {
        id: `tab-vault-${Date.now()}`,
        title: file.name,
        content,
        language: detectLanguageByExtension(file.extension),
        cursor: { line: 1, ch: 0 },
        lastModified: file.modified * 1000 || Date.now(),
        preAiSnapshot: null,
        isAiDraft: false,
        deck: 'primary',
        filePath: file.path,
        isDirty: false,
      };

      state.tabs.push(newTab);
      state.activeTabId = newTab.id;
      showToast(`📄 已載入檔案：${file.name}`);

      // 3. 記錄進最近開啟
      recentFiles = recordFileOpened({
        path: file.path,
        title: file.name,
        preview: content.slice(0, 150),
        language: newTab.language,
        isLocalFile: true,
      });
    } catch (err: any) {
      showToast(`⚠️ 開啟檔案失敗: ${err.message || err}`);
    }
  }

  function handleClearRecent() {
    clearRecentFiles();
    recentFiles = [];
    showToast('🕒 已清除最近開啟記錄');
  }

  // 分頁操作
  function selectTab(id: string) {
    state.activeTabId = id;
    showDiffView = false;
    const target = state.tabs.find((t) => t.id === id);
    if (target) {
      recentFiles = recordFileOpened({
        path: target.filePath || target.id,
        title: target.title,
        preview: target.content.slice(0, 150),
        language: target.language,
        isLocalFile: !!target.filePath,
      });
    }
  }

  function addTab() {
    const newIndex = state.tabs.length + 1;
    const newTab: TabItem = {
      id: `tab-${Date.now()}`,
      title: `素簡${newIndex}`,
      content: '',
      language: 'plaintext',
      cursor: { line: 1, ch: 0 },
      lastModified: Date.now(),
      preAiSnapshot: null,
      isAiDraft: false,
      deck: 'primary',
    };
    state.tabs.push(newTab);
    state.activeTabId = newTab.id;
  }

  function handleCreateDemoTab() {
    const demoTab: TabItem = {
      id: `tab-demo-${Date.now()}`,
      title: '藥帖·煉丹渲染展示手稿',
      content: INITIAL_WELCOME_CONTENT,
      language: 'markdown',
      cursor: { line: 1, ch: 0 },
      lastModified: Date.now(),
      preAiSnapshot: null,
      isAiDraft: false,
      deck: 'primary',
    };
    state.tabs.push(demoTab);
    state.activeTabId = demoTab.id;
    showToast('🎋 已建立「藥帖·煉丹渲染展示手稿」');
  }

  function closeTab(id: string) {
    if (state.tabs.length <= 1) return;
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx !== -1) {
      state.tabs.splice(idx, 1);
      if (state.activeTabId === id) {
        state.activeTabId = state.tabs[Math.max(0, idx - 1)].id;
      }
    }
  }

  function renameTab(id: string, newTitle: string) {
    const target = state.tabs.find((t) => t.id === id);
    if (target) {
      target.title = newTitle;
    }
  }

  // 分頁在主頂欄與次頂欄之間自由移動
  function handleMoveTabDeck(tabId: string, deck: 'primary' | 'secondary') {
    const target = state.tabs.find((t) => t.id === tabId);
    if (target) {
      const oldDeck = target.deck || 'primary';
      target.deck = deck;
      if (oldDeck !== deck) {
        // 移入不同甲板時，將該分頁置於陣列末端（即該甲板最後一項）
        const fromIndex = state.tabs.findIndex((t) => t.id === tabId);
        if (fromIndex !== -1) {
          const updated = [...state.tabs];
          const [moved] = updated.splice(fromIndex, 1);
          updated.push(moved);
          state.tabs = updated;
        }
        showToast(deck === 'secondary' ? '🔥 藥帖已移入「次頂 AI 煉丹欄」' : '📜 藥帖已移回「主頂檔案欄」');
      }
      saveVaultState(state, true);
    }
  }

  // 拖曳重排分頁順序（支援跨甲板拖動定位與 Deck 自動切換）
  function handleReorderTabs(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const fromIndex = state.tabs.findIndex((t) => t.id === sourceId);
    const toIndex = state.tabs.findIndex((t) => t.id === targetId);
    if (fromIndex !== -1 && toIndex !== -1) {
      const sourceTab = state.tabs[fromIndex];
      const targetTab = state.tabs[toIndex];
      const targetDeck = targetTab.deck || 'primary';
      const sourceDeck = sourceTab.deck || 'primary';

      const updated = [...state.tabs];
      const [moved] = updated.splice(fromIndex, 1);

      // 若跨甲板拖動至目標分頁，自動承繼目標層級並給予反饋
      if (sourceDeck !== targetDeck) {
        moved.deck = targetDeck;
        showToast(targetDeck === 'secondary' ? '🔥 藥帖已移入「次頂 AI 煉丹欄」' : '📜 藥帖已移回「主頂檔案欄」');
      }

      // 重新取得 splice 後目標分頁之精確 index，避免 offset 偏差
      const newToIndex = updated.findIndex((t) => t.id === targetId);
      if (newToIndex !== -1) {
        updated.splice(newToIndex, 0, moved);
      } else {
        updated.splice(toIndex, 0, moved);
      }
      state.tabs = updated;
      saveVaultState(state, true);
    }
  }

  // 實體檔案磁碟同步
  let fileSaveTimer: number | null = null;
  function syncToDisk(tab: TabItem, immediate = false) {
    if (!tab.filePath) return;
    const doSync = async () => {
      try {
        const normalized = tab.filePath!.replace(/\\/g, '/').toLowerCase();
        recentSelfWrites.set(normalized, Date.now());
        await writeVaultFile(tab.filePath!, tab.content);
        tab.isDirty = false;
      } catch (err) {
        console.error('[App] Failed to auto-sync to disk:', err);
      }
    };

    if (immediate) {
      if (fileSaveTimer) clearTimeout(fileSaveTimer);
      doSync();
      return;
    }

    if (fileSaveTimer) clearTimeout(fileSaveTimer);
    fileSaveTimer = window.setTimeout(doSync, 500);
  }

  // 本地歷史自動快照排程機制 (編輯暫停自動快照)
  function triggerAutoSnapshot(tab: TabItem, reason: SnapshotReason, label?: string, summary?: string) {
    if (!tab) return;
    const fileKey = tab.filePath || tab.id;
    const lastContent = lastRecordedSnapshotMap.get(fileKey);
    // 若內容與上個快照完全相同且無自訂標籤，則不重複生成
    if (lastContent === tab.content && !label && reason === 'typing') return;

    lastRecordedSnapshotMap.set(fileKey, tab.content);
    recordSnapshot({
      fileKey,
      title: tab.title,
      content: tab.content,
      reason,
      label,
      summary,
    });
    // 維護本地快照數量（避免空間過度累積）
    pruneOldSnapshots(fileKey, 80);
  }

  // 編輯器內容與游標變更
  function handleContentChange(newContent: string) {
    if (activeTab) {
      activeTab.content = newContent;
      activeTab.lastModified = Date.now();
      if (activeTab.filePath) {
        activeTab.isDirty = true;
        syncToDisk(activeTab);
      }

      // 15 秒輸入停止防抖自動快照 (typing pause snapshot)
      if (historyDebounceTimer) clearTimeout(historyDebounceTimer);
      historyDebounceTimer = window.setTimeout(() => {
        if (activeTab) {
          triggerAutoSnapshot(activeTab, 'typing');
        }
      }, 15000);
    }
  }

  // 另存新檔觸發 (Ctrl+Shift+S / 未命名草稿 Ctrl+S)
  function handleSaveAs() {
    if (activeTab) {
      isSaveModalOpen = true;
    }
  }

  // 行處理解藥包套用
  function handleApplyTextTools(newContent: string, reasonDesc: string) {
    if (activeTab) {
      activeTab.content = newContent;
      activeTab.lastModified = Date.now();
      if (activeTab.filePath) {
        activeTab.isDirty = true;
        syncToDisk(activeTab);
      }
      saveVaultState(state, true);
      triggerAutoSnapshot(activeTab, 'typing');
      showToast(`✅ ${reasonDesc || '已成功套用文字處理'}`);
    }
  }

  // 確認寫入本機實體檔案並綁定分頁
  async function handleConfirmSaveAs(targetDir: string, fileName: string) {
    if (!activeTab) return;
    const cleanDir = targetDir.replace(/\\+/g, '/').replace(/\/+$/, '');
    const cleanFile = fileName.replace(/^[/\\]+/, '');
    const fullPath = `${cleanDir}/${cleanFile}`;
    const normalized = fullPath.replace(/\\/g, '/').toLowerCase();
    recentSelfWrites.set(normalized, Date.now());

    await writeVaultFile(fullPath, activeTab.content);
    activeTab.filePath = fullPath;
    activeTab.title = fileName;
    activeTab.isDirty = false;

    // 記錄至最近開啟檔案清單
    recordFileOpened({
      path: fullPath,
      title: fileName,
      preview: activeTab.content.slice(0, 150),
      language: activeTab.language,
      isLocalFile: true,
    });
    recentFiles = loadRecentFiles();

    // 記錄儲存目錄至最近常用資料夾
    recordFolderOpened(targetDir);
    recentFolders = loadRecentFolders();

    saveVaultState(state, true);
    triggerAutoSnapshot(activeTab, 'save');
    showToast(`💾 檔案已成功歸檔至「${fileName}」！`);
  }

  // 手動存檔觸發 (Ctrl+S / Vim :w)
  function handleManualSave() {
    if (activeTab) {
      if (activeTab.filePath) {
        syncToDisk(activeTab, true);
        showToast('💾 實體檔案已成功保存至磁碟！');
        triggerAutoSnapshot(activeTab, 'save');
      } else {
        // 未綁定實體路徑之散帖，直覺喚起 AI 智薦歸檔對話盒
        handleSaveAs();
      }
    }
  }

  // 本地歷史一鍵還原 (Revert)
  function handleRevertHistory(revertedContent: string) {
    if (!activeTab) return;
    // 還原前先將當前狀態記錄快照，保障 100% 不遺失
    triggerAutoSnapshot(activeTab, 'save', undefined, '還原前自動留底');
    activeTab.content = revertedContent;
    activeTab.lastModified = Date.now();
    if (activeTab.filePath) {
      activeTab.isDirty = true;
      syncToDisk(activeTab, true);
    }
    saveVaultState(state, true);
    showToast('⏪ 已成功還原至指定歷史版本！');
  }

  // 為當前歷史版本添加自訂標籤 (Put Label)
  async function handleSaveLabel(label: string) {
    if (!activeTab) return;
    const fileKey = activeTab.filePath || activeTab.id;
    await recordSnapshot({
      fileKey,
      title: activeTab.title,
      content: activeTab.content,
      reason: 'label',
      label,
    });
    lastRecordedSnapshotMap.set(fileKey, activeTab.content);
    showToast(`🏷️ 已固定歷史錨點標籤：「${label}」`);
  }

  function handleCursorChange(newCursor: CursorPosition) {
    if (activeTab) {
      activeTab.cursor = newCursor;
    }
  }

  function handleLanguageChange(lang: SupportedLanguage) {
    if (activeTab) {
      activeTab.language = lang;
    }
  }

  // AI 煉丹操作
  async function handleExecuteRefine(mode: RefineryMode, customPrompt: string, cardPrompt?: string) {
    if (!activeTab) return;
    isRefining = true;

    try {
      // 1. Saga 快照建立：保留 AI 介入前的 100% 原稿
      activeTab.preAiSnapshot = {
        content: activeTab.content,
        timestamp: Date.now(),
        reason: `煉丹前快照 (${mode})`,
      };
      triggerAutoSnapshot(activeTab, 'pre-ai', undefined, `AI煉丹前 (${mode})`);

      // 2. 呼叫推論引擎 (使用動態熱重載指定之模型，支援超長文本自動 Map-Reduce 分段)
      const res = await refineNotes({
        model: state.selectedAiModel,
        modelId: state.selectedAiModelId,
        groqKey: state.groqApiKey,
        geminiKey: state.geminiApiKey,
        customKey: state.customApiKey,
        customEndpoint: state.customEndpoint,
        mode,
        content: activeTab.content,
        customPrompt,
        cardPrompt,
        onProgress: (p) => {
          showToast(p.message);
        },
      });

      // 3. 建立逐段對照結構，並切換為草稿審核狀態（此時不覆蓋原稿，進入逐段卡片對照流）
      reviewChunks = buildReviewChunks(activeTab.content, res.refinedText);
      activeTab.isAiDraft = true;
      activeTab.aiPromptSummary = `${res.summary} [${res.engineUsed}]`;
      activeTab.lastModified = Date.now();
      showDiffView = false;
      saveVaultState(state, true);
      triggerAutoSnapshot(activeTab, 'post-ai', undefined, `AI煉丹成果 (${res.summary})`);
      showToast(`✨ 煉丹完成：請逐段審核成果與原始手稿`);
    } finally {
      isRefining = false;
    }
  }

  // 智慧探測游標所在段落（以空行分隔的自然段落）
  function getCurrentParagraphText(): string {
    if (!activeTab || !activeTab.content) return '';
    const lines = activeTab.content.split('\n');
    const curLine = Math.max(0, Math.min((activeTab.cursor?.line || 1) - 1, lines.length - 1));

    let start = curLine;
    while (start > 0 && lines[start - 1].trim() !== '') {
      start--;
    }

    let end = curLine;
    while (end < lines.length - 1 && lines[end + 1].trim() !== '') {
      end++;
    }

    return lines.slice(start, end + 1).join('\n').trim();
  }

  // 行內 AI 浮動指令修煉：支援「該段落」與「整篇手稿」自由切換
  async function handleExecuteInlinePrompt(instruction: string, scope: 'paragraph' | 'full' = 'paragraph') {
    if (!activeTab || isInlineExecuting) return;
    isInlineExecuting = true;

    try {
      // 1. Saga 快照建立：保留 AI 指令介入前的 100% 原稿
      activeTab.preAiSnapshot = {
        content: activeTab.content,
        timestamp: Date.now(),
        reason: `行內指令修煉前快照 (${scope === 'paragraph' ? '該段落' : '整篇手稿'})`,
      };
      triggerAutoSnapshot(activeTab, 'pre-ai', undefined, `AI行內指令修煉前`);

      let targetSegment: string | undefined = undefined;

      if (scope === 'paragraph') {
        // 若有反白文字優先以反白文字為主，否則自動抓取游標所在段落
        const para = getCurrentParagraphText();
        targetSegment = currentSelectionText?.trim() || para || undefined;
      }

      // 2. 呼叫單次修煉推論模組
      const res = await executeInlinePromptRefine({
        instruction,
        content: activeTab.content,
        selection: targetSegment,
        model: state.selectedAiModel,
        modelId: state.selectedAiModelId,
        groqKey: state.groqApiKey,
        geminiKey: state.geminiApiKey,
      });

      // 3. 建立逐段對照結構，並切換為草稿審核狀態
      if (scope === 'paragraph' && targetSegment) {
        // 記錄局部段落標的，以便收丹時精準置換，不傷全篇前後文
        activeTab.partialReplaceTarget = targetSegment;
        reviewChunks = buildReviewChunks(targetSegment, res.refinedText);
      } else {
        activeTab.partialReplaceTarget = undefined;
        reviewChunks = buildReviewChunks(activeTab.content, res.refinedText);
      }

      activeTab.isAiDraft = true;
      activeTab.aiPromptSummary = `${res.summary} [${res.engineUsed}]`;
      activeTab.lastModified = Date.now();
      showDiffView = false;
      saveVaultState(state, true);
      triggerAutoSnapshot(activeTab, 'post-ai', undefined, `AI行內指令成果 (${res.summary})`);

      // 關閉輸入列並提示
      isInlineAiPromptOpen = false;
      showToast(`✨ ${scope === 'paragraph' ? '段落' : '整篇'}修煉完成：請審核成果與原始手稿`);
    } catch (err: any) {
      showToast(`⚠️ 修煉失敗：${err.message || err}`);
    } finally {
      isInlineExecuting = false;
    }
  }

  // 將參謀抽屜中的成果直接送入逐段對照審核
  function handleChatSendToReview(aiContent: string, summary: string) {
    if (!activeTab) {
      showToast('⚠️ 尚未選取任何藥帖分頁');
      return;
    }

    // 1. 建立快照留底
    activeTab.preAiSnapshot = {
      content: activeTab.content,
      timestamp: Date.now(),
      reason: `AI參謀審核前快照 (${summary})`,
    };
    triggerAutoSnapshot(activeTab, 'pre-ai', undefined, `AI參謀審核前`);

    // 2. 構建逐段卡片對照
    reviewChunks = buildReviewChunks(activeTab.content, aiContent);
    activeTab.isAiDraft = true;
    activeTab.aiPromptSummary = summary;
    activeTab.lastModified = Date.now();
    showDiffView = false;
    saveVaultState(state, true);
    triggerAutoSnapshot(activeTab, 'post-ai', undefined, `AI參謀成果 (${summary})`);

    showToast('📜 丹道對照已就緒：請於工作台逐段審核參謀成果！');
  }

  // 將參謀建議直接插入至編輯器游標處
  function handleChatInsertToEditor(contentToInsert: string) {
    if (!activeTab) return;
    const original = activeTab.content;
    const cur = activeTab.cursor;

    // 計算插入位置 offset
    const lines = original.split('\n');
    let offset = 0;
    const targetLine = Math.min(cur.line - 1, lines.length - 1);
    for (let i = 0; i < targetLine; i++) {
      offset += lines[i].length + 1;
    }
    offset += Math.min(cur.ch, (lines[targetLine] || '').length);

    const updated = original.slice(0, offset) + '\n' + contentToInsert + '\n' + original.slice(offset);
    activeTab.content = updated;
    activeTab.lastModified = Date.now();
    saveVaultState(state);
  }

  // 執筆模式：一鍵採納並精準置換手稿目標段落（自動建立快照保險）
  function handleChatReplaceParagraph(originalText: string, newText: string) {
    if (!activeTab || !originalText) return;

    // 1. 建立執筆採納前快照
    activeTab.preAiSnapshot = {
      content: activeTab.content,
      timestamp: Date.now(),
      reason: `參謀執筆採納前快照`,
    };
    triggerAutoSnapshot(activeTab, 'pre-ai', undefined, `參謀執筆採納前`);

    // 2. 原地精準置換該段落
    if (activeTab.content.includes(originalText)) {
      activeTab.content = activeTab.content.replace(originalText, newText);
    } else {
      // 容錯備援：若原文已被微幅改動，追加至末端
      activeTab.content = activeTab.content + '\n\n' + newText;
    }

    activeTab.lastModified = Date.now();
    saveVaultState(state, true);
    triggerAutoSnapshot(activeTab, 'post-ai', undefined, `參謀執筆採納`);
    showToast('✨ 參謀執筆成果已採納並原地替換手稿！');
  }

  // 更新單一段落的決策狀態
  function handleUpdateChunkDecision(chunkId: string, decision: ChunkDecision) {
    const chunk = reviewChunks.find((c) => c.id === chunkId);
    if (chunk) {
      chunk.decision = decision;
    }
  }

  // 依目前各段選擇收丹入櫃
  function handleApplyChunkDecisions() {
    if (!activeTab) return;
    const finalContent = assembleFinalNote(reviewChunks);

    // 若為局部段落修煉，精準置換該段落；若為全篇修煉，覆蓋整篇
    if (activeTab.partialReplaceTarget && activeTab.content.includes(activeTab.partialReplaceTarget)) {
      activeTab.content = activeTab.content.replace(activeTab.partialReplaceTarget, finalContent);
      activeTab.partialReplaceTarget = undefined;
    } else {
      activeTab.content = finalContent;
      activeTab.partialReplaceTarget = undefined;
    }

    activeTab.isAiDraft = false;
    activeTab.preAiSnapshot = null;
    activeTab.aiPromptSummary = undefined;
    activeTab.language = 'markdown';
    activeTab.lastModified = Date.now();
    reviewChunks = [];
    showDiffView = false;
    saveVaultState(state, true);
    triggerAutoSnapshot(activeTab, 'post-ai', undefined, 'AI逐段審核收丹');
    showToast('📜 丹道落成：已依審核決策收丹入櫃！');
  }

  // 一次全採納 AI
  function handleAcceptAllAi() {
    for (const c of reviewChunks) {
      c.decision = 'ai';
    }
    handleApplyChunkDecisions();
  }

  // 一次全並存對照 (AI + 原文脈絡)
  function handleAcceptAllBoth() {
    for (const c of reviewChunks) {
      c.decision = 'both';
    }
    handleApplyChunkDecisions();
  }

  // Saga 補償：一鍵退回原稿 (Rollback)
  function handleRollbackAi() {
    if (!activeTab || !activeTab.preAiSnapshot) return;
    activeTab.content = activeTab.preAiSnapshot.content;
    activeTab.isAiDraft = false;
    activeTab.preAiSnapshot = null;
    activeTab.aiPromptSummary = undefined;
    activeTab.partialReplaceTarget = undefined;
    reviewChunks = [];
    showDiffView = false;
    saveVaultState(state, true);
    showToast('⏪ 原稿回滾：時空膠囊完好還原！');
  }

  // 浮動 Toast 狀態
  let toastMsg = $state<string | null>(null);
  let toastTimer: number | null = null;

  function showToast(msg: string) {
    toastMsg = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastMsg = null;
    }, 2600);
  }

  function handleImeWarning(msg: string) {
    showToast(msg);
  }

  // VIM / STD MODE 自動即時持久化切換
  function handleToggleVimMode(explicitMode?: boolean) {
    state.vimMode = explicitMode !== undefined ? explicitMode : !state.vimMode;
    saveVaultState(state, true);
    showToast(state.vimMode ? '⌨️ 編輯模式已切換為：VIM (VIM-HYBRID)' : '📝 編輯模式已切換為：STD (標準編輯)');
  }

  // 金鑰配置獨立保存 (純本機持久化，支援方案 3 與方案 2+1)
  async function handleSaveKeys(
    groq: string, 
    gemini: string, 
    model: AiProvider,
    modelId?: string,
    securityMode?: SecurityMode,
    customKey?: string,
    customEndpoint?: string
  ) {
    state.groqApiKey = groq;
    state.geminiApiKey = gemini;
    state.customApiKey = customKey || '';
    state.customEndpoint = customEndpoint || '';
    state.selectedAiModel = model;
    if (modelId) state.selectedAiModelId = modelId;
    if (securityMode) state.securityMode = securityMode;

    // 儲存至本機安全保險庫 (OS 原生或 Web Crypto AES-256)
    await saveSecureKeys({
      groqKey: groq,
      geminiKey: gemini,
      customKey: customKey || '',
      customEndpoint: customEndpoint || '',
      selectedModel: model,
      selectedModelId: modelId || state.selectedAiModelId || (model === 'groq' ? 'llama-3.3-70b-versatile' : model === 'custom' ? 'llama3.2' : 'gemini-1.5-flash'),
      securityMode: securityMode || state.securityMode || 'scheme_3_os_native',
    });

    saveVaultState(state, true);
    const modeName = securityMode === 'scheme_3_os_native' ? '方案 3 (OS 原生保險庫)' : '方案 2+1 (Web Crypto 本機加密)';
    showToast(`🔑 AI 金鑰與模型設定已透過【${modeName}】安全保存入櫃（100% 絕不上雲端）！`);
  }

  // 按鍵偏好獨立保存
  function handleSaveKeybindings(overrides: VimKeyOverrides, mode?: boolean) {
    state.vimOverrides = overrides;
    if (mode !== undefined) {
      state.vimMode = mode;
    }
    saveVaultState(state, true);
    showToast('⌨️ 按鍵快捷鍵與編輯模式偏好已成功保存入櫃！');
  }

  // 煉丹卡片心法自訂獨立保存
  function handleSaveAlchemyCards(cards: Record<string, AlchemyCardConfig>) {
    state.alchemyCards = cards;
    saveVaultState(state, true);
    showToast('📜 煉丹卡片心法設定已成功保存入櫃！');
  }

  function handleSaveSettings(
    groq: string, 
    gemini: string, 
    model: 'groq' | 'gemini',
    overrides: VimKeyOverrides
  ) {
    state.groqApiKey = groq;
    state.geminiApiKey = gemini;
    state.selectedAiModel = model;
    state.vimOverrides = overrides;
    saveVaultState(state, true);
    showToast('⚙️ 偏好與金鑰設定已成功儲存！');
  }

  function handleSaveLayoutConfig(config: LayoutConfig) {
    state.layoutConfig = config;
    smearEnabled = config.smearCursor;
    saveVaultState(state, true);
    showToast('📐 工作台版面與檢視偏好已成功儲存！');
  }

  function handleToggleSmear() {
    smearEnabled = !smearEnabled;
    if (state.layoutConfig) {
      state.layoutConfig.smearCursor = smearEnabled;
    } else {
      state.layoutConfig = {
        theme: 'bauhaus-dark',
        workbenchWidth: 'zen',
        fontSize: '14px',
        lineHeight: 1.6,
        fontFamily: 'JetBrains Mono',
        smearCursor: smearEnabled,
      };
    }
    saveVaultState(state, true);
    showToast(`🖌️ 墨韻殘影特效已${smearEnabled ? '開啟' : '關閉'}`);
  }

  function handleToggleWorkbenchWidth() {
    const current = state.layoutConfig?.workbenchWidth || 'zen';
    const nextWidth = current === 'full' ? 'zen' : 'full';
    if (state.layoutConfig) {
      state.layoutConfig.workbenchWidth = nextWidth;
    } else {
      state.layoutConfig = {
        theme: 'bauhaus-dark',
        workbenchWidth: nextWidth,
        fontSize: '14px',
        lineHeight: 1.6,
        fontFamily: 'JetBrains Mono',
        smearCursor: smearEnabled,
      };
    }
    saveVaultState(state, true);
    showToast(`📐 工作台畫布已切換為：${nextWidth === 'full' ? '全螢幕滿版 (FULL)' : '禪風置中 (ZEN)'}`);
  }

  function handleSaveOneDrivePreference(path: string, auto: boolean, intervalMinutes?: number, enablePeriodic?: boolean) {
    state.selectedOneDrivePath = path;
    state.autoOneDriveBackup = auto;
    if (intervalMinutes !== undefined) {
      state.oneDriveBackupIntervalMinutes = intervalMinutes;
    }
    if (enablePeriodic !== undefined) {
      state.enablePeriodicBackup = enablePeriodic;
    }
    saveVaultState(state, true);
  }

  // 從 OneDrive 還原全域藥帖分頁
  function handleRestoreVaultFromOneDrive(restoredTabs: TabItem[]) {
    if (restoredTabs && restoredTabs.length > 0) {
      if (activeTab) {
        triggerAutoSnapshot(activeTab, 'save', undefined, 'OneDrive雲端還原前本地留底');
      }
      state.tabs = restoredTabs;
      state.activeTabId = restoredTabs[0].id;
      saveVaultState(state, true);
    }
  }

  // 全域鍵盤快捷鍵攔截（優先於瀏覽器預設行為）
  function handleWindowKeyDown(e: KeyboardEvent) {
    // 核心防禦：若內部編輯器 (如 CodeMirror / Vim 插件) 已經處理過此快捷鍵，嚴禁重複執行
    if (e.defaultPrevented) return;

    const isMod = e.ctrlKey || e.metaKey;

    // 1. 添新簡 (Ctrl + T / Cmd + T)
    if (isMod && e.key.toLowerCase() === 't') {
      e.preventDefault();
      addTab();
      return;
    }

    // 2. 收合新簡 (Ctrl + W / Cmd + W)
    if (isMod && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      if (state.activeTabId) {
        closeTab(state.activeTabId);
      }
      return;
    }

    // 3. 儲存檔案 (Ctrl + S / Ctrl + Shift + S)
    if (isMod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (e.shiftKey) {
        handleSaveAs();
      } else {
        handleManualSave();
      }
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeyDown} />

<div 
  class="app-layout {activeTab?.isAiDraft ? 'ai-draft-active' : ''} {isRefining ? 'is-refining' : ''} {isDraggingOver ? 'drag-over-active' : ''} {isZenFocusMode ? 'is-zen-focus' : ''}"
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  role="region"
  aria-label="廣零散工作區"
>
  <!-- 跨平台拖放落藥懸浮覆蓋層 -->
  {#if isDraggingOver}
    <div class="drag-drop-overlay">
      <div class="drag-drop-card">
        <img src="/bamboo.svg" alt="Bamboo" class="drop-bamboo-icon" />
        <div class="drop-title">納入新簡</div>
        <div class="drop-desc">鬆開滑鼠將檔案直接納入素簡工作台</div>
      </div>
    </div>
  {/if}

  <!-- 4.2 竹林靜心專注模式：右上角極簡退出浮鈕 (平常半透明，Hover 喚醒) -->
  {#if isZenFocusMode}
    <button
      class="zen-exit-float-btn"
      onclick={() => toggleZenFocusMode(false)}
      title="退出竹林靜心 (Esc 或 F11)"
    >
      <span class="zen-exit-icon">🎋</span>
      <span>退出靜心</span>
      <kbd>ESC</kbd>
    </button>
  {/if}

  <!-- 包浩斯形上學極簡微點陣 (24px x 24px) -->
  <div class="metaphysical-grid"></div>

  <!-- 主頂欄 (Primary Constructivist Command Bar)：56px 高度、懸停快捷中樞、檔案瀏覽功能、主頂分頁與意圖煉丹樞紐 -->
  <PrimaryTopBar 
    bind:vimMode={state.vimMode}
    {smearEnabled}
    workbenchWidth={state.layoutConfig?.workbenchWidth || 'zen'}
    autoOneDriveBackup={state.autoOneDriveBackup}
    selectedOneDrivePath={state.selectedOneDrivePath}
    isZenFocusMode={isZenFocusMode}
    typewriterMode={state.layoutConfig?.typewriterMode ?? false}
    onToggleZenFocus={toggleZenFocusMode}
    onToggleTypewriter={toggleTypewriterMode}
    tabs={state.tabs}
    activeTabId={state.activeTabId}
    alchemyCards={state.alchemyCards}
    isRefining={isRefining}
    bind:isAlchemyOpen={isAlchemyOpen}
    bind:isExportOpen={isExportOpen}
    onSelectTab={selectTab}
    onAddTab={addTab}
    onCloseTab={closeTab}
    onRenameTab={renameTab}
    onMoveTabDeck={handleMoveTabDeck}
    onReorderTabs={handleReorderTabs}
    onToggleFileBrowser={() => (isFileBrowserOpen = !isFileBrowserOpen)}
    onManualSave={handleManualSave}
    onOpenFuzzy={() => {
      fuzzyInitialMode = 'fuzzy';
      isFuzzyModalOpen = true;
    }}
    onSaveAs={handleSaveAs}
    onOpenHistory={() => (isLocalHistoryOpen = true)}
    onOpenBackup={() => {
      aiModalTab = 'onedrive';
      isAiModalOpen = true;
    }}
    onOpenTextTools={() => (isTextToolsOpen = true)}
    onToggleVim={handleToggleVimMode}
    onToggleSmear={handleToggleSmear}
    onToggleWorkbenchWidth={handleToggleWorkbenchWidth}
    onOpenSettings={() => {
      aiModalTab = 'keys';
      isAiModalOpen = true;
    }}
    onOpenKeybindings={() => {
      aiModalTab = 'keybindings';
      isAiModalOpen = true;
    }}
    onExecuteRefine={handleExecuteRefine}
    onSaveAlchemyCards={handleSaveAlchemyCards}
    onToggleAiChat={() => (isAiChatDrawerOpen = !isAiChatDrawerOpen)}
    isAiChatOpen={isAiChatDrawerOpen}
    onShowToast={showToast}
    isSaved={isSavingIndicator}
  />

  {#if activeTab?.isAiDraft}
    <div class="review-bar-strip">
      <AiReviewBar 
        summary={activeTab.aiPromptSummary}
        timestamp={activeTab.preAiSnapshot?.timestamp}
        onApplyDecisions={handleApplyChunkDecisions}
        onAcceptAllAi={handleAcceptAllAi}
        onAcceptAllBoth={handleAcceptAllBoth}
        onRollback={handleRollbackAi}
      />
    </div>
  {/if}

  {#if activeConflict}
    <!-- 外部檔案變更衝突協調橫幅 (Gruvbox 琥珀警示) -->
    <div class="external-conflict-banner">
      <div class="conflict-left">
        <span class="conflict-pulse"></span>
        <span class="conflict-title">⚠️ 偵測到外部程式修改了 <strong>{activeConflict.tabTitle}</strong></span>
        <span class="conflict-desc">此藥帖在廣零散中有未儲存的草稿。請選擇處理方式：</span>
      </div>
      <div class="conflict-actions">
        <button class="conflict-btn reload-btn" onclick={resolveConflictReload}>
          🔄 載入外部版本 (捨棄草稿)
        </button>
        <button class="conflict-btn keep-btn" onclick={resolveConflictKeep}>
          🛡️ 保留廣零散草稿 (覆蓋磁碟)
        </button>
        <button class="conflict-btn close-btn" onclick={() => (activeConflict = null)} title="稍後處理">
          ✕
        </button>
      </div>
    </div>
  {/if}

  <!-- 主編輯工作台：沉陷包浩斯禪風置中排版 (精準對齊 code.html 第 15 行) -->
  <main class="workbench-sanctuary">
    <div 
      class="zen-canvas-frame {state.layoutConfig?.workbenchWidth === 'full' ? 'is-full-width' : ''}"
      style="--editor-font-size: {state.layoutConfig?.fontSize || '14px'};"
    >
      {#if activeTab?.isAiDraft && reviewChunks.length > 0}
        <!-- 逐段對照審核模式：清晰卡片流，原文與 AI 提煉一目了然 -->
        <AiChunkReviewView 
          chunks={reviewChunks} 
          onUpdateDecision={handleUpdateChunkDecision} 
        />
      {:else if activeTab}
        <!-- 單一全功能沉浸編輯模式：置中書卷感、精確包浩斯邊線 -->
        <div class="zen-editor-pod">
          <CodeEditor 
            bind:this={codeEditorRef}
            content={activeTab.content}
            language={activeTab.language}
            vimMode={state.vimMode}
            vimOverrides={state.vimOverrides}
            cursor={activeTab.cursor}
            smearEnabled={smearEnabled}
            typewriterMode={state.layoutConfig?.typewriterMode || isZenFocusMode}
            wikiLinkCandidates={wikiLinkCandidates}
            onOpenWikiLink={handleOpenWikiLink}
            onChange={handleContentChange}
            onCursorChange={handleCursorChange}
            onSelectionChange={(sel) => (currentSelectionText = sel)}
            onRegisterApi={(api) => (editorApi = api)}
            onOpenInlinePrompt={(coords) => {
              inlinePromptCoords = coords || null;
              isInlineAiPromptOpen = true;
            }}
            onManualSave={handleManualSave}
            onSaveAs={handleSaveAs}
            onImeWarning={handleImeWarning}
            onAddTab={addTab}
            onCloseTab={() => activeTab && closeTab(activeTab.id)}
          />
        </div>
      {/if}
    </div>
  </main>

  <!-- 底部狀態儀表：32px 高度 (精準對齊 code.html 第 92 行) -->
  {#if activeTab}
    <StatusBar 
      content={activeTab.content}
      language={activeTab.language}
      cursor={activeTab.cursor}
      vimMode={state.vimMode}
      onLanguageChange={handleLanguageChange}
      onToggleVim={handleToggleVimMode}
      onOpenFuzzy={() => {
        fuzzyInitialMode = 'fuzzy';
        isFuzzyModalOpen = true;
      }}
      onOpenHistory={() => (isLocalHistoryOpen = true)}
      onOpenBackup={() => {
        aiModalTab = 'onedrive';
        isAiModalOpen = true;
      }}
    />

    <!-- 本機歷史紀錄與 Diff 對比對話盒 (Alt+H) -->
    <LocalHistoryModal 
      isOpen={isLocalHistoryOpen}
      fileKey={activeTab.filePath || activeTab.id}
      fileTitle={activeTab.title}
      currentContent={activeTab.content}
      onRevert={handleRevertHistory}
      onOpenPutLabel={() => (isPutLabelOpen = true)}
      onClose={() => (isLocalHistoryOpen = false)}
    />

    <!-- 自訂歷史錨點標籤對話盒 (Alt+L) -->
    <PutLabelModal 
      isOpen={isPutLabelOpen}
      fileTitle={activeTab.title}
      onSaveLabel={handleSaveLabel}
      onClose={() => (isPutLabelOpen = false)}
    />

    <!-- 存為本機檔案 (AI 智薦歸檔對話盒) (Ctrl+S / Ctrl+Shift+S) -->
    <SaveWithAiModal 
      isOpen={isSaveModalOpen}
      tab={activeTab}
      recentFolders={recentFolders.map((f) => f.path)}
      directorySkeleton={directorySkeleton}
      groqKey={state.groqApiKey}
      geminiKey={state.geminiApiKey}
      customKey={state.customApiKey}
      customEndpoint={state.customEndpoint}
      modelPreference={state.selectedAiModel}
      modelId={state.selectedAiModelId}
      onConfirmSave={handleConfirmSaveAs}
      onClose={() => (isSaveModalOpen = false)}
    />
  {/if}

  <!-- 純文字編輯器檔案總管抽屜 (可隨時以 Ctrl+B 開合) -->
  <FileBrowserDrawer 
    isOpen={isFileBrowserOpen}
    tabs={state.tabs}
    activeTabId={state.activeTabId}
    vaultFolderPath={state.vaultFolderPath || ''}
    vaultFiles={vaultFiles}
    cavesFileCache={cavesFileCache}
    isScanningCaves={isScanningAllCaves}
    recentFiles={recentFiles}
    recentFolders={recentFolders}
    isScanning={isScanningFolder}
    groqApiKey={state.groqApiKey}
    geminiApiKey={state.geminiApiKey}
    customApiKey={state.customApiKey}
    customEndpoint={state.customEndpoint}
    selectedAiModel={state.selectedAiModel}
    selectedAiModelId={state.selectedAiModelId}
    onSelectTab={selectTab}
    onAddTab={addTab}
    onCloseTab={closeTab}
    onCloseDrawer={() => (isFileBrowserOpen = false)}
    onPickFolder={handlePickFolder}
    onSwitchFolder={handleSwitchFolder}
    onTogglePinFolder={handleTogglePinFolder}
    onRemoveRecentFolder={handleRemoveRecentFolder}
    onRefreshFolder={() => state.vaultFolderPath && refreshVaultFiles(state.vaultFolderPath)}
    onRefreshAllCaves={(force) => refreshAllCaves(undefined, force)}
    onOpenVaultFile={handleOpenVaultFile}
    onOpenFuzzyModal={(mode) => {
      fuzzyInitialMode = mode || 'fuzzy';
      isFuzzyModalOpen = true;
    }}
    onClearRecent={handleClearRecent}
    onConfirmSave={handleConfirmSaveAs}
  />

  <!-- 全域 Fuzzy Find 模糊跳轉與 AI 助查彈窗 (Ctrl+P 隨時喚起) -->
  <FuzzyFindModal 
    isOpen={isFuzzyModalOpen}
    initialMode={fuzzyInitialMode}
    tabs={state.tabs}
    vaultFiles={vaultFiles}
    recentFiles={recentFiles}
    groqApiKey={state.groqApiKey}
    geminiApiKey={state.geminiApiKey}
    customApiKey={state.customApiKey}
    customEndpoint={state.customEndpoint}
    selectedAiModel={state.selectedAiModel}
    onSelectTab={selectTab}
    onOpenVaultFile={handleOpenVaultFile}
    onCreateDemoTab={handleCreateDemoTab}
    onClose={() => (isFuzzyModalOpen = false)}
  />

  <!-- 浮動 Toast 提示 -->
  {#if toastMsg}
    <div class="toast-capsule">
      <span class="toast-dot"></span>
      <span>{toastMsg}</span>
    </div>
  {/if}

  <!-- SAGA Tech Engine AI 煉丹與系統設定對話框 (Ctrl+K) -->
  <AiModal 
    isOpen={isAiModalOpen}
    activeTab={aiModalTab}
    onTabChange={(tab) => (aiModalTab = tab)}
    selectedModel={state.selectedAiModel}
    selectedModelId={state.selectedAiModelId}
    securityMode={state.securityMode}
    groqApiKey={state.groqApiKey}
    geminiApiKey={state.geminiApiKey}
    customApiKey={state.customApiKey}
    customEndpoint={state.customEndpoint}
    vimMode={state.vimMode}
    vimOverrides={state.vimOverrides}
    alchemyCards={state.alchemyCards}
    layoutConfig={state.layoutConfig}
    tabs={state.tabs}
    selectedOneDrivePath={state.selectedOneDrivePath}
    autoOneDriveBackup={state.autoOneDriveBackup}
    backupIntervalMinutes={state.oneDriveBackupIntervalMinutes || 30}
    enablePeriodicBackup={state.enablePeriodicBackup ?? true}
    onClose={() => (isAiModalOpen = false)}
    onRefine={handleExecuteRefine}
    onSaveSettings={handleSaveSettings}
    onSaveKeys={handleSaveKeys}
    onSaveKeybindings={handleSaveKeybindings}
    onSaveAlchemyCards={handleSaveAlchemyCards}
    onSaveLayoutConfig={handleSaveLayoutConfig}
    onToggleVim={handleToggleVimMode}
    onSaveOneDrivePreference={handleSaveOneDrivePreference}
    onShowToast={showToast}
    onRestoreVault={handleRestoreVaultFromOneDrive}
  />

  <!-- 功能 A：行內 AI 修煉指令浮動列 (Ctrl+I) -->
  <AiInlinePrompt 
    isOpen={isInlineAiPromptOpen}
    selectionText={currentSelectionText}
    paragraphText={getCurrentParagraphText()}
    fullTextLength={activeTab?.content?.length || 0}
    coords={inlinePromptCoords}
    isExecuting={isInlineExecuting}
    onSubmit={handleExecuteInlinePrompt}
    onClose={() => (isInlineAiPromptOpen = false)}
  />

  <!-- 功能 B：竹語參謀多輪對話問道抽屜 (Ctrl+Shift+I) -->
  <AiChatDrawer 
    isOpen={isAiChatDrawerOpen}
    activeTab={activeTab}
    selectionText={currentSelectionText}
    groqKey={state.groqApiKey}
    geminiKey={state.geminiApiKey}
    customKey={state.customApiKey}
    customEndpoint={state.customEndpoint}
    selectedAiModel={state.selectedAiModel}
    selectedAiModelId={state.selectedAiModelId}
    onClose={() => (isAiChatDrawerOpen = false)}
    onSendToReview={handleChatSendToReview}
    onInsertToEditor={handleChatInsertToEditor}
    onReplaceTargetText={handleChatReplaceParagraph}
    onShowToast={showToast}
  />

  <!-- 功能 C：行處理解藥包彈窗 (Ctrl+Shift+T) -->
  {#if isTextToolsOpen && activeTab}
    <TextToolsModal
      isOpen={isTextToolsOpen}
      content={activeTab.content}
      selectedText={currentSelectionText}
      onApply={handleApplyTextTools}
      onClose={() => (isTextToolsOpen = false)}
      onShowToast={showToast}
    />
  {/if}
</div>

<style>
  .app-layout {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #141615; /* 包浩斯形上學深黑大地底色 */
    color: #dcd7cb;
  }

  /* 4.2 竹林靜心模式 (True Zen Mode) 沉浸專注隱藏介面元素 */
  .app-layout.is-zen-focus :global(.constructivist-topbar),
  .app-layout.is-zen-focus :global(.metaphysical-statusbar),
  .app-layout.is-zen-focus :global(.review-bar-strip),
  .app-layout.is-zen-focus .review-bar-strip {
    display: none !important;
  }

  .app-layout.is-zen-focus .workbench-sanctuary {
    height: 100vh;
    padding-top: 16px;
  }

  /* 右上角極簡退出浮鈕 */
  .zen-exit-float-btn {
    position: fixed;
    top: 16px;
    right: 20px;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    background: rgba(20, 22, 21, 0.65);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(212, 155, 53, 0.25);
    border-radius: 20px;
    color: #a89984;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    opacity: 0.25;
    transition: opacity 0.25s ease, background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
  }

  .zen-exit-float-btn:hover {
    opacity: 1;
    background: rgba(26, 29, 28, 0.95);
    border-color: #d49b35;
    color: #ebdbb2;
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  }

  .zen-exit-float-btn kbd {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(212, 155, 53, 0.3);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 10px;
    font-family: monospace;
    color: #d49b35;
  }

  /* 極簡禪風包浩斯微點陣 (透明度 3.5% 的 24px x 24px 網格) */
  .metaphysical-grid {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(212, 155, 53, 0.035) 1px, transparent 1px);
    background-size: 24px 24px;
    pointer-events: none;
    z-index: 0;
  }

  .review-bar-strip {
    position: relative;
    z-index: 25;
    padding: 4px 16px 0 16px;
    background: #141615;
  }

  /* 主工作台：沉浸式置中禪風排版 (精準對齊 code.html 第 15 行) */
  .workbench-sanctuary {
    flex: 1;
    position: relative;
    z-index: 5;
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: stretch;
    background: #141615;
    padding: 0 20px;
  }

  .zen-canvas-frame {
    flex: 1;
    width: 100%;
    max-width: 960px; /* 包浩斯沉陷書卷開闊黃金閱讀寬度 */
    height: 100%;
    display: flex;
    position: relative;
    border-left: 1px solid rgba(80, 69, 52, 0.25);
    border-right: 1px solid rgba(80, 69, 52, 0.25);
    background: #141615;
    transition: max-width 0.2s ease, border-color 0.2s ease;
  }

  .zen-canvas-frame.is-split-view,
  .zen-canvas-frame.is-full-width {
    max-width: 100%;
    border-left: none;
    border-right: none;
  }

  .zen-canvas-frame :global(.cm-editor),
  .zen-canvas-frame :global(.readonly-text) {
    font-size: var(--editor-font-size, 14px) !important;
  }

  /* 處於 AI 煉丹草稿狀態時的外框高光 */
  .app-layout.ai-draft-active .zen-canvas-frame {
    border-color: rgba(212, 155, 53, 0.55);
    box-shadow: 0 0 30px rgba(212, 155, 53, 0.08);
  }

  .zen-editor-pod {
    width: 100%;
    height: 100%;
    position: relative;
  }

  /* 雙欄對比模式 */
  .diff-split-view {
    display: flex;
    width: 100%;
    height: 100%;
    gap: 1px;
    background: rgba(80, 69, 52, 0.35);
  }

  .diff-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .origin-pane {
    background: #121414;
  }

  .ai-pane {
    background: #141615;
  }

  .pane-header {
    height: 34px;
    background: #161817;
    border-bottom: 1px solid rgba(80, 69, 52, 0.35);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    font-size: 11px;
    color: #938c80;
    font-family: 'JetBrains Mono', monospace;
  }

  .ai-header {
    color: #d49b35;
  }

  .hud-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.06);
    color: #938c80;
    font-weight: 600;
  }

  .hud-pill.accent {
    background: rgba(212, 155, 53, 0.2);
    color: #d49b35;
    border: 1px solid #d49b35;
  }

  .pane-content {
    flex: 1;
    overflow: auto;
    position: relative;
  }

  .readonly-text {
    padding: 24px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14.5px;
    line-height: 2.1;
    color: #938c80;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .editor-wrapper {
    height: 100%;
  }

  /* 浮動 Toast */
  .toast-capsule {
    position: fixed;
    bottom: 42px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(22, 24, 23, 0.96);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: #ece7dc;
    border: 1px solid #d49b35;
    padding: 7px 18px;
    border-radius: 4px;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
    box-shadow: 0 12px 35px rgba(0, 0, 0, 0.85);
    z-index: 9999;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    animation: toast-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
  }

  .toast-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #d49b35;
    box-shadow: 0 0 6px #d49b35;
  }

  @keyframes toast-pop {
    from { opacity: 0; transform: translate(-50%, 8px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }

  /* 跨平台拖曳落藥遮罩 */
  .drag-drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(26, 24, 22, 0.88);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    border: 3px dashed #d49b35;
    animation: overlay-fade 0.15s ease-out;
  }

  .drag-drop-card {
    background: #25221d;
    border: 1px solid #d49b35;
    border-radius: 8px;
    padding: 36px 48px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.9), 0 0 40px rgba(212, 155, 53, 0.2);
    transform: scale(1.02);
  }

  .drop-bamboo-icon {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    filter: drop-shadow(0 4px 12px rgba(212, 155, 53, 0.4));
    display: block;
  }

  .drop-title {
    font-family: 'JetBrains Mono', 'Cinzel Decorative', serif;
    font-size: 20px;
    font-weight: 700;
    color: #e5c07b;
    letter-spacing: 2px;
  }

  .drop-desc {
    font-size: 13px;
    color: #a89984;
    font-family: 'JetBrains Mono', sans-serif;
  }

  @keyframes overlay-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* 外部檔案衝突橫幅樣式 (Gruvbox Dark 風格) */
  .external-conflict-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    background: #32261e;
    border-bottom: 1px solid #d79921;
    padding: 10px 20px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 50;
    animation: conflict-slide-down 0.25s ease-out;
  }

  .conflict-left {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: #ebdbb2;
    flex-wrap: wrap;
  }

  .conflict-pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #fabd2f;
    box-shadow: 0 0 8px #fabd2f;
    animation: conflict-blink 1.5s infinite;
  }

  .conflict-title strong {
    color: #fabd2f;
    font-family: 'JetBrains Mono', monospace;
  }

  .conflict-desc {
    color: #a89984;
    font-size: 12px;
  }

  .conflict-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .conflict-btn {
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
  }

  .conflict-btn.reload-btn {
    background: #d79921;
    color: #1d2021;
  }

  .conflict-btn.reload-btn:hover {
    background: #fabd2f;
    transform: translateY(-1px);
  }

  .conflict-btn.keep-btn {
    background: #282828;
    color: #ebdbb2;
    border-color: #504945;
  }

  .conflict-btn.keep-btn:hover {
    background: #3c3836;
    border-color: #665c54;
    color: #fbf1c7;
  }

  .conflict-btn.close-btn {
    background: transparent;
    color: #928374;
    padding: 6px 8px;
  }

  .conflict-btn.close-btn:hover {
    color: #fb4934;
  }

  @keyframes conflict-slide-down {
    from {
      opacity: 0;
      transform: translateY(-100%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes conflict-blink {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.85); }
  }
</style>
