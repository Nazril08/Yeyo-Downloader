// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use serde::{Deserialize, Serialize};

// =================================
// Playlist Logic
// =================================

#[derive(Serialize, Deserialize, Clone)]
struct PlaylistEntry {
    id: String,
    title: String,
    thumbnail: Option<String>,
}

#[tauri::command]
async fn get_playlist_info(app_handle: tauri::AppHandle, url: String) -> Result<Vec<PlaylistEntry>, String> {
    let python_script_path = {
        #[cfg(not(debug_assertions))]
        {
            app_handle.path_resolver()
                .resolve_resource("yt_downloader.py")
                .ok_or_else(|| "In production, failed to resolve resource path.".to_string())?
        }
        #[cfg(debug_assertions)]
        {
            let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            manifest_dir.parent()
                .ok_or_else(|| "Failed to get project root from manifest dir".to_string())?
                .join("yt_downloader.py")
        }
    };

    // Try multiple Python commands in order of preference
    let python_commands = ["python", "python3", "py"];
    let mut last_error = String::new();
    
    for python_cmd in python_commands.iter() {
        match Command::new(python_cmd)
            .arg(&python_script_path)
            .arg("get-playlist-info")
            .arg(&url)
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    let stdout = String::from_utf8(output.stdout)
                        .map_err(|e| format!("Failed to read stdout from python script: {}", e))?;
                    return serde_json::from_str(&stdout)
                        .map_err(|e| format!("Failed to parse playlist JSON: {}", e));
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    last_error = format!("Python script failed with {}: {}", python_cmd, stderr);
                }
            }
            Err(e) => {
                last_error = format!("Failed to execute {} command: {}", python_cmd, e);
                continue;
            }
        }
    }
    
    Err(format!("All Python commands failed. Last error: {}. Please ensure Python is installed and yt-dlp is available.", last_error))
}


// =================================
// Settings Logic
// =================================

#[derive(Serialize, Deserialize, Clone)]
struct Settings {
    download_path: String,
}

/// A helper function to get the OS-specific path to our settings directory.
/// It creates a dedicated folder for our app inside the user's config directory.
/// Example: C:\Users\Nazril\AppData\Roaming\com.yeyo.downloader
fn get_settings_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path_resolver()
        .app_config_dir()
        .ok_or_else(|| "Could not determine the app config directory.".to_string())
}

#[tauri::command]
async fn load_settings(app_handle: tauri::AppHandle) -> Result<Settings, String> {
    let settings_dir = get_settings_dir(&app_handle)?;
    let file_path = settings_dir.join("settings.json");

    if file_path.exists() {
        let content = fs::read_to_string(file_path)
            .map_err(|e| format!("Failed to read settings file: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings file: {}", e))
    } else {
        // If no settings file exists, create a default one.
        let default_path = dirs_next::download_dir()
            .ok_or_else(|| "Could not determine the default download directory.".to_string())?
            .to_str()
            .ok_or_else(|| "Default download path contains invalid characters.".to_string())?
            .to_string();

        let default_settings = Settings {
            download_path: default_path,
        };
        // We use the save_settings command to ensure the directory is created correctly.
        save_settings(app_handle, default_settings.clone()).await?;
        Ok(default_settings)
    }
}

#[tauri::command]
async fn save_settings(app_handle: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let settings_dir = get_settings_dir(&app_handle)?;
    let file_path = settings_dir.join("settings.json");

    // === THE CRITICAL STEP ===
    // Ensure the parent directory exists before trying to write the file.
    // This atomically creates all parent directories if they are missing.
    fs::create_dir_all(&settings_dir)
        .map_err(|e| format!("Failed to create settings directory: {}", e))?;

    let json_string = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&file_path, json_string)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;

    Ok(())
}


// =================================
// Download Logic
// =================================

#[derive(Serialize, Clone)]
struct DownloadPayload {
    status: String,
    message: String,
}

