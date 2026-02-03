use tauri::Manager;
use serde::Serialize;

#[derive(Serialize)]
pub struct PathDebugInfo {
    app_data_dir: String,
    app_cache_dir: String,
    app_config_dir: String,
    app_log_dir: String,
}

#[tauri::command]
pub fn get_path_debug_info(app: tauri::AppHandle) -> Result<PathDebugInfo, String> {
    Ok(PathDebugInfo {
        app_data_dir: app.path().app_data_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|e| format!("Error: {}", e)),
        app_cache_dir: app.path().app_cache_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|e| format!("Error: {}", e)),
        app_config_dir: app.path().app_config_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|e| format!("Error: {}", e)),
        app_log_dir: app.path().app_log_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|e| format!("Error: {}", e)),
    })
}
