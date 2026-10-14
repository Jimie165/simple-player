import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LyricsFrameScheduler } from '@/features/player/lyrics/lyricsFrameScheduler';

const clock = vi.hoisted(() => ({
    state: { isPlaying: true, playbackRevision: 0, playbackSessionId: 1 },
    cursor: 0,
    slots: [] as unknown[],
    effects: [] as Array<() => void>,
    getTime: vi.fn<() => Promise<number>>(),
    slot(create: () => unknown) {
        const i = this.cursor++;
        if (i === this.slots.length) this.slots.push(create());
        return this.slots[i];
    },
}));

vi.mock('@/store/usePlayerStore', () => ({
    usePlayerStore: Object.assign((selector: (state: typeof clock.state) => unknown) => selector(clock.state), {
        getState: () => clock.state,
    }),
}));
vi.mock('@/services/audioService', () => ({ audioService: { getCurrentTime: clock.getTime } }));
vi.mock('react', async importOriginal => ({
    ...await importOriginal<typeof import('react')>(),
    useRef: (current: unknown) => clock.slot(() => ({ current })),
    useState: (initial: unknown) => {
        const state = clock.slot(() => ({ value: initial })) as { value: unknown };
        return [state.value, (next: unknown) => { state.value = typeof next === 'function' ? next(state.value) : next; }];
    },
    useCallback: (callback: unknown, deps: readonly unknown[]) => {
        const slot = clock.slot(() => ({ callback, deps })) as { callback: unknown; deps: readonly unknown[] };
        if (!deps.every((value, i) => Object.is(value, slot.deps[i]))) { slot.callback = callback; slot.deps = deps; }
        return slot.callback;
    },
    useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
        const slot = clock.slot(() => ({})) as { deps?: readonly unknown[]; cleanup?: () => void };
        if (slot.deps && deps.every((value, i) => Object.is(value, slot.deps![i]))) return;
        clock.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect() ?? undefined; slot.deps = deps; });
    },
}));

import { usePrecisePlaybackTime } from '@/features/player/lyrics/usePrecisePlaybackTime';

describe('lyric clock calibration lifetime', () => {
    afterEach(() => {
        for (const slot of clock.slots) (slot as { cleanup?: () => void }).cleanup?.();
        clock.cursor = 0; clock.slots.length = 0; clock.effects.length = 0;
        clock.state = { isPlaying: true, playbackRevision: 0, playbackSessionId: 1 };
        clock.getTime.mockReset();
        vi.unstubAllGlobals(); vi.restoreAllMocks();
    });

    const setup = () => {
        let now = 0;
        let nextId = 0;
        const pending = new Map<number, FrameRequestCallback>();
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        vi.stubGlobal('window', globalThis);
        vi.stubGlobal('document', { hidden: false, addEventListener() {}, removeEventListener() {} });
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pending.set(++nextId, callback); return nextId; });
        vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
        let tick: ((now: number, delta: number) => void) | undefined;
        const scheduler = { subscribe: (_phase: string, callback: typeof tick) => {
            tick = callback;
            return () => { tick = undefined; };
        } } as unknown as LyricsFrameScheduler;
        let resolveTime: (value: number) => void = () => {};
        clock.getTime.mockImplementation(() => new Promise(resolve => { resolveTime = resolve; }));
        const render = function ClockHarness(time = 0) {
            clock.cursor = 0; clock.effects.length = 0;
            const result = usePrecisePlaybackTime(time, undefined, false, scheduler);
            clock.effects.forEach(run => run());
            for (const [id, callback] of pending) { pending.delete(id); callback(now); }
            return result;
        };
        const result = render();
        now = 1600;
        tick?.(now, 1600);
        expect(clock.getTime).toHaveBeenCalledTimes(1);
        return { result, render, resolve: async (value: number) => { resolveTime(value); await Promise.resolve(); } };
    };

    it('still accepts a current-session correction with unchanged thresholds', async () => {
        const { result, resolve } = setup();
        await resolve(4);
        expect(result.preciseMsRef.current).toBe(4000);
    });

    it.each(['pause', 'session', 'revision'] as const)('ignores a response invalidated by %s', async reason => {
        const { result, resolve } = setup();
        if (reason === 'pause') clock.state = { ...clock.state, isPlaying: false };
        if (reason === 'session') clock.state = { ...clock.state, playbackSessionId: 2 };
        if (reason === 'revision') clock.state = { ...clock.state, playbackRevision: 1 };
        await resolve(4);
        expect(result.preciseMsRef.current).toBe(1600);
    });

    it('does not undo a newer hard synchronization', async () => {
        const { result, render, resolve } = setup();
        render(8);
        expect(result.preciseMsRef.current).toBe(8000);
        await resolve(4);
        expect(result.preciseMsRef.current).toBe(8000);
    });

    it('ignores an in-flight calibration after unmount', async () => {
        const { result, resolve } = setup();
        for (const slot of clock.slots) (slot as { cleanup?: () => void }).cleanup?.();
        await resolve(4);
        expect(result.preciseMsRef.current).toBe(1600);
    });
});
