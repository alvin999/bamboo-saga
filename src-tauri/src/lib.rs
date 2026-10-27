use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ExternalFileChangePayload {
    pub path: String,
    pub content: String,
}

pub struct FileWatcherInner {
    pub watched_files: HashSet<PathBuf>,
    pub watched_dirs: HashSet<PathBuf>,
    pub last_written_hashes: HashMap<String, u64>,
}

#[derive(Clone)]
pub struct FileWatcherManager {
    pub inner: Arc<Mutex<FileWatcherInner>>,
    pub watcher: Arc<Mutex<Option<RecommendedWatcher>>>,
}

impl Default for FileWatcherManager {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(FileWatcherInner {
                watched_files: HashSet::new(),
                watched_dirs: HashSet::new(),
                last_written_hashes: HashMap::new(),
            })),
            watcher: Arc::new(Mutex::new(None)),
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct VaultFileItem {
    pub path: String,
    pub name: String,
    pub rel_path: String,
    pub size: u64,
    pub modified: u64,
    pub preview: String,
    pub extension: String,
}

const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".vscode",
    ".idea",
    "vendor",
    ".gemini",
    "__pycache__",
    ".cargo",
];

const ALLOWED_EXTENSIONS: &[&str] = &[
    "md", "txt", "json", "js", "ts", "py", "sql", "rs", "css", "html", "svelte", "yaml", "yml",
    "toml", "sh", "ps1", "log", "csv", "xml", "ini", "conf",
];

fn walk_directory_internal(
    base: &Path,
    current: &Path,
    depth: usize,
    max_depth: usize,
    results: &mut Vec<VaultFileItem>,
) {
    if depth > max_depth {
        return;
    }

    let entries = match fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        // 跨平台跳過符號連結，防止循環連結造成無窮遞迴
        if let Ok(ft) = entry.file_type() {
            if ft.is_symlink() {
                continue;
            }
        }

        if path.is_dir() {
            if IGNORED_DIRS.contains(&file_name.as_str()) || file_name.starts_with('.') {
                continue;
            }
            walk_directory_internal(base, &path, depth + 1, max_depth, results);
        } else if path.is_file() {
            let ext = path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();

            // 若沒有副檔名或在允許副檔名清單中
            if ext.is_empty() || ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
                let metadata = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                let size = metadata.len();
                let modified = metadata
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);

                let rel_path = path
                    .strip_prefix(base)
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|_| file_name.clone());

                // 內文 Lazy Loading：遍歷階段絕不讀取檔案內容，由使用者選取時非同步按需載入
                let preview = String::new();

                results.push(VaultFileItem {
                    path: path.to_string_lossy().to_string(),
                    name: file_name,
                    rel_path,
                    size,
                    modified,
                    preview,
                    extension: ext,
                });
            }
        }
    }
}

#[tauri::command]
fn pick_vault_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    Ok(folder.map(|p| match p {
        tauri_plugin_dialog::FilePath::Path(path_buf) => path_buf.to_string_lossy().to_string(),
        tauri_plugin_dialog::FilePath::Url(url) => url.to_file_path().unwrap_or(PathBuf::from(url.path())).to_string_lossy().to_string(),
    }))
}

#[tauri::command]
async fn scan_vault_folder(folder_path: String) -> Result<Vec<VaultFileItem>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let base_path = PathBuf::from(&folder_path);
        if !base_path.exists() || !base_path.is_dir() {
            return Err("指定的路徑不存在或並非目錄".to_string());
        }

        let mut results = Vec::new();
        walk_directory_internal(&base_path, &base_path, 0, 7, &mut results);
        // 依修改時間降冪排列（最近修改的排前面）
        results.sort_by(|a, b| b.modified.cmp(&a.modified));
        Ok(results)
    })
    .await
    .map_err(|e| format!("背景掃描工作失敗: {}", e))?
}

/// 標準化路徑字串：統一轉為正斜線、去除尾部斜線，並將 Windows 磁碟機代號轉為小寫
fn normalize_path_str(p: &str) -> String {
    let mut normalized = p.replace('\\', "/");
    while normalized.ends_with('/') {
        normalized.pop();
    }
    if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        let first_char = normalized.chars().next().unwrap();
        if first_char.is_ascii_alphabetic() {
            let lower = first_char.to_ascii_lowercase();
            normalized.replace_range(0..1, &lower.to_string());
        }
    }
    normalized
}

/// 判斷 child 是否為 parent 本身或是其子資料夾（具備邊界斜線防護、UTF-8 字符邊界防護與 Windows 磁碟機大小寫相容）
fn is_sub_or_same_path(parent: &str, child: &str) -> bool {
    let p = parent.trim_end_matches('/');
    let c = child.trim_end_matches('/');
    if p.eq_ignore_ascii_case(c) {
        return true;
    }
    if c.len() > p.len() && c.is_char_boundary(p.len()) && c[..p.len()].eq_ignore_ascii_case(p) {
        let rem = &c[p.len()..];
        if rem.starts_with('/') {
            return true;
        }
    }
    false
}

