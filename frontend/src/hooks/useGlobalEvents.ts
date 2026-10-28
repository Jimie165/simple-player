import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tagName = target.tagName;
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
    if (target.isContentEditable) return true;
    return false;
}

export function useGlobalEvents() {
    const { refreshFavorites, refreshRecentHistory, triggerLibraryUpdate } = useLibraryStore();
    const { togglePlayback } = usePlaybackActions();

    useEffect(() => {
        let disposed = false;
        let unlistenLibrary: (() => void) | undefined;
        let unlistenVideo: (() => void) | undefined;

        const setupListeners = async () => {
            try {
                unlistenLibrary = await listen('library_scan_complete', () => {
                    if (disposed) return;
                    console.log('Global Event: library_scan_complete');
                    void (refreshFavorites()).catch(console.error);
                    void (refreshRecentHistory()).catch(console.error);
                    triggerLibraryUpdate(); // Triggers re-render in components subscribing to version
                });
                // Release handles returned after the effect has already been cleaned up.
                if (disposed) { unlistenLibrary(); return; }

                unlistenVideo = await listen('video_scan_complete', () => {
                    if (disposed) return;
                    console.log('Global Event: video_scan_complete');
                    void (refreshRecentHistory()).catch(console.error);
                    // Video library might have its own state or components handle it locally, 
                    // but refreshing recent history is global.
                });
                if (disposed) unlistenVideo();
            } catch (err) {
                console.error('Failed to listen to global events:', err);
            }
        };

        void (setupListeners()).catch(console.error);

        return () => {
            disposed = true;
            if (unlistenLibrary) unlistenLibrary();
            if (unlistenVideo) unlistenVideo();
        };
    }, [refreshFavorites, refreshRecentHistory, triggerLibraryUpdate]);

    useEffect(() => {
        const handleGlobalSpace = (event: KeyboardEvent) => {
            if (event.code !== 'Space') return;
            if (event.repeat) return;
            if (isEditableTarget(event.target)) return;

            const { metadata, mediaKind } = usePlayerStore.getState();
            if (mediaKind === 'video' || !metadata) return;

            event.preventDefault();
            event.stopPropagation();
            void togglePlayback();
        };

        window.addEventListener('keydown', handleGlobalSpace, { capture: true });
        return () => window.removeEventListener('keydown', handleGlobalSpace, { capture: true });
    }, [togglePlayback]);
}
