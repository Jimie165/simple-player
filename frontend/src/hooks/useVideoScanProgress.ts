import { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useVideoStore } from '@/store/useVideoStore';

interface ScanProgressPayload {
    folder_id: number;
    processed: number;
    total: number;
}

interface ThumbnailReadyPayload {
    video_id: number;
    thumbnail_path: string;
}

export function useVideoScanProgress() {
    const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
    const [scanning, setScanning] = useState(false);
    const updateThumbnail = useVideoStore((state) => state.updateThumbnail);

    // Throttle ref to prevent state thrashing
    const lastUpdate = useRef<number>(0);

    useEffect(() => {
        let disposed = false;
        // Activity may resume after the completion event was emitted while hidden.
        queueMicrotask(() => {
            if (disposed) return;
            setScanning(false);
            setProgress(null);
        });
        let unlistenProgress: (() => void) | undefined;
        let unlistenComplete: (() => void) | undefined;
        let unlistenThumbnail: (() => void) | undefined;

        const setupListeners = async () => {
            unlistenProgress = await listen<ScanProgressPayload>('video_scan_progress', (event) => {
                if (disposed) return;
                const now = Date.now();
                // Update at most every 200ms
                if (now - lastUpdate.current > 200 || event.payload.processed === event.payload.total) {
                    setProgress({
                        processed: event.payload.processed,
                        total: event.payload.total
                    });
                    setScanning(true);
                    lastUpdate.current = now;
                }
            });
            // Navigation can finish before Tauri returns the subscription handle.
            if (disposed) { unlistenProgress(); return; }

            unlistenComplete = await listen('video_scan_complete', () => {
                if (disposed) return;
                setScanning(false);
                setProgress(null);
            });
            if (disposed) { unlistenComplete(); return; }

            unlistenThumbnail = await listen<ThumbnailReadyPayload>('video_thumbnail_ready', (event) => {
                if (disposed) return;
                updateThumbnail(event.payload.video_id, event.payload.thumbnail_path);
            });
            if (disposed) unlistenThumbnail();
        };

        void setupListeners().catch(error => console.error('Failed to listen to video scan events:', error));

        return () => {
            disposed = true;
            if (unlistenProgress) unlistenProgress();
            if (unlistenComplete) unlistenComplete();
            if (unlistenThumbnail) unlistenThumbnail();
        };
    }, [updateThumbnail]);

    return { scanning, progress };
}
