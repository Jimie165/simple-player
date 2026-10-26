import { afterEach, expect, it, vi } from 'vitest';
import { PerformanceLyricsScroll } from '@/features/player/lyrics/performanceLyricsScroll';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function setup() {
    let now = 0;
    let id = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        frames.set(++id, callback);
        return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => frames.delete(handle));
    const element = {
        scrollTop: 0, scrollHeight: 2000, clientHeight: 400,
        scrollTo(options: ScrollToOptions) { this.scrollTop = options.top ?? this.scrollTop; },
    };
    const scroll = new PerformanceLyricsScroll();
    const move = (target: number, smooth = true, index = 1) => scroll.move(element as HTMLElement, index, target, smooth);
    const frame = (delta: number) => {
        now += delta;
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach(callback => callback(now));
    };
    return { element, scroll, move, frame, frames };
}

it('progresses towards the target and eventually releases its animation frame', () => {
    const { element, move, frame, frames } = setup();
    move(1000);
    expect(element.scrollTop).toBe(0);
    frame(100);
    expect(element.scrollTop).toBeGreaterThan(0);
    expect(element.scrollTop).toBeLessThan(1000);
    frame(10000);
    expect(element.scrollTop).toBe(1000);
    expect(frames.size).toBe(0);
});

it('cancels pending movement without changing the current position', () => {
    const { element, scroll, move, frame, frames } = setup();
    move(1000);
    frame(100);
    const stopped = element.scrollTop;
    scroll.cancel();
    frame(10000);
    expect(element.scrollTop).toBe(stopped);
    expect(frames.size).toBe(0);
});

it('accepts measurement corrections and starts a new target from the actual position', () => {
    const { element, move, frame } = setup();
    move(1000);
    frame(100);
    move(1200);
    frame(10000);
    expect(element.scrollTop).toBe(1200);
    move(100, true, 2);
    frame(100);
    expect(element.scrollTop).toBeGreaterThan(100);
    expect(element.scrollTop).toBeLessThan(1200);
    frame(10000);
    expect(element.scrollTop).toBe(100);
});

it('clamps immediate targets to the scrollable range and cancels old motion', () => {
    const { element, move, frames } = setup();
    move(1000);
    move(9999, false);
    expect(element.scrollTop).toBe(1600);
    expect(frames.size).toBe(0);
    move(-100, false);
    expect(element.scrollTop).toBe(0);
});