/// 跨洞天背景批次掃描：具備母子資料夾自動去重與記憶體投影切片
#[tauri::command]
async fn scan_multiple_vault_folders(
    folder_paths: Vec<String>,
) -> Result<HashMap<String, Vec<VaultFileItem>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut final_map: HashMap<String, Vec<VaultFileItem>> = HashMap::new();
        if folder_paths.is_empty() {
            return Ok(final_map);
        }

        // 1. 整理並標準化所有輸入路徑，預先標記有效目錄
        struct CaveMeta {
            original: String,
            norm: String,
            exists: bool,
        }

        let mut cave_metas: Vec<CaveMeta> = Vec::new();
        for orig in &folder_paths {
            let norm = normalize_path_str(orig);
            let path_buf = PathBuf::from(orig);
            let exists = path_buf.exists() && path_buf.is_dir();
            cave_metas.push(CaveMeta {
                original: orig.clone(),
                norm,
                exists,
            });
        }

        // 不存在的目錄直接回傳空清單，避免整批掃描中斷
        for meta in &cave_metas {
            if !meta.exists {
                final_map.insert(meta.original.clone(), Vec::new());
            }
        }

        let valid_caves: Vec<&CaveMeta> = cave_metas.iter().filter(|m| m.exists).collect();
        if valid_caves.is_empty() {
            return Ok(final_map);
        }

        // 2. 母子資料夾去重演算法 (Minimal Independent Roots)
        // 依據正規化路徑長度升冪排列（短者為潛在的母目錄）
        let mut sorted_valid = valid_caves.clone();
        sorted_valid.sort_by_key(|m| m.norm.len());

        let mut independent_roots: Vec<String> = Vec::new();
        let mut cave_norm_to_root: HashMap<String, String> = HashMap::new();

        for meta in &sorted_valid {
            // 檢查是否已被現有的母目錄包含
            let existing_parent = independent_roots
                .iter()
                .find(|root| is_sub_or_same_path(root, &meta.norm));

            match existing_parent {
                Some(parent_root) => {
                    // 屬於子目錄：略過實體重複掃描，直接映射至母根目錄
                    cave_norm_to_root.insert(meta.norm.clone(), parent_root.clone());
                }
                None => {
                    // 獨立全新根目錄
                    independent_roots.push(meta.norm.clone());
                    cave_norm_to_root.insert(meta.norm.clone(), meta.norm.clone());
                }
            }
        }

        // 3. 實體磁碟遍歷：僅針對獨立母根目錄進行遞迴掃描 (Zero redundant disk I/O)
        let mut root_scanned_files: HashMap<String, Vec<VaultFileItem>> = HashMap::new();
        for root_norm in &independent_roots {
            // Windows 磁碟機根目錄（例如 "d:"）若無後綴斜線會被視為相對路徑，必須補全為 "d:/"
            let safe_root = if root_norm.len() == 2 && root_norm.ends_with(':') {
                format!("{}/", root_norm)
            } else {
                root_norm.clone()
            };
            let base_path = PathBuf::from(&safe_root);
            let mut results = Vec::new();
            walk_directory_internal(&base_path, &base_path, 0, 7, &mut results);
            root_scanned_files.insert(root_norm.clone(), results);
        }

        // 4. 結果投影與切片：為每個原始輸入洞天產生專屬檔案清單並重新計算相對路徑
        for meta in &valid_caves {
            let root_norm = match cave_norm_to_root.get(&meta.norm) {
                Some(r) => r,
                None => continue,
            };

            let all_files_in_root = match root_scanned_files.get(root_norm) {
                Some(f) => f,
                None => continue,
            };

            let mut cave_files: Vec<VaultFileItem> = Vec::new();
            let meta_clean = meta.norm.trim_end_matches('/');

            for file in all_files_in_root {
                let file_norm = normalize_path_str(&file.path);
                if is_sub_or_same_path(&meta.norm, &file_norm) {
                    // 計算相對於該洞天的 rel_path
                    let rel_path = if file_norm.len() > meta_clean.len() && file_norm.is_char_boundary(meta_clean.len()) {
                        let sub = &file_norm[meta_clean.len()..];
                        sub.trim_start_matches('/').to_string()
                    } else {
                        file.name.clone()
                    };

                    cave_files.push(VaultFileItem {
                        path: file.path.clone(),
                        name: file.name.clone(),
                        rel_path,
                        size: file.size,
                        modified: file.modified,
                        preview: file.preview.clone(),
                        extension: file.extension.clone(),
                    });
                }
            }

            cave_files.sort_by(|a, b| b.modified.cmp(&a.modified));
            final_map.insert(meta.original.clone(), cave_files);
        }

        // 自動將完整掃描結果持久化至原生磁碟快取，冷啟動時免除配額限制極速秒開
        if let Ok(cache_path) = get_caves_cache_file_path() {
            let now = std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            let payload = CavesCachePayload {
                timestamp: now,
                cache: final_map.clone(),
            };
            if let Ok(json) = serde_json::to_string(&payload) {
                let _ = fs::write(&cache_path, json);
            }
        }

        Ok(final_map)
    })
    .await
    .map_err(|e| format!("批次背景掃描洞天失敗: {}", e))?
}

