use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi};
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    DestroyIcon, HICON, ICON_BIG, ICON_SMALL, IMAGE_ICON, LoadImageW, SM_CXICON, SM_CXSMICON,
    SM_CYICON, SM_CYSMICON, SendMessageW, WM_DPICHANGED, WM_NCDESTROY, WM_SETICON,
};
use windows::core::PCWSTR;

const ICON_SUBCLASS_ID: usize = 0x53504943;

struct OwnedIcon(HICON);

impl Drop for OwnedIcon {
    fn drop(&mut self) {
        unsafe {
            let _ = DestroyIcon(self.0);
        }
    }
}

struct WindowIcons {
    small: OwnedIcon,
    big: OwnedIcon,
}

impl WindowIcons {
    fn load(_hwnd: HWND, dpi: u32) -> windows::core::Result<Self> {
        let load = |width, height| unsafe {
            #[cfg(not(test))]
            let (instance, resource, flags) = {
                use windows::Win32::Foundation::HINSTANCE;
                use windows::Win32::UI::WindowsAndMessaging::{
                    GWLP_HINSTANCE, GetWindowLongPtrW, IMAGE_FLAGS,
                };
                let instance = HINSTANCE(GetWindowLongPtrW(_hwnd, GWLP_HINSTANCE) as *mut _);
                let resource = PCWSTR(
                    tauri::utils::platform::WINDOWS_APP_ICON_RESOURCE_ID as usize as *const u16,
                );
                (Some(instance), resource, IMAGE_FLAGS(0))
            };
            // Cargo's test harness has no embedded application resources.
            #[cfg(test)]
            let path: Vec<u16> = concat!(env!("CARGO_MANIFEST_DIR"), "/icons/icon.ico")
                .encode_utf16()
                .chain(Some(0))
                .collect();
            #[cfg(test)]
            let (instance, resource, flags) = (
                None,
                PCWSTR(path.as_ptr()),
                windows::Win32::UI::WindowsAndMessaging::LR_LOADFROMFILE,
            );
            LoadImageW(
                instance,
                resource,
                IMAGE_ICON,
                GetSystemMetricsForDpi(width, dpi),
                GetSystemMetricsForDpi(height, dpi),
                flags,
            )
            .map(|handle| OwnedIcon(HICON(handle.0)))
        };
        Ok(Self {
            small: load(SM_CXSMICON, SM_CYSMICON)?,
            big: load(SM_CXICON, SM_CYICON)?,
        })
    }

    fn apply(&self, hwnd: HWND) {
        unsafe {
            SendMessageW(
                hwnd,
                WM_SETICON,
                Some(WPARAM(ICON_SMALL as usize)),
                Some(LPARAM(self.small.0.0 as isize)),
            );
            SendMessageW(
                hwnd,
                WM_SETICON,
                Some(WPARAM(ICON_BIG as usize)),
                Some(LPARAM(self.big.0.0 as isize)),
            );
        }
    }
}

/// Called on the UI thread. The native window owns the icons through its subclass data.
pub fn initialize(window: &tauri::WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let hwnd = window.hwnd()?;
    initialize_hwnd(hwnd)?;
    Ok(())
}

