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
    RotateCcw,
    Key,
    Keyboard,
    Eye,
    EyeOff,
    LayoutTemplate,
    Shield,
    Sparkles,
    AlertCircle,
    CheckCircle2,
  } from "lucide-svelte";
  import {
    fetchGeminiModels,
    fetchGroqModels,
    fetchCustomModels,
    normalizeEndpoint,
    getCachedModels,
    type AvailableModelItem,
  } from "../lib/ai/modelFetcher";
  import {
    saveSecureKeys,
    loadSecureKeys,
    getCurrentSecurityMode,
    type SecurityMode,
    type AiProvider,
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
    selectedModel: AiProvider;
    selectedModelId?: string;
    securityMode?: SecurityMode;
    groqApiKey: string;
    geminiApiKey: string;
    customApiKey?: string;
    customEndpoint?: string;
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
      tab: "refine" | "keys" | "keybindings" | "onedrive" | "layout" | "system",
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
      model: AiProvider,
      vimOverrides: VimKeyOverrides,
    ) => void;
    onSaveKeys?: (
      groq: string,
      gemini: string,
      model: AiProvider,
      modelId?: string,
      securityMode?: SecurityMode,
      customKey?: string,
      customEndpoint?: string,
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
    selectedModel = "gemini" as AiProvider,
    selectedModelId = "gemini-1.5-flash",
    securityMode = "scheme_3_os_native" as SecurityMode,
    groqApiKey = "",
    geminiApiKey = "",
    customApiKey = "",
    customEndpoint = "http://localhost:11434/v1",
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

  let showGeminiKey = $state(false);
  let showGroqKey = $state(false);

  let inputCards = $state<Record<string, AlchemyCardConfig>>(
    getDefaultAlchemyCards(),
  );
  let inputLayoutConfig = $state<LayoutConfig>(getDefaultLayoutConfig());
  let inputVimMode = $state(false);
  let inputVimOverrides = $state<VimKeyOverrides>(getDefaultVimOverrides());

  let inputGroqKey = $state("");
  let inputGeminiKey = $state("");
  let inputCustomKey = $state("");
  let inputCustomEndpoint = $state("http://localhost:11434/v1");
  let inputModel = $state<AiProvider>("gemini");
  let inputModelId = $state("gemini-1.5-flash");
  let inputSecurityMode = $state<SecurityMode>("scheme_3_os_native");
  let showCustomKey = $state(false);

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

      if (currentProvider === "custom") {
        isFetchingModels = true;
        fetchModelsError = null;
        fetchModelsSuccess = false;

        try {
          const res = await fetchCustomModels(
            inputCustomEndpoint,
            inputCustomKey,
          );
          if (res.success && res.models.length > 0) {
            availableModels = res.models;
            fetchModelsSuccess = true;
            fetchModelsSource = res.source;
            if (!res.models.some((m) => m.id === inputModelId)) {
              inputModelId = res.models[0].id;
            }
          } else {
            availableModels = [];
            fetchModelsError = res.error || "連線至本地端點失敗";
          }
        } catch (err: any) {
          availableModels = [];
          fetchModelsError = err.message || "連線異常";
        } finally {
          isFetchingModels = false;
        }
        return;
      }

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

  function handleProviderChange(newProvider: AiProvider) {
    inputModel = newProvider;
    const cached = getCachedModels(newProvider);
    if (cached && cached.length > 0) {
      availableModels = cached;
      if (!cached.some((m) => m.id === inputModelId)) {
        inputModelId = cached[0].id;
      }
    } else {
      availableModels = [];
      if (newProvider === "custom") {
        inputModelId = "llama3.2";
      }
    }
    triggerModelFetch(true);
  }

  let oneDriveAccounts = $state<OneDriveAccountInfo[]>([]);
  let currentOneDrivePath = $state("");
  let isAutoBackup = $state(false);
  let inputBackupInterval = $state(30);
  let isEnablePeriodic = $state(true);
  let isScanningOneDrive = $state(false);
  let isBackingUp = $state(false);
  let lastBackupResult = $state<BackupResult | null>(null);
  let backupOverview = $state<OneDriveBackupOverview | null>(null);
  let isCheckingBackup = $state(false);
  let prevIsOpen = false;

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
    if (isOpen && !prevIsOpen) {
      inputGroqKey = groqApiKey;
      inputGeminiKey = geminiApiKey;
      inputCustomKey = customApiKey;
      inputCustomEndpoint = customEndpoint || "http://localhost:11434/v1";
      inputModel = selectedModel;
      const currentOrFallback =
        !selectedModelId || selectedModelId === "gemini-2.5-flash"
          ? selectedModel === "groq"
            ? "llama-3.3-70b-versatile"
            : selectedModel === "custom"
              ? "llama3.2"
              : "gemini-1.5-flash"
          : selectedModelId;
      inputModelId = currentOrFallback;
      inputSecurityMode = securityMode || getCurrentSecurityMode();

      const cached = getCachedModels(inputModel);
      if (cached && cached.length > 0) {
        availableModels = cached;
      }
      if (
        (inputModel === "gemini" && inputGeminiKey) ||
        (inputModel === "groq" && inputGroqKey) ||
        inputModel === "custom"
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

  function handleSaveKeysOnly() {
    if (onSaveKeys) {
      onSaveKeys(
        inputGroqKey.trim(),
        inputGeminiKey.trim(),
        inputModel,
        inputModelId,
        inputSecurityMode,
        inputCustomKey.trim(),
        inputCustomEndpoint.trim(),
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
  <!-- 背景遮罩 -->
  <div class="modal-backdrop" onclick={onClose} role="presentation"></div>

  <!-- 主體容器：Apothecary Gruvbox 沉浸通透面板 -->
  <div
    class="modal-box"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onkeydown={(e) => {
      if (e.key === "Escape") onClose();
    }}
  >
    <!-- 頂部導航列：精簡膠囊分頁 -->
    <header class="modal-header">
      <div class="header-left">
        <span class="brand-glyph">⚙</span>
        <span class="engine-title">
          {activeTab === "onedrive"
            ? "雲端備份中樞"
            : activeTab === "keybindings"
              ? "按鍵與編輯偏好"
              : activeTab === "layout"
                ? "版面配置偏好"
                : activeTab === "system"
                  ? "跨平台系統整合"
                  : "API 金鑰與推論核心"}
        </span>
      </div>

      <div class="header-nav">
        <button
          type="button"
          class="tab-pill {activeTab === 'keys' || activeTab === 'settings'
            ? 'active'
            : ''}"
          onclick={() => setTab("keys")}
        >
          🔑 金鑰配置
        </button>
        <button
          type="button"
          class="tab-pill {activeTab === 'keybindings' ? 'active' : ''}"
          onclick={() => setTab("keybindings")}
        >
          ⌨️ 按鍵偏好
        </button>
        <button
          type="button"
          class="tab-pill {activeTab === 'layout' ? 'active' : ''}"
          onclick={() => setTab("layout")}
        >
          📐 版面配置
        </button>
        <button
          type="button"
          class="tab-pill {activeTab === 'onedrive' ? 'active' : ''}"
          onclick={() => setTab("onedrive")}
        >
          ☁️ 雲端備份
        </button>
        <button
          type="button"
          class="tab-pill {activeTab === 'system' ? 'active' : ''}"
          onclick={() => setTab("system")}
        >
          🖥️ 系統整合
        </button>
        <button
          type="button"
          class="esc-btn"
          onclick={onClose}
          title="關閉 (ESC)"
        >
          ✕
        </button>
      </div>
    </header>

    {#if errorMsg}
      <div class="error-banner">
        <span>⚠️ {errorMsg}</span>
      </div>
    {/if}

    <!-- 分頁一：API 金鑰與推論核心 -->
    {#if activeTab === "keys" || activeTab === "settings"}
      <div class="modal-body settings-body">
        <div class="section-banner">
          <Key size={15} class="section-icon" />
          <div class="section-title-group">
            <span class="section-main-title">AI 推論金鑰與熱重載核心</span>
            <span class="section-sub-title"
              >輸入金鑰即時探勘可用模型，本機安全加密不落雲端</span
            >
          </div>
        </div>

        <!-- 本機加密機制選擇 -->
        <div class="security-scheme-card">
          <div class="scheme-header">
            <Shield size={14} class="scheme-icon" />
            <span class="scheme-title">金鑰本機安全持久化機制</span>
          </div>
          <div class="scheme-options-grid">
            <button
              type="button"
              class="scheme-option-item {inputSecurityMode ===
              'scheme_3_os_native'
                ? 'selected'
                : ''}"
              onclick={() => (inputSecurityMode = "scheme_3_os_native")}
            >
              <div class="scheme-item-content">
                <div class="scheme-item-header">
                  <span class="scheme-item-name">作業系統原生認證保險庫</span>
                  <span class="scheme-tag-rec">推薦</span>
                </div>
                <span class="scheme-item-desc"
                  >透過 OS 原生憑證安全庫綁定電腦登入帳號，不落地純文字。</span
                >
              </div>
            </button>

            <button
              type="button"
              class="scheme-option-item {inputSecurityMode ===
              'scheme_2_web_crypto'
                ? 'selected'
                : ''}"
              onclick={() => (inputSecurityMode = "scheme_2_web_crypto")}
            >
              <div class="scheme-item-content">
                <div class="scheme-item-header">
                  <span class="scheme-item-name"
                    >本機沙盒 + Web Crypto (AES-256)</span
                  >
                </div>
                <span class="scheme-item-desc"
                  >本機硬體加速加密密文隔離，即使開啟本地儲存檔案亦為密文。</span
                >
              </div>
            </button>
          </div>

          <div class="onedrive-isolation-notice">
            <CheckCircle2 size={13} class="notice-icon" />
            <span
              ><strong>雲端隔離保證</strong>：所有 API 金鑰已從 OneDrive
              同步備份中徹底脫敏剔除。</span
            >
          </div>
        </div>

        <!-- 核心推論引擎供應商選擇 -->
        <div class="form-group">
          <span class="form-label">核心推論引擎供應商</span>
          <div class="provider-capsule-row">
            <button
              type="button"
              class="provider-capsule {inputModel === 'gemini' ? 'active' : ''}"
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
            <button
              type="button"
              class="provider-capsule {inputModel === 'custom' ? 'active' : ''}"
              onclick={() => handleProviderChange("custom")}
            >
              <span>本地 / Ollama</span>
              <span class="capsule-sub">100% 離線私密</span>
            </button>
          </div>
        </div>

        <!-- 金鑰輸入框 -->
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
                  {#if showGeminiKey}<EyeOff size={13} />
                    <span>隱藏</span>{:else}<Eye size={13} />
                    <span>顯示</span>{/if}
                </button>
                <button
                  type="button"
                  class="refresh-models-btn"
                  disabled={isFetchingModels || !inputGeminiKey.trim()}
                  onclick={() => triggerModelFetch(true)}
                >
                  <RefreshCw size={12} class={isFetchingModels ? "spin" : ""} />
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
          </div>
        {:else if inputModel === "groq"}
          <div class="form-group">
            <div class="label-with-tool">
              <label class="form-label" for="groq-key">Groq API Key</label>
              <div class="tool-btn-group">
                <button
                  type="button"
                  class="text-link-btn"
                  onclick={() => (showGroqKey = !showGroqKey)}
                >
                  {#if showGroqKey}<EyeOff size={13} />
                    <span>隱藏</span>{:else}<Eye size={13} />
                    <span>顯示</span>{/if}
                </button>
                <button
                  type="button"
                  class="refresh-models-btn"
                  disabled={isFetchingModels || !inputGroqKey.trim()}
                  onclick={() => triggerModelFetch(true)}
                >
                  <RefreshCw size={12} class={isFetchingModels ? "spin" : ""} />
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
          </div>
        {:else}
          <div class="form-group">
            <div class="label-with-tool">
              <label class="form-label" for="custom-endpoint"
                >本地端點 URL (Base URL)</label
              >
              <button
                type="button"
                class="refresh-models-btn"
                disabled={isFetchingModels}
                onclick={() => triggerModelFetch(true)}
              >
                <RefreshCw size={12} class={isFetchingModels ? "spin" : ""} />
                <span>測試連線與探勘模型</span>
              </button>
            </div>
            <input
              id="custom-endpoint"
              type="text"
              class="form-input font-mono"
              placeholder="http://localhost:11434/v1"
              bind:value={inputCustomEndpoint}
              oninput={() => triggerModelFetch(false)}
            />
            <div class="quick-endpoint-chips">
              <span class="chip-label">快捷填入：</span>
              <button
                type="button"
                class="quick-chip"
                onclick={() => {
                  inputCustomEndpoint = "http://localhost:11434/v1";
                  triggerModelFetch(true);
                }}
              >
                Ollama (11434)
              </button>
              <button
                type="button"
                class="quick-chip"
                onclick={() => {
                  inputCustomEndpoint = "http://localhost:1234/v1";
                  triggerModelFetch(true);
                }}
              >
                LM Studio (1234)
              </button>
            </div>
          </div>
        {/if}

        <!-- 連線狀態提示 -->
        <div class="hot-reload-status-box">
          {#if isFetchingModels}
            <div class="status-indicator loading">
              <span class="spinner-small">⏳</span>
              <span>正在向端點探勘支援之模型清單...</span>
            </div>
          {:else if fetchModelsSuccess && availableModels.length > 0}
            <div class="status-indicator success">
              <Sparkles size={13} />
              <span
                >驗證成功！已探勘到 {availableModels.length} 款可用推論模型</span
              >
            </div>
          {:else if fetchModelsError}
            <div class="status-indicator error">
              <AlertCircle size={13} />
              <span>驗證失敗：{fetchModelsError}</span>
            </div>
          {/if}
        </div>

        <!-- 動態模型選擇器 -->
        <div class="form-group">
          <label class="form-label" for="dynamic-model-select"
            >推論模型選擇</label
          >
          {#if availableModels.length > 0}
            <select
              id="dynamic-model-select"
              class="form-select dynamic-select"
              bind:value={inputModelId}
            >
              {#each availableModels as model (model.id)}
                <option value={model.id}>{model.displayName}</option>
              {/each}
            </select>
          {:else}
            <input
              id="dynamic-model-select"
              type="text"
              class="form-input font-mono"
              placeholder="請先配置金鑰"
              bind:value={inputModelId}
            />
          {/if}
        </div>

        <!-- 機敏資訊防護濾網說明 -->
        <div class="sanitizer-shield-card">
          <div class="shield-head">
            <ShieldCheck size={14} class="shield-icon" />
            <span class="shield-title"
              >AI 機敏資訊防護濾網 (Sanitizer Guard) · 啟動中</span
            >
          </div>
          <p class="shield-desc">
            向雲端 AI 傳送前自動脫敏金鑰與個資，守護本機隱私。
          </p>
        </div>

        <footer class="modal-footer">
          <div class="telemetry">
            <span class="telemetry-dot"></span>
            <span class="telemetry-text">
              VAULT: {inputSecurityMode === "scheme_3_os_native"
                ? "OS-NATIVE"
                : "WEB-CRYPTO"}
            </span>
          </div>
          <button
            type="button"
            class="save-settings-btn"
            onclick={handleSaveKeysOnly}
          >
            💾 保存金鑰與核心配置
          </button>
        </footer>
      </div>

      <!-- 分頁二：按鍵偏好與 VIM 模式 -->
    {:else if activeTab === "keybindings"}
      <div class="modal-body settings-body">
        <div class="section-banner">
          <Keyboard size={15} class="section-icon" />
          <div class="section-title-group">
            <span class="section-main-title">按鍵偏好與編輯器模式</span>
            <span class="section-sub-title"
              >自訂 VIM 模態、快捷鍵衝突覆蓋與中文防呆機制</span
            >
          </div>
        </div>

        <div class="form-group">
          <span class="form-label">預設編輯器模式</span>
          <div class="mode-selector-grid">
            <button
              type="button"
              class="mode-choice-card {!inputVimMode ? 'selected' : ''}"
              onclick={() => handleToggleVimModeInSettings(false)}
            >
              <div class="choice-head">
                <span class="choice-title">STD-EDIT 標準模式</span>
                {#if !inputVimMode}<span class="choice-badge">作用中</span>{/if}
              </div>
              <p class="choice-desc">
                標準現代無阻編輯體驗，直覺打字與游標選取。
              </p>
            </button>

            <button
              type="button"
              class="mode-choice-card {inputVimMode ? 'selected' : ''}"
              onclick={() => handleToggleVimModeInSettings(true)}
            >
              <div class="choice-head">
                <span class="choice-title">VIM-HYBRID 模態</span>
                {#if inputVimMode}<span class="choice-badge">作用中</span>{/if}
              </div>
              <p class="choice-desc">
                經典 Normal/Insert/Visual 模態，結合系統剪貼簿相容。
              </p>
            </button>
          </div>
        </div>

        <div class="form-group">
          <div class="label-with-tool">
            <span class="form-label">Vim 模式快捷鍵衝突攔截覆蓋</span>
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

        <footer class="modal-footer">
          <button
            type="button"
            class="reset-secondary-btn"
            onclick={handleResetVimOverrides}
          >
            <RotateCcw size={13} />
            <span>恢復預設</span>
          </button>
          <button
            type="button"
            class="save-settings-btn"
            onclick={handleSaveKeybindingsOnly}
          >
            💾 保存按鍵偏好
          </button>
        </footer>
      </div>

      <!-- 分頁三：版面配置偏好 -->
    {:else if activeTab === "layout"}
      <div class="modal-body settings-body">
        <div class="section-banner">
          <LayoutTemplate size={15} class="section-icon" />
          <div class="section-title-group">
            <span class="section-main-title">工作台版面與檢視偏好</span>
            <span class="section-sub-title"
              >自訂畫布排版寬度、字級大小與動態反饋</span
            >
          </div>
        </div>

        <div class="form-group">
          <span class="form-label">工作台畫布寬度</span>
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
                <span class="choice-title">禪風居中 (960px)</span>
                {#if inputLayoutConfig.workbenchWidth === "zen"}<span
                    class="choice-badge">作用中</span
                  >{/if}
              </div>
              <p class="choice-desc">黃金閱讀寬度，沉浸專注，文字視線集中。</p>
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
                <span class="choice-title">全螢幕滿版</span>
                {#if inputLayoutConfig.workbenchWidth === "full"}<span
                    class="choice-badge">作用中</span
                  >{/if}
              </div>
              <p class="choice-desc">
                完全填滿左右兩側視窗，提供極限寬廣視野。
              </p>
            </button>
          </div>
        </div>

        <div class="form-group">
          <span class="form-label">編輯器字級大小</span>
          <div class="font-size-grid">
            {#each ["13px", "14px", "16px", "18px"] as size}
              <button
                type="button"
                class="font-size-pill {inputLayoutConfig.fontSize === size
                  ? 'selected'
                  : ''}"
                onclick={() => (inputLayoutConfig.fontSize = size as any)}
              >
                <span>{size}</span>
                {#if size === "14px"}<span class="size-hint">(預設)</span>{/if}
              </button>
            {/each}
          </div>
        </div>

        <div class="form-group">
          <span class="form-label">視覺動態反饋與捲動</span>
          <div class="overrides-grid">
            <label class="override-item">
              <input
                type="checkbox"
                bind:checked={inputLayoutConfig.smearCursor}
              />
              <span>流光游標物理拖尾殘影 (Smear Cursor)</span>
            </label>
            <label class="override-item">
              <input
                type="checkbox"
                bind:checked={inputLayoutConfig.typewriterMode}
              />
              <span>打字機垂直置中捲動 (Typewriter)</span>
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
          <button
            type="button"
            class="save-settings-btn"
            onclick={handleSaveLayoutOnly}
          >
            💾 保存版面配置
          </button>
        </footer>
      </div>

      <!-- 分頁四：雲端備份與 OneDrive -->
    {:else if activeTab === "onedrive"}
      <div class="modal-body settings-body onedrive-body">
        <div class="onedrive-header-desc">
          <span class="desc-title">☁️ OneDrive 自動雲端鏡像備份</span>
          <span class="desc-subtitle"
            >純本機寫入，由微軟 OneDrive 客戶端原生安全上傳。</span
          >
        </div>

        <div class="form-group">
          <div class="onedrive-account-header">
            <span class="form-label">選擇備份目的地帳號</span>
            <button
              type="button"
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
              <span>正在從系統環境變數探測中...</span>
            </div>
          {:else if oneDriveAccounts.length === 0}
            <div class="onedrive-empty">
              <span>⚠️ 尚未探測到已登入的 OneDrive 資料夾。</span>
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
                    e.key === "Enter" && handleSelectOneDrive(acc.folder_path)}
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
                        {acc.account_type === "business" ? "商業版" : "個人版"}
                      </span>
                    </div>
                    <span class="acc-folder font-mono">{acc.folder_path}</span>
                  </div>
                  <div class="acc-check">
                    {#if isSelected}<Check size={14} class="text-green" />{/if}
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
              <span class="toggle-title">啟用背景定時與關閉前自動鏡像備份</span>
              <span class="toggle-sub"
                >有變更時於背景排程備份，並在視窗關閉前立即鏡像儲存。</span
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
        </div>

        <footer class="modal-footer onedrive-footer">
          <button
            type="button"
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

      <!-- 分頁五：系統整合與原生路由 -->
    {:else if activeTab === "system"}
      <div class="modal-body settings-body">
        <div class="section-banner">
          <span style="font-size: 16px;">🖥️</span>
          <div class="section-title-group">
            <span class="section-main-title">跨平台系統整合與原生路由</span>
            <span class="section-sub-title"
              >偵測作業系統：{sysInfo.os.toUpperCase()} · 單一實例守護運行中</span
            >
          </div>
        </div>

        <div class="system-dashboard-grid">
          <div class="sys-metric-card">
            <div class="metric-top">
              <span class="metric-label">實例路由狀態</span>
              <span class="status-pill active">🟢 守護中</span>
            </div>
            <div class="metric-title">單一視窗熱傳遞</div>
            <div class="metric-desc">
              重複點選或自外部開啟檔案時自動拉回現有視窗。
            </div>
          </div>

          <div class="sys-metric-card">
            <div class="metric-top">
              <span class="metric-label">跨平台拖曳落藥</span>
              <span class="status-pill active">🟢 支援就緒</span>
            </div>
            <div class="metric-title">全域 Drag & Drop</div>
            <div class="metric-desc">
              可隨時從檔案總管將文件拖入編輯區直接收入藥帖。
            </div>
          </div>
        </div>

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
                    免 UAC 系統管理員權限，隨開隨用。
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
        {/if}

        <footer class="modal-footer">
          <div class="telemetry">
            <span class="telemetry-dot"></span>
            <span class="telemetry-text"
              >ROUTER: SINGLE-INSTANCE KERNEL ACTIVE</span
            >
          </div>
          <button type="button" class="save-settings-btn" onclick={onClose}>
            ✓ 完成並關閉
          </button>
        </footer>
      </div>
    {/if}
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
  }

  .modal-box {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90vw;
    max-width: 960px;
    height: 84vh;
    background: rgba(20, 22, 21, 0.98);
    color: #e6dfd5;
    z-index: 1001;
    display: flex;
    flex-direction: column;
    box-shadow:
      0 24px 60px rgba(0, 0, 0, 0.78),
      0 0 0 1px rgba(250, 189, 47, 0.08);
    border: 1px solid rgba(100, 86, 66, 0.4);
    border-radius: 12px;
    overflow: hidden;
    font-family: "JetBrains Mono", monospace;
    animation: modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes modal-pop {
    from {
      transform: translate(-50%, -48%) scale(0.98);
      opacity: 0;
    }
    to {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
    }
  }

  .modal-header {
    height: 56px;
    padding: 0 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(16, 18, 17, 0.9);
    border-bottom: 1px solid rgba(100, 86, 66, 0.25);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-glyph {
    font-size: 16px;
    color: #fabd2f;
  }

  .engine-title {
    font-size: 14.5px;
    font-weight: 600;
    color: #ebdbb2;
    letter-spacing: 0.03em;
  }

  .header-nav {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tab-pill {
    padding: 6px 12px;
    border-radius: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: #8c8273;
    font-size: 12.5px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.14s ease;
  }

  .tab-pill:hover {
    color: #d5c4a1;
    background: rgba(255, 255, 255, 0.035);
  }

  .tab-pill.active {
    background: rgba(250, 189, 47, 0.08);
    border-color: rgba(250, 189, 47, 0.22);
    color: #fabd2f;
    font-weight: 500;
  }

  .esc-btn {
    background: transparent;
    border: none;
    color: #7c7365;
    font-size: 15px;
    width: 30px;
    height: 30px;
    border-radius: 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.14s ease;
  }

  .esc-btn:hover {
    background: rgba(251, 73, 52, 0.14);
    color: #fb4934;
  }

  .error-banner {
    padding: 8px 18px;
    background: rgba(251, 73, 52, 0.15);
    border-bottom: 1px solid rgba(251, 73, 52, 0.4);
    color: #fb4934;
    font-size: 12px;
  }

  .modal-body {
    padding: 20px 24px;
    flex: 1;
    overflow-y: auto;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 24px;
    border-top: 1px solid rgba(100, 86, 66, 0.2);
    background: rgba(16, 18, 17, 0.4);
    flex-shrink: 0;
  }

  .telemetry {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #7c7365;
  }

  .telemetry-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #8ec07c;
  }

  /* 區塊標題橫幅 */
  .section-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(100, 86, 66, 0.22);
    border-radius: 7px;
    margin-bottom: 16px;
  }

  :global(.section-icon) {
    color: #fabd2f;
    flex-shrink: 0;
  }

  .section-title-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .section-main-title {
    font-size: 13.5px;
    font-weight: 600;
    color: #ebdbb2;
  }

  .section-sub-title {
    font-size: 11.5px;
    color: #7c7365;
  }

  /* 通用表單控制項 */
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
  }

  .form-label {
    font-size: 12.5px;
    color: #e6dfd5;
    font-weight: 500;
  }

  .form-input,
  .form-select {
    height: 36px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(100, 86, 66, 0.32);
    border-radius: 7px;
    padding: 0 12px;
    color: #ebdbb2;
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: all 0.15s ease;
  }

  .form-input:focus,
  .form-select:focus {
    border-color: rgba(250, 189, 47, 0.55);
    background: rgba(0, 0, 0, 0.4);
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
    color: #b8ac99;
    font-size: 11.5px;
    cursor: pointer;
  }

  .text-link-btn:hover {
    color: #fabd2f;
  }

  /* 模式選擇與供應商卡片網格 */
  .mode-selector-grid,
  .provider-capsule-row,
  .scheme-options-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-top: 4px;
  }

  .provider-capsule-row {
    grid-template-columns: repeat(3, 1fr);
  }

  .mode-choice-card,
  .provider-capsule,
  .scheme-option-item {
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(100, 86, 66, 0.28);
    border-radius: 8px;
    padding: 11px 14px;
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: all 0.15s ease;
    color: inherit;
  }

  .mode-choice-card:hover,
  .provider-capsule:hover,
  .scheme-option-item:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(250, 189, 47, 0.35);
  }

  .mode-choice-card.selected,
  .provider-capsule.active,
  .scheme-option-item.selected {
    background: rgba(250, 189, 47, 0.09);
    border-color: rgba(250, 189, 47, 0.4);
  }

  .choice-head,
  .scheme-item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .choice-title,
  .scheme-item-name {
    font-size: 13.5px;
    font-weight: 600;
    color: #ebdbb2;
  }

  .mode-choice-card.selected .choice-title,
  .scheme-option-item.selected .scheme-item-name {
    color: #fabd2f;
  }

  .choice-badge,
  .scheme-tag-rec {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(250, 189, 47, 0.15);
    color: #fabd2f;
    font-weight: 500;
  }

  .choice-desc,
  .scheme-item-desc {
    font-size: 11.5px;
    color: #7c7365;
    margin: 0;
    line-height: 1.4;
  }

  .capsule-sub {
    font-size: 11px;
    color: #7c7365;
  }

  /* 儲存按鈕 */
  .save-settings-btn {
    height: 34px;
    padding: 0 16px;
    background: rgba(250, 189, 47, 0.14);
    border: 1px solid rgba(250, 189, 47, 0.38);
    color: #fabd2f;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .save-settings-btn:hover {
    background: #fabd2f;
    color: #1d2021;
  }

  .reset-secondary-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    height: 34px;
    border-radius: 6px;
    background: transparent;
    border: 1px solid rgba(100, 86, 66, 0.3);
    color: #8c8273;
    font-size: 12.5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .reset-secondary-btn:hover {
    border-color: rgba(251, 73, 52, 0.4);
    color: #fb4934;
  }

  /* 字級與覆蓋選項 */
  .font-size-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .font-size-pill {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(100, 86, 66, 0.28);
    border-radius: 6px;
    color: #a89984;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s ease;
  }

  .font-size-pill:hover {
    border-color: rgba(250, 189, 47, 0.35);
    color: #ebdbb2;
  }

  .font-size-pill.selected {
    border-color: rgba(250, 189, 47, 0.45);
    background: rgba(250, 189, 47, 0.1);
    color: #fabd2f;
    font-weight: 600;
  }

  .overrides-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .override-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: #b8ac99;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(100, 86, 66, 0.2);
    padding: 8px 10px;
    border-radius: 6px;
  }

  .override-item input[type="checkbox"] {
    accent-color: #fabd2f;
  }

  /* 防護卡片與狀態指示 */
  .sanitizer-shield-card,
  .security-scheme-card,
  .system-integration-card,
  .sys-metric-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(100, 86, 66, 0.25);
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 16px;
  }

  .shield-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    color: #fabd2f;
    font-size: 13px;
    font-weight: 600;
  }

  .shield-desc {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.5;
    color: #8c8273;
  }

  .onedrive-isolation-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: 6px;
    background: rgba(142, 192, 124, 0.08);
    border: 1px solid rgba(142, 192, 124, 0.3);
    color: #8ec07c;
    font-size: 12px;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    margin-bottom: 14px;
  }

  .status-indicator.loading {
    background: rgba(131, 165, 152, 0.1);
    border: 1px solid #458588;
    color: #83a598;
  }

  .status-indicator.success {
    background: rgba(142, 192, 124, 0.1);
    border: 1px solid rgba(142, 192, 124, 0.3);
    color: #8ec07c;
  }

  .status-indicator.error {
    background: rgba(251, 73, 52, 0.1);
    border: 1px solid rgba(251, 73, 52, 0.3);
    color: #fb4934;
  }

  /* 雲端備份帳號卡片 */
  .onedrive-accounts-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .onedrive-acc-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(100, 86, 66, 0.25);
    border-radius: 7px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .onedrive-acc-card:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(250, 189, 47, 0.3);
  }

  .onedrive-acc-card.selected {
    background: rgba(250, 189, 47, 0.08);
    border-color: rgba(250, 189, 47, 0.4);
  }

  .acc-badge-icon {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .acc-text-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .acc-title {
    font-size: 13px;
    font-weight: 500;
    color: #ebdbb2;
  }

  .acc-folder {
    font-size: 11px;
    color: #7c7365;
  }

  .backup-now-btn {
    width: 100%;
    height: 36px;
    background: rgba(142, 192, 124, 0.14);
    border: 1px solid rgba(142, 192, 124, 0.35);
    color: #8ec07c;
    font-size: 13px;
    font-weight: 500;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .backup-now-btn:hover:not(:disabled) {
    background: #8ec07c;
    color: #1d2021;
  }

  .backup-now-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .quick-endpoint-chips {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 6px;
  }

  .quick-chip {
    padding: 3px 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(100, 86, 66, 0.28);
    border-radius: 5px;
    color: #b8ac99;
    font-size: 11.5px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .quick-chip:hover {
    border-color: rgba(250, 189, 47, 0.4);
    color: #fabd2f;
    background: rgba(250, 189, 47, 0.08);
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

  /* OneDrive 雲端備份面板 */
  .onedrive-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .onedrive-header-desc {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(100, 86, 66, 0.2);
  }

  .desc-title {
    font-size: 13.5px;
    font-weight: 600;
    color: #ebdbb2;
  }

  .desc-subtitle {
    font-size: 11.5px;
    color: #7c7365;
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
    border: 1px solid rgba(100, 86, 66, 0.3);
    color: #8c8273;
    padding: 3px 8px;
    border-radius: 5px;
    font-size: 11.5px;
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    transition: all 0.14s ease;
  }

  .rescan-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.04);
    color: #ebdbb2;
    border-color: rgba(250, 189, 47, 0.3);
  }

  .onedrive-empty {
    background: rgba(0, 0, 0, 0.2);
    border: 1px dashed rgba(100, 86, 66, 0.3);
    border-radius: 6px;
    padding: 16px;
    font-size: 12px;
    color: #7c7365;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
  }

  .acc-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .acc-tag {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 500;
  }

  .acc-tag.business {
    background: rgba(131, 165, 152, 0.12);
    color: #83a598;
    border: 1px solid rgba(131, 165, 152, 0.25);
  }

  .acc-tag.personal {
    background: rgba(250, 189, 47, 0.12);
    color: #fabd2f;
    border: 1px solid rgba(250, 189, 47, 0.25);
  }

  .acc-check {
    width: 20px;
    display: flex;
    justify-content: center;
  }

  :global(.text-business) {
    color: #83a598;
  }

  :global(.text-personal) {
    color: #fabd2f;
  }

  :global(.text-green) {
    color: #8ec07c;
  }

  :global(.text-accent) {
    color: #fabd2f;
  }

  .auto-backup-toggle {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-title {
    font-size: 12.5px;
    font-weight: 600;
    color: #ebdbb2;
  }

  .toggle-sub {
    font-size: 11px;
    color: #7c7365;
  }

  .onedrive-summary-box {
    background: rgba(0, 0, 0, 0.2);
    border: 1px dashed rgba(100, 86, 66, 0.3);
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 12px;
  }

  .summary-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: #8c8273;
  }

  .onedrive-footer {
    display: flex;
    justify-content: flex-end;
  }

  /* 系統整合與原生路由 */
  .system-dashboard-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }

  .sys-metric-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(100, 86, 66, 0.25);
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 0;
  }

  .metric-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .metric-label {
    font-size: 10.5px;
    color: #7c7365;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-pill.active {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(142, 192, 124, 0.12);
    color: #8ec07c;
    border: 1px solid rgba(142, 192, 124, 0.25);
    font-weight: 500;
  }

  .metric-title {
    font-size: 13.5px;
    font-weight: 600;
    color: #ebdbb2;
  }

  .metric-desc {
    font-size: 11.5px;
    color: #7c7365;
    line-height: 1.4;
  }

  .system-integration-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(100, 86, 66, 0.25);
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 0;
  }

  .integration-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .integration-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .integration-title {
    font-size: 13px;
    font-weight: 600;
    color: #ebdbb2;
  }

  .integration-desc {
    font-size: 11.5px;
    color: #7c7365;
    line-height: 1.4;
  }

  .context-menu-toggle-btn {
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    background: rgba(250, 189, 47, 0.1);
    color: #fabd2f;
    border: 1px solid rgba(250, 189, 47, 0.35);
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .context-menu-toggle-btn:hover:not(:disabled) {
    background: #fabd2f;
    color: #1d2021;
  }

  .context-menu-toggle-btn.enabled {
    background: rgba(142, 192, 124, 0.14);
    color: #8ec07c;
    border-color: rgba(142, 192, 124, 0.35);
  }

  .context-menu-toggle-btn.enabled:hover:not(:disabled) {
    background: rgba(251, 73, 52, 0.15);
    color: #fb4934;
    border-color: rgba(251, 73, 52, 0.4);
  }

  /* 輔助細節 */
  .reset-link {
    color: #7c7365;
  }

  .reset-link:hover {
    color: #fb4934;
  }

  .size-hint {
    font-size: 10px;
    opacity: 0.65;
  }

  .dynamic-select {
    cursor: pointer;
  }

  .model-desc-hint {
    font-size: 11.5px;
    color: #83a598;
    margin-top: 4px;
  }
</style>
