import * as React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LyricsLineItem from '@/features/player/lyrics/LyricsLineItem';

vi.mock('@/store/useThemeStore', () => ({
    useThemeStore: (selector: (state: { lyricFillMode: 'character'; lyricLineBlendEnabled: boolean }) => unknown) =>
        selector({ lyricFillMode: 'character', lyricLineBlendEnabled: false }),
}));

describe('shared lyric row hover feedback', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('uses Apple Music highlight dimensions and keeps feedback separate from scrolling', () => {
        const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
        const baseRule = css.match(/\.lyrics-interaction-layer\s*\{([^}]+)\}/)?.[1];
        expect(baseRule).toContain('border-radius: 16px');
        expect(baseRule).toContain('margin: -16px');
        expect(baseRule).toContain('padding: 16px');
        expect(baseRule).toContain('transition: background-color 250ms ease');
    });

    it('does not retain the hover background through keyboard focus after pausing', () => {
        const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
        expect(css).toMatch(/\.lyrics-hover-target:hover > \.lyrics-interaction-layer\s*\{\s*background-color: rgb\(255 255 255 \/ 8%\);/);
        expect(css).not.toMatch(/\.lyrics-hover-target:focus(?:-visible)?/);
    });

    const render = (animatedMotion: boolean, patch: Partial<React.ComponentProps<typeof LyricsLineItem>> = {}) => {
        vi.stubGlobal('React', React);
        return renderToStaticMarkup(React.createElement(LyricsLineItem, {
            line: { id: 'line', role: 'main', text: 'Lyric', translation: 'Translation', words: [], start_time_ms: 0, end_time_ms: 1000 },
            isActive: false, isUserScrolling: false, pausedScroll: false,
            distanceFromActive: 1, interludeShift: 0, interludeShiftDurationMs: 300,
            lineEndMs: 1000, currentTime: 0, preciseMsRef: { current: 0 },
            onSeek: () => {}, animatedMotion, ...patch,
        }));
    };

    it.each([true, false])('uses a row-level hover target without text brightening (animated=%s)', animatedMotion => {
        const html = render(animatedMotion);
        expect(html).toMatch(/<button[^>]*class="[^"]*lyrics-hover-target/);
        expect(html).toContain('Translation');
        expect(html).toContain('opacity-30');
        expect(html).not.toContain('hover:opacity');
        expect(html).toContain('class="lyrics-interaction-layer"');
        expect(html).toMatch(/lyrics-interaction-layer[^>]*><div[^>]*lyrics-line-scale-layer/);
    });

    it.each([true, false])('keeps karaoke base dim while only its filled layer fades on exit (animated=%s)', animatedMotion => {
        const line = {
            id: 'karaoke', role: 'main' as const, text: 'Lyric', translation: null,
            words: [{ text: 'Lyric', start_time_ms: 0, end_time_ms: 1000 }],
            start_time_ms: 0, end_time_ms: 1000,
        };
        const active = render(animatedMotion, { line, isActive: true });
        const inactive = render(animatedMotion, { line, isActive: false });
        const finishingTail = render(animatedMotion, { line, isActive: false, isKaraokeActive: true });
        expect(active).toContain('--kb:0.4');
        expect(inactive).toContain('--kb:0.3');
        expect(active).toContain('--kfa:1');
        // Tail timing can keep updating after focus leaves, while its bright layer fades out.
        expect(finishingTail).toContain('--kfa:0');
        expect(inactive).toContain('--kfa:0');
        expect(inactive).not.toContain('opacity-30');
    });

    it('measures real animated row content instead of an intrinsic height placeholder', () => {
        const html = render(true);
        expect(html).toContain('contain:layout style paint');
        expect(html).not.toContain('content-visibility:auto');
        expect(html).not.toContain('contain-intrinsic-size');
    });

    it.each([true, false])('does not show hover feedback for invisible backgrounds (animated=%s)', animatedMotion => {
        expect(render(animatedMotion, { isBackground: true })).not.toContain('lyrics-hover-target');
        expect(render(animatedMotion, { isBackground: true, isActive: true })).toContain('lyrics-hover-target');
    });

    it.each([true, false])('does not show a seek affordance for untimed lyrics (animated=%s)', animatedMotion => {
        const html = render(animatedMotion, {
            line: { id: 'untimed', role: 'main', text: 'Untimed', words: [], start_time_ms: null, end_time_ms: null },
        });
        expect(html).toContain('disabled=""');
        expect(html).not.toContain('lyrics-hover-target');
    });
});
