import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VirtuosoHandle, VirtuosoProps } from 'react-virtuoso';
import type { DisplayItem, LyricsPanelProps } from '@/features/player/lyrics/types';

const hooks = vi.hoisted(() => ({
    cursor: 0, slots: [] as unknown[], effects: [] as Array<() => void>, playing: true,
    slot(create: () => unknown) {
        const index = this.cursor++;
        if (index === this.slots.length) this.slots.push(create());
        return this.slots[index];
    },
}));

vi.mock('react', async importOriginal => ({
    ...await importOriginal<typeof import('react')>(),
    useState: (initial: unknown) => {
        const state = hooks.slot(() => ({ value: typeof initial === 'function' ? initial() : initial })) as { value: unknown };
        return [state.value, (next: unknown) => { state.value = typeof next === 'function' ? next(state.value) : next; }];
    },
    useRef: (current: unknown) => hooks.slot(() => ({ current })),
    useMemo: (create: () => unknown) => create(),
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
        const slot = hooks.slot(() => ({ deps: undefined, cleanup: undefined })) as { deps?: unknown[]; cleanup?: () => void };
        if (slot.deps && deps.every((dep, index) => Object.is(dep, slot.deps?.[index]))) return;
        slot.deps = deps;
        hooks.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect() || undefined; });
    },
}));
vi.mock('react-virtuoso', () => ({ Virtuoso: 'virtuoso-list' }));
vi.mock('@/store/usePlayerStore', () => ({ usePlayerStore: () => hooks.playing }));
vi.mock('@/features/player/lyrics/usePrecisePlaybackTime', () => ({
    usePrecisePlaybackTime: (time: number) => ({ renderCurrentMs: time * 1000, preciseMsRef: { current: time * 1000 } }),
}));
vi.mock('@/features/player/lyrics/LyricsLineItem', () => ({ default: () => null }));
vi.mock('@/features/player/lyrics/InterludeItem', () => ({ default: () => null }));

import LyricsPanel from '@/features/player/lyrics/LyricsPanel';