#[tauri::command]
fn read_vault_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| format!("無法讀取檔案 {}: {}", file_path, e))
}

#[tauri::command]
fn write_vault_file(
    file_path: String,
    content: String,
    watcher_state: tauri::State<FileWatcherManager>,
) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("無法建立目錄: {}", e))?;
        }
    }

    // 計算寫入內容的 Hash 並登記，避免觸發自我監聽迴圈 (Self-trigger loop)
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    std::hash::Hash::hash(&content, &mut hasher);
    let hash = std::hash::Hasher::finish(&hasher);
    if let Ok(mut inner) = watcher_state.inner.lock() {
        inner.last_written_hashes.insert(file_path.clone(), hash);
        if let Ok(canonical) = path.canonicalize() {
            inner.last_written_hashes.insert(canonical.to_string_lossy().to_string(), hash);
        }
    }

    fs::write(&path, content).map_err(|e| format!("無法寫入檔案 {}: {}", file_path, e))
}

#[tauri::command]
fn set_watched_files(
    files: Vec<String>,
    manager: tauri::State<FileWatcherManager>,
) -> Result<(), String> {
    let mut inner = manager.inner.lock().map_err(|e| e.to_string())?;
    let mut watcher_guard = manager.watcher.lock().map_err(|e| e.to_string())?;

    let watcher = match watcher_guard.as_mut() {
        Some(w) => w,
        None => return Ok(()),
    };

    let mut new_files = HashSet::new();
    let mut new_dirs = HashSet::new();

    for f in files {
        let p = PathBuf::from(&f);
        if let Ok(canonical) = p.canonicalize() {
            new_files.insert(canonical.clone());
            if let Some(parent) = canonical.parent() {
                new_dirs.insert(parent.to_path_buf());
            }
        }
        new_files.insert(p.clone());
        if let Some(parent) = p.parent() {
            new_dirs.insert(parent.to_path_buf());
        }
    }

    // 移除不再需要的目錄監聽
    for old_dir in &inner.watched_dirs {
        if !new_dirs.contains(old_dir) {
            let _ = watcher.unwatch(old_dir);
        }
    }

    // 註冊新增的目錄監聽 (Windows 透過目錄監聽，可完美處理 atomic save / rename 覆寫)
    for new_dir in &new_dirs {
        if !inner.watched_dirs.contains(new_dir) && new_dir.exists() {
            let _ = watcher.watch(new_dir, RecursiveMode::NonRecursive);
        }
    }

    inner.watched_files = new_files;
    inner.watched_dirs = new_dirs;

    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct OneDriveAccountInfo {
    pub account_type: String,       // "personal" (個人版) 或 "business" (企業版)
    pub display_name: String,       // 顯示名稱 (例如 "OneDrive - 個人" 或 "OneDrive - 某某企業")
    pub folder_path: String,        // 實體資料夾路徑
    pub tenant_name: Option<String>,// 企業租戶名稱
    pub is_available: bool,         // 本機路徑是否存在
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct BackupMarkdownFile {
    pub file_name: String,
    pub content: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct BackupResult {
    pub success: bool,
    pub backup_dir: String,
    pub timestamp: u64,
    pub exported_files_count: usize,
    pub message: String,
}

#[tauri::command]
fn detect_onedrive_accounts() -> Result<Vec<OneDriveAccountInfo>, String> {
    let mut accounts = Vec::new();

    // 1. 探測原生環境變數 (Windows 原生變數與通用 Unix 變數)
    for env_key in &["OneDriveCommercial", "OneDriveConsumer", "OneDrive", "ONEDRIVE_PATH", "ONEDRIVE"] {
        if let Ok(onedrive_path) = std::env::var(env_key) {
            let p = PathBuf::from(&onedrive_path);
            if p.exists() && !accounts.iter().any(|a: &OneDriveAccountInfo| a.folder_path == onedrive_path) {
                let dir_name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                let is_commercial = dir_name.contains(" - ") || env_key == &"OneDriveCommercial";
                let tenant_name = if is_commercial {
                    dir_name.split(" - ").nth(1).map(|s| s.trim().to_string())
                } else {
                    None
                };

                accounts.push(OneDriveAccountInfo {
                    account_type: if is_commercial { "business".to_string() } else { "personal".to_string() },
                    display_name: if is_commercial {
                        format!("OneDrive (企業/組織版) · {}", tenant_name.as_deref().unwrap_or("商業版"))
                    } else {
                        "OneDrive (個人版)".to_string()
                    },
                    folder_path: onedrive_path,
                    tenant_name,
                    is_available: true,
                });
            }
        }
    }

    // 2. 跨平台家目錄探測 (Linux / macOS / Windows 通用)
    if let Some(home_path) = std::env::var("HOME").ok().or_else(|| std::env::var("USERPROFILE").ok()).map(PathBuf::from) {
        let mut candidate_dirs: Vec<(PathBuf, bool, Option<String>)> = Vec::new();

        // 2.1 macOS 現代 File Provider 目錄: ~/Library/CloudStorage/OneDrive*
        let cloud_storage = home_path.join("Library/CloudStorage");
        if cloud_storage.exists() {
            if let Ok(entries) = fs::read_dir(&cloud_storage) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.starts_with("OneDrive") {
                            let is_comm = name.contains('-') && !name.ends_with("-Personal");
                            let tenant = if is_comm {
                                name.split('-').nth(1).map(|s| s.trim().to_string())
                            } else {
                                None
                            };
                            candidate_dirs.push((path, is_comm, tenant));
                        }
                    }
                }
            }
        }

        // 2.2 Linux / macOS / Windows 家目錄直轄: ~/OneDrive*
        if let Ok(entries) = fs::read_dir(&home_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name == "OneDrive" {
                        candidate_dirs.push((path, false, None));
                    } else if name.starts_with("OneDrive - ") {
                        let tenant = name.strip_prefix("OneDrive - ").map(|s| s.trim().to_string());
                        candidate_dirs.push((path, true, tenant));
                    } else if name.starts_with("OneDrive-") {
                        let tenant = name.strip_prefix("OneDrive-").map(|s| s.trim().to_string());
                        candidate_dirs.push((path, true, tenant));
                    }
                }
            }
        }

        // 2.3 Linux XDG 設定檔解析 (~/.config/onedrive/config - 如 abraunegg client)
        let linux_cfg = home_path.join(".config/onedrive/config");
        if linux_cfg.exists() {
            if let Ok(content) = fs::read_to_string(&linux_cfg) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("sync_dir") && trimmed.contains('=') {
                        if let Some(val) = trimmed.split('=').nth(1) {
                            let raw = val.trim().trim_matches('"').trim_matches('\'');
                            let resolved = if raw.starts_with("~/") {
                                home_path.join(&raw[2..])
                            } else {
                                PathBuf::from(raw)
                            };
                            if resolved.exists() {
                                candidate_dirs.push((resolved, false, None));
                            }
                        }
                    }
                }
            }
        }

        // 整理 candidate_dirs 並去重加入 accounts
        for (p, is_commercial, tenant_name) in candidate_dirs {
            let path_str = p.to_string_lossy().to_string();
            if !accounts.iter().any(|a| a.folder_path == path_str) {
                accounts.push(OneDriveAccountInfo {
                    account_type: if is_commercial { "business".to_string() } else { "personal".to_string() },
                    display_name: if is_commercial {
                        format!("OneDrive (企業/組織版) · {}", tenant_name.as_deref().unwrap_or("商業版"))
                    } else {
                        "OneDrive (個人版)".to_string()
                    },
                    folder_path: path_str,
                    tenant_name,
                    is_available: true,
                });
            }
        }
    }

    Ok(accounts)
}

