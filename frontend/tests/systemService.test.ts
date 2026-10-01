import { beforeEach, describe, expect, it, vi } from 'vitest';

const appWindow = vi.hoisted(() => ({
    isFullscreen: vi.fn(),
    setFullscreen: vi.fn(),
    isMaximized: vi.fn(),
    toggleMaximize: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => appWindow }));
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});

describe('platform window controls', () => {
    it('hides and restores native macOS buttons through the registered command', async () => {
        vi.stubGlobal('navigator', { userAgent: 'Macintosh' });
        const { systemService } = await import('@/services/systemService');
        await systemService.setWindowButtonsVisible(false);
        await systemService.setWindowButtonsVisible(true);
        expect(invoke.mock.calls).toEqual([
            ['set_macos_window_buttons_visible', { visible: false }],
            ['set_macos_window_buttons_visible', { visible: true }],
        ]);
    });

    it('does not change Windows decorations when opening the player', async () => {
        vi.stubGlobal('navigator', { userAgent: 'Windows NT 10.0' });
        const { systemService } = await import('@/services/systemService');
        await systemService.setWindowButtonsVisible(false);
        expect(invoke).not.toHaveBeenCalled();
    });
    it('enters and exits macOS fullscreen without calling maximize', async () => {
        vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
        const { systemService } = await import('@/services/systemService');
        appWindow.isFullscreen.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        await systemService.toggleMaximize();
        await systemService.toggleMaximize();
        expect(appWindow.setFullscreen.mock.calls).toEqual([[true], [false]]);
        expect(appWindow.toggleMaximize).not.toHaveBeenCalled();
        appWindow.isFullscreen.mockResolvedValue(true);
        expect(await systemService.isMaximized()).toBe(true);
        expect(appWindow.isMaximized).not.toHaveBeenCalled();
    });

    it('keeps Windows maximize and restore separate from fullscreen', async () => {
        vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
        const { systemService } = await import('@/services/systemService');
        await systemService.toggleMaximize();
        appWindow.isMaximized.mockResolvedValue(true);
        expect(await systemService.isMaximized()).toBe(true);
        expect(appWindow.toggleMaximize).toHaveBeenCalledOnce();
        expect(appWindow.setFullscreen).not.toHaveBeenCalled();
        expect(appWindow.isFullscreen).not.toHaveBeenCalled();
    });
});
