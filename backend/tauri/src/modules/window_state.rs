use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::Manager;

const WINDOW_STATE_KEY: &str = "main_window_state";

#[derive(Clone, Copy, Deserialize, Serialize)]
struct WindowBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Deserialize, Serialize)]
struct PersistedWindowState {
    bounds: WindowBounds,
    maximized: bool,
}

/// 恢复主窗口状态，并在关闭时保存下一次启动所需的边界与最大化状态。
pub fn initialize(app: &tauri::App, db: Arc<Mutex<Connection>>) {
    let saved_state = db.lock().ok().and_then(|conn| load(&conn));
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    if let Some(state) = saved_state.as_ref() {
        let _ = window.set_size(tauri::PhysicalSize::new(
            state.bounds.width,
            state.bounds.height,
        ));
        let _ = window.set_position(tauri::PhysicalPosition::new(state.bounds.x, state.bounds.y));
        if state.maximized {
            let _ = window.maximize();
        }
    }

    let bounds = Arc::new(Mutex::new(
        saved_state
            .map(|state| state.bounds)
            .or_else(|| current_bounds(&window))
            .unwrap_or(WindowBounds {
                x: 0,
                y: 0,
                width: 1000,
                height: 700,
            }),
    ));
    let window_for_events = window.clone();

    window.on_window_event(move |event| match event {
        tauri::WindowEvent::Moved(position)
            if !window_for_events.is_maximized().unwrap_or(false) =>
        {
            if let Ok(mut current) = bounds.lock() {
                current.x = position.x;
                current.y = position.y;
            }
        }
        tauri::WindowEvent::Resized(_) if !window_for_events.is_maximized().unwrap_or(false) => {
            if let (Ok(size), Ok(mut current)) = (window_for_events.outer_size(), bounds.lock()) {
                current.width = size.width;
                current.height = size.height;
            }
        }
        tauri::WindowEvent::CloseRequested { .. } => {
            if let Ok(current) = bounds.lock() {
                save(
                    &db,
                    PersistedWindowState {
                        bounds: *current,
                        maximized: window_for_events.is_maximized().unwrap_or(false),
                    },
                );
            }
        }
        _ => {}
    });

    // 窗口在配置中以隐藏状态创建；完成恢复后再显示，避免默认位置闪现。
    let _ = window.show();
}

fn current_bounds(window: &tauri::WebviewWindow) -> Option<WindowBounds> {
    let position = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    Some(WindowBounds {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    })
}

fn load(conn: &Connection) -> Option<PersistedWindowState> {
    let value: String = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![WINDOW_STATE_KEY],
            |row| row.get(0),
        )
        .ok()?;
    serde_json::from_str(&value).ok()
}

fn save(db: &Arc<Mutex<Connection>>, state: PersistedWindowState) {
    let Ok(value) = serde_json::to_string(&state) else {
        return;
    };
    let Ok(conn) = db.lock() else {
        return;
    };
    let _ = conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()",
        params![WINDOW_STATE_KEY, value],
    );
}
