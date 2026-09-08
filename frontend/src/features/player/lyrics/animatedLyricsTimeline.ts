import type { LyricsLine } from '@/types';
import type { DisplayItem } from '@/features/player/lyrics/types';
import type { LyricsTimingStrategy } from '@/features/player/lyrics/timingStrategy';
import {
    buildAnimatedLyricsRenderBoundaries,
    getActiveLyricsState,
    getAnimatedLyricsRenderKey,
} from '@/features/player/lyrics/lyricsDisplay';
import { interludeGapOpenDurationMs, interludeNextLineFocusLeadMs } from '@/features/player/lyrics/constants';

interface AnimatedLyricsSnapshot {
    key: string;
    focusIndex: number;
    activeIndices: Set<number>;
    karaokeActiveIndices: Set<number>;
}

const sameSet = (left: ReadonlySet<number>, right: ReadonlySet<number>) =>
    left.size === right.size && [...left].every(index => right.has(index));

/** Cache only the clock/render intervals, not a snapshot for every song timestamp. */
export function createAnimatedLyricsTimeline(
    items: DisplayItem[],
    lines: LyricsLine[],
    strategy: LyricsTimingStrategy,
    isTtml: boolean,
) {
    const boundaries = buildAnimatedLyricsRenderBoundaries(items, lines, strategy, isTtml);
    const interludeBoundaries = items.flatMap(item => item.type === 'interlude'
        ? [item.startMs, item.startMs + interludeGapOpenDurationMs,
            item.endMs - interludeNextLineFocusLeadMs, item.endMs] : [])
        .sort((left, right) => left - right);
    const tails = items.flatMap((item, index) => item.type === 'line' && item.line.words.length > 0 &&
        strategy.focusNextLineByVisualEnd && typeof item.line.visual_end_ms === 'number' &&
        typeof item.line.end_time_ms === 'number' && item.line.visual_end_ms < item.line.end_time_ms
        ? [{ index, start: item.line.visual_end_ms, end: item.line.end_time_ms }] : []);
    const snapshots = new Map<number, AnimatedLyricsSnapshot>();
    let previous: AnimatedLyricsSnapshot | undefined;

    const getSnapshot = (timeMs: number, refresh = false): AnimatedLyricsSnapshot => {
        const interval = getAnimatedLyricsRenderKey(boundaries, timeMs);
        const cached = snapshots.get(interval);
        if (cached && !refresh) return cached;

        const state = getActiveLyricsState(items, lines, timeMs / 1000, strategy, isTtml);
        // Retain collection identity even when only focus/interlude state changes.
        const activeIndices = previous && sameSet(previous.activeIndices, state.activeIndices)
            ? previous.activeIndices : state.activeIndices;
        let karaokeActiveIndices = new Set(activeIndices);
        for (const tail of tails) {
            if (timeMs >= tail.start && timeMs < tail.end) karaokeActiveIndices.add(tail.index);
        }
        if (previous && sameSet(previous.karaokeActiveIndices, karaokeActiveIndices)) {
            karaokeActiveIndices = previous.karaokeActiveIndices;
        }
        const key = `${state.focusIndex}|${[...activeIndices].sort((a, b) => a - b)}|` +
            `${[...karaokeActiveIndices].sort((a, b) => a - b)}|${getAnimatedLyricsRenderKey(interludeBoundaries, timeMs)}`;
        const snapshot = { key, focusIndex: state.focusIndex, activeIndices, karaokeActiveIndices };
        snapshots.set(interval, snapshot);
        if (snapshots.size > 2) {
            const oldest = snapshots.keys().next().value;
            if (oldest !== undefined) snapshots.delete(oldest);
        }
        previous = snapshot;
        return snapshot;
    };

    return { getSnapshot, getRenderKey: (timeMs: number, refresh = false) => getSnapshot(timeMs, refresh).key };
}
