// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Child};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

// Embed Python script at compile time
const PYTHON_SCRIPT: &str = include_str!("../../yt_downloader.py");

// Global state for managing download processes
type DownloadProcesses = Arc<Mutex<HashMap<String, Child>>>;

// =================================
// Helper Functions
// =================================

// Helper function to create a command with hidden window on Windows
fn create_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW flag to hide the command prompt window
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    cmd
}

// Generate unique download ID
fn generate_download_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    format!("download_{}", timestamp)
}

/// Get the path to the Python script, handling both development and production modes
fn get_python_script_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        // Development mode: use the file from project root
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        Ok(manifest_dir.parent()
            .ok_or_else(|| "Failed to get project root from manifest dir".to_string())?
            .join("yt_downloader.py"))
    }
    #[cfg(not(debug_assertions))]
    {
        // Production mode: create temporary file with embedded script
        let temp_dir = app_handle
            .path_resolver()
            .app_cache_dir()
            .ok_or_else(|| "Failed to get app cache directory".to_string())?;
        
        // Ensure temp directory exists
        fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create temp directory: {}", e))?;
        
        let script_path = temp_dir.join("yt_downloader.py");
        
        // Write embedded script to temp file if it doesn't exist or is outdated
        if !script_path.exists() {
            let mut file = fs::File::create(&script_path)
                .map_err(|e| format!("Failed to create temp Python script: {}", e))?;
            file.write_all(PYTHON_SCRIPT.as_bytes())
                .map_err(|e| format!("Failed to write Python script: {}", e))?;
        }
        
        Ok(script_path)
    }
}

// =================================
// Playlist Logic
// =================================

