import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';

const HARD_SYNC_MS = 900;

export function usePrecisePlaybackTime(currentTime: number) {
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const playbackRevision = usePlayerStore(state => state.playbackRevision);
    const [preciseMs, setPreciseMs] = useState(currentTime * 1000);
    const lastTick = useRef(0);
    const lastExternalMs = useRef(currentTime * 1000);
    const currentTimeRef = useRef(currentTime);
    const preciseMsRef = useRef(currentTime * 1000);

    const setSyncedPreciseMs = (ms: number) => {
        preciseMsRef.current = ms;
        setPreciseMs(ms);
    };

    useEffect(() => {
        currentTimeRef.current = currentTime;
    }, [currentTime]);

    useEffect(() => {
        const externalMs = currentTime * 1000;
        const externalStepMs = Math.abs(externalMs - lastExternalMs.current);
        const driftMs = Math.abs(externalMs - preciseMsRef.current);
        let frame: number | null = null;

        if (!isPlaying || externalStepMs > HARD_SYNC_MS || driftMs > HARD_SYNC_MS) {
            frame = requestAnimationFrame(() => setSyncedPreciseMs(externalMs));
        }
        lastExternalMs.current = externalMs;

        return () => {
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [currentTime, isPlaying]);

    useEffect(() => {
        const syncFrame = requestAnimationFrame(() => {
            setSyncedPreciseMs(currentTimeRef.current * 1000);
        });
        if (!isPlaying) {
            return () => cancelAnimationFrame(syncFrame);
        }

        let frame: number;
        const tick = (now: number) => {
            const delta = now - lastTick.current;
            lastTick.current = now;
            const advancedMs = preciseMsRef.current + delta;
            preciseMsRef.current = advancedMs;
            setPreciseMs(advancedMs);
            frame = requestAnimationFrame(tick);
        };

        lastTick.current = performance.now();
        frame = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(syncFrame);
            cancelAnimationFrame(frame);
        };
    }, [isPlaying, playbackRevision]);

    return preciseMs;
}
