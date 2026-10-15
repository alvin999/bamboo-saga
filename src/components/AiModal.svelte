<script lang="ts">
  import type { RefineryMode } from '../lib/ai/refinery';
  import type { TabItem, VimKeyOverrides, OneDriveAccountInfo, BackupResult, OneDriveBackupOverview } from '../types/tab';
  import {
    detectOneDriveAccounts,
    backupVaultToOneDrive,
    checkOneDriveBackup,
    readOneDriveBackupJson,
    openInSystemExplorer
  } from '../lib/storage/fsBridge';
  import { Building2, User, Cloud, RefreshCw, Check, ShieldCheck, FolderOpen, Download } from 'lucide-svelte';

  let {
    isOpen = false,
    selectedModel = 'gemini' as 'groq' | 'gemini',
    groqApiKey = '',
    geminiApiKey = '',
    vimOverrides = {
      ctrlS: true,
      ctrlC: true,
      ctrlV: true,
      ctrlA: true,
      ctrlF: true,
      imeWarning: true,
    } as VimKeyOverrides,
    backupIntervalMinutes = 30,
    tabs = [] as TabItem[],
    selectedOneDrivePath = '',
    autoOneDriveBackup = false,
    enablePeriodicBackup = true,
    activeTab = 'refine' as 'refine' | 'settings' | 'onedrive',
    onTabChange,
    onClose,
    onRefine,
    onSaveSettings,
    onSaveOneDrivePreference,
    onShowToast,
    onRestoreVault
  } = $props<{
    isOpen: boolean;
    selectedModel: 'groq' | 'gemini';
    groqApiKey: string;
    geminiApiKey: string;
    vimOverrides?: VimKeyOverrides;
    tabs?: TabItem[];
    selectedOneDrivePath?: string;
    autoOneDriveBackup?: boolean;
    backupIntervalMinutes?: number;
    enablePeriodicBackup?: boolean;
    activeTab?: 'refine' | 'settings' | 'onedrive';
    onTabChange?: (tab: 'refine' | 'settings' | 'onedrive') => void;
    onClose: () => void;
    onRefine: (mode: RefineryMode, customPrompt: string) => Promise<void>;
    onSaveSettings: (
      groq: string,
      gemini: string,
      model: 'groq' | 'gemini',
      vimOverrides: VimKeyOverrides
    ) => void;
    onSaveOneDrivePreference?: (path: string, auto: boolean, intervalMinutes?: number, enablePeriodic?: boolean) => void;
    onShowToast?: (msg: string) => void;
    onRestoreVault?: (restoredTabs: TabItem[]) => void;
  }>();

  let selectedMode = $state<RefineryMode>('organize');
  let customPrompt = $state('');
  let isRefining = $state(false);
  let errorMsg = $state('');

  // OneDrive 備份與讀取狀態
  let oneDriveAccounts = $state<OneDriveAccountInfo[]>([]);
  let currentOneDrivePath = $state('');
  let isAutoBackup = $state(false);
  let inputBackupInterval = $state(30);
  let isEnablePeriodic = $state(true);
  let isScanningOneDrive = $state(false);
  let isBackingUp = $state(false);
  let lastBackupResult = $state<BackupResult | null>(null);
  let backupOverview = $state<import('../types/tab').OneDriveBackupOverview | null>(null);
  let isCheckingBackup = $state(false);
  let prevIsOpen = false;

  let inputGroqKey = $state('');
  let inputGeminiKey = $state('');
  let inputModel = $state<'groq' | 'gemini'>('gemini');
  let inputVimOverrides = $state<VimKeyOverrides>({
    ctrlS: true,
    ctrlC: true,
    ctrlV: true,
    ctrlA: true,
    ctrlF: true,
    imeWarning: true,
  });

  function setTab(tab: 'refine' | 'settings' | 'onedrive') {
    onTabChange?.(tab);
    if (tab === 'onedrive') {
      scanOneDrive();
    }
  }

  $effect(() => {
    // 僅在對話框剛由關閉轉為開啟的瞬間，初始化表單輸入與掃描
    if (isOpen && !prevIsOpen) {
      inputGroqKey = groqApiKey;
      inputGeminiKey = geminiApiKey;
      inputModel = selectedModel;
      if (vimOverrides) {
        inputVimOverrides = { ...vimOverrides };
      }
      currentOneDrivePath = selectedOneDrivePath;
      isAutoBackup = autoOneDriveBackup;
      inputBackupInterval = backupIntervalMinutes || 30;
      isEnablePeriodic = enablePeriodicBackup ?? true;
      scanOneDrive();
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
        onSaveOneDrivePreference?.(currentOneDrivePath, isAutoBackup, inputBackupInterval);
      }
      if (currentOneDrivePath) {
        checkBackupStatus(currentOneDrivePath);
      }
    } catch (err) {
      console.error('[AiModal] OneDrive scan failed:', err);
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
      console.warn('檢查備份失敗:', e);
    } finally {
      isCheckingBackup = false;
    }
  }

  function handleSelectOneDrive(path: string) {
    currentOneDrivePath = path;
    onSaveOneDrivePreference?.(currentOneDrivePath, isAutoBackup, inputBackupInterval, isEnablePeriodic);
    checkBackupStatus(path);
  }

  function handleToggleAutoBackup() {
    isAutoBackup = !isAutoBackup;
    onSaveOneDrivePreference?.(currentOneDrivePath, isAutoBackup, inputBackupInterval, isEnablePeriodic);
    onShowToast?.(isAutoBackup ? `🛡️ 已啟用 OneDrive 背景自動備份（每 ${inputBackupInterval} 分鐘）` : '已關閉 OneDrive 自動備份');
  }

  function handleChangeInterval(minutes: number) {
    inputBackupInterval = minutes;
    onSaveOneDrivePreference?.(currentOneDrivePath, isAutoBackup, inputBackupInterval, isEnablePeriodic);
    onShowToast?.(`⏱️ 背景備份間隔已調整為：每 ${minutes} 分鐘`);
  }

  function handleTogglePeriodicBackup() {
    isEnablePeriodic = !isEnablePeriodic;
    onSaveOneDrivePreference?.(currentOneDrivePath, isAutoBackup, inputBackupInterval, isEnablePeriodic);
    onShowToast?.(isEnablePeriodic ? '📦 已啟用多週期分類備份（日・週・月階層存檔）' : '已關閉多週期備份（僅保留最新鏡像）');
  }

  async function handleRestoreFromOneDrive(customFilePath?: string, label?: string) {
    if (!currentOneDrivePath) return;
    const targetDesc = label ? `「${label}」` : '最新備份存檔';
    const ok = window.confirm(
      `⚠️ 確定要從 OneDrive 還原 ${targetDesc} 的所有藥帖嗎？\n\n` +
      '還原將會以該備份存檔取代當前工作台中的藥帖分頁。\n' +
      '（放心：還原前會於本機歷史自動建立快照留底）'
    );
    if (!ok) return;

    try {
      const raw = await readOneDriveBackupJson(currentOneDrivePath, customFilePath);
      const parsed = JSON.parse(raw);
      if (parsed.tabs && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        onRestoreVault?.(parsed.tabs);
        onShowToast?.(`📥 成功從 OneDrive 還原 ${parsed.tabs.length} 篇藥帖！`);
        onClose();
      } else {
        onShowToast?.('⚠️ 備份檔案中未包含有效的藥帖資料');
      }
    } catch (err: any) {
      onShowToast?.(`⚠️ 還原失敗: ${err.message || err}`);
    }
  }

  async function handleOpenExplorer() {
    if (!currentOneDrivePath) return;
    try {
      await openInSystemExplorer(`${currentOneDrivePath}\\BambooSaga_VaultBackup`);
    } catch (e: any) {
      onShowToast?.(`無法開啟目錄: ${e.message || e}`);
    }
  }

  let selectedPeriodicCategory = $state<'daily' | 'weekly' | 'monthly'>('daily');

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatBackupLabel(category: 'daily' | 'weekly' | 'monthly', fileName: string): string {
    // 檔名格式例如 backup_daily_2026-10-14.json, backup_weekly_2026-W42.json, backup_monthly_2026-10.json
    const cleaned = fileName.replace(/^backup_(daily|weekly|monthly)_/, '').replace(/\.json$/, '');
    if (category === 'daily') return `📅 日記存檔：${cleaned}`;
    if (category === 'weekly') return `🗓️ 第 ${cleaned.replace(/^.*-W/, '')} 週存檔 (${cleaned.split('-W')[0]} 年)`;
    if (category === 'monthly') return `🌙 月份存檔：${cleaned}`;
    return cleaned;
  }

  async function handleBackupNow() {
    if (!currentOneDrivePath) {
      onShowToast?.('⚠️ 請先選擇要備份的 OneDrive 帳號');
      return;
    }
    isBackingUp = true;
    try {
      const safeTabs = tabs || [];
      const markdownFiles = safeTabs.map((t: TabItem, idx: number) => ({
        file_name: t.title || `藥帖_${idx + 1}`,
        content: t.content,
      }));
      const vaultJson = JSON.stringify({
        exportedAt: new Date().toISOString(),
        tabCount: safeTabs.length,
        tabs: safeTabs,
      }, null, 2);

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

  async function handleExecuteSpecific(mode: RefineryMode) {
    selectedMode = mode;
    isRefining = true;
    errorMsg = '';
    try {
      await onRefine(mode, customPrompt);
      onClose();
    } catch (e: any) {
      errorMsg = e.message || '煉丹失敗，請檢查網路連線或 API 金鑰';
    } finally {
      isRefining = false;
    }
  }

  function handleSaveSettings() {
    onSaveSettings(
      inputGroqKey.trim(),
      inputGeminiKey.trim(),
      inputModel,
      $state.snapshot(inputVimOverrides)
    );
    setTab('refine');
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
      onkeydown={(e) => e.key === 'Escape' && onClose()}
    >
      <!-- 包浩斯形上學頂部導航 -->
      <header class="modal-header">
        <div class="header-left">
          <span class="pulse-cinnabar"></span>
          <span class="engine-title">
            {activeTab === 'onedrive' 
              ? '雲端備份 // ONEDRIVE MIRROR' 
              : activeTab === 'settings' 
              ? '偏好設定 // PREFERENCES' 
              : '煉丹樞紐 // SAGATECH ENGINE'}
          </span>
          <span class="engine-badge">DOT-SYS v2.5</span>
        </div>

        <div class="header-nav">
          <button 
            class="tab-btn {activeTab === 'refine' ? 'active' : ''}" 
            onclick={() => setTab('refine')}
          >
            煉丹樞紐
          </button>
          <button 
            class="tab-btn {activeTab === 'settings' ? 'active' : ''}" 
            onclick={() => setTab('settings')}
          >
            金鑰與偏好
          </button>
          <button 
            class="tab-btn {activeTab === 'onedrive' ? 'active' : ''}" 
            onclick={() => setTab('onedrive')}
          >
            ☁️ 雲端備份
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

      {#if activeTab === 'refine'}
        <div class="modal-body refine-body">
          <p class="philosophy-quote">
            「無須複雜旋鈕，AI 智能感應全文上下文，萃取結論、待辦事項與核心代碼架構。」
          </p>

          <!-- Bauhaus Metaphysica 三欄矩陣卡片 -->
          <div class="matrix-grid">
            <div 
              class="matrix-card {selectedMode === 'organize' ? 'selected' : ''}"
              onclick={() => handleExecuteSpecific('organize')}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && handleExecuteSpecific('organize')}
            >
              <div class="card-head">
                <span class="step-tag tag-cinnabar">[ 01 // 凝練 ]</span>
                <h4 class="card-title">結構化結論</h4>
              </div>
              <p class="card-desc">自動提煉會議要點、脈絡綱領與決策結論</p>
            </div>

            <div 
              class="matrix-card {selectedMode === 'action_items' ? 'selected' : ''}"
              onclick={() => handleExecuteSpecific('action_items')}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && handleExecuteSpecific('action_items')}
            >
              <div class="card-head">
                <span class="step-tag tag-ochre">[ 02 // 析理 ]</span>
                <h4 class="card-title">待辦矩陣化</h4>
              </div>
              <p class="card-desc">識別 TODO、FIXME 與行動項目，轉換為排程工單</p>
            </div>

            <div 
              class="matrix-card {selectedMode === 'code_refactor' ? 'selected' : ''}"
              onclick={() => handleExecuteSpecific('code_refactor')}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && handleExecuteSpecific('code_refactor')}
            >
              <div class="card-head">
                <span class="step-tag tag-olive">[ 03 // 淨心 ]</span>
                <h4 class="card-title">代碼語法補正</h4>
              </div>
              <p class="card-desc">排版校對、Markdown 標籤補齊與智能命名對齊</p>
            </div>
          </div>

          <!-- 自訂指令輸入框 -->
          <div class="custom-prompt-section">
            <label class="prompt-label" for="custom-input">自訂煉丹心法 (可選)：</label>
            <input 
              id="custom-input"
              type="text" 
              class="prompt-input" 
              placeholder="例：改以古風駢文總結 / 著重在資安漏洞分析..." 
              bind:value={customPrompt}
            />
          </div>

          <!-- 底部指標與全自動成丹 -->
          <footer class="modal-footer">
            <div class="telemetry">
              <span class="telemetry-dot"></span>
              <span class="telemetry-text">LATENCY: 42MS • SAGA-CORE ({selectedModel.toUpperCase()})</span>
            </div>

            <button 
              class="auto-refine-btn" 
              disabled={isRefining}
              onclick={() => handleExecuteSpecific(selectedMode)}
            >
              {#if isRefining}
                <span class="spinner">⏳</span>
                <span>煉丹運算中...</span>
              {:else}
                <span class="fire-dot"></span>
                <span>一鍵全自動成丹</span>
              {/if}
            </button>
          </footer>
        </div>
      {:else if activeTab === 'settings'}
        <!-- 偏好設定與金鑰配置 -->
        <div class="modal-body settings-body">
          <div class="form-group">
            <label class="form-label" for="model-select">核心推論引擎</label>
            <select id="model-select" class="form-select" bind:value={inputModel}>
              <option value="gemini">Google Gemini 1.5 Flash (大文本上下文推薦)</option>
              <option value="groq">Groq Llama 3 70B (超極速推論)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="gemini-key">Gemini API Key</label>
            <input 
              id="gemini-key"
              type="password" 
              class="form-input" 
              placeholder="AIzaSy..." 
              bind:value={inputGeminiKey} 
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="groq-key">Groq API Key</label>
            <input 
              id="groq-key"
              type="password" 
              class="form-input" 
              placeholder="gsk_..." 
              bind:value={inputGroqKey} 
            />
          </div>

          <div class="form-group">
            <span class="form-label">Vim 模式快捷鍵攔截覆蓋 (避免與常用系統鍵衝突)</span>
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
                <input type="checkbox" bind:checked={inputVimOverrides.imeWarning} />
                <span>中文注音防呆告警</span>
              </label>
            </div>
          </div>

          <footer class="modal-footer">
            <button class="save-settings-btn" onclick={handleSaveSettings}>
              💾 保存偏好設定
            </button>
          </footer>
        </div>
      {:else if activeTab === 'onedrive'}
        <!-- 雲端備份與 OneDrive 整合面板 -->
        <div class="modal-body settings-body onedrive-body">
          <div class="onedrive-header-desc">
            <span class="desc-title">☁️ OneDrive 自動雲端鏡像備份</span>
            <span class="desc-subtitle">
              純本機寫入，由微軟 OneDrive 客戶端原生安全上傳。零授權風險、自動辨識個人版與企業/學校版。
            </span>
          </div>

          <div class="form-group">
            <div class="onedrive-account-header">
              <span class="form-label">選擇備份目的地帳號</span>
              <button class="rescan-btn" onclick={scanOneDrive} disabled={isScanningOneDrive}>
                <RefreshCw size={12} class={isScanningOneDrive ? 'spin' : ''} />
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
                <span>⚠️ 尚未探測到已登入的 OneDrive 資料夾，請確認電腦已啟動 OneDrive 客戶端。</span>
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
                    onkeydown={(e) => e.key === 'Enter' && handleSelectOneDrive(acc.folder_path)}
                  >
                    <div class="acc-badge-icon">
                      {#if acc.account_type === 'business'}
                        <Building2 size={16} class="text-business" />
                      {:else}
                        <User size={16} class="text-personal" />
                      {/if}
                    </div>
                    <div class="acc-text-wrap">
                      <div class="acc-title-row">
                        <span class="acc-title">{acc.display_name}</span>
                        <span class="acc-tag {acc.account_type}">
                          {acc.account_type === 'business' ? '商業/學校版' : '個人版'}
                        </span>
                      </div>
                      <span class="acc-folder font-mono">{acc.folder_path}</span>
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
              <input type="checkbox" checked={isAutoBackup} onchange={handleToggleAutoBackup} />
              <div class="toggle-text">
                <span class="toggle-title">啟用背景定時與關閉前自動鏡像備份</span>
                <span class="toggle-sub">有變更時於背景排程備份，並在視窗關閉前立即鏡像儲存。</span>
              </div>
            </label>

            {#if isAutoBackup}
              <div class="backup-interval-selector">
                <span class="interval-label">⏱️ 背景備份循環頻率：</span>
                <div class="interval-capsules">
                  {#each [15, 30, 60, 120, 240] as minutes}
                    <button 
                      type="button"
                      class="interval-capsule {inputBackupInterval === minutes ? 'active' : ''}"
                      onclick={() => handleChangeInterval(minutes)}
                    >
                      {minutes < 60 ? `${minutes} 分鐘` : `${minutes / 60} 小時`}
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
              <input type="checkbox" checked={isEnablePeriodic} onchange={handleTogglePeriodicBackup} />
              <div class="toggle-text">
                <span class="toggle-title">啟用多週期備份庫（日・週・月階層分類輪轉存檔）</span>
                <span class="toggle-sub">開啟後每次備份將自動保留最近 7 天、4 週與 12 個月的歷史版本；關閉則僅維持最新存檔。</span>
              </div>
            </label>
          </div>

          <div class="onedrive-summary-box">
            <div class="summary-line">
              <span>備份儲存資料匣：</span>
              <span class="font-mono text-accent">
                {currentOneDrivePath ? `${currentOneDrivePath}\\BambooSaga_VaultBackup` : '未選取'}
              </span>
            </div>
            <div class="summary-line">
              <span>包含項目：</span>
              <span>全域藥帖 JSON 鏡像 + {(tabs || []).length} 份純 Markdown 文件 (手機 App 可直接閱讀)</span>
            </div>
            {#if lastBackupResult}
              <div class="summary-line text-green">
                <span>最後備份時間：</span>
                <span>{new Date(lastBackupResult.timestamp * 1000).toLocaleTimeString()} ({lastBackupResult.exported_files_count} 份檔案已封裝)</span>
              </div>
            {/if}
          </div>

          <!-- 多週期性備份讀取與還原區塊 -->
          {#if backupOverview?.has_backup}
            {@const dailyList = backupOverview.periodic_backups?.filter(b => b.category === 'daily') || []}
            {@const weeklyList = backupOverview.periodic_backups?.filter(b => b.category === 'weekly') || []}
            {@const monthlyList = backupOverview.periodic_backups?.filter(b => b.category === 'monthly') || []}
            {@const currentCategoryList = selectedPeriodicCategory === 'daily' 
              ? dailyList 
              : selectedPeriodicCategory === 'weekly' 
              ? weeklyList 
              : monthlyList}

            <div class="onedrive-restore-panel">
              <div class="restore-title-row">
                <div class="restore-title-group">
                  <span class="restore-title">📦 多週期備份庫 (Vault Archive)</span>
                  <span class="restore-sub">日・週・月階層分類輪轉，自動清理過期存檔</span>
                </div>
                {#if backupOverview.latest_timestamp}
                  <span class="restore-time-badge">
                    最新存檔：{new Date(backupOverview.latest_timestamp * 1000).toLocaleTimeString()}
                  </span>
                {/if}
              </div>

              <!-- 日/週/月 分類頁籤切換器 -->
              <div class="periodic-tabs-bar">
                <button 
                  type="button"
                  class="periodic-tab-pill {selectedPeriodicCategory === 'daily' ? 'active' : ''}"
                  onclick={() => (selectedPeriodicCategory = 'daily')}
                >
                  📅 每日備份 ({dailyList.length})
                </button>
                <button 
                  type="button"
                  class="periodic-tab-pill {selectedPeriodicCategory === 'weekly' ? 'active' : ''}"
                  onclick={() => (selectedPeriodicCategory = 'weekly')}
                >
                  🗓️ 每週備份 ({weeklyList.length})
                </button>
                <button 
                  type="button"
                  class="periodic-tab-pill {selectedPeriodicCategory === 'monthly' ? 'active' : ''}"
                  onclick={() => (selectedPeriodicCategory = 'monthly')}
                >
                  🌙 每月備份 ({monthlyList.length})
                </button>
              </div>

              <!-- 週期備份項目清單 -->
              <div class="periodic-snapshots-list">
                {#if currentCategoryList.length === 0}
                  <div class="snapshots-empty">
                    <span>此週期分類暫無存檔（下次執行備份時自動分類生成）</span>
                  </div>
                {:else}
                  {#each currentCategoryList as item (item.file_path)}
                    <div class="snapshot-card">
                      <div class="snapshot-info">
                        <span class="snapshot-label">{formatBackupLabel(item.category, item.file_name)}</span>
                        <div class="snapshot-meta">
                          <span>{new Date(item.timestamp * 1000).toLocaleString()}</span>
                          <span>•</span>
                          <span class="font-mono">{formatBytes(item.size)}</span>
                        </div>
                      </div>
                      <button 
                        type="button"
                        class="snapshot-restore-btn"
                        onclick={() => handleRestoreFromOneDrive(item.file_path, item.file_name)}
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
                  onclick={() => handleRestoreFromOneDrive(undefined, '最新鏡像存檔')} 
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
                  <span class="preview-label">手機可直接閱讀之 Markdown 匯出檔 ({backupOverview.markdown_files.length})：</span>
                  <div class="files-tags-wrap">
                    {#each backupOverview.markdown_files.slice(0, 8) as f}
                      <span class="file-tag">{f}</span>
                    {/each}
                    {#if backupOverview.markdown_files.length > 8}
                      <span class="file-tag more">+{backupOverview.markdown_files.length - 8} 篇...</span>
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
    max-width: 680px;
    max-height: 88vh;
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
    from { transform: scale(0.96); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
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
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pulse-cinnabar {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #c95847;
    box-shadow: 0 0 8px #c95847;
    animation: pulse 1s infinite alternate;
  }

  @keyframes pulse {
    from { opacity: 0.4; }
    to { opacity: 1; }
  }

  .engine-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: #ece7dc;
    letter-spacing: 0.08em;
  }

  .engine-badge {
    font-size: 0.65rem;
    padding: 1px 6px;
    border-radius: 3px;
    background: #242220;
    color: #b59e72;
    border: 1px solid #504534;
  }

  .header-nav {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tab-btn {
    padding: 4px 10px;
    border-radius: 4px;
    background: transparent;
    border: 1px solid transparent;
    color: #938c80;
    font-size: 0.72rem;
    cursor: pointer;
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

  .tag-cinnabar { color: #c95847; }
  .tag-ochre { color: #d49b35; }
  .tag-olive { color: #869b74; }

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

  /* 設定頁籤樣式 */
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

  .form-input, .form-select {
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

  .form-input:focus, .form-select:focus {
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

  .save-settings-btn {
    width: 100%;
    height: 34px;
    background: #1f2020;
    border: 1px solid #d49b35;
    color: #d49b35;
    border-radius: 4px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
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

  .auto-backup-toggle input[type='checkbox'] {
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
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
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
</style>
