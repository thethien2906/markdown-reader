use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use std::sync::{Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use notify::{Watcher, RecursiveMode, Event, Config};
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileEntry>>,
}

// Managed state for the file watcher
pub struct WatcherState {
    watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

fn scan_directory(dir_path: &Path, recursive: bool) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(dir_path)
        .map_err(|e| format!("Failed to read directory {:?}: {}", dir_path, e))?;

    for entry in read_dir {
        if let Ok(entry) = entry {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            
            // Standard ignore patterns like VS Code
            if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" || name == ".git" {
                continue;
            }

            let file_type = entry.file_type()
                .map_err(|e| format!("Failed to get file type: {}", e))?;
            
            let is_dir = file_type.is_dir();
            let mut children = None;
            
            // If recursive is requested, we scan subdirectories
            if is_dir && recursive {
                if let Ok(sub_entries) = scan_directory(&path, true) {
                     children = Some(sub_entries);
                }
            } else if is_dir {
                // For lazy loading, we just indicate it's a directory with no children yet
                children = Some(Vec::new());
            }

            entries.push(FileEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir,
                children,
            });
        }
    }
    
    // Sort: dirs first, then name
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
fn get_directory_structure(path: String, recursive: Option<bool>) -> Result<Vec<FileEntry>, String> {
    scan_directory(Path::new(&path), recursive.unwrap_or(false))
}

#[tauri::command]
fn watch_folder(app_handle: AppHandle, state: State<'_, WatcherState>, path: String) -> Result<(), String> {
    // 1. Stop previous watcher if any
    let mut watcher_guard = state.watcher.lock().unwrap();
    *watcher_guard = None;

    // 2. Setup the event handler
    let path_to_watch = PathBuf::from(&path);
    let app_handle_clone = app_handle.clone();
    
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        match res {
            Ok(event) => {
                // If anything changed, notify frontend
                // VS Code uses a small debounce, we'll emit the event and let frontend handle refresh
                if event.kind.is_modify() || event.kind.is_create() || event.kind.is_remove() {
                    let _ = app_handle_clone.emit("fs-update", ());
                }
            }
            Err(e) => println!("watch error: {:?}", e),
        }
    }).map_err(|e| e.to_string())?;

    // 3. Start watching recursively
    watcher.watch(&path_to_watch, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    
    // 4. Save the watcher back to state
    *watcher_guard = Some(watcher);
    
    Ok(())
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
fn write_file_content(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherState { watcher: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            read_file_content, 
            write_file_content, 
            get_directory_structure,
            watch_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