// 零外部依賴的精準日曆標籤換算 (Howard Hinnant 算法)
fn get_utc_date_tags(timestamp: u64) -> (String, String, String) {
    let days = (timestamp / 86400) as i64;
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    let daily_tag = format!("{:04}-{:02}-{:02}", y, m, d);
    let monthly_tag = format!("{:04}-{:02}", y, m);
    let week_num = (doy / 7) + 1;
    let weekly_tag = format!("{:04}-W{:02}", y, week_num);

    (daily_tag, weekly_tag, monthly_tag)
}

fn prune_directory_backups(dir: &Path, max_keep: usize) {
    if let Ok(entries) = fs::read_dir(dir) {
        let mut files: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_file() && p.extension().map_or(false, |ext| ext == "json"))
            .collect();

        files.sort_by(|a, b| {
            let time_a = fs::metadata(a).and_then(|m| m.modified()).unwrap_or(UNIX_EPOCH);
            let time_b = fs::metadata(b).and_then(|m| m.modified()).unwrap_or(UNIX_EPOCH);
            time_b.cmp(&time_a)
        });

        if files.len() > max_keep {
            for old_file in &files[max_keep..] {
                let _ = fs::remove_file(old_file);
            }
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PeriodicBackupEntry {
    pub category: String, // "daily", "weekly", "monthly"
    pub file_name: String,
    pub file_path: String,
    pub timestamp: u64,
    pub size: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct OneDriveBackupOverview {
    pub has_backup: bool,
    pub backup_dir: String,
    pub latest_timestamp: Option<u64>,
    pub latest_json_size: Option<u64>,
    pub markdown_files: Vec<String>,
    pub periodic_backups: Vec<PeriodicBackupEntry>,
}

#[tauri::command]
fn backup_vault_to_onedrive(
    onedrive_folder_path: String,
    vault_json: String,
    markdown_files: Vec<BackupMarkdownFile>,
    enable_periodic: Option<bool>,
) -> Result<BackupResult, String> {
    let base_path = PathBuf::from(&onedrive_folder_path);
    if !base_path.exists() || !base_path.is_dir() {
        return Err("指定的 OneDrive 目錄無效或不存在".to_string());
    }

    let backup_root = base_path.join("BambooSaga_VaultBackup");
    let markdown_dir = backup_root.join("markdown_export");
    fs::create_dir_all(&markdown_dir).map_err(|e| format!("無法建立 Markdown 匯出目錄: {}", e))?;

    let now = std::time::SystemTime::now();
    let timestamp = now.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let (daily_tag, weekly_tag, monthly_tag) = get_utc_date_tags(timestamp);

    // 1. 寫入最新完整狀態 (latest_vault_state.json)
    let latest_json_path = backup_root.join("latest_vault_state.json");
    fs::write(&latest_json_path, &vault_json).map_err(|e| format!("無法寫入全域狀態: {}", e))?;

    // 2. 長週期性分類存檔（日・週・月階層輪轉）：依使用者設定選擇是否建立
    if enable_periodic.unwrap_or(true) {
        let periodic_root = backup_root.join("periodic_snapshots");
        let daily_dir = periodic_root.join("daily");
        let weekly_dir = periodic_root.join("weekly");
        let monthly_dir = periodic_root.join("monthly");

        let _ = fs::create_dir_all(&daily_dir);
        let _ = fs::create_dir_all(&weekly_dir);
        let _ = fs::create_dir_all(&monthly_dir);

        // 日備份 (Daily)：每天一份，保留最近 7 天
        let daily_file = daily_dir.join(format!("backup_daily_{}.json", daily_tag));
        let _ = fs::write(&daily_file, &vault_json);
        prune_directory_backups(&daily_dir, 7);

        // 週備份 (Weekly)：每週一份，保留最近 4 週
        let weekly_file = weekly_dir.join(format!("backup_weekly_{}.json", weekly_tag));
        let _ = fs::write(&weekly_file, &vault_json);
        prune_directory_backups(&weekly_dir, 4);

        // 月備份 (Monthly)：每月一份，保留最近 12 個月
        let monthly_file = monthly_dir.join(format!("backup_monthly_{}.json", monthly_tag));
        let _ = fs::write(&monthly_file, &vault_json);
        prune_directory_backups(&monthly_dir, 12);
    }

    // 3. 匯出各分頁為實際 Markdown 檔案
    let mut exported_count = 0;
    for file in &markdown_files {
        let safe_name: String = file.file_name
            .chars()
            .map(|c| match c {
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
                other => other,
            })
            .collect();

        let file_path = markdown_dir.join(format!("{}.md", safe_name));
        if fs::write(&file_path, &file.content).is_ok() {
            exported_count += 1;
        }
    }

    // 4. 寫入中繼清單
    let manifest = serde_json::json!({
        "last_backup_timestamp": timestamp,
        "backup_destination": backup_root.to_string_lossy(),
        "exported_markdown_count": exported_count,
        "daily_tag": daily_tag,
        "weekly_tag": weekly_tag,
        "monthly_tag": monthly_tag,
        "app_version": "0.1.1"
    });
    let manifest_path = backup_root.join("backup_manifest.json");
    let _ = fs::write(&manifest_path, manifest.to_string());

    Ok(BackupResult {
        success: true,
        backup_dir: backup_root.to_string_lossy().to_string(),
        timestamp,
        exported_files_count: exported_count,
        message: format!("已成功將全域藥帖封裝並依日/週/月歸檔，匯出 {} 份 Markdown 檔案！", exported_count),
    })
}

#[tauri::command]
fn check_onedrive_backup(onedrive_folder_path: String) -> Result<OneDriveBackupOverview, String> {
    let base_path = PathBuf::from(&onedrive_folder_path);
    let backup_root = base_path.join("BambooSaga_VaultBackup");
    if !backup_root.exists() {
        return Ok(OneDriveBackupOverview {
            has_backup: false,
            backup_dir: backup_root.to_string_lossy().to_string(),
            latest_timestamp: None,
            latest_json_size: None,
            markdown_files: Vec::new(),
            periodic_backups: Vec::new(),
        });
    }

    let latest_json = backup_root.join("latest_vault_state.json");
    let (has_latest, latest_size, latest_time) = if latest_json.exists() {
        let meta = fs::metadata(&latest_json).ok();
        let size = meta.as_ref().map(|m| m.len());
        let time = meta
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs());
        (true, size, time)
    } else {
        (false, None, None)
    };

    let mut md_files = Vec::new();
    let md_dir = backup_root.join("markdown_export");
    if let Ok(entries) = fs::read_dir(md_dir) {
        for entry in entries.flatten() {
            if entry.path().is_file() {
                md_files.push(entry.file_name().to_string_lossy().to_string());
            }
        }
    }

    // 搜集日/週/月多週期備份存檔
    let mut periodic_entries = Vec::new();
    let periodic_root = backup_root.join("periodic_snapshots");
    let categories = [("daily", "日備份"), ("weekly", "週備份"), ("monthly", "月備份")];

    for (cat_key, _cat_label) in categories {
        let cat_dir = periodic_root.join(cat_key);
        if let Ok(entries) = fs::read_dir(cat_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() && p.extension().map_or(false, |ext| ext == "json") {
                    let meta = fs::metadata(&p).ok();
                    let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                    let ts = meta
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);

                    periodic_entries.push(PeriodicBackupEntry {
                        category: cat_key.to_string(),
                        file_name: entry.file_name().to_string_lossy().to_string(),
                        file_path: p.to_string_lossy().to_string(),
                        timestamp: ts,
                        size,
                    });
                }
            }
        }
    }

    // 依時間由新至舊排序
    periodic_entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    Ok(OneDriveBackupOverview {
        has_backup: has_latest || !md_files.is_empty() || !periodic_entries.is_empty(),
        backup_dir: backup_root.to_string_lossy().to_string(),
        latest_timestamp: latest_time,
        latest_json_size: latest_size,
        markdown_files: md_files,
        periodic_backups: periodic_entries,
    })
}

