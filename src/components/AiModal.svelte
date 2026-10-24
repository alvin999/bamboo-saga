<script lang="ts">
  import type { RefineryMode } from "../lib/ai/refinery";
  import type {
    TabItem,
    VimKeyOverrides,
    OneDriveAccountInfo,
    BackupResult,
    OneDriveBackupOverview,
    AlchemyCardConfig,
    LayoutConfig,
    SystemIntegrationInfo,
  } from "../types/tab";
  import {
    detectOneDriveAccounts,
    backupVaultToOneDrive,
    checkOneDriveBackup,
    readOneDriveBackupJson,
    openInSystemExplorer,
    getSystemIntegrationInfo,
    toggleWindowsContextMenu,
  } from "../lib/storage/fsBridge";
  import {
    DEFAULT_ALCHEMY_CARDS,
    DEFAULT_VIM_OVERRIDES,
    DEFAULT_LAYOUT_CONFIG,
    getDefaultAlchemyCards,
    getDefaultVimOverrides,
    getDefaultLayoutConfig,
  } from "../lib/storage/vault";
  import { DEFAULT_SHORTCUT_GROUPS } from "../lib/constants/shortcuts";
  import {
    Building2,
    User,
    Cloud,
    RefreshCw,
    Check,
    ShieldCheck,
    FolderOpen,
    Download,
    RotateCcw,
    Key,
    Keyboard,
    Eye,
    EyeOff,
    LayoutTemplate,
    Shield,
    Lock,
    Sparkles,
    AlertCircle,
    CheckCircle2,
  } from "lucide-svelte";
  import {
    fetchGeminiModels,
    fetchGroqModels,
    getCachedModels,
    type AvailableModelItem,
  } from "../lib/ai/modelFetcher";
  import {
    saveSecureKeys,
    loadSecureKeys,
    getCurrentSecurityMode,
    type SecurityMode,
  } from "../lib/security/keyVault";
  import {
    checkForAppUpdates,
    CURRENT_VERSION,
    type VersionCheckResult,
  } from "../lib/updater";

  let isCheckingUpdates = $state(false);
  let updateResult = $state<VersionCheckResult | null>(null);
  let updateError = $state<string | null>(null);

  async function handleCheckUpdates() {
    isCheckingUpdates = true;
    updateError = null;
    try {
      updateResult = await checkForAppUpdates();
    } catch (err: any) {
      updateError = err?.message || "檢查更新失敗，請確認網路連線。";
    } finally {
      isCheckingUpdates = false;
    }
  }

  type ModalTab =
    | "refine"
    | "keys"
    | "keybindings"
    | "onedrive"
    | "settings"
    | "layout"
    | "system";

  interface AiModalProps {
    isOpen: boolean;
    selectedModel: "groq" | "gemini";
    selectedModelId?: string;
    securityMode?: SecurityMode;
    groqApiKey: string;
    geminiApiKey: string;
    vimMode?: boolean;
    vimOverrides?: VimKeyOverrides;
    alchemyCards?: Record<string, AlchemyCardConfig>;
    layoutConfig?: LayoutConfig;
    tabs?: TabItem[];
    selectedOneDrivePath?: string;
    autoOneDriveBackup?: boolean;
    backupIntervalMinutes?: number;
    enablePeriodicBackup?: boolean;
    activeTab?: ModalTab;
    onTabChange?: (
      tab: "refine" | "keys" | "keybindings" | "onedrive" | "layout",
    ) => void;
    onClose: () => void;
    onRefine: (
      mode: RefineryMode,
      customPrompt: string,
      cardPrompt?: string,
    ) => Promise<void>;
    onSaveSettings?: (
      groq: string,
      gemini: string,
      model: "groq" | "gemini",
      vimOverrides: VimKeyOverrides,
    ) => void;
    onSaveKeys?: (
      groq: string,
      gemini: string,
      model: "groq" | "gemini",
      modelId?: string,
      securityMode?: SecurityMode,
    ) => void;
    onSaveKeybindings?: (overrides: VimKeyOverrides, mode?: boolean) => void;
    onSaveAlchemyCards?: (cards: Record<string, AlchemyCardConfig>) => void;
    onSaveLayoutConfig?: (config: LayoutConfig) => void;
    onToggleVim?: (mode: boolean) => void;
    onSaveOneDrivePreference?: (
      path: string,
      auto: boolean,
      intervalMinutes?: number,
      enablePeriodic?: boolean,
    ) => void;
    onShowToast?: (msg: string) => void;
    onRestoreVault?: (restoredTabs: TabItem[]) => void;
  }

  let {
    isOpen = false,
    selectedModel = "gemini" as "groq" | "gemini",
    selectedModelId = "gemini-1.5-flash",
    securityMode = "scheme_3_os_native" as SecurityMode,
    groqApiKey = "",
    geminiApiKey = "",
    vimMode = false,
    vimOverrides = getDefaultVimOverrides(),
    alchemyCards = getDefaultAlchemyCards(),
    layoutConfig = getDefaultLayoutConfig(),
    backupIntervalMinutes = 30,
    tabs = [] as TabItem[],
    selectedOneDrivePath = "",
    autoOneDriveBackup = false,
    enablePeriodicBackup = true,
    activeTab = "keys" as ModalTab,
    onTabChange,
    onClose,
    onRefine,
    onSaveSettings,
    onSaveKeys,
    onSaveKeybindings,
    onSaveAlchemyCards,
    onSaveLayoutConfig,
    onToggleVim,
    onSaveOneDrivePreference,
    onShowToast,
    onRestoreVault,
  }: AiModalProps = $props();

  let selectedMode = $state<string>("organize");
  let customPrompt = $state("");
  let isRefining = $state(false);
  let errorMsg = $state("");

  // 密碼顯示開關
  let showGeminiKey = $state(false);
  let showGroqKey = $state(false);

  // 卡片心法自訂狀態
  let inputCards = $state<Record<string, AlchemyCardConfig>>(
    getDefaultAlchemyCards(),
  );

  // 版面配置偏好狀態
  let inputLayoutConfig = $state<LayoutConfig>(getDefaultLayoutConfig());

  // 按鍵與編輯模式狀態
  let inputVimMode = $state(false);
  let inputVimOverrides = $state<VimKeyOverrides>(getDefaultVimOverrides());

  // 金鑰與推論核心狀態
  let inputGroqKey = $state("");
  let inputGeminiKey = $state("");
  let inputModel = $state<"groq" | "gemini">("gemini");
  let inputModelId = $state("gemini-1.5-flash");
  let inputSecurityMode = $state<SecurityMode>("scheme_3_os_native");

  // 模型熱重載動態探勘狀態
  let availableModels = $state<AvailableModelItem[]>([]);
  let isFetchingModels = $state(false);
  let fetchModelsError = $state<string | null>(null);
  let fetchModelsSuccess = $state(false);
  let fetchModelsSource = $state<"remote" | "cache" | null>(null);
  let modelFetchTimer: number | null = null;

  async function triggerModelFetch(immediate = false) {
    if (modelFetchTimer) clearTimeout(modelFetchTimer);

    const execute = async () => {
      const currentProvider = inputModel;
      const key =
        currentProvider === "gemini"
          ? inputGeminiKey.trim()
          : inputGroqKey.trim();

      if (!key) {
        availableModels = [];
        fetchModelsError = null;
        fetchModelsSuccess = false;
        fetchModelsSource = null;
        return;
      }

      isFetchingModels = true;
      fetchModelsError = null;
      fetchModelsSuccess = false;

      try {
        const res =
          currentProvider === "gemini"
            ? await fetchGeminiModels(key)
            : await fetchGroqModels(key);

        if (res.success && res.models.length > 0) {
          availableModels = res.models;
          fetchModelsSuccess = true;
          fetchModelsSource = res.source;
          // 若目前所選的 modelId 不在清單中，自動選取第一個 (推薦款)
          if (!res.models.some((m) => m.id === inputModelId)) {
            inputModelId = res.models[0].id;
          }
        } else {
          availableModels = [];
          fetchModelsError = res.error || "探勘模型失敗";
        }
      } catch (err: any) {
        availableModels = [];
        fetchModelsError = err.message || "連線異常";
      } finally {
        isFetchingModels = false;
      }
    };

    if (immediate) {
      await execute();
    } else {
      modelFetchTimer = window.setTimeout(execute, 600);
    }
  }

  function handleProviderChange(newProvider: "groq" | "gemini") {
    inputModel = newProvider;
    // 優先讀取本地快取的模型
    const cached = getCachedModels(newProvider);
    if (cached && cached.length > 0) {
      availableModels = cached;
      if (!cached.some((m) => m.id === inputModelId)) {
        inputModelId = cached[0].id;
      }
    } else {
      availableModels = [];
    }
    triggerModelFetch(true);
  }

  // OneDrive 備份與讀取狀態
  let oneDriveAccounts = $state<OneDriveAccountInfo[]>([]);
  let currentOneDrivePath = $state("");
  let isAutoBackup = $state(false);
  let inputBackupInterval = $state(30);
  let isEnablePeriodic = $state(true);
  let isScanningOneDrive = $state(false);
  let isBackingUp = $state(false);
  let lastBackupResult = $state<BackupResult | null>(null);
  let backupOverview = $state<
    import("../types/tab").OneDriveBackupOverview | null
  >(null);
  let isCheckingBackup = $state(false);
  let prevIsOpen = false;

  // 跨平台系統整合資訊
  let sysInfo = $state<SystemIntegrationInfo>({
    os: "web",
    supports_context_menu: false,
    is_context_menu_enabled: false,
  });
  let isTogglingContextMenu = $state(false);

  async function loadSystemIntegration() {
    try {
      sysInfo = await getSystemIntegrationInfo();
    } catch (e) {
      console.warn("無法載入系統整合資訊:", e);
    }
  }

  async function handleToggleContextMenu() {
    if (isTogglingContextMenu) return;
    isTogglingContextMenu = true;
    try {
      const nextState = !sysInfo.is_context_menu_enabled;
      const res = await toggleWindowsContextMenu(nextState);
      sysInfo.is_context_menu_enabled = res;
      if (res) {
        onShowToast?.("✨ 已成功新增 Windows 右鍵「用 廣零散 收入藥帖」選單！");
      } else {
        onShowToast?.("🗑️ 已成功移除 Windows 右鍵選單項目");
      }
    } catch (err: any) {
      onShowToast?.(`⚠️ 設定失敗: ${err.message || err}`);
    } finally {
      isTogglingContextMenu = false;
    }
  }

  function setTab(
    tab: "refine" | "keys" | "keybindings" | "onedrive" | "layout" | "system",
  ) {
    onTabChange?.(tab as any);
    if (tab === "onedrive") {
      scanOneDrive();
    }
    if (tab === "keys" || tab === "system") {
      loadSystemIntegration();
    }
  }

  $effect(() => {
    // 僅在對話框剛由關閉轉為開啟的瞬間，初始化表單輸入與掃描
    if (isOpen && !prevIsOpen) {
      inputGroqKey = groqApiKey;
      inputGeminiKey = geminiApiKey;
      inputModel = selectedModel;
      const currentOrFallback =
        !selectedModelId || selectedModelId === "gemini-2.5-flash"
          ? selectedModel === "groq"
            ? "llama-3.3-70b-versatile"
            : "gemini-1.5-flash"
          : selectedModelId;
      inputModelId = currentOrFallback;
      inputSecurityMode = securityMode || getCurrentSecurityMode();

      // 載入模型快取並在有金鑰時自動熱重載
      const cached = getCachedModels(inputModel);
      if (cached && cached.length > 0) {
        availableModels = cached;
      }
      if (
        (inputModel === "gemini" && inputGeminiKey) ||
        (inputModel === "groq" && inputGroqKey)
      ) {
        triggerModelFetch(true);
      }

      inputVimMode = !!vimMode;
      if (vimOverrides) {
        inputVimOverrides = { ...vimOverrides };
      }
      if (layoutConfig) {
        inputLayoutConfig = { ...layoutConfig };
      } else {
        inputLayoutConfig = getDefaultLayoutConfig();
      }
      if (alchemyCards) {
        inputCards = JSON.parse(JSON.stringify(alchemyCards));
      } else {
        inputCards = getDefaultAlchemyCards();
      }
      currentOneDrivePath = selectedOneDrivePath;
      isAutoBackup = autoOneDriveBackup;
      inputBackupInterval = backupIntervalMinutes || 30;
      isEnablePeriodic = enablePeriodicBackup ?? true;
      scanOneDrive();
      loadSystemIntegration();
    }
    prevIsOpen = isOpen;
  });

  async function scanOneDrive() {
    isScanningOneDrive = true;
    try {
      const list = await detectOneDriveAccounts();
      oneDriveAccounts = list;
      if (!currentOneDrivePath && list.length > 0) {
        currentOneDrivePath = list[0].folder_path;
        onSaveOneDrivePreference?.(
          currentOneDrivePath,
          isAutoBackup,
          inputBackupInterval,
        );
      }
      if (currentOneDrivePath) {
        checkBackupStatus(currentOneDrivePath);
      }
    } catch (err) {
      console.error("[AiModal] OneDrive scan failed:", err);
    } finally {
      isScanningOneDrive = false;
    }
  }

  async function checkBackupStatus(folderPath: string) {
    if (!folderPath) return;
    isCheckingBackup = true;
    try {
      backupOverview = await checkOneDriveBackup(folderPath);
    } catch (e) {
      console.warn("檢查備份失敗:", e);
    } finally {
      isCheckingBackup = false;
    }
  }

  function handleSelectOneDrive(path: string) {
    currentOneDrivePath = path;
    onSaveOneDrivePreference?.(
      currentOneDrivePath,
      isAutoBackup,
      inputBackupInterval,
      isEnablePeriodic,
    );
    checkBackupStatus(path);
  }

  function handleToggleAutoBackup() {
    isAutoBackup = !isAutoBackup;
    onSaveOneDrivePreference?.(
      currentOneDrivePath,
      isAutoBackup,
      inputBackupInterval,
      isEnablePeriodic,
    );
    onShowToast?.(
      isAutoBackup
        ? `🛡️ 已啟用 OneDrive 背景自動備份（每 ${inputBackupInterval} 分鐘）`
        : "已關閉 OneDrive 自動備份",
    );
  }

  function handleChangeInterval(minutes: number) {
    inputBackupInterval = minutes;
    onSaveOneDrivePreference?.(
      currentOneDrivePath,
      isAutoBackup,
      inputBackupInterval,
      isEnablePeriodic,
    );
    onShowToast?.(`⏱️ 背景備份間隔已調整為：每 ${minutes} 分鐘`);
  }

  function handleTogglePeriodicBackup() {
    isEnablePeriodic = !isEnablePeriodic;
    onSaveOneDrivePreference?.(
      currentOneDrivePath,
      isAutoBackup,
      inputBackupInterval,
      isEnablePeriodic,
    );
    onShowToast?.(
      isEnablePeriodic
        ? "📦 已啟用多週期分類備份（日・週・月階層存檔）"
        : "已關閉多週期備份（僅保留最新鏡像）",
    );
  }

  async function handleRestoreFromOneDrive(
    customFilePath?: string,
    label?: string,
  ) {
    if (!currentOneDrivePath) return;
    const targetDesc = label ? `「${label}」` : "最新備份存檔";
    const ok = window.confirm(
      `⚠️ 確定要從 OneDrive 還原 ${targetDesc} 的所有藥帖嗎？\n\n` +
        "還原將會以該備份存檔取代當前工作台中的藥帖分頁。\n" +
        "（放心：還原前會於本機歷史自動建立快照留底）",
    );
    if (!ok) return;

    try {
      const raw = await readOneDriveBackupJson(
        currentOneDrivePath,
        customFilePath,
      );
      const parsed = JSON.parse(raw);
      if (parsed.tabs && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        onRestoreVault?.(parsed.tabs);
        onShowToast?.(`📥 成功從 OneDrive 還原 ${parsed.tabs.length} 篇藥帖！`);
        onClose();
      } else {
        onShowToast?.("⚠️ 備份檔案中未包含有效的藥帖資料");
      }
    } catch (err: any) {
      onShowToast?.(`⚠️ 還原失敗: ${err.message || err}`);
    }
  }

  async function handleOpenExplorer() {
    if (!currentOneDrivePath) return;
    try {
      await openInSystemExplorer(
        `${currentOneDrivePath}\\BambooSaga_VaultBackup`,
      );
    } catch (e: any) {
      onShowToast?.(`無法開啟目錄: ${e.message || e}`);
    }
  }

  let selectedPeriodicCategory = $state<"daily" | "weekly" | "monthly">(
    "daily",
  );

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatBackupLabel(
    category: "daily" | "weekly" | "monthly",
    fileName: string,
  ): string {
    // 檔名格式例如 backup_daily_2026-10-14.json, backup_weekly_2026-W42.json, backup_monthly_2026-10.json
    const cleaned = fileName
      .replace(/^backup_(daily|weekly|monthly)_/, "")
      .replace(/\.json$/, "");
    if (category === "daily") return `📅 日記存檔：${cleaned}`;
    if (category === "weekly")
      return `🗓️ 第 ${cleaned.replace(/^.*-W/, "")} 週存檔 (${cleaned.split("-W")[0]} 年)`;
    if (category === "monthly") return `🌙 月份存檔：${cleaned}`;
    return cleaned;
  }

  async function handleBackupNow() {
    if (!currentOneDrivePath) {
      onShowToast?.("⚠️ 請先選擇要備份的 OneDrive 帳號");
      return;
    }
    isBackingUp = true;
    try {
      const safeTabs = tabs || [];
      const markdownFiles = safeTabs.map((t: TabItem, idx: number) => ({
        file_name: t.title || `藥帖_${idx + 1}`,
        content: t.content,
      }));
      const vaultJson = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          tabCount: safeTabs.length,
          tabs: safeTabs,
        },
        null,
        2,
      );

      const res = await backupVaultToOneDrive({
        onedriveFolderPath: currentOneDrivePath,
        vaultJson,
        markdownFiles,
        enablePeriodic: isEnablePeriodic,
      });
      lastBackupResult = res;
      onShowToast?.(`☁️ ${res.message}`);
      await checkBackupStatus(currentOneDrivePath);
    } catch (err: any) {
      onShowToast?.(`⚠️ 備份失敗: ${err.message || err}`);
    } finally {
      isBackingUp = false;
    }
  }

  function handleSelectCard(modeId: string) {
    selectedMode = modeId;
  }

  async function handleExecuteRefine() {
    isRefining = true;
    errorMsg = "";
    try {
      const currentCardPrompt = inputCards[selectedMode]?.systemPrompt;
      await onRefine(
        selectedMode as RefineryMode,
        customPrompt,
        currentCardPrompt,
      );
      onClose();
    } catch (e: any) {
      errorMsg = e.message || "煉丹失敗，請檢查網路連線或 API 金鑰";
    } finally {
      isRefining = false;
    }
  }

  function handleResetCurrentCard() {
    if (DEFAULT_ALCHEMY_CARDS[selectedMode]) {
      inputCards[selectedMode].systemPrompt =
        DEFAULT_ALCHEMY_CARDS[selectedMode].systemPrompt;
      inputCards[selectedMode].title =
        DEFAULT_ALCHEMY_CARDS[selectedMode].title;
      inputCards[selectedMode].desc = DEFAULT_ALCHEMY_CARDS[selectedMode].desc;
      onShowToast?.(
        `🔄 已將【${inputCards[selectedMode].title}】恢復為原廠預設心法`,
      );
    }
  }

  function handleSaveCards() {
    onSaveAlchemyCards?.($state.snapshot(inputCards));
    onShowToast?.(
      `💾 【${inputCards[selectedMode]?.title || "煉丹卡片"}】心法設定已成功儲存入櫃！`,
    );
  }

  function handleSaveKeysOnly() {
    if (onSaveKeys) {
      onSaveKeys(
        inputGroqKey.trim(),
        inputGeminiKey.trim(),
        inputModel,
        inputModelId,
        inputSecurityMode,
      );
    } else if (onSaveSettings) {
      onSaveSettings(
        inputGroqKey.trim(),
        inputGeminiKey.trim(),
        inputModel,
        $state.snapshot(inputVimOverrides),
      );
    }
    const modeName =
      inputSecurityMode === "scheme_3_os_native"
        ? "OS 原生保險庫"
        : "Web Crypto 本機加密";
    onShowToast?.(`🔑 AI 金鑰已透過【${modeName}】安全保存入櫃！`);
  }

  function handleSaveKeybindingsOnly() {
    if (onSaveKeybindings) {
      onSaveKeybindings($state.snapshot(inputVimOverrides), inputVimMode);
    } else if (onSaveSettings) {
      onSaveSettings(
        inputGroqKey.trim(),
        inputGeminiKey.trim(),
        inputModel,
        $state.snapshot(inputVimOverrides),
      );
    }
    onToggleVim?.(inputVimMode);
    onShowToast?.("⌨️ 按鍵與編輯模式偏好已成功保存！");
  }

  function handleResetVimOverrides() {
    inputVimOverrides = getDefaultVimOverrides();
    onShowToast?.("🔄 已恢復 Vim 快捷鍵衝突攔截的推薦預設值！");
  }

  function handleToggleVimModeInSettings(mode: boolean) {
    inputVimMode = mode;
    onToggleVim?.(mode);
    onShowToast?.(
      mode
        ? "⌨️ 已切換為 VIM 模態 (VIM-HYBRID)"
        : "📝 已切換為 STD 標準編輯模式",
    );
  }

  function handleSaveLayoutOnly() {
    onSaveLayoutConfig?.($state.snapshot(inputLayoutConfig));
    onShowToast?.("📐 工作台版面配置已成功保存！");
  }

  function handleResetLayout() {
    inputLayoutConfig = getDefaultLayoutConfig();
    onShowToast?.("🔄 已恢復版面配置推薦預設值！");
  }
