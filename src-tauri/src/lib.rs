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
            write_vault_file
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
