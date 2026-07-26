import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';

import type { LowFrequencyFrame } from '@/features/player/apple/background/audioResponse';
import { audioService } from '@/services/audioService';

const SILENT_FRAME: LowFrequencyFrame = { bass: 0, beat: 0 };

export function useLowFrequencyLevel(enabled: boolean) {
    const levelRef = useRef<LowFrequencyFrame>(SILENT_FRAME);

    useEffect(() => {
        let disposed = false;
        let unlisten: (() => void) | undefined;

        const connect = async () => {
            unlisten = await listen<LowFrequencyFrame>('audio:low-frequency', (event) => {
                levelRef.current = {
                    bass: Math.min(1, Math.max(0, event.payload.bass)),
                    beat: Math.min(1, Math.max(0, event.payload.beat)),
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
            levelRef.current = SILENT_FRAME;
            void audioService.setReactiveBackgroundEnabled(false);
        };
    }, []);

    useEffect(() => {
        if (!enabled) levelRef.current = SILENT_FRAME;
        void audioService.setReactiveBackgroundEnabled(enabled).catch((error) => {
            console.error('音乐律动背景状态更新失败', error);
        });
    }, [enabled]);

    return levelRef;
}