#[tauri::command]
fn read_onedrive_backup_json(
    onedrive_folder_path: String,
    custom_file_path: Option<String>,
) -> Result<String, String> {
    let target_path = if let Some(custom) = custom_file_path {
        PathBuf::from(custom)
    } else {
        let base_path = PathBuf::from(&onedrive_folder_path);
        base_path.join("BambooSaga_VaultBackup").join("latest_vault_state.json")
    };

    if !target_path.exists() {
        return Err(format!("找不到指定的備份檔案: {:?}", target_path));
    }
    fs::read_to_string(&target_path).map_err(|e| format!("讀取備份檔案失敗: {}", e))
}

#[tauri::command]
fn open_in_system_explorer(folder_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&folder_path)
            .spawn()
            .map_err(|e| format!("無法開啟檔案總管: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&folder_path)
            .spawn()
            .map_err(|e| format!("無法開啟 Finder: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&folder_path)
            .spawn()
            .map_err(|e| format!("無法開啟檔案總管: {}", e))?;
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct NativeRoutePayload {
    pub path: String,
    pub is_directory: bool,
}

#[derive(Default)]
pub struct InitialRouteState {
    pub target: std::sync::Mutex<Option<NativeRoutePayload>>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SystemIntegrationInfo {
    pub os: String,
    pub supports_context_menu: bool,
    pub is_context_menu_enabled: bool,
}

// 命令列啟動引數解析（支援檔案直開與 --folder 開啟目錄）
fn parse_route_args(args: &[String]) -> Option<NativeRoutePayload> {
    if args.len() <= 1 {
        return None;
    }

    // 檢查是否有指定 --folder 旗標
    if let Some(pos) = args.iter().position(|a| a == "--folder") {
        if let Some(folder_arg) = args.get(pos + 1) {
            return Some(NativeRoutePayload {
                path: folder_arg.clone(),
                is_directory: true,
            });
        }
    }

    // 搜尋第一個實體存在的路徑或有效副檔名路徑
    for arg in args.iter().skip(1) {
        if arg.starts_with("--") {
            continue;
        }
        let p = Path::new(arg);
        if p.exists() {
            return Some(NativeRoutePayload {
                path: arg.clone(),
                is_directory: p.is_dir(),
            });
        }
        // 若為有效副檔名檔名格式（例如自檔案總管或拖曳傳入）
        if arg.contains('.') || arg.contains('\\') || arg.contains('/') {
            return Some(NativeRoutePayload {
                path: arg.clone(),
                is_directory: false,
            });
        }
    }
    None
}

#[tauri::command]
fn get_initial_route_target(state: tauri::State<InitialRouteState>) -> Result<Option<NativeRoutePayload>, String> {
    let mut lock = state.target.lock().map_err(|e| e.to_string())?;
    Ok(lock.take())
}

#[tauri::command]
fn get_system_integration_info() -> Result<SystemIntegrationInfo, String> {
    let os = std::env::consts::OS.to_string();
    let supports_context_menu = cfg!(target_os = "windows");
    #[cfg(target_os = "windows")]
    let is_context_menu_enabled = std::process::Command::new("reg")
        .args(["query", r"HKCU\Software\Classes\*\shell\BambooSaga"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);

    #[cfg(not(target_os = "windows"))]
    let is_context_menu_enabled = false;

    Ok(SystemIntegrationInfo {
        os,
        supports_context_menu,
        is_context_menu_enabled,
    })
}

#[tauri::command]
fn toggle_windows_context_menu(enable: bool) -> Result<bool, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enable;
        Err("自訂右鍵選單整合僅支援 Windows 系統，macOS/Linux 可透過檔案關聯或直接拖曳使用".to_string())
    }

    #[cfg(target_os = "windows")]
    {
        if enable {
            let current_exe = std::env::current_exe()
                .map_err(|e| format!("無法取得執行檔路徑: {}", e))?;
            let exe_str = current_exe.to_string_lossy().to_string();

            // 1. 任意檔案右鍵：「用 廣零散 收入藥帖」
            let _ = std::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\*\shell\BambooSaga", "/ve", "/d", "用 廣零散 收入藥帖", "/f"])
                .status();
            let _ = std::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\*\shell\BambooSaga", "/v", "Icon", "/d", &format!("\"{}\"", exe_str), "/f"])
                .status();
            let _ = std::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\*\shell\BambooSaga\command", "/ve", "/d", &format!("\"{}\" \"%1\"", exe_str), "/f"])
                .status();

            // 2. 目錄右鍵：「用 廣零散 開啟藥卷庫」
            let _ = std::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\Directory\shell\BambooSaga", "/ve", "/d", "用 廣零散 開啟藥卷庫", "/f"])
                .status();
            let _ = std::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\Directory\shell\BambooSaga", "/v", "Icon", "/d", &format!("\"{}\"", exe_str), "/f"])
                .status();
            let _ = std::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\Directory\shell\BambooSaga\command", "/ve", "/d", &format!("\"{}\" \"--folder\" \"%1\"", exe_str), "/f"])
                .status();

            // 3. 目錄背景右鍵：「在此處開啟 廣零散 藥卷庫」
            let _ = std::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\Directory\Background\shell\BambooSaga", "/ve", "/d", "在此處開啟 廣零散 藥卷庫", "/f"])
                .status();
            let _ = std::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\Directory\Background\shell\BambooSaga", "/v", "Icon", "/d", &format!("\"{}\"", exe_str), "/f"])
                .status();
            let _ = std::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\Directory\Background\shell\BambooSaga\command", "/ve", "/d", &format!("\"{}\" \"--folder\" \"%V\"", exe_str), "/f"])
                .status();

            Ok(true)
        } else {
            // 刪除各機碼
            let _ = std::process::Command::new("reg")
                .args(["delete", r"HKCU\Software\Classes\*\shell\BambooSaga", "/f"])
                .status();
            let _ = std::process::Command::new("reg")
                .args(["delete", r"HKCU\Software\Classes\Directory\shell\BambooSaga", "/f"])
                .status();
            let _ = std::process::Command::new("reg")
                .args(["delete", r"HKCU\Software\Classes\Directory\Background\shell\BambooSaga", "/f"])
                .status();

            Ok(false)
        }
    }
}

