import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KaraokeText from '@/features/player/lyrics/KaraokeText';
import { createLineFill, type LineFillCharRuntime } from '@/features/player/lyrics/karaokeLineFill';
import { groupKaraokeWords } from '@/features/player/lyrics/karaokeLayout';
import { parseLyricsWordsToChars } from '@/features/player/lyrics/lyricCharSplitting';
import type { LyricFillMode, LyricFloatMode } from '@/store/useThemeStore';
import type { LyricsWord } from '@/types';

const theme = vi.hoisted(() => ({ lyricFillMode: 'line', lyricFloatMode: 'word', lyricLineBlendEnabled: false }));
vi.mock('@/store/useThemeStore', () => ({ useThemeStore: (select: (state: typeof theme) => unknown) => select(theme) }));
vi.mock('@/features/player/lyrics/useKaraokeAnimation', () => ({ useKaraokeAnimation: () => ({
    contentRef: { current: null }, wordRefs: { current: [] }, dimWordRefs: { current: [] },
    charRefCallbacks: [], dimCharRefCallbacks: [], layoutGroups: [], wordLayoutGroups: [],
    charRuntimes: [], wordCharacterLift: [],
}) }));

const setup = (wordFill: boolean, gap = 500) => {
    vi.stubGlobal('getComputedStyle', () => ({ fontSize: '100px' }));
    const words: LyricsWord[] = [
        { text: 'A', start_time_ms: 0, end_time_ms: 1000 },
        { text: 'B', start_time_ms: 1000 + gap, end_time_ms: 2000 + gap },
    ];
    const chars = parseLyricsWordsToChars(words, 2000 + gap);
    const elements = chars.map(() => ({ offsetWidth: 120, style: { setProperty: vi.fn() } }) as unknown as HTMLSpanElement);
    const runtimes: LineFillCharRuntime[] = chars.map(() => ({
        longToneAmount: 0, fillLeftPx: 0, fillWidthPx: 0, fillMaskWidthPx: 0, fillPaddingPx: 0, fillFeatherPx: 0,
    }));
    return createLineFill(groupKaraokeWords(chars), elements, runtimes, words, 2000 + gap, wordFill);
};

describe('word-group mask sizing', () => {
    afterEach(() => vi.unstubAllGlobals());

    it.each<[LyricFillMode, LyricFloatMode, boolean]>([
        ['line', 'word', true], ['line', 'character', false],
        ['character', 'word', false], ['character', 'character', false],
    ])('enables the larger mask only for fill=%s, float=%s', (fill, float, enabled) => {
        theme.lyricFillMode = fill;
        theme.lyricFloatMode = float;
        const html = renderToStaticMarkup(createElement(KaraokeText, {
            words: [], lineEndMs: 0, currentMs: 0, preciseMsRef: { current: 0 }, isActive: true, isFocused: true,
        }));
        expect(html.includes('karaoke-text-line-word-mask')).toBe(enabled);
    });

    it('keeps the larger feather outside an unstarted word and clears the full padding after completion', () => {
        const fill = setup(true);
        fill.update(-1);
        expect(fill.getWordFillStop(0)).toBeLessThan(-75);
        fill.update(1000);
        expect(fill.getWordFillStop(0)).toBeGreaterThan(175);
        expect(fill.getWordFillStop(1)).toBeLessThan(-75);
        fill.update(2500);
        expect(fill.getWordFillStop(1)).toBeGreaterThan(175);
        fill.update(-1);
        expect(fill.getWordFillStop(0)).toBeLessThan(-75);
    });

    it('keeps a continuous fill head across words that share a boundary', () => {
        const fill = setup(true, 0);
        fill.update(1000);
        expect(fill.getWordFillStop(0)).toBe(100);
        fill.update(1100);
        expect(fill.getWordFillStop(0)).toBeGreaterThan(100);
        expect(fill.getWordFillStop(0)).toBeLessThan(175);
    });

    it('preserves the original character-based mask coordinates', () => {
        const fill = setup(false);
        fill.update(-1);
        expect(fill.getWordFillStop(0)).toBe(-17);
        fill.update(1000);
        expect(fill.getWordFillStop(0)).toBeCloseTo(116);
    });
});
