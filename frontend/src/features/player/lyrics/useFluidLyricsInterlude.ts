import { useCallback, useEffect, useRef, useState } from 'react';
import {
    interludeExitCollapseDelayMs,
    interludeGapOpenDurationMs,
    interludeNextLineFocusLeadMs,
} from '@/features/player/lyrics/constants';
import type { DisplayItem } from '@/features/player/lyrics/types';

interface FluidLyricsInterludeArgs {
    activeDisplayIndex: number;
    displayItems: DisplayItem[];
    currentMs: number;
}

/** 管理动画优先歌词的间奏退出与跳播同步状态。 */
export function useFluidLyricsInterlude({
    activeDisplayIndex,
    displayItems,
    currentMs,
}: FluidLyricsInterludeArgs) {
    const previousPlaybackMsRef = useRef(currentMs);
    const exitingInterludeIndexRef = useRef<number | null>(null);
    const exitTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
    const [exitingInterludeIndex, setExitingInterludeIndex] = useState<number | null>(null);
    const [interludeExitKey, setInterludeExitKey] = useState(0);
    const [playbackSyncKey, setPlaybackSyncKey] = useState(0);

    useEffect(() => {
        exitingInterludeIndexRef.current = exitingInterludeIndex;
    }, [exitingInterludeIndex]);

    const startInterludeExit = useCallback((displayIndex: number) => {
        if (displayItems[displayIndex]?.type !== 'interlude') return;
        if (exitingInterludeIndexRef.current === displayIndex) return;
        if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);

        exitingInterludeIndexRef.current = displayIndex;
        setExitingInterludeIndex(displayIndex);
        setInterludeExitKey(key => key + 1);
        exitTimeoutRef.current = window.setTimeout(() => {
            exitingInterludeIndexRef.current = null;
            setExitingInterludeIndex(null);
            exitTimeoutRef.current = null;
        }, interludeExitCollapseDelayMs);
    }, [displayItems]);

    const keepCurrentInterludeForExit = useCallback(() => {
        const activeItem = displayItems[activeDisplayIndex];
        if (activeItem?.type !== 'interlude') return;
        if (currentMs < activeItem.startMs + interludeGapOpenDurationMs) return;
        startInterludeExit(activeDisplayIndex);
    }, [activeDisplayIndex, currentMs, displayItems, startInterludeExit]);

    useEffect(() => {
        const previousMs = previousPlaybackMsRef.current;
        previousPlaybackMsRef.current = currentMs;
        if (Math.abs(currentMs - previousMs) < 900) return;

        const findInterludeAt = (timeMs: number) => displayItems.findIndex(item =>
            item.type === 'interlude' && timeMs >= item.startMs && timeMs < item.endMs
        );
        const previousActiveIndex = findInterludeAt(previousMs);
        if (previousActiveIndex >= 0 && previousActiveIndex === findInterludeAt(currentMs)) return;

        const syncFrame = requestAnimationFrame(() => setPlaybackSyncKey(key => key + 1));
        const previousInterludeIndex = displayItems.findIndex(item =>
            item.type === 'interlude' &&
            previousMs >= item.startMs + interludeGapOpenDurationMs &&
            previousMs < item.endMs - interludeNextLineFocusLeadMs
        );

        if (previousInterludeIndex >= 0) {
            const previousInterlude = displayItems[previousInterludeIndex];
            const stillInSameInterlude =
                previousInterlude.type === 'interlude' &&
                currentMs >= previousInterlude.startMs &&
                currentMs < previousInterlude.endMs;
            if (!stillInSameInterlude) startInterludeExit(previousInterludeIndex);
        }

        return () => cancelAnimationFrame(syncFrame);
    }, [currentMs, displayItems, startInterludeExit]);

    useEffect(() => () => {
        if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    }, []);

    return {
        exitingInterludeIndex,
        interludeExitKey,
        keepCurrentInterludeForExit,
        playbackSyncKey,
    };
}
