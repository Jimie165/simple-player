import { describe, expect, it } from 'vitest';
import {
    buildDisplayItems,
    getActiveLyricsState,
} from '@/features/player/lyrics/lyricsDisplay';
import { animationLyricsTimingStrategy } from '@/features/player/lyrics/timingStrategy';
import type { LyricsLine } from '@/types';

describe('opening lyrics interlude', () => {
    it('owns the negative clock pre-roll instead of briefly focusing the first line', () => {
        const lines: LyricsLine[] = [{
            id: 'first-line',
            role: 'main',
            start_time_ms: 10_000,
            end_time_ms: 12_000,
            text: 'First lyric',
            words: [],
        }];
        const displayItems = buildDisplayItems(
            lines,
            true,
            animationLyricsTimingStrategy,
        );

        expect(displayItems[0]?.type).toBe('interlude');
        const state = getActiveLyricsState(
            displayItems,
            lines,
            -0.01,
            animationLyricsTimingStrategy,
            false,
        );

        expect(state.focusIndex).toBe(0);
        expect([...state.activeIndices]).toEqual([0]);
    });
});
