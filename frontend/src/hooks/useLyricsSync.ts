import { useEffect, useMemo, useState } from 'react';
import type { LyricsLine } from '@/types';

interface UseLyricsSyncArgs {
    lyrics: LyricsLine[];
    currentTime: number;
    enabled: boolean;
    hasTimestamps: boolean;
}

export function useLyricsSync({ lyrics, currentTime, enabled, hasTimestamps }: UseLyricsSyncArgs) {
    const [currentIndex, setCurrentIndex] = useState(0);

    const timedLines = useMemo(() => {
        if (!hasTimestamps || lyrics.length === 0) return [] as Array<{ time: number; index: number }>;
        return lyrics
            .map((line, index) => ({ time: line.time_ms, index }))
            .filter((entry): entry is { time: number; index: number } => typeof entry.time === 'number');
    }, [lyrics, hasTimestamps]);

    useEffect(() => {
        setCurrentIndex(0);
    }, [lyrics]);

    useEffect(() => {
        if (!enabled || !hasTimestamps || timedLines.length === 0) return;

        const currentMs = currentTime * 1000;
        let low = 0;
        let high = timedLines.length - 1;
        let bestIndex = timedLines[0].index;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const midTime = timedLines[mid].time;

            if (midTime <= currentMs) {
                bestIndex = timedLines[mid].index;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        setCurrentIndex(bestIndex);
    }, [currentTime, enabled, hasTimestamps, timedLines]);

    return currentIndex;
}