fn get_os_secure_file_path() -> Result<PathBuf, String> {
    let local_appdata = std::env::var("LOCALAPPDATA")
        .or_else(|_| std::env::var("APPDATA"))
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "無法解析本機安全目錄路徑".to_string())?;

    let root = PathBuf::from(local_appdata).join("BambooSaga");
    let _ = fs::create_dir_all(&root);
    Ok(root.join(".secure_keys.dat"))
}

#[tauri::command]
fn save_os_secure_keys(payload: String) -> Result<(), String> {
    let path = get_os_secure_file_path()?;
    // 本機安全位元遮罩防護，防止純文字被掃描
    let obfuscated: Vec<u8> = payload
        .as_bytes()
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ ((i as u8).wrapping_mul(7) ^ 0xA5))
        .collect();
    fs::write(&path, obfuscated).map_err(|e| format!("無法寫入系統安全金鑰庫: {}", e))?;
    Ok(())
}

#[tauri::command]
fn load_os_secure_keys() -> Result<String, String> {
    let path = get_os_secure_file_path()?;
    if !path.exists() {
        return Ok(String::new());
    }
    let data = fs::read(&path).map_err(|e| format!("無法讀取系統安全金鑰庫: {}", e))?;
    let unobfuscated: Vec<u8> = data
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ ((i as u8).wrapping_mul(7) ^ 0xA5))
        .collect();
    String::from_utf8(unobfuscated).map_err(|e| format!("金鑰解析失敗: {}", e))
}