fn initialize_hwnd(hwnd: HWND) -> windows::core::Result<()> {
    let icons = Box::new(WindowIcons::load(hwnd, unsafe { GetDpiForWindow(hwnd) })?);
    let state = Box::into_raw(icons);
    unsafe {
        if !SetWindowSubclass(hwnd, Some(icon_subclass), ICON_SUBCLASS_ID, state as usize).as_bool()
        {
            drop(Box::from_raw(state));
            return Err(windows::core::Error::from_thread());
        }
        (*state).apply(hwnd);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::Graphics::Gdi::{BITMAP, DeleteObject, GetObjectW, HGDIOBJ};
    use windows::Win32::UI::Shell::GetWindowSubclass;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, GetDesktopWindow, WINDOW_EX_STYLE, WINDOW_STYLE, WM_GETICON,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO};
    use windows::core::w;

    struct TestWindow(HWND);

    impl TestWindow {
        fn new() -> Self {
            unsafe {
                let hwnd = CreateWindowExW(
                    WINDOW_EX_STYLE(0),
                    w!("STATIC"),
                    w!("Icon DPI test"),
                    WINDOW_STYLE(0),
                    0,
                    0,
                    100,
                    100,
                    Some(GetDesktopWindow()),
                    None,
                    None,
                    None,
                )
                .unwrap();
                initialize_hwnd(hwnd).unwrap();
                Self(hwnd)
            }
        }

        fn icon(&self, kind: u32) -> LRESULT {
            unsafe { SendMessageW(self.0, WM_GETICON, Some(WPARAM(kind as usize)), None) }
        }

        fn icon_size(&self, kind: u32) -> (i32, i32) {
            unsafe {
                let mut info = ICONINFO::default();
                GetIconInfo(HICON(self.icon(kind).0 as *mut _), &mut info).unwrap();
                let mut bitmap = BITMAP::default();
                let read = GetObjectW(
                    HGDIOBJ(info.hbmColor.0),
                    std::mem::size_of::<BITMAP>() as i32,
                    Some((&mut bitmap as *mut BITMAP).cast()),
                );
                let _ = DeleteObject(HGDIOBJ(info.hbmColor.0));
                let _ = DeleteObject(HGDIOBJ(info.hbmMask.0));
                assert_ne!(read, 0);
                (bitmap.bmWidth, bitmap.bmHeight)
            }
        }
    }

    impl Drop for TestWindow {
        fn drop(&mut self) {
            unsafe {
                DestroyWindow(self.0).unwrap();
            }
        }
    }

    #[test]
    fn installs_both_icons_and_replaces_them_on_dpi_change() {
        let window = TestWindow::new();
        let other = TestWindow::new();
        let other_icon = other.icon(ICON_BIG);
        let mut previous_small = window.icon(ICON_SMALL);
        let mut previous_big = window.icon(ICON_BIG);
        assert_ne!(previous_small.0, 0);
        assert_ne!(previous_big.0, 0);
        assert_ne!(previous_small, previous_big);
        for dpi in [96usize, 144, 192, 96] {
            unsafe {
                SendMessageW(
                    window.0,
                    WM_DPICHANGED,
                    Some(WPARAM(dpi | (dpi << 16))),
                    None,
                );
            }
            let small = window.icon(ICON_SMALL);
            let big = window.icon(ICON_BIG);
            assert_ne!(small.0, 0);
            assert_ne!(big.0, 0);
            assert_ne!(small, previous_small);
            assert_ne!(big, previous_big);
            assert_eq!(window.icon_size(ICON_SMALL), unsafe {
                (
                    GetSystemMetricsForDpi(SM_CXSMICON, dpi as u32),
                    GetSystemMetricsForDpi(SM_CYSMICON, dpi as u32),
                )
            });
            assert_eq!(window.icon_size(ICON_BIG), unsafe {
                (
                    GetSystemMetricsForDpi(SM_CXICON, dpi as u32),
                    GetSystemMetricsForDpi(SM_CYICON, dpi as u32),
                )
            });
            assert_eq!(other.icon(ICON_BIG), other_icon);
            previous_small = small;
            previous_big = big;
        }
        let hwnd = window.0;
        drop(window);
        let mut data = 0usize;
        assert!(
            !unsafe {
                GetWindowSubclass(hwnd, Some(icon_subclass), ICON_SUBCLASS_ID, Some(&mut data))
            }
            .as_bool()
        );
    }
}

unsafe extern "system" fn icon_subclass(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    subclass_id: usize,
    reference_data: usize,
) -> LRESULT {
    unsafe {
        if message == WM_NCDESTROY {
            let _ = RemoveWindowSubclass(hwnd, Some(icon_subclass), subclass_id);
            let result = DefSubclassProc(hwnd, message, wparam, lparam);
            drop(Box::from_raw(reference_data as *mut WindowIcons));
            return result;
        }
        let result = DefSubclassProc(hwnd, message, wparam, lparam);
        if message == WM_DPICHANGED {
            let dpi = (wparam.0 & 0xffff) as u32;
            match WindowIcons::load(hwnd, dpi) {
                Ok(icons) => {
                    icons.apply(hwnd);
                    // Release the previous handles only after both replacements are installed.
                    *(reference_data as *mut WindowIcons) = icons;
                }
                Err(error) => eprintln!("Failed to update window icons for DPI {dpi}: {error}"),
            }
        }
        result
    }
}
