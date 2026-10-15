use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri_plugin_dialog::DialogExt;

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

                // 跳過過大檔案（大於 2MB 的文字檔先不即時掃描 preview）
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

                let preview = if size <= 2 * 1024 * 1024 {
                    // 讀取前 300 字元預覽
                    fs::read_to_string(&path)
                        .map(|s| s.chars().take(250).collect::<String>())
                        .unwrap_or_default()
                } else {
                    String::new()
                };

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
fn scan_vault_folder(folder_path: String) -> Result<Vec<VaultFileItem>, String> {
    let base_path = PathBuf::from(&folder_path);
    if !base_path.exists() || !base_path.is_dir() {
        return Err("指定的路徑不存在或並非目錄".to_string());
    }

    let mut results = Vec::new();
    walk_directory_internal(&base_path, &base_path, 0, 7, &mut results);
    // 依修改時間降冪排列（最近修改的排前面）
    results.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(results)
}

#[tauri::command]
fn read_vault_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| format!("無法讀取檔案 {}: {}", file_path, e))
}

#[tauri::command]
fn write_vault_file(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("無法建立目錄: {}", e))?;
        }
    }
    fs::write(&path, content).map_err(|e| format!("無法寫入檔案 {}: {}", file_path, e))
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

    // 1. 探測原生企業版環境變數: %OneDriveCommercial%
    if let Ok(commercial_path) = std::env::var("OneDriveCommercial") {
        let p = PathBuf::from(&commercial_path);
        if p.exists() {
            let dir_name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "OneDrive - 企業版".to_string());
            let tenant_name = if let Some(idx) = dir_name.find(" - ") {
                Some(dir_name[idx + 3..].trim().to_string())
            } else {
                Some("企業組織".to_string())
            };

            accounts.push(OneDriveAccountInfo {
                account_type: "business".to_string(),
                display_name: format!("OneDrive (企業/組織版) · {}", tenant_name.as_deref().unwrap_or("商業版")),
                folder_path: commercial_path,
                tenant_name,
                is_available: true,
            });
        }
    }

    // 2. 探測原生個人版環境變數: %OneDriveConsumer%
    if let Ok(consumer_path) = std::env::var("OneDriveConsumer") {
        let p = PathBuf::from(&consumer_path);
        if p.exists() && !accounts.iter().any(|a| a.folder_path == consumer_path) {
            accounts.push(OneDriveAccountInfo {
                account_type: "personal".to_string(),
                display_name: "OneDrive (個人版)".to_string(),
                folder_path: consumer_path,
                tenant_name: None,
                is_available: true,
            });
        }
    }

    // 3. 探測通用預設環境變數: %OneDrive%
    if let Ok(onedrive_path) = std::env::var("OneDrive") {
        let p = PathBuf::from(&onedrive_path);
        if p.exists() && !accounts.iter().any(|a| a.folder_path == onedrive_path) {
            let dir_name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            let is_commercial = dir_name.contains(" - ");

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

    // 4. 家目錄探測 Fallback: 尋找 %USERPROFILE%/OneDrive*
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let profile_path = PathBuf::from(&user_profile);
        if let Ok(entries) = fs::read_dir(&profile_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    let path_str = path.to_string_lossy().to_string();

                    if name == "OneDrive" && !accounts.iter().any(|a| a.folder_path == path_str) {
                        accounts.push(OneDriveAccountInfo {
                            account_type: "personal".to_string(),
                            display_name: "OneDrive (個人版)".to_string(),
                            folder_path: path_str,
                            tenant_name: None,
                            is_available: true,
                        });
                    } else if name.starts_with("OneDrive - ") && !accounts.iter().any(|a| a.folder_path == path_str) {
                        let tenant = name.strip_prefix("OneDrive - ").map(|s| s.trim().to_string());
                        accounts.push(OneDriveAccountInfo {
                            account_type: "business".to_string(),
                            display_name: format!("OneDrive (企業/組織版) · {}", tenant.as_deref().unwrap_or("商業版")),
                            folder_path: path_str,
                            tenant_name: tenant,
                            is_available: true,
                        });
                    }
                }
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
        "app_version": "0.1.0"
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_vault_folder,
            scan_vault_folder,
            read_vault_file,
            write_vault_file,
            detect_onedrive_accounts,
            backup_vault_to_onedrive,
            check_onedrive_backup,
            read_onedrive_backup_json,
            open_in_system_explorer
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