#[tauri::command]
fn purge_os_secure_keys() -> Result<(), String> {
    let path = get_os_secure_file_path()?;
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct CavesCachePayload {
    pub timestamp: u64,
    pub cache: HashMap<String, Vec<VaultFileItem>>,
}

fn get_caves_cache_file_path() -> Result<PathBuf, String> {
    let local_appdata = std::env::var("LOCALAPPDATA")
        .or_else(|_| std::env::var("APPDATA"))
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "無法解析本機資料目錄路徑".to_string())?;

    let root = PathBuf::from(local_appdata).join("BambooSaga");
    let _ = fs::create_dir_all(&root);
    Ok(root.join("caves_cache.json"))
}

#[tauri::command]
async fn load_caves_cache() -> Result<CavesCachePayload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = get_caves_cache_file_path()?;
        if !path.exists() {
            return Ok(CavesCachePayload {
                timestamp: 0,
                cache: HashMap::new(),
            });
        }
        let data = fs::read_to_string(&path).map_err(|e| format!("讀取洞天快取檔案失敗: {}", e))?;
        let payload: CavesCachePayload = serde_json::from_str(&data).map_err(|e| format!("解析洞天快取 JSON 失敗: {}", e))?;
        Ok(payload)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_caves_cache(cache: HashMap<String, Vec<VaultFileItem>>) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = get_caves_cache_file_path()?;
        let now = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let payload = CavesCachePayload {
            timestamp: now,
            cache,
        };
        let json = serde_json::to_string(&payload).map_err(|e| format!("序列化洞天快取失敗: {}", e))?;
        fs::write(&path, json).map_err(|e| format!("寫入洞天快取檔案失敗: {}", e))?;
        Ok(now)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // 熱傳遞：將現有視窗拉回前景並聚焦
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            // 解析命令列引數，若有檔案或資料夾則派發路由事件至前端
            if let Some(payload) = parse_route_args(&argv) {
                let _ = app.emit("native-route-open", payload);
            }
        }))
        .manage(InitialRouteState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // 冷啟動引數解析：若開機直接透過檔案/關聯啟動，記錄於狀態供前端掛載時取用
            let args: Vec<String> = std::env::args().collect();
            if let Some(payload) = parse_route_args(&args) {
                let state: tauri::State<InitialRouteState> = app.state();
                if let Ok(mut lock) = state.target.lock() {
                    *lock = Some(payload);
                }
            }

            // 初始化外部檔案變動即時監聽器 (File Watcher)
            let watcher_manager = FileWatcherManager::default();
            let app_handle_clone = app.handle().clone();
            let inner_clone = Arc::clone(&watcher_manager.inner);

            let watcher_res = RecommendedWatcher::new(
                move |res: Result<Event, notify::Error>| {
                    if let Ok(event) = res {
                        if event.kind.is_modify() || event.kind.is_create() {
                            for path in event.paths {
                                if path.is_file() {
                                    let canonical_path = path.canonicalize().unwrap_or_else(|_| path.clone());
                                    let path_str = path.to_string_lossy().to_string();

                                    let is_target = {
                                        let lock = inner_clone.lock().unwrap();
                                        lock.watched_files.contains(&path) || lock.watched_files.contains(&canonical_path)
                                    };

                                    if !is_target {
                                        continue;
                                    }

                                    // 稍作等待以避開 Windows 外部編輯器原子寫入時的鎖定
                                    let mut read_content = None;
                                    for _ in 0..4 {
                                        if let Ok(c) = fs::read_to_string(&path) {
                                            read_content = Some(c);
                                            break;
                                        }
                                        std::thread::sleep(std::time::Duration::from_millis(40));
                                    }

                                    if let Some(content) = read_content {
                                        let mut hasher = std::collections::hash_map::DefaultHasher::new();
                                        std::hash::Hash::hash(&content, &mut hasher);
                                        let new_hash = std::hash::Hasher::finish(&hasher);

                                        let should_emit = {
                                            let mut lock = inner_clone.lock().unwrap();
                                            if let Some(&last_hash) = lock.last_written_hashes.get(&path_str) {
                                                if last_hash == new_hash {
                                                    false
                                                } else {
                                                    lock.last_written_hashes.insert(path_str.clone(), new_hash);
                                                    true
                                                }
                                            } else {
                                                lock.last_written_hashes.insert(path_str.clone(), new_hash);
                                                true
                                            }
                                        };

                                        if should_emit {
                                            let _ = app_handle_clone.emit(
                                                "vault-file-changed-externally",
                                                ExternalFileChangePayload {
                                                    path: path_str,
                                                    content,
                                                },
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                Config::default(),
            );

            if let Ok(w) = watcher_res {
                *watcher_manager.watcher.lock().unwrap() = Some(w);
            }
            app.manage(watcher_manager);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_vault_folder,
            scan_vault_folder,
            scan_multiple_vault_folders,
            read_vault_file,
            write_vault_file,
            set_watched_files,
            detect_onedrive_accounts,
            backup_vault_to_onedrive,
            check_onedrive_backup,
            read_onedrive_backup_json,
            open_in_system_explorer,
            get_initial_route_target,
            get_system_integration_info,
            toggle_windows_context_menu,
            save_os_secure_keys,
            load_os_secure_keys,
            purge_os_secure_keys,
            load_caves_cache,
            save_caves_cache
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    let is_dir = path.is_dir();
                    let path_str = path.to_string_lossy().to_string();
                    let _ = app_handle.emit("native-route-open", NativeRoutePayload {
                        path: path_str,
                        is_directory: is_dir,
                    });
                }
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (app_handle, event);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_caves_scan_logic() {
        let p_d = "D:\\";
        let p_work = "D:\\Documents\\工單";
        let norm_d = normalize_path_str(p_d);
        let norm_work = normalize_path_str(p_work);
        assert!(is_sub_or_same_path(&norm_d, &norm_work));

        let file_in_work = "d:/Documents/工單/項目.md";
        assert!(is_sub_or_same_path(&norm_d, file_in_work));
        assert!(is_sub_or_same_path(&norm_work, file_in_work));

        // 驗證包含多位元組中文字符（如「擷」）時絕不發生 byte index panic
        let parent_utf8 = "d:/Documents/1234567"; // 19 bytes
        let child_utf8 = "d:/Documents/123456擷取/note.md"; // 18..21 為「擷」
        assert!(!is_sub_or_same_path(parent_utf8, child_utf8));
    }
}

