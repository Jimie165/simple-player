import * as React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LyricsLineItem from '@/features/player/lyrics/LyricsLineItem';
import { buildDisplayItems, getActiveLyricsState, getLineCompressionHandoffStartMs, getLineKaraokeEndMs, getTtmlLineWindows } from '@/features/player/lyrics/lyricsDisplay';
import { parseLyricsWordsToChars } from '@/features/player/lyrics/lyricCharSplitting';
import { animationLyricsTimingStrategy } from '@/features/player/lyrics/timingStrategy';
import type { LyricsLine } from '@/types';

vi.mock('@/store/useThemeStore', () => ({
    useThemeStore: (selector: (state: { lyricFillMode: 'character'; lyricLineBlendEnabled: boolean }) => unknown) =>
        selector({ lyricFillMode: 'character', lyricLineBlendEnabled: false }),
}));

const lines: LyricsLine[] = [
    { id: 'old', role: 'main', text: 'Old', start_time_ms: 1300, end_time_ms: 2000,
        words: [{ text: 'Old', start_time_ms: 1300, end_time_ms: 2000 }] },
    { id: 'next', role: 'main', text: 'Next', start_time_ms: 2000, end_time_ms: 3000,
        words: [{ text: 'Next', start_time_ms: 2000, end_time_ms: 3000 }] },
];

const renderRow = (isSeekExiting: boolean) => {
    vi.stubGlobal('React', React);
    return renderToStaticMarkup(React.createElement(LyricsLineItem, {
        line: lines[0], isActive: true, isKaraokeActive: true, isSeekExiting,
        isUserScrolling: false, pausedScroll: false, distanceFromActive: 0,
        interludeShift: 0, interludeShiftDurationMs: 300, lineEndMs: 2000,
        currentTime: 1.5, preciseMsRef: { current: 1500 },
        onSeek: () => {}, animatedMotion: true,
    }));
};

describe('seek exit versus normal compressed handoff', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('fades the clicked-away row’s filled layer without brightening its base', () => {
        const playing = renderRow(false);
        const seekingAway = renderRow(true);
        expect(playing).toContain('--kb:0.4');
        expect(playing).toContain('--kfa:1');
        expect(seekingAway).toContain('--kb:0.3');
        expect(seekingAway).toContain('--kfa:0');
        expect(seekingAway).not.toContain('opacity-30');
        const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
        expect(css).toMatch(/\.karaoke-char::before\s*\{[^}]*transition: color 450ms ease-out/s);
    });

    it('keeps the old line active until its compressed fill reaches visual end', () => {
        const items = buildDisplayItems(lines, true, animationLyricsTimingStrategy);
        expect(items[0].type === 'line' && items[0].line.visual_end_ms).toBe(1650);
        expect(getActiveLyricsState(items, lines, 1.649, animationLyricsTimingStrategy).focusIndex).toBe(0);
        expect(getActiveLyricsState(items, lines, 1.65, animationLyricsTimingStrategy).focusIndex).toBe(1);
    });

    it('uses the main word end when TTML p end extends beyond the next line', () => {
        const ttmlLines: LyricsLine[] = [
            { id: 'L1', role: 'main', text: '车子缓缓的开 你慢慢走来',
                start_time_ms: 28871, end_time_ms: 34868,
                words: [
                    { text: '走', start_time_ms: 31494, end_time_ms: 31728 },
                    { text: '来', start_time_ms: 31728, end_time_ms: 32118 },
                ] },
            { id: 'L2', role: 'main', text: '我竟然看着你发呆',
                start_time_ms: 32320, end_time_ms: 34868,
                words: [{ text: '我', start_time_ms: 32320, end_time_ms: 32504 }] },
        ];
        const lineEnd = getLineKaraokeEndMs(ttmlLines[0], 32320);
        const items = buildDisplayItems(ttmlLines, true, animationLyricsTimingStrategy);
        const firstIndex = items.findIndex(item => item.type === 'line' && item.line.id === 'L1');
        const nextIndex = items.findIndex(item => item.type === 'line' && item.line.id === 'L2');
        const fillEnd = parseLyricsWordsToChars(ttmlLines[0].words, lineEnd, {
            enabled: true, nextLineStartMs: 32320,
        }).at(-1)?.nextStart;
        const handoff = getTtmlLineWindows(ttmlLines, animationLyricsTimingStrategy).windowEndMs[0];
        expect(lineEnd).toBe(32118);
        expect(items[firstIndex].type === 'line' && items[firstIndex].line.visual_end_ms).toBe(handoff);
        expect(fillEnd).toBe(handoff);
        expect(getActiveLyricsState(items, ttmlLines, (handoff - 1) / 1000, animationLyricsTimingStrategy, true).focusIndex).toBe(firstIndex);
        expect(getActiveLyricsState(items, ttmlLines, handoff / 1000, animationLyricsTimingStrategy, true).focusIndex).toBe(nextIndex);
    });

    it('finishes both co-ending duet tails before handing off to the next group', () => {
        const duet: LyricsLine[] = [
            { id: 'L18', role: 'main', text: '君への言葉を心で重ねて',
                start_time_ms: 89753, end_time_ms: 96433,
                words: [
                    { text: 'ね', start_time_ms: 95687, end_time_ms: 95890 },
                    { text: 'て', start_time_ms: 95890, end_time_ms: 96433 },
                ] },
            { id: 'L19', role: 'main', text: '君への想いに気づいて',
                start_time_ms: 91742, end_time_ms: 96432,
                words: [
                    { text: 'い', start_time_ms: 95741, end_time_ms: 96123 },
                    { text: 'て', start_time_ms: 96123, end_time_ms: 96432 },
                ] },
            { id: 'L20a', role: 'main', text: '神様',
                start_time_ms: 96442, end_time_ms: 99966,
                words: [{ text: '神', start_time_ms: 96442, end_time_ms: 97260 }] },
        ];
        const items = buildDisplayItems(duet, true, animationLyricsTimingStrategy);
        const windows = getTtmlLineWindows(duet, animationLyricsTimingStrategy);
        expect(getLineCompressionHandoffStartMs(duet, 0)).toBe(96442);
        expect(windows.windowEndMs[0]).toBe(windows.windowEndMs[1]);
        for (const lineIndex of [0, 1]) {
            const line = duet[lineIndex];
            const lineEnd = getLineKaraokeEndMs(line, 96442);
            const fillEnd = parseLyricsWordsToChars(line.words, lineEnd, {
                enabled: true,
                nextLineStartMs: getLineCompressionHandoffStartMs(duet, lineIndex),
            }).at(-1)?.nextStart;
            const displayItem = items.find(item => item.type === 'line' && item.line.id === line.id);
            expect(displayItem?.type === 'line' && displayItem.line.visual_end_ms).toBe(fillEnd);
            expect(fillEnd).toBeLessThanOrEqual(windows.windowEndMs[lineIndex]);
        }
        const before = getActiveLyricsState(items, duet, (windows.windowEndMs[0] - 1) / 1000, animationLyricsTimingStrategy, true);
        expect(before.activeIndices.size).toBe(2);
        const after = getActiveLyricsState(items, duet, windows.windowEndMs[0] / 1000, animationLyricsTimingStrategy, true);
        expect(after.activeIndices.size).toBe(1);
        expect(items[after.focusIndex].type === 'line' && items[after.focusIndex].line.id).toBe('L20a');
    });
});
