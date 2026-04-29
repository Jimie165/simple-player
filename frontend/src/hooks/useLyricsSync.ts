import { useEffect, useMemo, useState } from 'react';
import type { LyricsLine } from '@/types';

interface UseLyricsSyncArgs {
    lyrics: LyricsLine[];
    currentTime: number;
    enabled: boolean;
    hasTimestamps: boolean;
}

interface TimedEntry {
    time: number;
    index: number;
}

/**
 * Binary-search the largest index whose time_ms <= currentMs.
 * Returns 0 when there are no timed entries.
 */
function findActiveIndex(timedLines: TimedEntry[], currentMs: number): number {
    if (timedLines.length === 0) return 0;
    let low = 0;
    let high = timedLines.length - 1;
    let bestIndex = timedLines[0].index;
    while (low <= high) {
        const mid = (low + high) >> 1;
        const midTime = timedLines[mid].time;
        if (midTime <= currentMs) {
            bestIndex = timedLines[mid].index;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return bestIndex;
}

export function useLyricsSync({ lyrics, currentTime, enabled, hasTimestamps }: UseLyricsSyncArgs) {
    const timedLines = useMemo<TimedEntry[]>(() => {
        if (!hasTimestamps || lyrics.length === 0) return [];
        // Skip empty-text entries — those are interlude markers, not lines
        // that should ever become the highlighted "current lyric".
        return lyrics
            .map((line, index) => ({ time: line.time_ms, index, text: line.text }))
            .filter((entry): entry is TimedEntry =>
                typeof entry.time === 'number' && entry.text.length > 0
            );
    }, [lyrics, hasTimestamps]);

    // Compute the correct index synchronously on first render so the panel
    // can mount already pointing at the active line — no "flash at index 0
    // then jump" when the lyrics view opens mid-song.
    const [currentIndex, setCurrentIndex] = useState(() =>
        findActiveIndex(timedLines, currentTime * 1000)
    );

    // Re-anchor when the lyrics list itself changes (new song / reload).
    useEffect(() => {
        setCurrentIndex(findActiveIndex(timedLines, currentTime * 1000));
        // currentTime intentionally omitted — only re-anchor on lyrics swap;
        // ongoing time updates are handled by the next effect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timedLines]);

    useEffect(() => {
        if (!enabled || !hasTimestamps || timedLines.length === 0) return;
        setCurrentIndex(findActiveIndex(timedLines, currentTime * 1000));
    }, [currentTime, enabled, hasTimestamps, timedLines]);

    return currentIndex;
}
