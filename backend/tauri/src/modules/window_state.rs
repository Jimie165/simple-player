use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::Manager;

const WINDOW_STATE_KEY: &str = "main_window_state";
const MIN_WINDOW_WIDTH: u32 = 600;
const MIN_WINDOW_HEIGHT: u32 = 500;
const MIN_VISIBLE_EDGE: i64 = 64;

#[derive(Clone, Copy, Deserialize, Serialize)]
struct WindowBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
struct PersistedWindowState {
    bounds: WindowBounds,
    maximized: bool,
}

#[derive(Clone, Copy)]
struct MonitorBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

/// 恢复主窗口状态，并在关闭时保存下一次启动所需的边界与最大化状态。
pub fn initialize(app: &tauri::App, db: Arc<Mutex<Connection>>) {
    let saved_state = db.lock().ok().and_then(|conn| load(&conn));
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let monitor_bounds = available_monitor_bounds(&window);
    let restored_state = saved_state.filter(|state| {
        has_valid_size(&state.bounds) && is_visible_on_any_monitor(&state.bounds, &monitor_bounds)
    });

    if let Some(state) = restored_state.as_ref() {
        let _ = window.set_size(tauri::PhysicalSize::new(
            state.bounds.width,
            state.bounds.height,
        ));
        let _ = window.set_position(tauri::PhysicalPosition::new(state.bounds.x, state.bounds.y));
        if state.maximized {
            let _ = window.maximize();
        }
    } else if saved_state.is_some() {
        // The previous process may have been killed while minimized, or the display layout may
        // have changed. Keep the configured default size and put the window back on screen.
        let _ = window.center();
    }

    let bounds = Arc::new(Mutex::new(
        restored_state
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
        tauri::WindowEvent::Moved(position) if is_normal_window(&window_for_events) => {
            if let Ok(mut current) = bounds.lock() {
                current.x = position.x;
                current.y = position.y;
            }
        }
        tauri::WindowEvent::Resized(_) if is_normal_window(&window_for_events) => {
            if let (Ok(size), Ok(mut current)) = (window_for_events.outer_size(), bounds.lock()) {
                // On Windows a minimized window reports a tiny/zero outer size. Never let that
                // transient geometry replace the last usable normal-window bounds.
                if size.width >= MIN_WINDOW_WIDTH && size.height >= MIN_WINDOW_HEIGHT {
                    current.width = size.width;
                    current.height = size.height;
                }
            }
        }
        tauri::WindowEvent::CloseRequested { .. } => {
            if let Ok(current) = bounds.lock() {
                let monitors = available_monitor_bounds(&window_for_events);
                if has_valid_size(&current) && is_visible_on_any_monitor(&current, &monitors) {
                    save(
                        &db,
                        PersistedWindowState {
                            bounds: *current,
                            maximized: window_for_events.is_maximized().unwrap_or(false),
                        },
                    );
                }
            }
        }
        _ => {}
    });

    // 窗口在配置中以隐藏状态创建；完成恢复后再显示，避免默认位置闪现。
    let _ = window.show();
}

fn is_normal_window(window: &tauri::WebviewWindow) -> bool {
    !window.is_minimized().unwrap_or(false) && !window.is_maximized().unwrap_or(false)
}

fn available_monitor_bounds(window: &tauri::WebviewWindow) -> Vec<MonitorBounds> {
    window
        .available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|monitor| {
            let work_area = monitor.work_area();
            MonitorBounds {
                x: work_area.position.x,
                y: work_area.position.y,
                width: work_area.size.width,
                height: work_area.size.height,
            }
        })
        .collect()
}

fn has_valid_size(bounds: &WindowBounds) -> bool {
    bounds.width >= MIN_WINDOW_WIDTH && bounds.height >= MIN_WINDOW_HEIGHT
}

fn is_visible_on_any_monitor(bounds: &WindowBounds, monitors: &[MonitorBounds]) -> bool {
    monitors.iter().any(|monitor| {
        let left = i64::from(bounds.x).max(i64::from(monitor.x));
        let top = i64::from(bounds.y).max(i64::from(monitor.y));
        let right = (i64::from(bounds.x) + i64::from(bounds.width))
            .min(i64::from(monitor.x) + i64::from(monitor.width));
        let bottom = (i64::from(bounds.y) + i64::from(bounds.height))
            .min(i64::from(monitor.y) + i64::from(monitor.height));

        right - left >= MIN_VISIBLE_EDGE && bottom - top >= MIN_VISIBLE_EDGE
    })
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