</script>

{#if isOpen}
  <div class="modal-backdrop" onclick={onClose} role="presentation">
    <div
      class="modal-box"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onkeydown={(e) => {
        if (e.key === "Escape") onClose();
        if (
          (e.ctrlKey || e.metaKey) &&
          e.key === "Enter" &&
          activeTab === "refine" &&
          !isRefining
        ) {
          handleExecuteRefine();
        }
      }}
    >
      <!-- 包浩斯形上學頂部導航 -->
      <header class="modal-header">
        <div class="header-left">
          <span class="pulse-cinnabar"></span>
          <span class="engine-title">
            {activeTab === "onedrive"
              ? "雲端備份 // ONEDRIVE MIRROR"
              : activeTab === "keybindings"
                ? "按鍵偏好 // VIM & KEYMAP"
                : activeTab === "layout"
                  ? "版面配置 // WORKBENCH LAYOUT"
                  : activeTab === "system"
                    ? "系統整合 // NATIVE INTEGRATION"
                    : "金鑰配置 // API CREDENTIALS"}
          </span>
          <span class="engine-badge">DOT-SYS v2.5</span>
        </div>

        <div class="header-nav">
          <button
            class="tab-btn {activeTab === 'keys' || activeTab === 'settings'
              ? 'active'
              : ''}"
            onclick={() => setTab("keys")}
            title="配置 Gemini / Groq API 金鑰與推論核心"
          >
            🔑 API 金鑰
          </button>
          <button
            class="tab-btn {activeTab === 'keybindings' ? 'active' : ''}"
            onclick={() => setTab("keybindings")}
            title="設定 VIM / STD 模式與快捷鍵覆蓋"
          >
            ⌨️ 按鍵偏好
          </button>
          <button
            class="tab-btn {activeTab === 'layout' ? 'active' : ''}"
            onclick={() => setTab("layout")}
            title="設定工作台寬度、字級與 AI 審查對照偏好"
          >
            📐 版面配置
          </button>
          <button
            class="tab-btn {activeTab === 'onedrive' ? 'active' : ''}"
            onclick={() => setTab("onedrive")}
            title="OneDrive 自動雲端鏡像備份"
          >
            ☁️ 雲端備份
          </button>
          <button
            class="tab-btn {activeTab === 'system' ? 'active' : ''}"
            onclick={() => setTab("system")}
            title="Windows 右鍵選單、單一實例與原生整合"
          >
            🖥️ 原生整合
          </button>
          <button class="esc-btn" onclick={onClose} title="關閉視窗 (ESC)">
            [ ESC ]
          </button>
        </div>
      </header>

      {#if errorMsg}
        <div class="error-banner">
          <span>⚠️ {errorMsg}</span>
        </div>
      {/if}

      {#if activeTab === "keys" || activeTab === "settings"}
        <!-- 獨立分頁一：API 金鑰與推論核心配置 (支援熱重載與純本機安全加密) -->
        <div class="modal-body settings-body">
          <div class="section-banner">
            <Key size={16} class="section-icon" />
            <div class="section-title-group">
              <span class="section-main-title">AI 推論金鑰與熱重載核心</span>
              <span class="section-sub-title"
                >輸入金鑰即時向官方端點探勘可用模型；純本機持久化，絕對不上雲端</span
              >
            </div>
          </div>

          <!-- 金鑰本機加密與安全架構方案選擇 -->
          <div class="security-scheme-card">
            <div class="scheme-header">
              <Shield size={14} class="scheme-icon" />
              <span class="scheme-title"
                >金鑰本機安全持久化機制 (純本地保護)</span
              >
            </div>
            <div class="scheme-options-grid">
              <label
                class="scheme-option-item {inputSecurityMode ===
                'scheme_3_os_native'
                  ? 'selected'
                  : ''}"
              >
                <input
                  type="radio"
                  name="sec_scheme"
                  value="scheme_3_os_native"
                  checked={inputSecurityMode === "scheme_3_os_native"}
                  onchange={() => (inputSecurityMode = "scheme_3_os_native")}
                />
                <div class="scheme-item-content">
                  <div class="scheme-item-header">
                    <span class="scheme-item-name">作業系統原生認證保險庫</span>
                    <span class="scheme-tag-rec">推薦</span>
                  </div>
                  <span class="scheme-item-desc"
                    >透過 OS 原生憑證安全庫 (Windows DPAPI)
                    綁定電腦登入帳號，不落地純文字。</span
                  >
                </div>
              </label>

              <label
                class="scheme-option-item {inputSecurityMode ===
                'scheme_2_web_crypto'
                  ? 'selected'
                  : ''}"
              >
                <input
                  type="radio"
                  name="sec_scheme"
                  value="scheme_2_web_crypto"
                  checked={inputSecurityMode === "scheme_2_web_crypto"}
                  onchange={() => (inputSecurityMode = "scheme_2_web_crypto")}
                />
                <div class="scheme-item-content">
                  <div class="scheme-item-header">
                    <span class="scheme-item-name"
                      >本機沙盒 + Web Crypto (AES-256)</span
                    >
                  </div>
                  <span class="scheme-item-desc"
                    >本機硬體加速 AES-GCM-256
                    加密密文隔離，即使開啟本地儲存檔案亦為密文。</span
                  >
                </div>
              </label>
            </div>

            <div class="onedrive-isolation-notice">
              <CheckCircle2 size={13} class="notice-icon" />
              <span
                >🛡️ <strong>雲端隔離保證</strong>：所有 API 金鑰已從 OneDrive
                同步備份中徹底脫敏剔除，零雲端外洩風險。</span
              >
            </div>
          </div>

          <!-- 核心推論引擎選擇 -->
          <div class="form-group">
            <label class="form-label" for="model-provider-select"
              >核心推論引擎供應商</label
            >
            <div class="provider-capsule-row">
              <button
                type="button"
                class="provider-capsule {inputModel === 'gemini'
                  ? 'active'
                  : ''}"
                onclick={() => handleProviderChange("gemini")}
              >
                <span>Google Gemini</span>
                <span class="capsule-sub">長文分析 / 多模態</span>
              </button>
              <button
                type="button"
                class="provider-capsule {inputModel === 'groq' ? 'active' : ''}"
                onclick={() => handleProviderChange("groq")}
              >
                <span>Groq Llama</span>
                <span class="capsule-sub">超極速毫秒級推論</span>
              </button>
            </div>
          </div>

          <!-- 對應供應商之 API Key 輸入框 -->
          {#if inputModel === "gemini"}
            <div class="form-group">
              <div class="label-with-tool">
                <label class="form-label" for="gemini-key"
                  >Google Gemini API Key</label
                >
                <div class="tool-btn-group">
                  <button
                    type="button"
                    class="text-link-btn"
                    onclick={() => (showGeminiKey = !showGeminiKey)}
                  >
                    {#if showGeminiKey}
                      <EyeOff size={13} /> <span>隱藏</span>
                    {:else}
                      <Eye size={13} /> <span>顯示</span>
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="refresh-models-btn"
                    disabled={isFetchingModels || !inputGeminiKey.trim()}
                    onclick={() => triggerModelFetch(true)}
                    title="立即向 Google 端點探勘模型清單"
                  >
                    <RefreshCw
                      size={12}
                      class={isFetchingModels ? "spin" : ""}
                    />
                    <span>測試連線與重載模型</span>
                  </button>
                </div>
              </div>
              <input
                id="gemini-key"
                type={showGeminiKey ? "text" : "password"}
                class="form-input"
                placeholder="貼上 AIzaSy 開頭之 Gemini API Key..."
                bind:value={inputGeminiKey}
                oninput={() => triggerModelFetch(false)}
              />
              <span class="field-hint"
                >推薦使用 Google AI Studio
                免費金鑰，長文提煉效果極佳。輸入後自動熱重載官方可用模型。</span
              >
            </div>
          {:else}
            <div class="form-group">
              <div class="label-with-tool">
                <label class="form-label" for="groq-key">Groq API Key</label>
                <div class="tool-btn-group">
                  <button
                    type="button"
                    class="text-link-btn"
                    onclick={() => (showGroqKey = !showGroqKey)}
                  >
                    {#if showGroqKey}
                      <EyeOff size={13} /> <span>隱藏</span>
                    {:else}
                      <Eye size={13} /> <span>顯示</span>
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="refresh-models-btn"
                    disabled={isFetchingModels || !inputGroqKey.trim()}
                    onclick={() => triggerModelFetch(true)}
                    title="立即向 Groq 端點探勘模型清單"
                  >
                    <RefreshCw
                      size={12}
                      class={isFetchingModels ? "spin" : ""}
                    />
                    <span>測試連線與重載模型</span>
                  </button>
                </div>
              </div>
              <input
                id="groq-key"
                type={showGroqKey ? "text" : "password"}
                class="form-input"
                placeholder="貼上 gsk_ 開頭之 Groq API Key..."
                bind:value={inputGroqKey}
                oninput={() => triggerModelFetch(false)}
              />
              <span class="field-hint"
                >極速毫秒級響應，適合靈感速記與即時整理。輸入後自動熱重載官方可用模型。</span
              >
            </div>
          {/if}

          <!-- 連線狀態指示條 (Status Banner) -->
          <div class="hot-reload-status-box">
            {#if isFetchingModels}
              <div class="status-indicator loading">
                <span class="spinner-small">⏳</span>
                <span
                  >正在向 {inputModel === "gemini" ? "Google" : "Groq"} 官方端點探勘支援之模型清單...</span
                >
              </div>
            {:else if fetchModelsSuccess && availableModels.length > 0}
              <div class="status-indicator success">
                <Sparkles size={13} />
                <span
                  >✨ 驗證成功！已探勘到 {availableModels.length} 款可用推論模型{fetchModelsSource ===
                  "cache"
                    ? " (自本機快取載入)"
                    : " (即時熱重載)"}</span
                >
              </div>
            {:else if fetchModelsError}
              <div class="status-indicator error">
                <AlertCircle size={13} />
                <span
                  >⚠️ 驗證失敗：{fetchModelsError}（請檢查金鑰有效性或網路）</span
                >
              </div>
            {:else if !(inputModel === "gemini" ? inputGeminiKey.trim() : inputGroqKey.trim())}
              <div class="status-indicator idle">
                <Lock size={13} />
                <span
                  >🔒 尚未配置金鑰。請在上方輸入金鑰以探勘官方模型清單。</span
                >
              </div>
            {/if}
          </div>

          <!-- 動態熱重載模型選擇器 -->
          <div class="form-group">
            <label class="form-label" for="dynamic-model-select">
              推論模型選擇 (依金鑰權限動態生成)
            </label>
            <select
              id="dynamic-model-select"
              class="form-select dynamic-select"
              bind:value={inputModelId}
              disabled={availableModels.length === 0}
            >
              {#if availableModels.length === 0}
                <option value="" disabled selected>
                  {isFetchingModels
                    ? "⏳ 正在熱重載模型中..."
                    : "🔒 請先在上方輸入有效 API Key 以載入模型清單"}
                </option>
              {:else}
                {#each availableModels as model (model.id)}
                  <option value={model.id}>
                    {model.displayName}
                  </option>
                {/each}
              {/if}
            </select>
            {#if availableModels.length > 0}
              {@const currentModelObj = availableModels.find(
                (m) => m.id === inputModelId,
              )}
              {#if currentModelObj?.description}
                <span class="field-hint model-desc-hint"
                  >💡 {currentModelObj.description}</span
                >
              {/if}
            {/if}
          </div>

          <footer class="modal-footer">
            <div class="telemetry">
              <span class="telemetry-dot"></span>
              <span class="telemetry-text">
                VAULT: {inputSecurityMode === "scheme_3_os_native"
                  ? "OS-NATIVE-DPAPI"
                  : "WEB-CRYPTO-AES256"} (CLOUD ISOLATED)
              </span>
            </div>
            <button class="save-settings-btn" onclick={handleSaveKeysOnly}>
              💾 保存金鑰與核心配置
            </button>
          </footer>
        </div>
      {:else if activeTab === "keybindings"}
        <!-- 獨立分頁二：按鍵偏好與 VIM 模式 -->
        <div class="modal-body settings-body">
          <div class="section-banner">
            <Keyboard size={16} class="section-icon" />
            <div class="section-title-group">
              <span class="section-main-title">按鍵偏好與編輯器模式</span>
              <span class="section-sub-title"
                >自訂 VIM 模態、快捷鍵衝突覆蓋與中文防呆機制</span
              >
            </div>
          </div>

          <!-- 預設編輯模式切換器 (STD vs VIM) -->
          <div class="form-group">
            <span class="form-label">預設編輯器模式 (Default Editor Mode)</span>
            <div class="mode-selector-grid">
              <button
                type="button"
                class="mode-choice-card {!inputVimMode ? 'selected' : ''}"
                onclick={() => handleToggleVimModeInSettings(false)}
              >
                <div class="choice-head">
                  <span class="choice-title">📝 MODE // STD-EDIT</span>
                  {#if !inputVimMode}
                    <span class="choice-badge">作用中</span>
                  {/if}
                </div>
                <p class="choice-desc">
                  標準現代無阻編輯體驗，直覺打字、游標選取與智慧染色。
                </p>
              </button>

              <button
                type="button"
                class="mode-choice-card {inputVimMode ? 'selected' : ''}"
                onclick={() => handleToggleVimModeInSettings(true)}
              >
                <div class="choice-head">
                  <span class="choice-title">⌨️ MODE // VIM-HYBRID</span>
                  {#if inputVimMode}
                    <span class="choice-badge">作用中</span>
                  {/if}
                </div>
                <p class="choice-desc">
                  經典 Normal/Insert/Visual 模態，結合物理殘影與系統剪貼簿相容。
                </p>
              </button>
            </div>
          </div>

          <!-- Vim 快捷鍵衝突攔截覆蓋 -->
          <div class="form-group">
            <div class="label-with-tool">
              <span class="form-label"
                >Vim 模式快捷鍵攔截覆蓋 (避免與常用系統習慣衝突)</span
              >
              <button
                type="button"
                class="text-link-btn reset-link"
                onclick={handleResetVimOverrides}
              >
                <RotateCcw size={12} />
                <span>恢復推薦預設值</span>
              </button>
            </div>

            <div class="overrides-grid">
              <label class="override-item">
                <input type="checkbox" bind:checked={inputVimOverrides.ctrlS} />
                <span>Ctrl+S 立即存檔</span>
              </label>
              <label class="override-item">
                <input type="checkbox" bind:checked={inputVimOverrides.ctrlC} />
                <span>Ctrl+C 系統剪貼簿</span>
              </label>
              <label class="override-item">
                <input type="checkbox" bind:checked={inputVimOverrides.ctrlV} />
                <span>Ctrl+V 系統貼上</span>
              </label>
              <label class="override-item">
                <input type="checkbox" bind:checked={inputVimOverrides.ctrlA} />
                <span>Ctrl+A 全選</span>
              </label>
              <label class="override-item">
                <input type="checkbox" bind:checked={inputVimOverrides.ctrlF} />
                <span>Ctrl+F 搜尋</span>
              </label>
              <label class="override-item">
                <input
                  type="checkbox"
                  bind:checked={inputVimOverrides.imeWarning}
                />
                <span>中文注音防呆告警</span>
              </label>
            </div>
          </div>

          <!-- 全域系統快捷鍵映射與未來自訂宣告 (Single Source of Truth) -->
          <div class="form-group">
            <div class="label-with-tool">
              <span class="form-label"
                >全域系統快捷鍵映射 (Global Shortcuts Mapping)</span
              >
              <span class="badge-hint">已綁定 Ctrl 控制 · 未來開放自訂鍵位</span
              >
            </div>

            <div class="system-shortcuts-container">
              {#each DEFAULT_SHORTCUT_GROUPS[0].items as item}
                <div class="shortcut-map-row">
                  <div class="map-label-group">
                    <span class="map-label">{item.label}</span>
                    <span class="map-desc">{item.description}</span>
                  </div>
                  <div class="map-keycaps">
                    {#each item.keys as k}
                      <kbd class="map-kbd">{k}</kbd>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <footer class="modal-footer">
            <button
              type="button"
              class="reset-secondary-btn"
              onclick={handleResetVimOverrides}
            >
              <RotateCcw size={13} />
              <span>恢復預設快捷鍵</span>
            </button>
            <button
              class="save-settings-btn"
              onclick={handleSaveKeybindingsOnly}
            >
              💾 保存按鍵偏好
            </button>
          </footer>
        </div>
      {:else if activeTab === "onedrive"}
        <!-- 雲端備份與 OneDrive 整合面板 -->
        <div class="modal-body settings-body onedrive-body">
          <div class="onedrive-header-desc">
            <span class="desc-title">☁️ OneDrive 自動雲端鏡像備份</span>
            <span class="desc-subtitle">
              純本機寫入，由微軟 OneDrive
              客戶端原生安全上傳。零授權風險、自動辨識個人版與企業/學校版。
            </span>
          </div>

          <div class="form-group">
            <div class="onedrive-account-header">
              <span class="form-label">選擇備份目的地帳號</span>
              <button
                class="rescan-btn"
                onclick={scanOneDrive}
                disabled={isScanningOneDrive}
              >
                <RefreshCw size={12} class={isScanningOneDrive ? "spin" : ""} />
                <span>重新探測</span>
              </button>
            </div>

            {#if isScanningOneDrive}
              <div class="onedrive-empty">
                <RefreshCw size={16} class="spin" />
                <span>正在從 Windows 系統環境變數探測中...</span>
              </div>
            {:else if oneDriveAccounts.length === 0}
              <div class="onedrive-empty">
                <span
                  >⚠️ 尚未探測到已登入的 OneDrive 資料夾，請確認電腦已啟動
                  OneDrive 客戶端。</span
                >
              </div>
            {:else}
              <div class="onedrive-accounts-grid">
                {#each oneDriveAccounts as acc (acc.folder_path)}
                  {@const isSelected = currentOneDrivePath === acc.folder_path}
                  <div
                    class="onedrive-acc-card {isSelected ? 'selected' : ''}"
                    onclick={() => handleSelectOneDrive(acc.folder_path)}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) =>
                      e.key === "Enter" &&
                      handleSelectOneDrive(acc.folder_path)}
                  >
                    <div class="acc-badge-icon">
                      {#if acc.account_type === "business"}
                        <Building2 size={16} class="text-business" />
                      {:else}
                        <User size={16} class="text-personal" />
                      {/if}
                    </div>
                    <div class="acc-text-wrap">
                      <div class="acc-title-row">
                        <span class="acc-title">{acc.display_name}</span>
                        <span class="acc-tag {acc.account_type}">
                          {acc.account_type === "business"
                            ? "商業/學校版"
                            : "個人版"}
                        </span>
                      </div>
                      <span class="acc-folder font-mono">{acc.folder_path}</span
                      >
                    </div>
                    <div class="acc-check">
                      {#if isSelected}
                        <Check size={14} class="text-green" />
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <div class="form-group">
            <label class="override-item auto-backup-toggle">
              <input
                type="checkbox"
                checked={isAutoBackup}
                onchange={handleToggleAutoBackup}
              />
              <div class="toggle-text">
                <span class="toggle-title"
                  >啟用背景定時與關閉前自動鏡像備份</span
                >
                <span class="toggle-sub"
                  >有變更時於背景排程備份，並在視窗關閉前立即鏡像儲存。</span
                >
              </div>
            </label>

            {#if isAutoBackup}
              <div class="backup-interval-selector">
                <span class="interval-label">⏱️ 背景備份循環頻率：</span>
                <div class="interval-capsules">
                  {#each [15, 30, 60, 120, 240] as minutes}
                    <button
                      type="button"
                      class="interval-capsule {inputBackupInterval === minutes
                        ? 'active'
                        : ''}"
                      onclick={() => handleChangeInterval(minutes)}
                    >
                      {minutes < 60
                        ? `${minutes} 分鐘`
                        : `${minutes / 60} 小時`}
                      {#if minutes === 30}
                        <span class="recommend-tag">推薦</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>

          <div class="form-group">
            <label class="override-item auto-backup-toggle">
              <input
                type="checkbox"
                checked={isEnablePeriodic}
                onchange={handleTogglePeriodicBackup}
              />
              <div class="toggle-text">
                <span class="toggle-title"
                  >啟用多週期備份庫（日・週・月階層分類輪轉存檔）</span
                >
                <span class="toggle-sub"
                  >開啟後每次備份將自動保留最近 7 天、4 週與 12
                  個月的歷史版本；關閉則僅維持最新存檔。</span
                >
              </div>
            </label>
          </div>

          <div class="onedrive-summary-box">
            <div class="summary-line">
              <span>備份儲存資料匣：</span>
              <span class="font-mono text-accent">
                {currentOneDrivePath
                  ? `${currentOneDrivePath}\\BambooSaga_VaultBackup`
                  : "未選取"}
              </span>
            </div>
            <div class="summary-line">
              <span>包含項目：</span>
              <span
                >全域藥帖 JSON 鏡像 + {(tabs || []).length} 份純 Markdown 文件 (手機
                App 可直接閱讀)</span
              >
            </div>
            {#if lastBackupResult}
              <div class="summary-line text-green">
                <span>最後備份時間：</span>
                <span
                  >{new Date(
                    lastBackupResult.timestamp * 1000,
                  ).toLocaleTimeString()} ({lastBackupResult.exported_files_count}
                  份檔案已封裝)</span
                >
              </div>
            {/if}
          </div>

          <!-- 多週期性備份讀取與還原區塊 -->
          {#if backupOverview?.has_backup}
            {@const dailyList =
              backupOverview.periodic_backups?.filter(
                (b) => b.category === "daily",
              ) || []}
            {@const weeklyList =
              backupOverview.periodic_backups?.filter(
                (b) => b.category === "weekly",
              ) || []}
            {@const monthlyList =
              backupOverview.periodic_backups?.filter(
                (b) => b.category === "monthly",
              ) || []}
            {@const currentCategoryList =
              selectedPeriodicCategory === "daily"
                ? dailyList
                : selectedPeriodicCategory === "weekly"
                  ? weeklyList
                  : monthlyList}

            <div class="onedrive-restore-panel">
              <div class="restore-title-row">
                <div class="restore-title-group">
                  <span class="restore-title"
                    >📦 多週期備份庫 (Vault Archive)</span
                  >
                  <span class="restore-sub"
                    >日・週・月階層分類輪轉，自動清理過期存檔</span
                  >
                </div>
                {#if backupOverview.latest_timestamp}
                  <span class="restore-time-badge">
                    最新存檔：{new Date(
                      backupOverview.latest_timestamp * 1000,
                    ).toLocaleTimeString()}
                  </span>
                {/if}
              </div>

              <!-- 日/週/月 分類頁籤切換器 -->
              <div class="periodic-tabs-bar">
                <button
                  type="button"
                  class="periodic-tab-pill {selectedPeriodicCategory === 'daily'
                    ? 'active'
                    : ''}"
                  onclick={() => (selectedPeriodicCategory = "daily")}
                >
                  📅 每日備份 ({dailyList.length})
                </button>
                <button
                  type="button"
                  class="periodic-tab-pill {selectedPeriodicCategory ===
                  'weekly'
                    ? 'active'
                    : ''}"
                  onclick={() => (selectedPeriodicCategory = "weekly")}
                >
                  🗓️ 每週備份 ({weeklyList.length})
                </button>
                <button
                  type="button"
                  class="periodic-tab-pill {selectedPeriodicCategory ===
                  'monthly'
                    ? 'active'
                    : ''}"
                  onclick={() => (selectedPeriodicCategory = "monthly")}
                >
                  🌙 每月備份 ({monthlyList.length})
                </button>
              </div>

              <!-- 週期備份項目清單 -->
              <div class="periodic-snapshots-list">
                {#if currentCategoryList.length === 0}
                  <div class="snapshots-empty">
                    <span>此週期分類暫無存檔（下次執行備份時自動分類生成）</span
                    >
                  </div>
                {:else}
                  {#each currentCategoryList as item (item.file_path)}
                    <div class="snapshot-card">
                      <div class="snapshot-info">
                        <span class="snapshot-label"
                          >{formatBackupLabel(
                            item.category,
                            item.file_name,
                          )}</span
                        >
                        <div class="snapshot-meta">
                          <span
                            >{new Date(
                              item.timestamp * 1000,
                            ).toLocaleString()}</span
                          >
                          <span>•</span>
                          <span class="font-mono">{formatBytes(item.size)}</span
                          >
                        </div>
                      </div>
                      <button
                        type="button"
                        class="snapshot-restore-btn"
                        onclick={() =>
                          handleRestoreFromOneDrive(
                            item.file_path,
                            item.file_name,
                          )}
                        title="將百子櫃還原至此歷史備份點"
                      >
                        <Download size={12} />
                        <span>還原此版</span>
                      </button>
                    </div>
                  {/each}
                {/if}
              </div>

              <div class="restore-actions-row">
                <button
                  type="button"
                  class="restore-btn"
                  onclick={() =>
                    handleRestoreFromOneDrive(undefined, "最新鏡像存檔")}
                  title="將 OneDrive 最新鏡像還原至當前百子櫃"
                >
                  <Download size={14} />
                  <span>📥 還原最新鏡像 (Latest)</span>
                </button>
                <button
                  type="button"
                  class="open-explorer-btn"
                  onclick={handleOpenExplorer}
                  title="在 Windows 檔案總管中直接開啟此目錄"
                >
                  <FolderOpen size={14} />
                  <span>📂 開啟備份資料匣</span>
                </button>
              </div>

              {#if backupOverview.markdown_files.length > 0}
                <div class="restore-files-preview">
                  <span class="preview-label"
                    >手機可直接閱讀之 Markdown 匯出檔 ({backupOverview
                      .markdown_files.length})：</span
                  >
                  <div class="files-tags-wrap">
                    {#each backupOverview.markdown_files.slice(0, 8) as f}
                      <span class="file-tag">{f}</span>
                    {/each}
                    {#if backupOverview.markdown_files.length > 8}
                      <span class="file-tag more"
                        >+{backupOverview.markdown_files.length - 8} 篇...</span
                      >
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <footer class="modal-footer onedrive-footer">
            <button
              class="backup-now-btn"
              disabled={!currentOneDrivePath || isBackingUp}
              onclick={handleBackupNow}
            >
              {#if isBackingUp}
                <RefreshCw size={14} class="spin" />
                <span>備份封裝寫入中...</span>
              {:else}
                <Cloud size={14} />
                <span>⚡ 立即執行全域備份 (Backup Now)</span>
              {/if}
            </button>
          </footer>
        </div>
      {:else if activeTab === "layout"}
        <!-- 獨立分頁四：版面配置與視圖偏好 -->
        <div class="modal-body settings-body">
          <div class="section-banner">
            <LayoutTemplate size={16} class="section-icon" />
            <div class="section-title-group">
              <span class="section-main-title">工作台版面與檢視偏好</span>
              <span class="section-sub-title"
                >自訂畫布排版寬度、字級大小與 AI 審查對照體驗</span
              >
            </div>
          </div>

          <!-- 一、工作台畫布格局 -->
          <div class="form-group">
            <span class="form-label">工作台畫布寬度 (Canvas Layout Mode)</span>
            <div class="mode-selector-grid">
              <button
                type="button"
                class="mode-choice-card {inputLayoutConfig.workbenchWidth ===
                'zen'
                  ? 'selected'
                  : ''}"
                onclick={() => (inputLayoutConfig.workbenchWidth = "zen")}
              >
                <div class="choice-head">
                  <span class="choice-title">📜 禪風居中 // ZEN (960px)</span>
                  {#if inputLayoutConfig.workbenchWidth === "zen"}
                    <span class="choice-badge">作用中</span>
                  {/if}
                </div>
                <p class="choice-desc">
                  黃金閱讀寬度，沉浸專注，文字視線集中不散亂。
                </p>
              </button>

              <button
                type="button"
                class="mode-choice-card {inputLayoutConfig.workbenchWidth ===
                'full'
                  ? 'selected'
                  : ''}"
                onclick={() => (inputLayoutConfig.workbenchWidth = "full")}
              >
                <div class="choice-head">
                  <span class="choice-title">🖥️ 全螢幕滿版 // FULL WIDTH</span>
                  {#if inputLayoutConfig.workbenchWidth === "full"}
                    <span class="choice-badge">作用中</span>
                  {/if}
                </div>
                <p class="choice-desc">
                  完全填滿左右兩側視窗，提供極限寬廣的視野與橫向空間。
                </p>
              </button>
            </div>
          </div>

          <!-- 二、AI 變更與審查對照 -->
          <div class="form-group">
            <span class="form-label"
              >AI 提煉審查偏好 (AI Review Preferences)</span
            >
            <div class="overrides-grid">
              <label class="override-item">
                <input
                  type="checkbox"
                  bind:checked={inputLayoutConfig.autoDiffOnAi}
                />
                <span>AI 提煉完成後自動展開雙欄對照</span>
              </label>
              <label class="override-item">
                <input
                  type="checkbox"
                  bind:checked={inputLayoutConfig.scrollSync}
                />
                <span>雙欄對照左右捲動同步 (Scroll Sync)</span>
              </label>
            </div>
            <span class="field-hint"
              >一般筆記時常駐單欄沉浸；僅在 AI
              整理產出後，依此設定在審查列提供無縫比對。</span
            >
          </div>

          <!-- 三、編輯器字級縮放 -->
          <div class="form-group">
            <span class="form-label">編輯器字級大小 (Editor Font Size)</span>
            <div class="font-size-grid">
              {#each ["13px", "14px", "16px", "18px"] as size}
                <button
                  type="button"
                  class="font-size-pill {inputLayoutConfig.fontSize === size
                    ? 'selected'
                    : ''}"
                  onclick={() => (inputLayoutConfig.fontSize = size as any)}
                >
                  <span class="size-text">{size}</span>
                  {#if size === "14px"}<span class="size-hint">(預設)</span
                    >{/if}
                </button>
              {/each}
            </div>
          </div>

          <!-- 四、視覺動態反饋 -->
          <div class="form-group">
            <span class="form-label">物理動態反饋 (Visual Effects)</span>
            <div class="overrides-grid">
              <label class="override-item">
                <input
                  type="checkbox"
                  bind:checked={inputLayoutConfig.smearCursor}
                />
                <span>流光游標物理拖尾殘影 (Smear Cursor)</span>
              </label>
            </div>
          </div>

          <footer class="modal-footer">
            <button
              type="button"
              class="reset-secondary-btn"
              onclick={handleResetLayout}
            >
              <RotateCcw size={13} />
              <span>恢復預設版面</span>
            </button>
            <button class="save-settings-btn" onclick={handleSaveLayoutOnly}>
              💾 保存版面配置
            </button>
          </footer>
        </div>
      {:else if activeTab === "system"}
        <!-- 獨立分頁六：系統整合與原生路由 -->
        <div class="modal-body settings-body">
          <div class="section-banner">
            <span style="font-size: 16px;">🖥️</span>
            <div class="section-title-group">
              <span class="section-main-title">跨平台系統整合與原生路由</span>
              <span class="section-sub-title"
                >偵測作業系統：{sysInfo.os.toUpperCase()} · 單一實例守護運行中 (Single-Instance
                Router)</span
              >
            </div>
          </div>

          <!-- 一、單一實例與冷熱路由狀態 -->
          <div class="system-dashboard-grid">
            <div class="sys-metric-card">
              <div class="metric-top">
                <span class="metric-label">實例路由狀態</span>
                <span class="status-pill active">🟢 守護中</span>
              </div>
              <div class="metric-title">單一視窗熱傳遞</div>
              <div class="metric-desc">
                重複點選或自外部開啟檔案時，自動拉回現有視窗聚焦並切換新分頁，避免重複多開。
              </div>
            </div>

            <div class="sys-metric-card">
              <div class="metric-top">
                <span class="metric-label">跨平台拖曳落藥</span>
                <span class="status-pill active">🟢 支援就緒</span>
              </div>
              <div class="metric-title">全域 Drag & Drop</div>
              <div class="metric-desc">
                可隨時從 Windows 檔案總管、macOS Finder、Linux
                將文件拖入編輯區直接收入藥帖。
              </div>
            </div>
          </div>

          <!-- 二、Windows 右鍵選單操作面板 -->
          {#if sysInfo.supports_context_menu}
            <div class="form-group" style="margin-top: 18px;">
              <span class="form-label"
                >Windows 檔案總管滑鼠右鍵選單 (Context Menu)</span
              >
              <div class="system-integration-card">
                <div class="integration-row">
                  <div class="integration-info">
                    <div class="integration-title">
                      「用 廣零散 收入藥帖」捷徑整合
                    </div>
                    <div class="integration-desc">
                      將操作機碼寫入當前使用者登錄檔（<code
                        >HKCU\Software\Classes</code
                      >），<strong>免 UAC 系統管理員權限</strong>，隨開隨用。
                    </div>
                    <div class="integration-features-list">
                      <div class="feat-item">
                        📄 任意文字/Markdown 檔案右鍵：<strong
                          >「🍃 用 廣零散 收入藥帖」</strong
                        >
                      </div>
                      <div class="feat-item">
                        📁 任意資料夾右鍵：<strong
                          >「📜 用 廣零散 開啟藥卷庫」</strong
                        >
                      </div>
                      <div class="feat-item">
                        🗂️ 資料夾空白背景右鍵：<strong
                          >「📜 在此處開啟 廣零散 藥卷庫」</strong
                        >
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="context-menu-toggle-btn {sysInfo.is_context_menu_enabled
                      ? 'enabled'
                      : ''}"
                    disabled={isTogglingContextMenu}
                    onclick={handleToggleContextMenu}
                  >
                    {#if isTogglingContextMenu}
                      處理中...
                    {:else if sysInfo.is_context_menu_enabled}
                      ✓ 已啟用 (點擊移除)
                    {:else}
                      + 點擊啟用右鍵選單
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          {:else}
            <!-- 非 Windows 平台說明 -->
            <div class="cross-platform-full-note">
              <div class="note-title">跨平台原生相容與檔案關聯</div>
              <div class="note-desc">
                {#if sysInfo.os === "macos"}
                  🍎 <strong>macOS 原生關聯相容</strong>： 您可以在 Finder
                  中對任意文字或 Markdown 檔案按右鍵選擇「打開方式 ➔
                  廣零散」，或直接將檔案拖移至 Dock
                  圖示與開啟中的視窗，廣零散會透過 Cocoa
                  原生事件自動接收並開啟新藥帖。
                {:else if sysInfo.os === "linux"}
                  🐧 <strong>Linux 桌面標準相容</strong>： 打包時已註冊 XDG
                  桌面規格與標準 MIME 檔案關聯（<code>text/markdown</code>,
                  <code>text/plain</code
                  >），可直接在檔案管理員中點擊開啟或拖曳。
                {:else}
                  🌐 跨平台預覽環境：支援檔案關聯與拖曳直開。
                {/if}
              </div>
            </div>
          {/if}

          <!-- 三、支援檔案格式清單 -->
          <div class="form-group" style="margin-top: 18px;">
            <span class="form-label"
              >原生支援與關聯之藥帖格式 (Supported File Associations)</span
            >
            <div class="file-associations-pills">
              <span class="assoc-pill">.md (Markdown)</span>
              <span class="assoc-pill">.markdown</span>
              <span class="assoc-pill">.txt (純文字)</span>
              <span class="assoc-pill">.json</span>
              <span class="assoc-pill">.csv</span>
              <span class="assoc-pill">.log</span>
            </div>
          </div>

          <!-- 四、版本資訊與線上升級檢查 (Release Radar) -->
          <div class="form-group" style="margin-top: 22px;">
            <span class="form-label">
              軟體版本與線上升級檢查 (Version & Updates)
            </span>
            <div class="system-integration-card">
              <div class="integration-row">
                <div class="integration-info">
                  <div class="integration-title" style="display: flex; align-items: center; gap: 8px;">
                    <span>廣零散 當前版本：<code>{CURRENT_VERSION}</code></span>
                    {#if updateResult?.hasUpdate}
                      <span style="background: #b8bb26; color: #1d2021; font-size: 10px; font-weight: bold; padding: 1px 6px; border-radius: 4px;">NEW</span>
                    {/if}
                  </div>
                  <div class="integration-desc">
                    {#if isCheckingUpdates}
                      <span style="color: #d79921;">⏳ 連線至 GitHub API 檢索最新發佈版本中...</span>
                    {:else if updateResult}
                      {#if updateResult.hasUpdate}
                        <span style="color: #b8bb26;">
                          🎉 發現新版本 <strong>{updateResult.latestVersion}</strong>！建議前往 GitHub 下載更新檔體驗最新功能。
                        </span>
                      {:else}
                        <span style="color: #b8bb26;">
                          ✓ 目前已是最新版本 ({CURRENT_VERSION})，萬象齊全。
                        </span>
                      {/if}
                    {:else if updateError}
                      <span style="color: #fb4934;">
                        ⚠️ {updateError}
                      </span>
                    {:else}
                      直連 GitHub Releases 公開端點，無感檢索最新跨平台安裝檔與版本更迭說明。
                    {/if}
                  </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                  {#if updateResult?.hasUpdate}
                    <a
                      href={updateResult.releaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="context-menu-toggle-btn enabled"
                      style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center; height: 32px;"
                    >
                      🚀 前往下載 ↗
                    </a>
                  {/if}
                  <button
                    type="button"
                    class="context-menu-toggle-btn"
                    disabled={isCheckingUpdates}
                    onclick={handleCheckUpdates}
                  >
                    {#if isCheckingUpdates}
                      檢查中...
                    {:else}
                      🔄 檢查最新版本
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <footer class="modal-footer">
            <div class="telemetry">
              <span class="telemetry-dot"></span>
              <span class="telemetry-text"
                >ROUTER: SINGLE-INSTANCE KERNEL ACTIVE</span
              >
            </div>
            <button class="save-settings-btn" onclick={onClose}>
              ✓ 完成並關閉
            </button>
          </footer>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .modal-box {
    width: 100%;
    max-width: 980px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    background: #141615;
    border: 1px solid #504534;
    border-radius: 8px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.9);
    overflow: hidden;
    font-family: var(--font-mono, monospace);
    animation: modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes modal-pop {
    from {
      transform: scale(0.96);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .modal-header {
    height: 50px;
    padding: 0 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(80, 69, 52, 0.45);
    background: #191c1a;
    flex-shrink: 0;
    gap: 12px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .pulse-cinnabar {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #c95847;
    box-shadow: 0 0 8px #c95847;
    animation: pulse 1s infinite alternate;
    flex-shrink: 0;
  }

  @keyframes pulse {
    from {
      opacity: 0.4;
    }
    to {
      opacity: 1;
    }
  }

  .engine-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: #ece7dc;
    letter-spacing: 0.08em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .engine-badge {
    font-size: 0.65rem;
    padding: 1px 6px;
    border-radius: 3px;
    background: #242220;
    color: #b59e72;
    border: 1px solid #504534;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .header-nav {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .tab-btn {
    padding: 4px 9px;
    border-radius: 4px;
    background: transparent;
    border: 1px solid transparent;
    color: #938c80;
    font-size: 0.72rem;
    cursor: pointer;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s;
  }

  .tab-btn:hover {
    color: #ece7dc;
  }

  .tab-btn.active {
    background: #242220;
    border-color: #504534;
    color: #d49b35;
    font-weight: 600;
  }

  .esc-btn {
    padding: 2px 7px;
    background: #0e0e0e;
    border: 1px solid #504534;
    border-radius: 4px;
    color: #938c80;
    font-size: 0.68rem;
    cursor: pointer;
  }

  .esc-btn:hover {
    color: #ece7dc;
    border-color: #d49b35;
  }

  .error-banner {
    padding: 8px 18px;
    background: rgba(201, 88, 71, 0.18);
    border-bottom: 1px solid #c95847;
    color: #ffb4ab;
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .modal-body {
    padding: 20px 22px;
    flex: 1;
    overflow-y: auto;
    max-height: calc(88vh - 50px);
  }

  .philosophy-quote {
    color: #b59e72;
    font-size: 0.78rem;
    line-height: 1.6;
    margin: 0 0 16px 0;
    font-style: italic;
  }

  /* 三欄矩陣卡片 */
  .matrix-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 18px;
  }

  .matrix-card {
    background: #1f2020;
    border: 1px solid #504534;
    border-radius: 6px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .matrix-card:hover {
    background: #292a2a;
    border-color: #d49b35;
    transform: translateY(-1px);
  }

  .matrix-card.selected {
    border-color: #d49b35;
    background: rgba(212, 155, 53, 0.12);
  }

  .card-head {
    margin-bottom: 8px;
  }

  .step-tag {
    font-size: 0.68rem;
    font-weight: 700;
    display: block;
    margin-bottom: 4px;
  }

  .tag-cinnabar {
    color: #c95847;
  }
  .tag-ochre {
    color: #d49b35;
  }
  .tag-olive {
    color: #869b74;
  }

  .card-title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: #ece7dc;
  }

  .card-desc {
    margin: 0;
    font-size: 0.68rem;
    color: #938c80;
    line-height: 1.5;
  }

  .title-with-badge {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .active-badge {
    font-size: 0.62rem;
    padding: 1px 6px;
    border-radius: 10px;
    background: rgba(212, 155, 53, 0.25);
    color: #fabd2f;
    border: 1px solid rgba(212, 155, 53, 0.4);
    font-weight: 600;
  }

  .card-action-hint {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px dashed rgba(80, 69, 52, 0.4);
    font-size: 0.64rem;
    color: #868074;
    text-align: right;
  }

  /* 選中卡片之心法配置面板 */
  .card-config-panel {
    background: #191c1a;
    border: 1px solid rgba(212, 155, 53, 0.4);
    border-radius: 6px;
    padding: 12px 14px;
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .panel-title-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .config-tag {
    font-size: 0.7rem;
    font-weight: 700;
  }

  .config-title {
    font-size: 0.76rem;
    font-weight: 600;
    color: #ece7dc;
  }

  .panel-btn-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 3px;
    font-size: 0.66rem;
    background: transparent;
    cursor: pointer;
    font-family: var(--font-mono, monospace);
    transition: all 0.15s ease;
  }

  .reset-btn {
    border: 1px solid #504534;
    color: #938c80;
  }

  .reset-btn:hover {
    border-color: #c95847;
    color: #c95847;
  }

  .save-card-btn {
    border: 1px solid #869b74;
    color: #b8bb26;
    background: rgba(134, 155, 116, 0.12);
  }

  .save-card-btn:hover {
    background: #869b74;
    color: #141615;
  }

  .prompt-textarea {
    width: 100%;
    background: #0e0e0e;
    border: 1px solid #3c3836;
    border-radius: 4px;
    padding: 8px 10px;
    color: #ece7dc;
    font-size: 0.74rem;
    font-family: var(--font-mono, monospace);
    line-height: 1.5;
    resize: vertical;
    outline: none;
  }

  .prompt-textarea:focus {
    border-color: #d49b35;
  }

  .prompt-help-note {
    font-size: 0.64rem;
    color: #868074;
  }

  .custom-prompt-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 20px;
  }

  .prompt-label {
    font-size: 0.72rem;
    color: #938c80;
  }

  .prompt-input {
    width: 100%;
    height: 34px;
    background: #0e0e0e;
    border: 1px solid #504534;
    border-radius: 4px;
    padding: 0 10px;
    color: #ece7dc;
    font-size: 0.78rem;
    font-family: var(--font-mono, monospace);
    outline: none;
  }

  .prompt-input:focus {
    border-color: #d49b35;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 14px;
    border-top: 1px solid rgba(80, 69, 52, 0.35);
    gap: 12px;
  }

  .telemetry {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.68rem;
    color: #868074;
  }

  .telemetry-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #c95847;
  }

  .auto-refine-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 16px;
    background: #d49b35;
    border: 1px solid #d49b35;
    border-radius: 20px;
    color: #141615;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .auto-refine-btn:hover:not(:disabled) {
    background: #fabd2f;
    box-shadow: 0 0 14px rgba(212, 155, 53, 0.6);
  }

  .fire-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #c95847;
  }

  /* 區塊標題橫幅 */
  .section-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: rgba(45, 43, 39, 0.35);
    border: 1px solid rgba(80, 69, 52, 0.4);
    border-radius: 6px;
    margin-bottom: 14px;
  }

  :global(.section-icon) {
    color: #d49b35;
    flex-shrink: 0;
  }

  .section-title-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .section-main-title {
    font-size: 0.78rem;
    font-weight: 600;
    color: #ece7dc;
  }

  .section-sub-title {
    font-size: 0.66rem;
    color: #868074;
  }

  .label-with-tool {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .text-link-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    color: #b59e72;
    font-size: 0.66rem;
    cursor: pointer;
    font-family: var(--font-mono, monospace);
  }

  .text-link-btn:hover {
    color: #fabd2f;
    text-decoration: underline;
  }

  .reset-link {
    color: #938c80;
  }

  .reset-link:hover {
    color: #c95847;
  }

  .field-hint {
    font-size: 0.64rem;
    color: #868074;
    margin-top: 2px;
  }

  /* 模式選擇卡片 (STD vs VIM) */
  .mode-selector-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-top: 4px;
  }

  .mode-choice-card {
    background: #0e0e0e;
    border: 1px solid #3c3836;
    border-radius: 6px;
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: all 0.15s ease;
    font-family: var(--font-mono, monospace);
  }

  .mode-choice-card:hover {
    border-color: #d49b35;
    background: #181919;
  }

  .mode-choice-card.selected {
    border-color: #d49b35;
    background: rgba(212, 155, 53, 0.12);
  }

  .choice-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .choice-title {
    font-size: 0.76rem;
    font-weight: 700;
    color: #ece7dc;
  }

  .choice-badge {
    font-size: 0.6rem;
    padding: 1px 5px;
    border-radius: 3px;
    background: #d49b35;
    color: #141615;
    font-weight: 700;
  }

  .choice-desc {
    font-size: 0.66rem;
    color: #938c80;
    margin: 0;
    line-height: 1.4;
  }

  .reset-secondary-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 12px;
    height: 34px;
    border-radius: 4px;
    background: transparent;
    border: 1px solid #504534;
    color: #938c80;
    font-size: 0.72rem;
    cursor: pointer;
    font-family: var(--font-mono, monospace);
    transition: all 0.15s ease;
  }

  .reset-secondary-btn:hover {
    border-color: #c95847;
    color: #c95847;
  }

  /* 編輯器字級大小網格按鈕 */
  .font-size-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-top: 4px;
  }

  .font-size-pill {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 7px 10px;
    background: #0e0e0e;
    border: 1px solid #3c3836;
    border-radius: 4px;
    color: #a89984;
    cursor: pointer;
    font-size: 0.74rem;
    font-family: var(--font-mono, monospace);
    transition: all 0.15s ease;
  }

  .font-size-pill:hover {
    border-color: #d49b35;
    color: #ebdbb2;
  }

  .font-size-pill.selected {
    border-color: #d49b35;
    background: rgba(212, 155, 53, 0.12);
    color: #fabd2f;
    font-weight: 700;
  }

  .font-size-pill .size-hint {
    font-size: 0.62rem;
    opacity: 0.75;
  }

  /* 設定頁籤表單通用 */
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }

  .form-label {
    font-size: 0.72rem;
    color: #ece7dc;
  }

  .form-input,
  .form-select {
    height: 34px;
    background: #0e0e0e;
    border: 1px solid #504534;
    border-radius: 4px;
    padding: 0 10px;
    color: #ece7dc;
    font-size: 0.78rem;
    font-family: var(--font-mono, monospace);
    outline: none;
  }

  .form-input:focus,
  .form-select:focus {
    border-color: #d49b35;
  }

  .overrides-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-top: 4px;
  }

  .override-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.72rem;
    color: #938c80;
    cursor: pointer;
  }

  .badge-hint {
    font-size: 10px;
    color: #7daea3;
    font-family: "JetBrains Mono", monospace;
    background: rgba(125, 174, 163, 0.1);
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid rgba(125, 174, 163, 0.25);
  }

  .system-shortcuts-container {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: rgba(20, 22, 21, 0.6);
    border: 1px solid rgba(235, 219, 178, 0.08);
    border-radius: 4px;
    padding: 8px 10px;
  }

  .shortcut-map-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 8px;
    border-radius: 3px;
    background: rgba(29, 32, 33, 0.4);
  }

  .shortcut-map-row:hover {
    background: rgba(212, 155, 53, 0.08);
  }

  .map-label-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .map-label {
    font-size: 11px;
    font-weight: 600;
    color: #ece7dc;
  }

  .map-desc {
    font-size: 10px;
    color: #868074;
  }

  .map-keycaps {
    display: flex;
    gap: 4px;
  }

  .map-kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 6px;
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    font-weight: 600;
    color: #ece7dc;
    background: #141615;
    border: 1px solid rgba(235, 219, 178, 0.2);
    border-bottom: 2px solid rgba(212, 155, 53, 0.5);
    border-radius: 3px;
  }

  .save-settings-btn {
    height: 34px;
    padding: 0 16px;
    background: #1f2020;
    border: 1px solid #d49b35;
    color: #d49b35;
    border-radius: 4px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-mono, monospace);
    transition: all 0.15s ease;
  }

  .save-settings-btn:hover {
    background: #d49b35;
    color: #141615;
  }

  /* OneDrive 雲端備份樣式 */
  .onedrive-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .onedrive-header-desc {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(80, 69, 52, 0.3);
  }

  .desc-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: #ece7dc;
  }

  .desc-subtitle {
    font-size: 0.72rem;
    color: #938c80;
    line-height: 1.4;
  }

  .onedrive-account-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .rescan-btn {
    background: transparent;
    border: 1px solid #3c3836;
    color: #a89984;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .rescan-btn:hover:not(:disabled) {
    background: #282828;
    color: #ebdbb2;
    border-color: #504945;
  }

  .onedrive-empty {
    background: #0e0e0e;
    border: 1px dashed #3c3836;
    border-radius: 4px;
    padding: 16px;
    font-size: 0.72rem;
    color: #938c80;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
  }

  .onedrive-accounts-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .onedrive-acc-card {
    background: #121312;
    border: 1px solid #262420;
    border-radius: 4px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .onedrive-acc-card:hover {
    background: #1a1b1a;
    border-color: #504534;
  }

  .onedrive-acc-card.selected {
    background: #1d201f;
    border-color: #d49b35;
    box-shadow: inset 3px 0 0 #d49b35;
  }

  .acc-badge-icon {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    background: #0e0e0e;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  :global(.text-business) {
    color: #83a598;
  }

  :global(.text-personal) {
    color: #fabd2f;
  }

  :global(.text-green) {
    color: #b8bb26;
  }

  :global(.text-accent) {
    color: #d49b35;
  }

  .acc-text-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }

  .acc-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .acc-title {
    font-size: 0.78rem;
    font-weight: 600;
    color: #ece7dc;
  }

  .acc-tag {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 2px;
    font-weight: 500;
  }

  .acc-tag.business {
    background: rgba(131, 165, 152, 0.15);
    color: #83a598;
    border: 1px solid rgba(131, 165, 152, 0.3);
  }

  .acc-tag.personal {
    background: rgba(250, 189, 47, 0.15);
    color: #fabd2f;
    border: 1px solid rgba(250, 189, 47, 0.3);
  }

  .acc-folder {
    font-size: 11px;
    color: #7c6f64;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .acc-check {
    width: 20px;
    display: flex;
    justify-content: center;
  }

  .auto-backup-toggle {
    background: #0e0e0e;
    border: 1px solid #262420;
    border-radius: 4px;
    padding: 8px 10px;
    cursor: pointer;
  }

  .auto-backup-toggle input[type="checkbox"] {
    accent-color: #d49b35;
    margin-top: 2px;
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: #ece7dc;
  }

  .toggle-sub {
    font-size: 0.68rem;
    color: #938c80;
  }

  .onedrive-summary-box {
    background: #0e0e0e;
    border: 1px dashed rgba(80, 69, 52, 0.4);
    border-radius: 4px;
    padding: 10px;
    font-size: 0.72rem;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .summary-line {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: #938c80;
  }

  .onedrive-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
  }

  .backup-now-btn {
    width: 100%;
    height: 36px;
    background: #076678;
    border: 1px solid #83a598;
    color: #fbf1c7;
    font-size: 0.8rem;
    font-weight: 700;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .backup-now-btn:hover:not(:disabled) {
    background: #458588;
    box-shadow: 0 0 14px rgba(131, 165, 152, 0.4);
  }

  .backup-now-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* 備份還原面板樣式 */
  .onedrive-restore-panel {
    background: #121312;
    border: 1px solid #3c3836;
    border-radius: 4px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .restore-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .restore-title {
    font-size: 0.76rem;
    font-weight: 700;
    color: #fbf1c7;
  }

  .restore-time-badge {
    font-size: 10px;
    color: #b8bb26;
    font-family: monospace;
  }

  .restore-actions-row {
    display: flex;
    gap: 8px;
  }

  .restore-btn {
    flex: 1;
    height: 32px;
    background: #282828;
    border: 1px solid #b8bb26;
    color: #b8bb26;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .restore-btn:hover {
    background: #323530;
    box-shadow: 0 0 10px rgba(184, 187, 38, 0.25);
  }

  .open-explorer-btn {
    flex: 1;
    height: 32px;
    background: #1f2020;
    border: 1px solid #504945;
    color: #ebdbb2;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .open-explorer-btn:hover {
    background: #282828;
    border-color: #83a598;
    color: #83a598;
  }

  .restore-files-preview {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }

  .preview-label {
    font-size: 10px;
    color: #7c6f64;
  }

  .files-tags-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .file-tag {
    background: #191b1a;
    border: 1px solid #262420;
    color: #a89984;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-family: monospace;
  }

  /* 背景備份間隔選擇器 */
  .backup-interval-selector {
    margin-top: 8px;
    padding: 8px 10px;
    background: #141615;
    border: 1px solid #262420;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .interval-label {
    font-size: 11px;
    color: #a89984;
    font-weight: 500;
  }

  .interval-capsules {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .interval-capsule {
    padding: 3px 8px;
    border-radius: 12px;
    background: #1d2021;
    border: 1px solid #3c3836;
    color: #928374;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .interval-capsule:hover {
    color: #ebdbb2;
    border-color: #504945;
  }

  .interval-capsule.active {
    background: #32302f;
    border-color: #fabd2f;
    color: #fabd2f;
    font-weight: 600;
  }

  .recommend-tag {
    font-size: 9px;
    background: rgba(250, 189, 47, 0.2);
    color: #fabd2f;
    padding: 0 4px;
    border-radius: 6px;
  }

  /* 多週期性分類備份樣式 */
  .restore-title-group {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .restore-sub {
    font-size: 10px;
    color: #7c6f64;
  }

  .periodic-tabs-bar {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid #282828;
    padding-bottom: 6px;
  }

  .periodic-tab-pill {
    padding: 4px 10px;
    border-radius: 4px;
    background: #1a1c1b;
    border: 1px solid #282828;
    color: #7c6f64;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .periodic-tab-pill:hover {
    color: #ebdbb2;
    background: #242625;
  }

  .periodic-tab-pill.active {
    background: #282828;
    border-color: #d49b35;
    color: #d49b35;
    font-weight: 600;
  }

  .periodic-snapshots-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 140px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .snapshots-empty {
    padding: 12px;
    text-align: center;
    color: #7c6f64;
    font-size: 11px;
    background: #181918;
    border: 1px dashed #282828;
    border-radius: 4px;
  }

  .snapshot-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: #191b1a;
    border: 1px solid #2b2b2b;
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .snapshot-card:hover {
    border-color: #504945;
    background: #202321;
  }

  .snapshot-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .snapshot-label {
    font-size: 11px;
    font-weight: 600;
    color: #ebdbb2;
  }

  .snapshot-meta {
    font-size: 10px;
    color: #7c6f64;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .snapshot-restore-btn {
    padding: 3px 8px;
    background: #282828;
    border: 1px solid #665c54;
    color: #d5c4a1;
    font-size: 10px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .snapshot-restore-btn:hover {
    background: #3c3836;
    border-color: #b8bb26;
    color: #b8bb26;
  }

  .file-tag.more {
    color: #d49b35;
    border-color: rgba(212, 155, 53, 0.3);
  }

  /* 系統整合與原生路由樣式 */
  .system-integration-card {
    background: #1d2021;
    border: 1px solid #3c3836;
    border-radius: 6px;
    padding: 16px;
    margin-top: 10px;
    margin-bottom: 20px;
  }

  .integration-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .integration-info {
    flex: 1;
  }

  .integration-title {
    font-size: 13px;
    font-weight: 600;
    color: #ebdbb2;
    margin-bottom: 4px;
    font-family: "JetBrains Mono", sans-serif;
  }

  .integration-desc {
    font-size: 11px;
    color: #a89984;
    line-height: 1.5;
  }

  .context-menu-toggle-btn {
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    font-family: "JetBrains Mono", monospace;
    cursor: pointer;
    background: #282828;
    color: #d49b35;
    border: 1px solid #d49b35;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .context-menu-toggle-btn:hover:not(:disabled) {
    background: rgba(212, 155, 53, 0.15);
    box-shadow: 0 0 10px rgba(212, 155, 53, 0.3);
  }

  .context-menu-toggle-btn.enabled {
    background: #427b58;
    color: #fbf1c7;
    border-color: #689d6a;
  }

  .context-menu-toggle-btn.enabled:hover:not(:disabled) {
    background: #cc241d;
    color: #fbf1c7;
    border-color: #fb4934;
  }

  /* 系統整合專屬儀表板樣式 */
  .system-dashboard-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-top: 10px;
    margin-bottom: 6px;
  }

  .sys-metric-card {
    background: #1d2021;
    border: 1px solid #3c3836;
    border-radius: 6px;
    padding: 14px 16px;
  }

  .metric-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .metric-label {
    font-size: 11px;
    color: #a89984;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-pill.active {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(184, 187, 38, 0.15);
    color: #b8bb26;
    border: 1px solid rgba(184, 187, 38, 0.3);
    font-weight: 600;
  }

  .metric-title {
    font-size: 14px;
    font-weight: 700;
    color: #ebdbb2;
    margin-bottom: 4px;
  }

  .metric-desc {
    font-size: 11px;
    color: #928374;
    line-height: 1.5;
  }

  .integration-features-list {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .feat-item {
    font-size: 11px;
    color: #d5c4a1;
    background: #282828;
    padding: 4px 8px;
    border-radius: 4px;
    border-left: 2px solid #d49b35;
  }

  .cross-platform-full-note {
    background: #1d2021;
    border: 1px solid #3c3836;
    border-left: 3px solid #83a598;
    border-radius: 6px;
    padding: 16px;
    margin-top: 12px;
  }

  .cross-platform-full-note .note-title {
    font-size: 13px;
    font-weight: 600;
    color: #83a598;
    margin-bottom: 8px;
  }

  .cross-platform-full-note .note-desc {
    font-size: 12px;
    color: #d5c4a1;
    line-height: 1.6;
  }

  .file-associations-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
  }

  .assoc-pill {
    background: #282828;
    border: 1px solid #504534;
    color: #b59e72;
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 12px;
    font-family: "JetBrains Mono", monospace;
  }

  /* 金鑰安全持久化方案卡片 */
  .security-scheme-card {
    background: #1d2021;
    border: 1px solid #3c3836;
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 16px;
  }

  .scheme-header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #d49b35;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  .scheme-options-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .scheme-option-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: #282828;
    border: 1px solid #3c3836;
    border-radius: 6px;
    padding: 10px 12px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .scheme-option-item:hover {
    border-color: #7c6f64;
    background: #32302f;
  }

  .scheme-option-item.selected {
    border-color: #d49b35;
    background: rgba(212, 155, 53, 0.08);
  }

  .scheme-option-item input[type="radio"] {
    margin-top: 2px;
    accent-color: #d49b35;
    cursor: pointer;
  }

  .scheme-item-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .scheme-item-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .scheme-item-name {
    font-size: 12px;
    font-weight: 600;
    color: #ebdbb2;
  }

  .scheme-tag-rec {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 10px;
    background: #427b58;
    color: #fbf1c7;
  }

  .scheme-item-desc {
    font-size: 11px;
    color: #a89984;
    line-height: 1.4;
  }

  .onedrive-isolation-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: 6px;
    background: rgba(66, 123, 88, 0.12);
    border: 1px solid #427b58;
    color: #8ec07c;
    font-size: 12px;
    line-height: 1.4;
  }

  /* 推論引擎選擇膠囊按鈕 */
  .provider-capsule-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .provider-capsule {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 10px 14px;
    background: #282828;
    border: 1px solid #3c3836;
    border-radius: 6px;
    color: #ebdbb2;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s ease;
  }

  .provider-capsule:hover {
    border-color: #7c6f64;
    background: #32302f;
  }

  .provider-capsule.active {
    border-color: #d49b35;
    background: rgba(212, 155, 53, 0.12);
    color: #fabd2f;
  }

  .capsule-sub {
    font-size: 11px;
    font-weight: 400;
    color: #928374;
  }

  .provider-capsule.active .capsule-sub {
    color: #d5c4a1;
  }

  /* 工具按鈕組 */
  .tool-btn-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .refresh-models-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid #504945;
    color: #83a598;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .refresh-models-btn:hover:not(:disabled) {
    background: #32302f;
    border-color: #83a598;
    color: #b8bb26;
  }

  .refresh-models-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  :global(.refresh-models-btn .spin) {
    animation: rotate-spinner 1s linear infinite;
  }

  @keyframes rotate-spinner {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* 連線與熱重載狀態列 */
  .hot-reload-status-box {
    margin-top: -6px;
    margin-bottom: 14px;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.4;
  }

  .status-indicator.loading {
    background: rgba(131, 165, 152, 0.1);
    border: 1px solid #458588;
    color: #83a598;
  }

  .status-indicator.success {
    background: rgba(184, 187, 38, 0.12);
    border: 1px solid #98971a;
    color: #b8bb26;
  }

  .status-indicator.error {
    background: rgba(204, 36, 29, 0.12);
    border: 1px solid #cc241d;
    color: #fb4934;
  }

  .status-indicator.idle {
    background: #1d2021;
    border: 1px dashed #3c3836;
    color: #7c6f64;
  }

  .dynamic-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: #1d2021;
    border-style: dashed;
  }

  .model-desc-hint {
    margin-top: 6px;
    color: #83a598 !important;
  }
</style>
