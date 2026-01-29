import { getCurrentWindow } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();

export const systemService = {
    minimize: () => appWindow.minimize(),
    toggleMaximize: () => appWindow.toggleMaximize(),
    close: () => appWindow.close(),
    // 监听窗口大小变化
    onResize: (callback: () => void) => appWindow.listen('tauri://resize', callback),
    isMaximized: () => appWindow.isMaximized(),
    setFullscreen: (fullscreen: boolean) => appWindow.setFullscreen(fullscreen),
};