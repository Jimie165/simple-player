import { useEffect, useState } from 'react';
import { systemService } from '@/services/systemService';
import { usePlayerFullscreen } from '@/features/player/hooks/usePlayerFullscreen';

export function useVideoControls(isOpen: boolean) {
    const { isFullscreen, toggleFullscreen: toggleAppFullscreen, exitFullscreen } = usePlayerFullscreen(isOpen);
    const [isMaximized, setIsMaximized] = useState(false);
    const [isCompact, setIsCompact] = useState(false);
    const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);

    useEffect(() => {
        const checkMaximized = async () => setIsMaximized(await systemService.isMaximized());
        void (checkMaximized()).catch(console.error);
        const unlisten = systemService.onResize(() => { void checkMaximized().catch(console.error); });
        return () => {
            void (unlisten.then(f => f && f())).catch(console.error);
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
            void (unlisten.then(f => f && f())).catch(console.error);
        };
    }, []);

    return {
        isFullscreen,
        isMaximized,
        isCompact,
        isPlaylistOpen,
        setIsPlaylistOpen,
        toggleAppFullscreen,
        exitFullscreen,
    };
}