describe('performance lyrics manual scroll ownership', () => {
    afterEach(() => {
        hooks.cursor = 0; hooks.slots.length = 0; hooks.effects.length = 0; hooks.playing = true;
        vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks();
    });

    const setup = (itemTop = 1000, initialScrollTop = 240) => {
        vi.useFakeTimers();
        vi.stubGlobal('React', React);
        vi.stubGlobal('window', { setTimeout, clearTimeout });
        const frames = new Map<number, FrameRequestCallback>();
        let now = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        let nextFrame = 0;
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
        vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
        class Scroller {
            scrollTop = 240;
            scrollHeight = 20000;
            clientHeight = 600;
            scrollTo = vi.fn((options: ScrollToOptions) => { this.scrollTop = options.top ?? this.scrollTop; });
        }
        vi.stubGlobal('HTMLElement', Scroller);
        const scroller = new Scroller();
        scroller.scrollTop = initialScrollTop;
        const scrollTo = scroller.scrollTo;
        const scrollToIndex = vi.fn();
        const scrollIntoView = vi.fn<VirtuosoHandle['scrollIntoView']>(location => {
            const result = location.calculateViewLocation?.({
                itemTop, itemBottom: itemTop + 100, viewportTop: 300, viewportBottom: 900, locationParams: location,
            });
            expect(result).toBeNull();
        });
        const handle = { scrollTo, scrollToIndex, scrollIntoView };
        const props: LyricsPanelProps = {
            isOpen: true, status: 'ready', playerEffectMode: 'performance', currentTime: 1,
            onSeek: vi.fn(), variant: 'side',
            lyricsDocument: { model: 'ttml', origin: 'native-ttml', timing_mode: 'line', offset_ms: 0, metadata: {},
                lines: [0, 1, 2].map(index => ({ id: String(index), role: 'main', text: 'Line', words: [], start_time_ms: index * 5000, end_time_ms: (index + 1) * 5000 })) },
        };
        const render = () => {
            hooks.cursor = 0; hooks.effects.length = 0;
            const root = LyricsPanel(props);
            const area = root.props.children as React.ReactElement<React.HTMLAttributes<HTMLDivElement>>;
            const list = area.props.children as React.ReactElement<VirtuosoProps<DisplayItem, unknown> & { ref: React.RefObject<VirtuosoHandle | null> }>;
            if (list.props.ref) list.props.ref.current = handle as VirtuosoHandle;
            list.props.scrollerRef?.(scroller as unknown as HTMLElement);
            return { area: area.props, list: list.props };
        };
        const commit = () => hooks.effects.forEach(effect => effect());
        const frame = (delta = 16) => {
            now += delta;
            const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now));
        };
        const wheel = (area: React.HTMLAttributes<HTMLDivElement>) => area.onWheel?.({ deltaY: 120 } as React.WheelEvent<HTMLDivElement>);
        return { render, commit, frame, wheel, scroller, scrollTo, scrollToIndex, scrollIntoView, props,
            setItemTop: (top: number) => { itemTop = top; }, frames };
    };

    it('uses a one-shot pixel target without starting a retrying index scroll', () => {
        const { render, commit, frame, scrollTo, scrollToIndex } = setup();
        const { list } = render(); commit(); frame();
        expect(list.initialTopMostItemIndex).toBeUndefined();
        expect(scrollTo).toHaveBeenCalledWith({ top: 750, behavior: 'instant' });
        expect(scrollToIndex).not.toHaveBeenCalled();
    });

    it('blocks a queued auto-scroll frame immediately, before React commits manual state', () => {
        const { render, commit, frame, wheel, scrollTo, scroller } = setup();
        const { area } = render(); commit(); wheel(area); frame();
        expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 240, behavior: 'instant' });
        expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it('does not recenter on measurement changes during sustained manual scrolling', () => {
        const { render, commit, frame, wheel, scrollTo } = setup();
        let view = render(); commit(); frame(); scrollTo.mockClear();
        wheel(view.area);
        scrollTo.mockClear();
        for (let index = 0; index < 4; index++) {
            vi.advanceTimersByTime(1000);
            view = render(); commit();
            wheel(view.area);
            view.list.totalListHeightChanged?.(1000 + index * 100);
            frame();
        }
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it('resumes smooth follow after inactivity and remeasures only while following', () => {
        const { render, commit, frame, wheel, scrollTo, scroller } = setup();
        let view = render(); commit(); frame();
        wheel(view.area); scroller.scrollTop = 0; render(); commit(); scrollTo.mockClear();
        vi.advanceTimersByTime(2000);
        view = render(); commit(); frame();
        frame();
        expect(scroller.scrollTop).toBeGreaterThan(0);
        expect(scroller.scrollTop).toBeLessThan(750);
        scrollTo.mockClear();
        view.list.totalListHeightChanged?.(1000); view.list.totalListHeightChanged?.(1200);
        render(); commit(); frame();
        expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it('animates a distant jump and finishes within 450ms despite repeated measurements', () => {
        const { render, commit, frame, scrollTo, scroller, props, setItemTop } = setup(5000, 0);
        render(); commit(); frame();
        scrollTo.mockClear();

        props.currentTime = 11;
        scroller.scrollTop = 0;
        render();
        commit();
        frame();
        frame(100);
        expect(scroller.scrollTop).toBeGreaterThan(0);
        expect(scroller.scrollTop).toBeLessThan(4750);
        for (let i = 0; i < 4; i++) {
            setItemTop(5100 + i * 100);
            const view = render(); commit();
            view.list.totalListHeightChanged?.(10000 + i * 100);
            render(); commit(); frame(50);
        }
        frame(150);
        expect(scrollTo).toHaveBeenLastCalledWith({ top: 5150, behavior: 'instant' });
    });

    it('cancels an ongoing distant animation immediately on manual input', () => {
        const { render, commit, frame, wheel, props, scroller, frames } = setup(5000, 0);
        render(); commit(); frame();
        props.currentTime = 11; scroller.scrollTop = 0;
        const view = render(); commit(); frame(); frame(100);
        wheel(view.area);
        const stopped = scroller.scrollTop;
        frame(500);
        expect(scroller.scrollTop).toBe(stopped);
        expect(frames.size).toBe(0);
    });

    it('reverses a new seek from the actual position without an old queued target', () => {
        const { render, commit, frame, props, scroller, frames, setItemTop } = setup(5000, 0);
        render(); commit(); frame();
        props.currentTime = 11; scroller.scrollTop = 0;
        render(); commit(); frame(); frame(100);
        props.currentTime = 1; setItemTop(500);
        render(); commit(); frame();
        const start = scroller.scrollTop;
        frame(100);
        expect(scroller.scrollTop).toBeLessThan(start);
        expect(scroller.scrollTop).toBeGreaterThan(250);
        expect(frames.size).toBe(1);
        frame(450);
        expect(scroller.scrollTop).toBe(250);
        expect(frames.size).toBe(0);
    });

    it.each(['pause', 'close', 'document'] as const)('cancels pending motion on %s', reason => {
        const { render, commit, frame, props, scroller, frames } = setup(5000, 0);
        render(); commit(); frame();
        props.currentTime = 11; scroller.scrollTop = 0;
        render(); commit(); frame(); frame(100);
        if (reason === 'pause') hooks.playing = false;
        else if (reason === 'close') props.isOpen = false;
        else props.lyricsDocument = null;
        render(); commit();
        const stopped = scroller.scrollTop;
        frame(500);
        expect(scroller.scrollTop).toBe(stopped);
        expect(frames.size).toBe(0);
    });

    it('resumes the interrupted target after playback resumes', () => {
        const { render, commit, frame, props, scroller } = setup(5000, 0);
        render(); commit(); frame();
        props.currentTime = 11; scroller.scrollTop = 0;
        render(); commit(); frame(); frame(100);
        hooks.playing = false; render(); commit();
        hooks.playing = true; render(); commit(); frame(); frame(450);
        expect(scroller.scrollTop).toBe(4750);
    });
});
