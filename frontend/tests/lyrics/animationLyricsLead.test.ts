import { describe, expect, it } from 'vitest';
import type { LyricsLine } from '@/types';
import {
    buildDisplayItems,
    buildAnimatedLyricsRenderBoundaries,
    getActiveLyricsState,
    getTtmlLineWindows,
} from '@/features/player/lyrics/lyricsDisplay';
import { parseLyricsWordsToChars } from '@/features/player/lyrics/lyricCharSplitting';
import {
    animationLyricsTimingStrategy as strategy,
    performanceLyricsTimingStrategy,
} from '@/features/player/lyrics/timingStrategy';

const line = (id: string, start: number, end: number | null, wordTimed = false): LyricsLine => ({
    id, role: 'main', text: id, start_time_ms: start, end_time_ms: end,
    words: wordTimed ? [{ text: id, start_time_ms: start, ...(end === null ? {} : { end_time_ms: end }) }] : [],
});
const stateAt = (lines: LyricsLine[], timeMs: number, isTtml = false) =>
    getActiveLyricsState(buildDisplayItems(lines, true, strategy), lines, timeMs / 1000, strategy, isTtml);

describe('animation mode 600ms handoff lead', () => {
    it('advances line-timed LRC at 600ms, not 800ms, and publishes the boundary', () => {
        const lines = [line('a', 0, null), line('b', 2000, null)];
        expect(stateAt(lines, 1200).focusIndex).toBe(0);
        expect(stateAt(lines, 1399).focusIndex).toBe(0);
        expect(stateAt(lines, 1400).focusIndex).toBe(1);
        const boundaries = buildAnimatedLyricsRenderBoundaries(buildDisplayItems(lines, true, strategy), lines, strategy);
        expect(boundaries).toContain(1400);
        expect(boundaries).not.toContain(1200);
    });

    it.each([false, true])('uses a 600ms lead across a non-interlude gap (TTML=%s)', isTtml => {
        const lines = [line('a', 0, 1000, true), line('b', 3000, 4000, true)];
        expect(stateAt(lines, 2200, isTtml).focusIndex).toBe(0);
        expect(stateAt(lines, 2399, isTtml).focusIndex).toBe(0);
        expect(stateAt(lines, 2400, isTtml).focusIndex).toBe(1);
    });

    it('uses 600ms for the TTML overlap-chain activation window', () => {
        const lines = [line('a', 0, 2500, true), line('b', 2000, 3500, true), line('c', 3000, 4000, true)];
        expect(getTtmlLineWindows(lines, strategy).windowStartMs[2]).toBe(2400);
        expect(stateAt(lines, 2399, true).activeIndices.has(2)).toBe(false);
        expect(stateAt(lines, 2400, true).activeIndices.has(2)).toBe(true);
    });

    it('retains the 600ms lead for opening and middle interludes', () => {
        const opening = [line('a', 10000, 12000)];
        expect(stateAt(opening, 9399).focusIndex).toBe(0);
        expect(stateAt(opening, 9400).focusIndex).toBe(1);
        const middle = [line('a', 0, 1000, true), line('b', 10000, 12000, true)];
        expect(stateAt(middle, 9399).focusIndex).toBe(1);
        expect(stateAt(middle, 9400).focusIndex).toBe(2);
    });

    it('only compresses the amount missing from the existing gap to reach 600ms', () => {
        const lines = [line('a', 1000, 1600, true), line('b', 2000, 3000, true)];
        const chars = parseLyricsWordsToChars(lines[0].words, 1600, { enabled: true, nextLineStartMs: 2000 });
        expect(chars.at(-1)?.nextStart).toBe(1400);
        expect(stateAt(lines, 1399).focusIndex).toBe(0);
        expect(stateAt(lines, 1400).focusIndex).toBe(1);
    });

    it('keeps the 50% compression limit rather than forcing every handoff to 600ms', () => {
        const lines = [line('a', 1300, 2000, true), line('b', 2000, 3000, true)];
        const items = buildDisplayItems(lines, true, strategy);
        expect(items[0].type === 'line' && items[0].line.visual_end_ms).toBe(1650);
        expect(stateAt(lines, 1400).focusIndex).toBe(0);
        expect(stateAt(lines, 1650).focusIndex).toBe(1);
    });

    it('does not change performance mode timing or enable tail compression there', () => {
        expect(performanceLyricsTimingStrategy.nextLineFocusLeadMs).toBe(400);
        expect(performanceLyricsTimingStrategy.compressTightHandoffTail).toBe(false);
        expect(performanceLyricsTimingStrategy.enableLineLyricsEarlyFocus).toBe(false);
    });
});
