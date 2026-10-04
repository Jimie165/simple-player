import { describe, expect, it } from 'vitest';
import type { LyricsLine } from '@/types';
import { buildDisplayItems, getActiveLyricsState } from '@/features/player/lyrics/lyricsDisplay';
import { animationLyricsTimingStrategy as strategy } from '@/features/player/lyrics/timingStrategy';

const line = (id: string, start: number, end: number | null, extra: Partial<LyricsLine> = {}): LyricsLine => ({
    id, role: 'main', start_time_ms: start, end_time_ms: end, text: id, words: [], ...extra,
});
const stateAt = (lines: LyricsLine[], timeMs: number, isTtml = false) =>
    getActiveLyricsState(buildDisplayItems(lines, true, strategy), lines, timeMs / 1000, strategy, isTtml);

describe('lyrics handoff group lifetimes', () => {
    it('does not treat an implicit final word start as the group end', () => {
        const lines = [line('a', 0, null, { words: [{ text: 'a', start_time_ms: 0 }] }), line('b', 2000, null)];
        expect(stateAt(lines, 1999).activeIndices).toEqual(new Set([0]));
    });

    it('buffers background vocals with their main line', () => {
        const lines = [line('a', 0, 1000), line('bg', 500, 2200, { role: 'background', parent_id: 'a' }), line('b', 2000, 3000)];
        expect(stateAt(lines, 2000, true)).toEqual({ focusIndex: 0, activeIndices: new Set([0, 1, 2]) });
    });

});