#[tauri::command]
async fn get_media_title(app_handle: tauri::AppHandle, url: String) -> Result<String, String> {
    let python_script_path = {
        #[cfg(not(debug_assertions))]
        {
            app_handle.path_resolver()
                .resolve_resource("yt_downloader.py")
                .ok_or_else(|| "In production, failed to resolve resource path.".to_string())?
        }
        #[cfg(debug_assertions)]
        {
            let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            manifest_dir.parent()
                .ok_or_else(|| "Failed to get project root from manifest dir".to_string())?
                .join("yt_downloader.py")
        }
    };

    // Try multiple Python commands in order of preference
    let python_commands = ["python", "python3", "py"];
    let mut last_error = String::new();
    
    for python_cmd in python_commands.iter() {
        match Command::new(python_cmd)
            .arg(&python_script_path)
            .arg("get-title")
            .arg(&url)
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    let filename = String::from_utf8(output.stdout)
                        .map_err(|e| format!("Failed to read stdout from get-title script: {}", e))?
                        .trim()
                        .to_string();
                    return Ok(filename);
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    last_error = format!("Python script (get-title) failed with {}: {}", python_cmd, stderr);
                }
            }
            Err(e) => {
                last_error = format!("Failed to execute {} command for get-title: {}", python_cmd, e);
                continue;
            }
        }
    }
    
    Err(format!("All Python commands failed for get-title. Last error: {}. Please ensure Python is installed and yt-dlp is available.", last_error))
}


#[tauri::command]
async fn download_media(
    window: tauri::Window,
    url: String,
    quality: String,
    format_type: String,
) -> Result<(), String> {
    let app_handle = window.app_handle();
    let settings = load_settings(app_handle.clone()).await?;
    let download_path = settings.download_path;

    let python_script_path = {
        #[cfg(not(debug_assertions))]
        {
            // In RELEASE mode, the script is a resource bundled with the app.
            app_handle.path_resolver()
                .resolve_resource("yt_downloader.py")
                .ok_or_else(|| "In production, failed to resolve resource path.".to_string())?
        }
        #[cfg(debug_assertions)]
        {
            // In DEBUG mode, we find the script relative to the crate's manifest directory.
            let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            manifest_dir.parent()
                .ok_or_else(|| "Failed to get project root from manifest dir".to_string())?
                .join("yt_downloader.py")
        }
    };

    if !python_script_path.exists() {
        return Err(format!("Python script not found at expected path: {}", python_script_path.display()));
    }
    
    let python_script_str = python_script_path.to_str().ok_or("Invalid path characters")?.to_string();

    window.emit("DOWNLOAD_STATUS", &DownloadPayload {
        status: "downloading".into(),
        message: "Starting download...".into(),
    }).map_err(|e| e.to_string())?;

    // Try multiple Python commands in order of preference
    let python_commands = ["python", "python3", "py"];
    let mut last_error = String::new();
    
    for python_cmd in python_commands.iter() {
        let output = Command::new(python_cmd)
            .arg(&python_script_str)
            .arg("download")
            .arg(&url)
            .arg(&quality)
            .arg(&format_type)
            .arg(&download_path)
            .output();

        match output {
            Ok(output) => {
                if output.status.success() {
                    let success_message = String::from_utf8_lossy(&output.stdout).to_string();
                    window.emit("DOWNLOAD_STATUS", &DownloadPayload {
                        status: "success".into(),
                        message: success_message,
                    }).map_err(|e| e.to_string())?;
                    return Ok(());
                } else {
                    let error_message = String::from_utf8_lossy(&output.stderr).to_string();
                    last_error = format!("Python script failed with {}: {}", python_cmd, error_message);
                }
            }
            Err(e) => {
                last_error = format!("Failed to execute {} command: {}", python_cmd, e);
                continue;
            }
        }
    }
    
    // If all commands failed, emit error and return
    let final_error = format!("All Python commands failed. Last error: {}. Please ensure Python is installed and yt-dlp is available.", last_error);
    window.emit("DOWNLOAD_STATUS", &DownloadPayload {
        status: "error".into(),
        message: final_error.clone(),
    }).map_err(|e| e.to_string())?;
    Err(final_error)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            download_media,
            get_media_title,
            load_settings,
            save_settings,
            get_playlist_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
