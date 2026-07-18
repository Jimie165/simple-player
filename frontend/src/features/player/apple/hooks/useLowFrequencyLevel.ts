import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';

import { audioService } from '@/services/audioService';

export interface LowFrequencyFrame {
    bass: number;
    beat: number;
}

export function useLowFrequencyLevel(enabled: boolean) {
    const levelRef = useRef<LowFrequencyFrame>({ bass: 0, beat: 0 });

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
            levelRef.current = { bass: 0, beat: 0 };
            void audioService.setReactiveBackgroundEnabled(false);
        };
    }, []);

    useEffect(() => {
        if (!enabled) levelRef.current = { bass: 0, beat: 0 };
        void audioService.setReactiveBackgroundEnabled(enabled).catch((error) => {
            console.error('音乐律动背景状态更新失败', error);
        });
    }, [enabled]);

    return levelRef;
}
