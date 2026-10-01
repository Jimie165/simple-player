/// Shows or hides the native macOS traffic lights without changing window decorations.
#[tauri::command]
pub fn set_macos_window_buttons_visible(
    window: tauri::WebviewWindow,
    visible: bool,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let target = window.clone();
        window
            .run_on_main_thread(move || {
                use objc2_app_kit::{NSWindow, NSWindowButton};
                let Ok(pointer) = target.ns_window() else {
                    return;
                };
                // Tauri owns this NSWindow; borrow it only on the main thread while
                // the captured WebviewWindow keeps the window handle alive.
                let native = unsafe { &*pointer.cast::<NSWindow>() };
                for button in [
                    NSWindowButton::CloseButton,
                    NSWindowButton::MiniaturizeButton,
                    NSWindowButton::ZoomButton,
                ] {
                    if let Some(button) = native.standardWindowButton(button) {
                        button.setHidden(!visible);
                    }
                }
            })
            .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, visible);
        Ok(())
    }
}
