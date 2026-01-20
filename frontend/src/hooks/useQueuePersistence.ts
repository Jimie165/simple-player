import { useEffect, useRef } from 'react';
import { useLibraryStore } from '../store/useLibraryStore';
import { libraryService } from '../services/libraryService';

export function useQueuePersistence() {
    const playlist = useLibraryStore((s) => s.playlist);
    const setPlaylist = useLibraryStore((s) => s.setPlaylist);

    // Initial load flag to avoid saving empty queue on startup before load
    const isLoaded = useRef(false);

    // Load queue on startup
    useEffect(() => {
        const loadQueue = async () => {
            try {
                const savedQueue = await libraryService.getPlayQueue();
                if (savedQueue && savedQueue.length > 0) {
                    setPlaylist(savedQueue);
                }
            } catch (error) {
                console.error("Failed to load play queue", error);
            } finally {
                isLoaded.current = true;
            }
        };
        loadQueue();
    }, []); // Run once

    // Save queue on change with debounce
    useEffect(() => {
        if (!isLoaded.current) return;

        const timer = setTimeout(() => {
            if (playlist.length > 0) {
                const ids = playlist.map(s => s.id).filter((id): id is number => id !== undefined);
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
