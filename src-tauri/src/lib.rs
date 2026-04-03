use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileEntry>>,
}

fn scan_directory(dir_path: &Path) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    let read_dir = fs::read_dir(dir_path)
        .map_err(|e| format!("Failed to read directory {:?}: {}", dir_path, e))?;

    for entry in read_dir {
        if let Ok(entry) = entry {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            
            // Skip hidden files/directories (starting with dot) 
            // and specific directories like node_modules, target, etc.
            if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
                continue;
            }

            let file_type = entry.file_type()
                .map_err(|e| format!("Failed to get file config: {}", e))?;
            
            let is_dir = file_type.is_dir();
            let mut children = None;
            
            // Note: We only fetch children if it's a directory, but doing it recursively
            // for the entire tree might be slow for huge directories.
            // For a basic explorer, it's often better to just fetch 1 level or a few levels deep.
            // We'll limit recursion depth by keeping it simple for now, but handle large trees carefully.
            if is_dir {
                // To keep it simple, we recurse. 
                // You could optimize this to lazy-load if needed.
                if let Ok(sub_entries) = scan_directory(&path) {
                     children = Some(sub_entries);
                }
            }

            entries.push(FileEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir,
                children,
            });
        }
    }
    
    // Sort entries: directories first, then alphabetically
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
fn get_directory_structure(path: String) -> Result<Vec<FileEntry>, String> {
    scan_directory(Path::new(&path))
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
fn write_file_content(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write file: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet, read_file_content, write_file_content, get_directory_structure])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
