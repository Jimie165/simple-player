use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    GWL_STYLE, GetWindowLongW, SC_MAXIMIZE, SC_MOVE, SC_RESTORE, SC_SIZE, WM_NCCALCSIZE,
    WM_NCDESTROY, WM_NCLBUTTONDBLCLK, WM_SYSCOMMAND, WS_OVERLAPPEDWINDOW,
};

const FULLSCREEN_SUBCLASS_ID: usize = 0x53504653;

/// Install on the window's UI thread during setup; Windows removes it when the window is destroyed.
pub fn initialize(window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let hwnd = window.hwnd()?;
    unsafe {
        SetWindowSubclass(hwnd, Some(fullscreen_subclass), FULLSCREEN_SUBCLASS_ID, 0).ok()?;
    }
    Ok(())
}

unsafe extern "system" fn fullscreen_subclass(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    subclass_id: usize,
    _reference_data: usize,
) -> LRESULT {
    unsafe {
        if message == WM_SYSCOMMAND || message == WM_NCLBUTTONDBLCLK {
            let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
            if style & WS_OVERLAPPEDWINDOW.0 == 0 {
                // WebView2 caption regions can send system commands without going through
                // the main window's hit test. Retained maximization makes SC_RESTORE able
                // to shrink fullscreen while Tao still reports it as fullscreen.
                let command = (wparam.0 & 0xfff0) as u32;
                if message == WM_NCLBUTTONDBLCLK
                    || matches!(command, SC_RESTORE | SC_MAXIMIZE | SC_MOVE | SC_SIZE)
                {
                    return LRESULT(0);
                }
            }
        }
        if message == WM_NCCALCSIZE && wparam.0 != 0 {
            let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
            // Tao removes WS_OVERLAPPEDWINDOW in fullscreen, but retains WS_MAXIMIZE.
            // Its borderless maximized handler would otherwise clip the client to rcWork,
            // reserving taskbar space even in fullscreen. Keep the proposed full client rect.
            if style & WS_OVERLAPPEDWINDOW.0 == 0 {
                return LRESULT(0);
            }
        }
        if message == WM_NCDESTROY {
            let _ = RemoveWindowSubclass(hwnd, Some(fullscreen_subclass), subclass_id);
        }
        DefSubclassProc(hwnd, message, wparam, lparam)
    }
}
