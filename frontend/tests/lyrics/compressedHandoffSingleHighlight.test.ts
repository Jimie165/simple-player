import { describe, expect, it } from 'vitest';
import type { LyricsLine } from '@/types';
import { createAnimatedLyricsTimeline } from '@/features/player/lyrics/animatedLyricsTimeline';
import {
    buildAnimatedLyricsRenderBoundaries,
    buildDisplayItems,
    getActiveLyricsState,
} from '@/features/player/lyrics/lyricsDisplay';
import { animationLyricsTimingStrategy as strategy } from '@/features/player/lyrics/timingStrategy';

const line = (id: string, start: number, end: number): LyricsLine => ({
    id,
    role: 'main',
    text: id,
    start_time_ms: start,
    end_time_ms: end,
    words: [{ text: id, start_time_ms: start, end_time_ms: end }],
});

describe('compressed handoff highlight', () => {
    it.each([false, true])('hands off at the compressed end while retaining the old karaoke tail (TTML=%s)', isTtml => {
        const lines = [line('a', 1300, 2000), line('b', 2000, 3000)];
        const items = buildDisplayItems(lines, true, strategy);
        const timeline = createAnimatedLyricsTimeline(items, lines, strategy, isTtml);
        expect(items[0].type === 'line' && items[0].line.visual_end_ms).toBe(1650);
        expect(getActiveLyricsState(items, lines, 1.649, strategy, isTtml).activeIndices).toEqual(new Set([0]));
        expect(getActiveLyricsState(items, lines, 1.65, strategy, isTtml)).toEqual({
            focusIndex: 1,
            activeIndices: new Set([1]),
        });
        expect(timeline.getSnapshot(1650).karaokeActiveIndices).toEqual(new Set([0, 1]));
        expect(timeline.getSnapshot(1650).activeIndices).toEqual(new Set([1]));
        expect(timeline.getSnapshot(2000).karaokeActiveIndices).toEqual(new Set([1]));
        expect(buildAnimatedLyricsRenderBoundaries(items, lines, strategy, isTtml)).toContain(1650);
    });

    it.each([false, true])('does not steal focus before the current line starts (TTML=%s)', isTtml => {
        const lines = [line('a', 1700, 2000), line('b', 2000, 3000)];
        const items = buildDisplayItems(lines, true, strategy);
        expect(getActiveLyricsState(items, lines, 1.7, strategy, isTtml).activeIndices).toEqual(new Set([0]));
        expect(getActiveLyricsState(items, lines, 1.85, strategy, isTtml).activeIndices).toEqual(new Set([1]));
    });

    it('leaves genuinely overlapping TTML lines jointly active', () => {
        const lines = [line('a', 1000, 2500), line('b', 2000, 3500)];
        const items = buildDisplayItems(lines, true, strategy);
        expect(getActiveLyricsState(items, lines, 2.1, strategy, true).activeIndices).toEqual(new Set([0, 1]));
    });
});
