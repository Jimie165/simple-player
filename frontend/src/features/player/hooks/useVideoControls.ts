import { useCallback, useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { systemService } from '@/services/systemService';

export function useVideoControls() {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [isCompact, setIsCompact] = useState(false);
    const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);

    useEffect(() => {
        const checkMaximized = async () => setIsMaximized(await systemService.isMaximized());
        checkMaximized();
        const unlisten = systemService.onResize(checkMaximized);
        return () => {
            unlisten.then(f => f && f());
        };
    }, []);

    useEffect(() => {
        const updateCompact = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            setIsCompact(w < 520 || h < 360);
        };

        updateCompact();
        window.addEventListener('resize', updateCompact);
        const unlisten = systemService.onResize(updateCompact);

        return () => {
            window.removeEventListener('resize', updateCompact);
            unlisten.then(f => f && f());
        };
    }, []);

    const toggleAppFullscreen = useCallback(async () => {
        const win = getCurrentWindow();
        const isFull = await win.isFullscreen();

        if (!isFull) {
            if (await win.isMaximized()) {
                await win.unmaximize();
                setIsMaximized(false);
            }
            await win.setFullscreen(true);
            setIsFullscreen(true);
        } else {
            await win.setFullscreen(false);
            setIsFullscreen(false);
        }
    }, []);

    return {
        isFullscreen,
        isMaximized,
        isCompact,
        isPlaylistOpen,
        setIsPlaylistOpen,
        toggleAppFullscreen,
    };
}
