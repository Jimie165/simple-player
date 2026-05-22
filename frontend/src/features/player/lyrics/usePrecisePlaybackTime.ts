import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';

export function usePrecisePlaybackTime(currentTime: number) {
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const [preciseMs, setPreciseMs] = useState(currentTime * 1000);
    const lastTick = useRef(0);
    const lastExternalMs = useRef(currentTime * 1000);
    const currentTimeRef = useRef(currentTime);

    useEffect(() => {
        currentTimeRef.current = currentTime;
    }, [currentTime]);

    useEffect(() => {
        const externalMs = currentTime * 1000;
        const diff = Math.abs(externalMs - lastExternalMs.current);
        let frame: number | null = null;

        if (diff > 1000) {
            frame = requestAnimationFrame(() => setPreciseMs(externalMs));
        }
        lastExternalMs.current = externalMs;

        return () => {
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [currentTime]);

    useEffect(() => {
        const syncFrame = requestAnimationFrame(() => {
            setPreciseMs(currentTimeRef.current * 1000);
        });
        if (!isPlaying) {
            return () => cancelAnimationFrame(syncFrame);
        }

        let frame: number;
        const tick = (now: number) => {
            const delta = now - lastTick.current;
            lastTick.current = now;
            setPreciseMs(prev => prev + delta);
            frame = requestAnimationFrame(tick);
        };

        lastTick.current = performance.now();
        frame = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(syncFrame);
            cancelAnimationFrame(frame);
        };
    }, [isPlaying]);

    return preciseMs;
}
