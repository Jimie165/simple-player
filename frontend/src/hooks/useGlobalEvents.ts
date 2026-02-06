import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useLibraryStore } from '@/store/useLibraryStore';

export function useGlobalEvents() {
    const { refreshFavorites, refreshRecentHistory, triggerLibraryUpdate } = useLibraryStore();

    useEffect(() => {
        let unlistenLibrary: (() => void) | undefined;
        let unlistenVideo: (() => void) | undefined;

        const setupListeners = async () => {
            try {
                unlistenLibrary = await listen('library_scan_complete', () => {
                    console.log('Global Event: library_scan_complete');
                    refreshFavorites();
                    refreshRecentHistory();
                    triggerLibraryUpdate(); // Triggers re-render in components subscribing to version
                });

                unlistenVideo = await listen('video_scan_complete', () => {
                    console.log('Global Event: video_scan_complete');
                    refreshRecentHistory();
                    // Video library might have its own state or components handle it locally, 
                    // but refreshing recent history is global.
                });
            } catch (err) {
                console.error('Failed to listen to global events:', err);
            }
        };

        setupListeners();

        return () => {
            if (unlistenLibrary) unlistenLibrary();
            if (unlistenVideo) unlistenVideo();
        };
    }, [refreshFavorites, refreshRecentHistory, triggerLibraryUpdate]);
}
