import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { systemService } from '@/services/systemService';

export function useImmersiveFullscreen(isOpen: boolean) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const wasMaximizedBeforeFullscreenRef = useRef(false);
    const enteredFullscreenRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        const checkFullscreen = async () => {
            try {
                const isFull = await getCurrentWindow().isFullscreen();
                if (!cancelled) setIsFullscreen(isFull);
            } catch (e) {
                console.error("Failed to check fullscreen status", e);
            }
        };
        checkFullscreen();
        const unlisten = systemService.onResize(checkFullscreen);
        return () => {
            cancelled = true;
            void unlisten.then((cleanup) => cleanup()).catch(console.error);
        };
    }, [isOpen]);

    const toggleFullscreen = async () => {
        const appWindow = getCurrentWindow();
        const fullscreenWindow = appWindow as typeof appWindow & { unmaximize?: () => Promise<void> };
        try {
            const currentFullscreen = await appWindow.isFullscreen();
            const newState = !currentFullscreen;

            if (systemService.isMacOS) {
                await appWindow.setFullscreen(newState);
                enteredFullscreenRef.current = newState;
                setIsFullscreen(newState);
                return;
            }

            if (newState) {
                const wasMaximized = await appWindow.isMaximized();
                wasMaximizedBeforeFullscreenRef.current = wasMaximized;
                if (wasMaximized) {
                    if (typeof fullscreenWindow.unmaximize === 'function') {
                        await fullscreenWindow.unmaximize();
                    } else {
                        await appWindow.toggleMaximize();
                    }
                    await new Promise(requestAnimationFrame);
                }
                await appWindow.setFullscreen(true);
                setIsFullscreen(true);
            } else {
                await appWindow.setFullscreen(false);
                setIsFullscreen(false);
                if (wasMaximizedBeforeFullscreenRef.current) {
                    await appWindow.maximize();
                    wasMaximizedBeforeFullscreenRef.current = false;
                }
            }
        } catch (e) {
            console.error("Failed to toggle fullscreen", e);
        }
    };

    useEffect(() => {
        if (!isOpen && isFullscreen) {
            // Closing the player must preserve fullscreen entered from the macOS title bar.
            if (systemService.isMacOS && !enteredFullscreenRef.current) return;
            let cancelled = false;
            const closeFullscreen = async () => {
                const appWindow = getCurrentWindow();
                try {
                    await appWindow.setFullscreen(false);
                    enteredFullscreenRef.current = false;
                    if (wasMaximizedBeforeFullscreenRef.current) {
                        await appWindow.maximize();
                        wasMaximizedBeforeFullscreenRef.current = false;
                    }
                } catch (error) {
                    console.error(error);
                }
                if (!cancelled) setIsFullscreen(false);
            };
            closeFullscreen();
            return () => {
                cancelled = true;
            };
        }
    }, [isOpen, isFullscreen]);

    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (!isFullscreen) return;

            event.preventDefault();
            event.stopPropagation();
            void toggleFullscreen();
        };

        window.addEventListener('keydown', handleEscape, { capture: true });
        return () => window.removeEventListener('keydown', handleEscape, { capture: true });
    }, [isOpen, isFullscreen]);

    return { isFullscreen, toggleFullscreen };
}
