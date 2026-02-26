import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface UseMkvPrepareOptions {
    isOpen: boolean;
    sourcePath?: string;
    isMkv: boolean;
    supportsHevc: boolean;
    supportedAudioCodecs: string[];
    onPrepareError?: (error: unknown) => void;
}

interface UseMkvPrepareResult {
    preparedPath: string | null;
    prepareStage: string | null;
    preparePercent: number | null;
    isPreparing: boolean;
}

export function useMkvPrepare({
    isOpen,
    sourcePath,
    isMkv,
    supportsHevc,
    supportedAudioCodecs,
    onPrepareError,
}: UseMkvPrepareOptions): UseMkvPrepareResult {
    const [preparedPath, setPreparedPath] = useState<string | null>(null);
    const [prepareStage, setPrepareStage] = useState<string | null>(null);
    const [preparePercent, setPreparePercent] = useState<number | null>(null);
    const [isPreparing, setIsPreparing] = useState(false);
    const onPrepareErrorRef = useRef<typeof onPrepareError>(onPrepareError);

    useEffect(() => {
        onPrepareErrorRef.current = onPrepareError;
    }, [onPrepareError]);

    useEffect(() => {
        let unlistenFn: null | (() => void) = null;
        let cancelled = false;

        const run = async () => {
            if (!isOpen || !sourcePath || !isMkv) {
                setPreparedPath(null);
                setIsPreparing(false);
                setPrepareStage(null);
                setPreparePercent(null);
                return;
            }

            setPreparedPath(null);
            setIsPreparing(true);
            setPrepareStage('start');
            setPreparePercent(null);

            unlistenFn = await listen<{ path: string; stage: string; percent?: number }>('video:prepare-progress', (event) => {
                if (event.payload.path !== sourcePath) return;
                setPrepareStage(event.payload.stage);
                setPreparePercent(event.payload.percent ?? null);
            });

            try {
                console.log('[VideoPlayer] 开始准备视频:', sourcePath);
                const outPath = await invoke<string>('prepare_video_for_playback', {
                    path: sourcePath,
                    supportsHevc,
                    supportedAudioCodecs,
                });
                console.log('[VideoPlayer] 视频准备完成:', outPath);
                if (cancelled) return;
                setPreparedPath(outPath);
            } catch (error) {
                console.error('[VideoPlayer] 视频准备失败:', error);
                if (cancelled) return;
                onPrepareErrorRef.current?.(error);
            } finally {
                if (cancelled) return;
                setIsPreparing(false);
            }
        };

        run();

        return () => {
            cancelled = true;
            if (unlistenFn) unlistenFn();
        };
    }, [isOpen, sourcePath, isMkv, supportsHevc, supportedAudioCodecs]);

    return {
        preparedPath,
        prepareStage,
        preparePercent,
        isPreparing,
    };
}
