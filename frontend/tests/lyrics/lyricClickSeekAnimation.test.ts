import { afterEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
    cursor: 0,
    slots: [] as unknown[],
    insertion: [] as Array<() => void | (() => void)>,
    layout: [] as Array<() => void | (() => void)>,
    slot(create: () => unknown) {
        const index = this.cursor++;
        if (index === this.slots.length) this.slots.push(create());
        return this.slots[index];
    },
}));

vi.mock('react', async importOriginal => ({
    ...await importOriginal<typeof import('react')>(),
    useState: (create: () => unknown) => [hooks.slot(create), vi.fn()],
    useRef: (current: unknown) => hooks.slot(() => ({ current })),
    useCallback: (callback: unknown) => callback,
    useInsertionEffect: (effect: () => void | (() => void)) => hooks.insertion.push(effect),
    useLayoutEffect: (effect: () => void | (() => void)) => hooks.layout.push(effect),
}));

import { useAnimatedLyricsAnimator } from '@/features/player/lyrics/useAnimatedLyricsAnimator';
import { LyricsFrameScheduler } from '@/features/player/lyrics/lyricsFrameScheduler';

describe('lyric click seek animation', () => {
    afterEach(() => {
        hooks.cursor = 0;
        hooks.slots.length = 0;
        hooks.insertion.length = 0;
        hooks.layout.length = 0;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    const setup = (initialScroll = 0) => {
        let now = 0;
        let pendingFrame: FrameRequestCallback | null = null;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pendingFrame = callback; return 1; });
        vi.stubGlobal('cancelAnimationFrame', () => { pendingFrame = null; });
        const props: Parameters<typeof useAnimatedLyricsAnimator>[0] = {
            activeDisplayIndex: 0, activeIndices: new Set([0, 1]), getDelay: () => 0.05,
            modelIdentity: {}, rowCount: 2, targetScrollY: initialScroll, visualShifts: [0, 0],
            springParams: { stiffness: 100, damping: 18, mass: 1 },
            isUserScrolling: false, pausedScroll: false, variant: 'side',
            parentDisplayIndexMap: new Map([[1, 0]]), frameScheduler: new LyricsFrameScheduler(),
            itemTops: [100, 200], itemHeights: [100, 0], viewportHeight: 600,
            fallbackVisibleIndices: [0, 1], onVisibleIndicesChange: vi.fn(),
        };
        // This fixture exercises the production hook's commit path with persistent refs/state.
        const render = function AnimatorHarness(patch: Partial<typeof props> = {}) {
            Object.assign(props, patch);
            hooks.cursor = 0;
            hooks.insertion.length = 0;
            hooks.layout.length = 0;
            const { registerAnimatedRow: register } = useAnimatedLyricsAnimator(props);
            hooks.insertion.forEach(effect => effect());
            return register;
        };
        const commit = () => hooks.layout.forEach(effect => effect());
        const register = render();
        const nodes = [0, 1].map(() => ({ style: {}, querySelector: () => null }) as unknown as HTMLDivElement);
        nodes.forEach((node, index) => register(index, node));
        commit();
        const frame = (ms: number) => {
            now += ms;
            const callback = pendingFrame;
            pendingFrame = null;
            callback?.(now);
        };
        const y = (i = 0) => Number(nodes[i].style.transform.match(/translateY\(([-\d.]+)px\)/)?.[1]);
        return { render, commit, frame, y };
    };

    it.each([[0, 800], [800, 0]])('animates a confirmed click from scroll %s to %s', (from, to) => {
        const { render, commit, frame, y } = setup(from);
        render({ targetScrollY: to });
        commit();
        expect(y()).toBe(from === 0 ? 0 : -from);
        frame(150);
        expect(y()).toBeGreaterThan(Math.min(-from, -to));
        expect(y()).toBeLessThan(Math.max(-from, -to));
        expect(y(1)).toBe(y());
        frame(3000);
        expect(y()).toBe(to === 0 ? 0 : -to);
    });

    it('preserves motion on successive distant clicks', () => {
        const { render, commit, frame, y } = setup();
        render({ targetScrollY: 800 });
        commit(); frame(150);
        const before = y();
        render({ targetScrollY: 1600 });
        commit();
        expect(y()).toBe(before);
        frame(150);
        expect(y()).toBeLessThan(before);
        expect(y()).toBeGreaterThan(-1600);
    });

    it('animates a large playback jump without requiring a lyric click marker', () => {
        const { render, commit, frame, y } = setup();
        render({ targetScrollY: 4000 });
        commit();
        expect(y()).toBe(0);
        frame(150);
        expect(y()).toBeLessThan(0);
        expect(y()).toBeGreaterThan(-4000);
        expect(y(1)).toBe(y());
        frame(3000);
        expect(y()).toBe(-4000);
    });

    it('still animates large jumps with no stagger delay', () => {
        const { render, commit, frame, y } = setup();
        render({ targetScrollY: 800, getDelay: () => 0 });
        commit();
        expect(y()).toBe(0);
        frame(100);
        expect(y()).toBeLessThan(0);
        expect(y()).toBeGreaterThan(-800);
        frame(3000);
        expect(y()).toBe(-800);
    });

    it('animates when follow resumes after the click has synchronized during manual scrolling', () => {
        const { render, commit, frame, y } = setup();
        render({ isUserScrolling: true });
        commit();
        render({ targetScrollY: 800, isUserScrolling: false });
        commit();
        expect(y()).toBe(0);
        frame(150);
        expect(y()).toBeLessThan(0);
        expect(y()).toBeGreaterThan(-800);
    });
});
