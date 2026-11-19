import { describe, expect, it } from 'vitest';
import type { LyricsLine } from '@/types';
import { buildDisplayItems } from '@/features/player/lyrics/lyricsDisplay';
import { getAnimatedLyricsSpringParams } from '@/features/player/lyrics/animatedLyricsMotion';
import { animationLyricsTimingStrategy } from '@/features/player/lyrics/timingStrategy';
import type { DisplayItem } from '@/features/player/lyrics/types';
import { buildLyricsLinesFromEntries } from '@/utils/lyrics/convertLrcToLyricsDocument';

const line = (id: string, start: number, end: number): LyricsLine => ({
    id, role: 'main', start_time_ms: start, end_time_ms: end, text: id, words: [],
});

describe('overlapping voices and inferred LRC ends', () => {
    it('starts an interlude after the longest overlapping voice ends', () => {
        const items = buildDisplayItems([
            line('long voice', 0, 15_000),
            line('short duet', 2000, 3000),
            line('overlap', 10_500, 11_000),
            line('next verse', 23_000, 24_000),
        ], true, animationLyricsTimingStrategy);
        expect(items.filter(item => item.type === 'interlude')).toEqual([
            { type: 'interlude', afterLineIndex: 2, startMs: 15_000, endMs: 23_000 },
        ]);
    });

    it('preserves whether each LRC end was inferred or explicitly provided', () => {
        const lines = buildLyricsLinesFromEntries([], [
            { time_ms: 0, end_ms: null, text: 'inferred', words: null, translation: null, _raw: '' },
            { time_ms: 2000, end_ms: 3500, text: 'explicit', words: null, translation: null, _raw: '' },
        ]);
        expect(lines.map(item => [item.end_time_ms, item.end_time_inferred])).toEqual([
            [2000, true], [3500, false],
        ]);
    });

    it('uses a fixed spring only for line-timed lyrics without a real preceding end', () => {
        const previous = { ...line('previous', 0, 1900), end_time_inferred: true };
        const current = line('current', 2000, 4000);
        const spring = () => {
            const displayItems: DisplayItem[] = [previous, current].map((item, lineIndex) => ({
                type: 'line', line: { ...item, visual_end_ms: item.end_time_ms }, lineIndex,
            }));
            return getAnimatedLyricsSpringParams({ activeDisplayIndex: 1, displayItems, isPlaying: true, isUserScrolling: false });
        };
        expect(spring()).toEqual({ stiffness: 100, damping: 18, mass: 1 });
        previous.end_time_inferred = false;
        expect(spring().stiffness).toBe(172);
        previous.end_time_inferred = true;
        previous.words = [{ text: 'word', start_time_ms: 0, end_time_ms: 1900 }];
        expect(spring().stiffness).toBe(172);
    });
});
