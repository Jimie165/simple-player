import { afterEach, describe, expect, it, vi } from 'vitest';

const animation = vi.hoisted(() => ({
    refIndex: 0,
    container: { style: { transform: '' } },
    dots: Array.from({ length: 3 }, () => ({ style: { opacity: '' } })),
    blended: false,
    cleanup: undefined as (() => void) | undefined,
}));

vi.mock('react', async importOriginal => ({
    ...await importOriginal<typeof import('react')>(),
    useRef: (initial: unknown) => ({ current: animation.refIndex++ === 0
        ? animation.container : Array.isArray(initial) ? animation.dots : initial }),
    useEffect: (effect: () => (() => void) | undefined) => { animation.cleanup = effect(); },
}));
vi.mock('@/features/player/lyrics/lyricsFrameScheduler', () => ({ useLyricsFrameTaskRegistry: () => null }));
vi.mock('@/store/useThemeStore', () => ({
    useThemeStore: (selector: (state: { lyricLineBlendEnabled: boolean }) => boolean) =>
        selector({ lyricLineBlendEnabled: animation.blended }),
}));

import InterludeItem from '@/features/player/lyrics/InterludeItem';

describe('interlude dot entry and whitening', () => {
    afterEach(() => {
        animation.cleanup?.();
        animation.cleanup = undefined;
        animation.refIndex = 0;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it.each([false, true])('fades in dim dots before lighting them one by one (blended=%s)', blended => {
        animation.blended = blended;
        let now = 0;
        let frame: FrameRequestCallback | undefined;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
        vi.stubGlobal('cancelAnimationFrame', () => { frame = undefined; });
        const preciseMsRef = { current: 420 };
        InterludeItem({ isActive: true, forceExiting: false, forceExitKey: 0, playbackSyncKey: 0,
            suppressDots: false, currentMs: 420, preciseMsRef, isPlaying: true, startMs: 0, endMs: 10_000 });
        const advance = (elapsed: number) => {
            now = elapsed;
            preciseMsRef.current = 420 + elapsed;
            frame?.(now);
            return animation.dots.map(dot => Number(dot.style.opacity));
        };
        expect(advance(0)).toEqual([0, 0, 0]);
        const entering = advance(550);
        const resting = blended ? 0.1 : 0.15;
        expect(entering[0]).toBeCloseTo(resting);
        expect(entering[1]).toBeLessThan(resting);
        expect(entering[2]).toBeLessThan(entering[1]);
        const first = advance(1000);
        expect(first[0]).toBeGreaterThan(resting);
        expect(first[1]).toBeCloseTo(resting);
        expect(first[2]).toBeCloseTo(resting);
        const second = advance(3500);
        expect(second[0]).toBe(1);
        expect(second[1]).toBeGreaterThan(resting);
        expect(second[2]).toBeCloseTo(resting);
        // All three are white during the hold before exit growth begins at 8150ms.
        expect(advance(7600)).toEqual([1, 1, 1]);
    });
});
