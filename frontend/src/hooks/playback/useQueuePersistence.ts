import { useEffect, useRef } from 'react';
import { useLibraryStore } from '@/store/useLibraryStore';
import { libraryService } from '@/services/libraryService';

export function useQueuePersistence() {
    const playlist = useLibraryStore((s) => s.playlist);


    // Initial load flag - we rely on Zustand persist for hydration, 
    // so we assume start as loaded/ready.
    const isLoaded = useRef(true);

    // Save queue on change with debounce


    // Save queue on change with debounce
    useEffect(() => {
        if (!isLoaded.current) return;

        const timer = setTimeout(() => {
            if (playlist.length > 0) {
                const ids = playlist
                    .map(s => s.id)
                    .filter((id): id is number => typeof id === 'number' && Number.isFinite(id));
                if (ids.length > 0) {
                    libraryService.savePlayQueue(ids).catch(console.error);
                }
            } else {
                // Option: Clear queue if empty?
                // libraryService.clearPlayQueue().catch(console.error);
            }
        }, 2000);

        return () => clearTimeout(timer);
    }, [playlist]);
}
