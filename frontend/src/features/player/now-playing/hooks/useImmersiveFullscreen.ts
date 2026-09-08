import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function useImmersiveFullscreen(isOpen: boolean) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const wasMaximizedBeforeFullscreenRef = useRef(false);

    useEffect(() => {
        const checkFullscreen = async () => {
            try {
                const isFull = await getCurrentWindow().isFullscreen();
                setIsFullscreen(isFull);
            } catch (e) {
                console.error("Failed to check fullscreen status", e);
            }
        };
        checkFullscreen();
    }, [isOpen]);

    const toggleFullscreen = async () => {
        const appWindow = getCurrentWindow();
        const fullscreenWindow = appWindow as typeof appWindow & { unmaximize?: () => Promise<void> };
        try {
            const currentFullscreen = await appWindow.isFullscreen();
            const newState = !currentFullscreen;

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
            let cancelled = false;
            const closeFullscreen = async () => {
                const appWindow = getCurrentWindow();
                try {
                    await appWindow.setFullscreen(false);
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