#[derive(Serialize, Deserialize, Clone)]
struct DownloadPayload {
    status: String,
    message: String,
    download_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct PlaylistEntry {
    id: String,
    title: String,
    thumbnail: Option<String>,
}

#[tauri::command]
async fn get_playlist_info(app_handle: tauri::AppHandle, url: String) -> Result<Vec<PlaylistEntry>, String> {
    // Load settings to check thumbnail preference
    let settings = load_settings(app_handle.clone()).await?;
    
    let python_script_path = get_python_script_path(&app_handle)?;

    // Try multiple Python commands in order of preference
    let python_commands = ["python", "python3", "py"];
    let mut last_error = String::new();
    
    for python_cmd in python_commands.iter() {
        let mut command = create_command(python_cmd);
        command.arg(&python_script_path)
            .arg("get-playlist-info")
            .arg(&url);
        
        // Add thumbnail parameter
        if settings.enable_thumbnails {
            command.arg("--enable-thumbnails");
        }
        
        match command.output() {
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
    #[serde(default = "default_enable_thumbnails")]
    enable_thumbnails: bool,
}

fn default_enable_thumbnails() -> bool {
    true
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
            enable_thumbnails: true, // Default to enabled
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

#[tauri::command]
async fn get_media_title(app_handle: tauri::AppHandle, url: String) -> Result<String, String> {
    let python_script_path = get_python_script_path(&app_handle)?;

    // Try multiple Python commands in order of preference
    let python_commands = ["python", "python3", "py"];
    let mut last_error = String::new();
    
    for python_cmd in python_commands.iter() {
        match create_command(python_cmd)
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
) -> Result<String, String> {
    let app_handle = window.app_handle();
    let settings = load_settings(app_handle.clone()).await?;
    let download_path = settings.download_path;

    let python_script_path = get_python_script_path(&app_handle)?;

    if !python_script_path.exists() {
        return Err(format!("Python script not found at expected path: {}", python_script_path.display()));
    }
    
    let python_script_str = python_script_path.to_str().ok_or("Invalid path characters")?.to_string();
    let download_id = generate_download_id();

    // Get or create the processes map
    let processes: DownloadProcesses = window.state::<DownloadProcesses>().inner().clone();

    window.emit("DOWNLOAD_STATUS", &DownloadPayload {
        status: "downloading".into(),
        message: "Starting download...".into(),
        download_id: Some(download_id.clone()),
    }).map_err(|e| e.to_string())?;

    // Try multiple Python commands in order of preference
    let python_commands = ["python", "python3", "py"];
    let mut last_error = String::new();
    
    for python_cmd in python_commands.iter() {
        let mut child = match create_command(python_cmd)
            .arg(&python_script_str)
            .arg("download")
            .arg(&url)
            .arg(&quality)
            .arg(&format_type)
            .arg(&download_path)
            .spawn()
        {
            Ok(child) => child,
            Err(e) => {
                last_error = format!("Failed to execute {} command: {}", python_cmd, e);
                continue;
            }
        };

        // Store the child process for cancellation
        {
            let mut processes_lock = processes.lock().unwrap();
            processes_lock.insert(download_id.clone(), child);
        }

        // Wait for the process to complete in a separate thread
        let processes_clone = processes.clone();
        let download_id_clone = download_id.clone();
        let window_clone = window.clone();
        
        std::thread::spawn(move || {
            // Wait for completion and handle cancellation
            loop {
                std::thread::sleep(std::time::Duration::from_millis(100));
                
                let mut processes_lock = processes_clone.lock().unwrap();
                if let Some(child) = processes_lock.get_mut(&download_id_clone) {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            // Process completed
                            processes_lock.remove(&download_id_clone);
                            drop(processes_lock);
                            
                            if status.success() {
                                let _ = window_clone.emit("DOWNLOAD_STATUS", &DownloadPayload {
                                    status: "success".into(),
                                    message: "Download completed successfully!".into(),
                                    download_id: Some(download_id_clone.clone()),
                                });
                            } else {
                                let _ = window_clone.emit("DOWNLOAD_STATUS", &DownloadPayload {
                                    status: "error".into(),
                                    message: "Download failed".into(),
                                    download_id: Some(download_id_clone.clone()),
                                });
                            }
                            return;
                        }
                        Ok(None) => {
                            // Process still running, continue loop
                            drop(processes_lock);
                        }
                        Err(_) => {
                            // Error checking status
                            processes_lock.remove(&download_id_clone);
                            drop(processes_lock);
                            
                            let _ = window_clone.emit("DOWNLOAD_STATUS", &DownloadPayload {
                                status: "error".into(),
                                message: "Process error".into(),
                                download_id: Some(download_id_clone.clone()),
                            });
                            return;
                        }
                    }
                } else {
                    // Process was removed (cancelled)
                    drop(processes_lock);
                    let _ = window_clone.emit("DOWNLOAD_STATUS", &DownloadPayload {
                        status: "cancelled".into(),
                        message: "Download was cancelled".into(),
                        download_id: Some(download_id_clone.clone()),
                    });
                    return;
                }
            }
        });

        // Return download ID immediately
        return Ok(download_id);
    }
    
    // If all commands failed, emit error and return
    let final_error = format!("All Python commands failed. Last error: {}. Please ensure Python is installed and yt-dlp is available.", last_error);
    window.emit("DOWNLOAD_STATUS", &DownloadPayload {
        status: "error".into(),
        message: final_error.clone(),
        download_id: Some(download_id.clone()),
    }).map_err(|e| e.to_string())?;
    Err(final_error)
}

#[tauri::command]
async fn cancel_download(window: tauri::Window, downloadId: String) -> Result<(), String> {
    let processes: DownloadProcesses = window.state::<DownloadProcesses>().inner().clone();
    
    let mut processes_lock = processes.lock().unwrap();
    if let Some(mut child) = processes_lock.remove(&downloadId) {
        drop(processes_lock); // Release lock before killing process
        
        match child.kill() {
            Ok(_) => {
                window.emit("DOWNLOAD_STATUS", &DownloadPayload {
                    status: "cancelled".into(),
                    message: "Download cancelled successfully".into(),
                    download_id: Some(downloadId),
                }).map_err(|e| e.to_string())?;
                Ok(())
            }
            Err(e) => Err(format!("Failed to cancel download: {}", e))
        }
    } else {
        Err("Download not found or already completed".to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .manage(DownloadProcesses::new(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            download_media,
            cancel_download,
            get_media_title,
            load_settings,
            save_settings,
            get_playlist_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
