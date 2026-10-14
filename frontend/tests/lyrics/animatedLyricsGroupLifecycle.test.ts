import { afterEach, describe, expect, it, vi } from 'vitest';

const effects = vi.hoisted(() => ({
    insertion: [] as Array<() => void | (() => void)>,
    layout: [] as Array<() => void | (() => void)>,
}));

// Reproduce StrictMode's effect ordering without a browser: layout effects replay,
// whereas insertion effects (which initially build the row models) do not.
vi.mock('react', async importOriginal => ({
    ...await importOriginal<typeof import('react')>(),
    useState: (create: () => unknown) => [create(), vi.fn()],
    useRef: (current: unknown) => ({ current }),
    useCallback: (callback: unknown) => callback,
    useInsertionEffect: (effect: () => void | (() => void)) => effects.insertion.push(effect),
    useLayoutEffect: (effect: () => void | (() => void)) => effects.layout.push(effect),
}));

import { useAnimatedLyricsAnimator } from '@/features/player/lyrics/useAnimatedLyricsAnimator';
import { LyricsFrameScheduler } from '@/features/player/lyrics/lyricsFrameScheduler';

describe('background group layout lifecycle', () => {
    afterEach(() => {
        effects.insertion.length = 0;
        effects.layout.length = 0;
        vi.unstubAllGlobals();
    });

    it.each([false, true])('restores parent coordinates after layout cleanup (parent mounted=%s)', mountParent => {
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        const scheduler = new LyricsFrameScheduler();
        const itemTops = [300, 420, 420];
        const { registerAnimatedRow: register } = useAnimatedLyricsAnimator({
            activeDisplayIndex: 0, activeIndices: new Set([0, 1, 2]),
            modelIdentity: {}, rowCount: 3, targetScrollY: 180,
            visualShifts: [-60, -60, -30],
            getDelay: () => 0.05,
            springParams: { stiffness: 100, damping: 18, mass: 1 },
            isUserScrolling: false, pausedScroll: false, variant: 'side',
            parentDisplayIndexMap: new Map([[1, 0], [2, 0]]),
            frameScheduler: scheduler, itemTops, itemHeights: [120, 0, 0],
            viewportHeight: 600, fallbackVisibleIndices: [0, 1, 2],
            onVisibleIndicesChange: vi.fn(),
        });
        // Minimal DOM double for the animator's style writes.
        const nodes = itemTops.map(() => ({ style: {}, querySelector: () => null }) as unknown as HTMLDivElement);
        const screenY = (i: number) => itemTops[i] + Number(nodes[i].style.transform.match(/translateY\(([-\d.]+)px\)/)?.[1]);
        effects.insertion.forEach(effect => effect());
        const unmounts = [register(1, nodes[1]), register(2, nodes[2])];
        if (mountParent) unmounts.push(register(0, nodes[0]));
        const cleanups = effects.layout.map(effect => effect());
        expect(screenY(1)).toBe(180);
        expect(screenY(2)).toBe(210);
        unmounts.forEach(unmount => unmount());
        cleanups.forEach(cleanup => cleanup?.());

        // Deliberately mount the child first, without rerunning insertion effects.
        register(1, nodes[1]);
        register(2, nodes[2]);
        if (mountParent) register(0, nodes[0]);
        effects.layout.forEach(effect => effect());
        expect(screenY(1)).toBe(180);
        expect(screenY(2)).toBe(210);
        if (mountParent) expect(screenY(1) - screenY(0)).toBe(120);
    });
});
