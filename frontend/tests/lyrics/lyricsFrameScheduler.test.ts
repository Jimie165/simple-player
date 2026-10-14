import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    LyricsFrameScheduler,
    LyricsFrameTaskRegistry,
} from '@/features/player/lyrics/lyricsFrameScheduler';

describe('LyricsFrameScheduler', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('shares one animation frame and runs tasks in phase order', () => {
        let pendingFrame: FrameRequestCallback | null = null;
        const requestFrame = vi.fn((callback: FrameRequestCallback) => {
            pendingFrame = callback;
            return 1;
        });
        const cancelFrame = vi.fn();
        vi.stubGlobal('requestAnimationFrame', requestFrame);
        vi.stubGlobal('cancelAnimationFrame', cancelFrame);
        vi.spyOn(performance, 'now').mockReturnValue(0);

        const scheduler = new LyricsFrameScheduler();
        const calls: string[] = [];
        const unsubscribeContent = scheduler.subscribe('content', () => calls.push('content'));
        const unsubscribeClock = scheduler.subscribe('clock', () => calls.push('clock'));
        const unsubscribeMotion = scheduler.subscribe('motion', () => calls.push('motion'));

        expect(requestFrame).toHaveBeenCalledTimes(1);
        const runFrame = pendingFrame;
        expect(runFrame).not.toBeNull();
        if (runFrame) runFrame(16);
        expect(calls).toEqual(['clock', 'motion', 'content']);

        unsubscribeContent();
        unsubscribeClock();
        unsubscribeMotion();
        expect(cancelFrame).toHaveBeenCalledTimes(1);
    });

    it('coalesces same-phase callbacks behind one scheduler task', () => {
        let pendingFrame: FrameRequestCallback | null = null;
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            pendingFrame = callback;
            return 1;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        vi.spyOn(performance, 'now').mockReturnValue(0);

        const scheduler = new LyricsFrameScheduler();
        const registry = new LyricsFrameTaskRegistry(scheduler, 'content');
        const calls: number[] = [];
        registry.subscribe((_now, deltaMs) => calls.push(deltaMs));
        registry.subscribe((_now, deltaMs) => calls.push(deltaMs * 2));

        expect(pendingFrame).not.toBeNull();
        pendingFrame?.(20);
        expect(calls).toEqual([20, 40]);
        registry.dispose();
    });

    it('stops the loop when the last subscriber leaves and resumes without stale work', () => {
        let pendingFrame: FrameRequestCallback | null = null;
        const requestFrame = vi.fn((callback: FrameRequestCallback) => {
            pendingFrame = callback;
            return requestFrame.mock.calls.length;
        });
        const cancelFrame = vi.fn();
        vi.stubGlobal('requestAnimationFrame', requestFrame);
        vi.stubGlobal('cancelAnimationFrame', cancelFrame);
        vi.spyOn(performance, 'now').mockReturnValue(0);

        const scheduler = new LyricsFrameScheduler();
        const calls: number[] = [];
        scheduler.subscribe('motion', (_now, deltaMs) => calls.push(deltaMs));

        expect(requestFrame).toHaveBeenCalledTimes(1);
        scheduler.dispose();
        expect(cancelFrame).toHaveBeenCalledTimes(1);
        pendingFrame?.(16);
        expect(calls).toEqual([]);

        scheduler.subscribe('motion', (_now, deltaMs) => calls.push(deltaMs));
        expect(requestFrame).toHaveBeenCalledTimes(2);
        pendingFrame?.(32);
        expect(calls).toEqual([32]);
        scheduler.dispose();
    });

    it('keeps the frame clock continuous when a callback subscribes another task', () => {
        let pendingFrame: FrameRequestCallback | null = null;
        const requestFrame = vi.fn((callback: FrameRequestCallback) => {
            pendingFrame = callback;
            return requestFrame.mock.calls.length;
        });
        vi.stubGlobal('requestAnimationFrame', requestFrame);
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        vi.spyOn(performance, 'now').mockReturnValue(0);

        const scheduler = new LyricsFrameScheduler();
        const deltas: number[] = [];
        let subscribed = false;
        scheduler.subscribe('clock', (_now, deltaMs) => {
            deltas.push(deltaMs);
            if (!subscribed) {
                subscribed = true;
                scheduler.subscribe('content', (_contentNow, contentDeltaMs) => deltas.push(contentDeltaMs));
            }
        });

        pendingFrame?.(16);
        expect(deltas).toEqual([16]);
        pendingFrame?.(32);
        expect(deltas).toEqual([16, 16, 16]);
        scheduler.dispose();
    });

    it('does not execute a registry callback added during dispatch until the next frame', () => {
        let pendingFrame: FrameRequestCallback | null = null;
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            pendingFrame = callback;
            return 1;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        vi.spyOn(performance, 'now').mockReturnValue(0);

        const scheduler = new LyricsFrameScheduler();
        const registry = new LyricsFrameTaskRegistry(scheduler, 'content');
        const calls: string[] = [];
        registry.subscribe(() => {
            calls.push('first');
            registry.subscribe(() => calls.push('second'));
        });

        pendingFrame?.(16);
        expect(calls).toEqual(['first']);
        pendingFrame?.(32);
        expect(calls).toEqual(['first', 'first', 'second']);
        registry.dispose();
    });

    it('does not reuse a stopped clock when the last task is replaced', () => {
        const pendingFrames: FrameRequestCallback[] = [];
        const requestFrame = vi.fn((callback: FrameRequestCallback) => {
            pendingFrames.push(callback);
            return pendingFrames.length;
        });
        vi.stubGlobal('requestAnimationFrame', requestFrame);
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        vi.spyOn(performance, 'now').mockReturnValue(0);

        const scheduler = new LyricsFrameScheduler();
        const deltas: number[] = [];
        const firstUnsubscribe = scheduler.subscribe('motion', (_now, deltaMs) => deltas.push(deltaMs));
        firstUnsubscribe();
        // A browser-cancelled callback should be inert even if a test invokes
        // the old callback object after the unsubscribe.
        pendingFrames[0]?.(100);
        const secondUnsubscribe = scheduler.subscribe('motion', (_now, deltaMs) => deltas.push(deltaMs));

        // The cancelled frame must be inert, while the new subscription starts
        // with its own explicit restart anchor.
        pendingFrames[1]?.(16);
        expect(deltas).toEqual([16]);
        secondUnsubscribe();
    });

    it('defers a callback that is re-added while the registry is dispatching', () => {
        let pendingFrame: FrameRequestCallback | null = null;
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            pendingFrame = callback;
            return 1;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        vi.spyOn(performance, 'now').mockReturnValue(0);

        const scheduler = new LyricsFrameScheduler();
        const registry = new LyricsFrameTaskRegistry(scheduler, 'content');
        const calls: string[] = [];
        let remove: (() => void) | null = null;
        const callback = () => {
            calls.push('callback');
            remove?.();
            remove = registry.subscribe(() => calls.push('replacement'));
        };
        remove = registry.subscribe(callback);

        pendingFrame?.(16);
        expect(calls).toEqual(['callback']);
        pendingFrame?.(32);
        expect(calls).toEqual(['callback', 'replacement']);
        registry.dispose();
    });
});
