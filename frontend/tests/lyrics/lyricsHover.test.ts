import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LyricsLineItem from '@/features/player/lyrics/LyricsLineItem';

vi.mock('@/store/useThemeStore', () => ({
    useThemeStore: (selector: (state: { lyricFillMode: 'character'; lyricLineBlendEnabled: boolean }) => unknown) =>
        selector({ lyricFillMode: 'character', lyricLineBlendEnabled: false }),
}));

describe('shared lyric row hover feedback', () => {
    afterEach(() => vi.unstubAllGlobals());

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
