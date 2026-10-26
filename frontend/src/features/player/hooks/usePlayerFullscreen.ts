import { useCallback, useEffect, useRef, useState } from 'react';
import { systemService } from '@/services/systemService';

export function usePlayerFullscreen(isOpen: boolean) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const transitionRef = useRef<Promise<void> | null>(null);
    const enteredFullscreenRef = useRef(false);

    const changeFullscreen = useCallback((fullscreen: boolean) => {
        const change = async () => {
            if (await systemService.isFullscreen() === fullscreen) return;

            // Tauri preserves the native window placement, including maximization, across fullscreen.
            await systemService.setFullscreen(fullscreen);
            enteredFullscreenRef.current = fullscreen;
            setIsFullscreen(fullscreen);
        };

        // Closing the player must wait for an in-flight entry before leaving fullscreen.
        const transition = (transitionRef.current ?? Promise.resolve())
            .catch(() => undefined)
            .then(change);
        transitionRef.current = transition;
        const clear = () => {
            if (transitionRef.current === transition) transitionRef.current = null;
        };
        void transition.then(clear, clear);
        return transition;
    }, []);

    const exitFullscreen = useCallback(() => changeFullscreen(false), [changeFullscreen]);
    const toggleFullscreen = useCallback(async () => {
        if (transitionRef.current) return;
        try {
            await changeFullscreen(!await systemService.isFullscreen());
        } catch (error) {
            console.error('Failed to toggle fullscreen', error);
        }
    }, [changeFullscreen]);

    useEffect(() => {
        let cancelled = false;
        const sync = async () => {
            try {
                const fullscreen = await systemService.isFullscreen();
                if (!cancelled) setIsFullscreen(fullscreen);
            } catch (error) {
                console.error('Failed to check fullscreen status', error);
            }
        };
        void sync();
        const unlisten = systemService.onResize(() => { void sync(); });
        return () => {
            cancelled = true;
            void unlisten.then(off => off());
        };
    }, []);

    useEffect(() => {
        if (!isOpen) {
            // 关闭播放器不能退出由系统窗口按钮进入的 macOS 原生全屏。
            if (systemService.isMacOS && !enteredFullscreenRef.current && !transitionRef.current) return;
            void exitFullscreen().catch(error => console.error('Failed to exit fullscreen', error));
        }
    }, [isOpen, exitFullscreen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || !isFullscreen) return;
            event.preventDefault();
            event.stopPropagation();
            void exitFullscreen().catch(error => console.error('Failed to exit fullscreen', error));
        };
        window.addEventListener('keydown', handleEscape, { capture: true });
        return () => window.removeEventListener('keydown', handleEscape, { capture: true });
    }, [isOpen, isFullscreen, exitFullscreen]);

    return { isFullscreen, toggleFullscreen, exitFullscreen };
}
