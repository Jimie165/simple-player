import { getCurrentWindow } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();

export const systemService = {
    minimize: () => appWindow.minimize(),
    toggleMaximize: () => appWindow.toggleMaximize(),
    close: () => appWindow.close(),
    // 监听窗口大小变化
    onResize: (callback: () => void) => appWindow.listen('tauri://resize', callback),
    isMaximized: () => appWindow.isMaximized(),
    isFullscreen: () => appWindow.isFullscreen(),
    setFullscreen: async (fullscreen: boolean) => {
        await appWindow.setFullscreen(fullscreen);
        const deadline = Date.now() + 3000;
        while (await appWindow.isFullscreen() !== fullscreen) {
            if (Date.now() >= deadline) throw new Error('Window fullscreen transition timed out');
            await new Promise(resolve => setTimeout(resolve, 16));
        }
    },
};
