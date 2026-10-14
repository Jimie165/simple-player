import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
    refs: [] as Array<{ current: unknown }>,
    effects: [] as Array<() => void | (() => void)>,
}));

vi.mock('react', async importOriginal => ({
    ...await importOriginal<typeof import('react')>(),
    memo: (component: unknown) => component,
    useRef: (current: unknown) => {
        const ref = { current };
        hooks.refs.push(ref);
        return ref;
    },
    useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
}));

import LyricsLineItem from '@/features/player/lyrics/LyricsLineItem';

vi.mock('@/store/useThemeStore', () => ({
    useThemeStore: (selector: (state: { lyricLineBlendEnabled: boolean }) => unknown) =>
        selector({ lyricLineBlendEnabled: false }),
}));

describe('lyric press feedback', () => {
    afterEach(() => {
        hooks.refs.length = 0;
        hooks.effects.length = 0;
        vi.unstubAllGlobals();
    });

    const setup = (animatedMotion: boolean, timed = true) => {
        vi.stubGlobal('React', React);
        const onSeek = vi.fn();
        const button = LyricsLineItem({
            line: { id: 'line', role: 'main', text: 'Lyric', words: [], start_time_ms: timed ? 2000 : null, end_time_ms: 3000 },
            isActive: false, isUserScrolling: false, pausedScroll: false,
            distanceFromActive: 1, interludeShift: 0, interludeShiftDurationMs: 300,
            lineEndMs: 3000, currentTime: 0, preciseMsRef: { current: 0 },
            onSeek, animatedMotion, isPlaying: false,
        });
        if (!React.isValidElement<React.ButtonHTMLAttributes<HTMLButtonElement>>(button)) throw new Error('Expected button');
        const cancel = vi.fn();
        const animate = vi.fn(() => ({ cancel }));
        // The interaction layer owns the animation; the outer row and focus-scale refs stay untouched.
        hooks.refs[1].current = { animate };
        const click = () => button.props.onClick?.({} as React.MouseEvent<HTMLButtonElement>);
        const pointerDown = () => button.props.onPointerDown?.({} as React.PointerEvent<HTMLButtonElement>);
        return { click, pointerDown, animate, cancel, onSeek };
    };

    it.each([true, false])('rebounds on click even while paused, without delaying the seek (animated=%s)', animatedMotion => {
        const { click, animate, onSeek } = setup(animatedMotion);
        click();
        expect(animate).toHaveBeenCalledWith([
            { transform: 'scale(0.95)', offset: 0 },
            { transform: 'scale(1.01)', offset: 0.6 },
            { transform: 'scale(1)', offset: 1 },
        ], { duration: 450, easing: 'ease-out' });
        expect(onSeek).toHaveBeenCalledWith(2);
    });

    it('cancels a previous rebound before another press or click and on unmount', () => {
        const { click, pointerDown, animate, cancel } = setup(true);
        click();
        pointerDown();
        expect(cancel).toHaveBeenCalledTimes(1);
        click();
        expect(animate).toHaveBeenCalledTimes(2);
        expect(cancel).toHaveBeenCalledTimes(2);
        const cleanup = hooks.effects[0]();
        if (typeof cleanup === 'function') cleanup();
        expect(cancel).toHaveBeenCalledTimes(3);
    });

    it('does not animate or seek an untimed line', () => {
        const { click, animate, onSeek } = setup(false, false);
        click();
        expect(animate).not.toHaveBeenCalled();
        expect(onSeek).not.toHaveBeenCalled();
    });
});
