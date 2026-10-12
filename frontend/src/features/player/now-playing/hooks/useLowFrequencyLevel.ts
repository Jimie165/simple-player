import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';

import { SILENT_AUDIO_FRAME, type LowFrequencyFrame } from '@/features/player/now-playing/background/audioResponse';
import { audioService } from '@/services/audioService';

export function useLowFrequencyLevel(enabled: boolean) {
    const levelRef = useRef<LowFrequencyFrame>(SILENT_AUDIO_FRAME);
    const enabledRef = useRef(enabled);

    useEffect(() => {
        let disposed = false;
        let unlisten: (() => void) | undefined;

        const connect = async () => {
            unlisten = await listen<LowFrequencyFrame & { readonly sent_at_ms: number }>('audio:low-frequency', (event) => {
                if (disposed || !enabledRef.current) return;
                if (event.payload.generation < levelRef.current.generation) return;
                // Both processes share the OS wall clock. Include time waiting in the IPC/UI
                // queue, then switch to monotonic performance time for the animation itself.
                const transitAge = Math.max(0, Date.now() - event.payload.sent_at_ms);
                levelRef.current = {
                    generation: event.payload.generation,
                    bass: Math.min(1, Math.max(0, event.payload.bass)),
                    onsets: event.payload.onsets,
                    receivedAt: performance.now() - transitAge,
                };
            });
            if (disposed) {
                unlisten();
            }
        };

        void connect().catch((error) => {
            console.error('音乐律动背景连接失败', error);
        });

        return () => {
            disposed = true;
            unlisten?.();
            levelRef.current = SILENT_AUDIO_FRAME;
            void audioService.setReactiveBackgroundEnabled(false);
        };
    }, []);

    useEffect(() => {
        enabledRef.current = enabled;
        if (!enabled) levelRef.current = SILENT_AUDIO_FRAME;
        void audioService.setReactiveBackgroundEnabled(enabled).catch((error) => {
            console.error('音乐律动背景状态更新失败', error);
        });
    }, [enabled]);

    return levelRef;
}
