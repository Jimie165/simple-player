import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

const appWindow = getCurrentWindow();
const isMacOS = /Macintosh|Mac OS X/.test(navigator.userAgent);

export const systemService = {
    isMacOS,
    setWindowButtonsVisible: async (visible: boolean) => {
        if (isMacOS) await invoke('set_macos_window_buttons_visible', { visible });
    },
    minimize: () => appWindow.minimize(),
    toggleMaximize: async () => {
        if (isMacOS) {
            await appWindow.setFullscreen(!await appWindow.isFullscreen());
        } else {
            await appWindow.toggleMaximize();
        }
    },
    close: () => appWindow.close(),
    // 监听窗口大小变化
    onResize: (callback: () => void) => appWindow.listen('tauri://resize', callback),
    isMaximized: () => isMacOS ? appWindow.isFullscreen() : appWindow.isMaximized(),
    setFullscreen: (fullscreen: boolean) => appWindow.setFullscreen(fullscreen),
};
