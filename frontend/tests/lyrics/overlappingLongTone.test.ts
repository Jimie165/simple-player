import { describe, expect, it } from 'vitest';
import type { LyricsLine } from '@/types';
import { getTightHandoffVisualEndMs, parseLyricsWordsToChars } from '@/features/player/lyrics/lyricCharSplitting';
import { buildDisplayItems, getActiveLyricsState, getLineEndMsByIndex } from '@/features/player/lyrics/lyricsDisplay';
import { animationLyricsTimingStrategy as strategy } from '@/features/player/lyrics/timingStrategy';

const words = [
    { text: '怪獣の', start_time_ms: 190912, end_time_ms: 192184 },
    { text: '歌', start_time_ms: 192184, end_time_ms: 199954 },
];
const lineEndMs = 199954;

describe('overlapping TTML long tones', () => {
    it('preserves the full 7.770 second word while another voice starts', () => {
        const chars = parseLyricsWordsToChars(words, lineEndMs, { enabled: true, nextLineStartMs: 192412 });
        expect(chars.at(-1)).toMatchObject({
            char: '歌', time_ms: 192184, durationMs: 7770,
            groupDurationMs: 7770, nextStart: 199954,
        });
        expect(getTightHandoffVisualEndMs(words, lineEndMs, 192412)).toBe(lineEndMs);
    });

    it('keeps the original voice active through successive overlapping lines', () => {
        const lines: LyricsLine[] = [
            { id: 'L67', role: 'main', text: '怪獣の歌', start_time_ms: 190912, end_time_ms: lineEndMs, words },
            ...[[192412, 195613], [195625, 198846], [198735, 202871]].map(([start, end], index): LyricsLine => ({
                id: `L${68 + index}`, role: 'main', text: '次の声部', start_time_ms: start, end_time_ms: end,
                words: [{ text: '次の声部', start_time_ms: start, end_time_ms: end }],
            })),
        ];
        const nextStart = getLineEndMsByIndex(lines, 0);
        expect(nextStart).toBe(192412);
        const items = buildDisplayItems(lines, true, strategy);
        const displayIndex = items.findIndex(item => item.type === 'line' && item.line.id === 'L67');
        const item = items[displayIndex];
        expect(item.type === 'line' && item.line.visual_end_ms).toBe(lineEndMs);
        for (const timeMs of [195184, 196846, 199000, 199953]) {
            expect(getActiveLyricsState(items, lines, timeMs / 1000, strategy, true).activeIndices.has(displayIndex)).toBe(true);
        }
        expect(getActiveLyricsState(items, lines, 199.954, strategy, true).activeIndices.has(displayIndex)).toBe(false);
    });

    it('still compresses a nonoverlapping handoff by the missing lead time', () => {
        expect(getTightHandoffVisualEndMs(words, lineEndMs, 200354)).toBe(199754);
    });
});
