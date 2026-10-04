import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { videoService } from '@/services/videoService';

interface UseMkvPrepareOptions {
    isOpen: boolean;
    sourcePath?: string;
    isMkv: boolean;
    supportsHevc: boolean;
    supportsAv1: boolean;
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
    supportsAv1,
    supportedAudioCodecs,
    onPrepareError,
}: UseMkvPrepareOptions): UseMkvPrepareResult {
    const [prepared, setPrepared] = useState<{ source: string; path: string } | null>(null);
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
            if (!isOpen || !sourcePath) {
                setPrepared(null);
                setIsPreparing(false);
                setPrepareStage(null);
                setPreparePercent(null);
                return;
            }

            setPrepared(null);
            setIsPreparing(true);
            setPrepareStage('start');
            setPreparePercent(null);

            try {
                const exists = await videoService.fileExists(sourcePath);
                if (cancelled) return;
                if (!exists) throw new Error('VIDEO_FILE_NOT_FOUND');
                if (!isMkv) {
                    setPrepared({ source: sourcePath, path: sourcePath });
                    return;
                }
                unlistenFn = await listen<{ path: string; stage: string; percent?: number }>('video:prepare-progress', (event) => {
                    if (cancelled || event.payload.path !== sourcePath) return;
                    setPrepareStage(event.payload.stage);
                    setPreparePercent(event.payload.percent ?? null);
                });
                if (cancelled) { unlistenFn(); return; }
                console.log('[VideoPlayer] 开始准备视频:', sourcePath);
                const outPath = await invoke<string>('prepare_video_for_playback', {
                    path: sourcePath,
                    supportsHevc,
                    supportsAv1,
                    supportedAudioCodecs,
                });
                console.log('[VideoPlayer] 视频准备完成:', outPath);
                if (cancelled) return;
                setPrepared({ source: sourcePath, path: outPath });
            } catch (error) {
                console.error('[VideoPlayer] 视频准备失败:', error);
                if (cancelled) return;
                onPrepareErrorRef.current?.(error);
            } finally {
                if (!cancelled) {
                    setIsPreparing(false);
                }
            }
        };

        run();

        return () => {
            cancelled = true;
            if (unlistenFn) unlistenFn();
        };
    }, [isOpen, sourcePath, isMkv, supportsHevc, supportsAv1, supportedAudioCodecs]);

    return {
        preparedPath: prepared && prepared.source === sourcePath ? prepared.path : null,
        prepareStage,
        preparePercent,
        isPreparing,
    };
}
