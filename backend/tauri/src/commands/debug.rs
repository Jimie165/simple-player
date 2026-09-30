use serde::Serialize;
use tauri::Manager;

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
        app_data_dir: crate::utils::paths::app_data_dir(&app)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|e| format!("Error: {}", e)),
        app_cache_dir: crate::utils::paths::app_cache_dir(&app)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|e| format!("Error: {}", e)),
        app_config_dir: crate::utils::paths::app_data_dir(&app)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|e| format!("Error: {}", e)),
        app_log_dir: app
            .path()
            .app_log_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|e| format!("Error: {}", e)),
    })
}
