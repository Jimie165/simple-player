import { afterEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
    cursor: 0,
    slots: [] as unknown[],
    effects: [] as Array<() => void | (() => void)>,
    stateWrites: 0,
    slot(create: () => unknown) {
        const index = this.cursor++;
        if (index === this.slots.length) this.slots.push(create());
        return this.slots[index];
    },
    memo(create: () => unknown, deps: readonly unknown[]) {
        const slot = this.slot(() => ({ value: create(), deps })) as { value: unknown; deps: readonly unknown[] };
        if (!deps.every((value, index) => Object.is(value, slot.deps[index]))) {
            slot.value = create();
            slot.deps = deps;
        }
        return slot.value;
    },
    effect(effect: () => void | (() => void), deps?: readonly unknown[]) {
        const slot = this.slot(() => ({ deps: undefined, cleanup: undefined })) as {
            deps?: readonly unknown[]; cleanup?: () => void;
        };
        if (deps && slot.deps && deps.every((value, index) => Object.is(value, slot.deps![index]))) return;
        this.effects.push(() => {
            slot.cleanup?.();
            slot.cleanup = effect() ?? undefined;
            slot.deps = deps;
        });
    },
}));

vi.mock('react', async importOriginal => ({
    ...await importOriginal<typeof import('react')>(),
    useState: (initial: unknown) => {
        const state = hooks.slot(() => ({ value: typeof initial === 'function' ? initial() : initial })) as { value: unknown };
        return [state.value, (next: unknown) => {
            hooks.stateWrites++;
            state.value = typeof next === 'function' ? next(state.value) : next;
        }];
    },
    useRef: (current: unknown) => hooks.slot(() => ({ current })),
    useMemo: (create: () => unknown, deps: readonly unknown[]) => hooks.memo(create, deps),
    useCallback: (callback: unknown, deps: readonly unknown[]) => hooks.memo(() => callback, deps),
    useInsertionEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => hooks.effect(effect, deps),
    useLayoutEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => hooks.effect(effect, deps),
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => hooks.effect(effect, deps),
}));

import { useAnimatedLyricsLayout, useAnimatedLyricsMeasurements } from '@/features/player/lyrics/useAnimatedLyricsLayout';
import type { DisplayItem } from '@/features/player/lyrics/types';

describe('animated lyrics height updates during resize', () => {
    afterEach(() => {
        hooks.cursor = 0;
        hooks.slots.length = 0;
        hooks.effects.length = 0;
        hooks.stateWrites = 0;
        vi.unstubAllGlobals();
    });

    const setup = (count = 3) => {
        const observers: Array<{ callback: ResizeObserverCallback; nodes: Set<Element> }> = [];
        vi.stubGlobal('ResizeObserver', class {
            nodes = new Set<Element>();
            constructor(public callback: ResizeObserverCallback) { observers.push(this); }
            observe(node: Element) { this.nodes.add(node); }
            unobserve(node: Element) { this.nodes.delete(node); }
            disconnect() { this.nodes.clear(); }
        });
        vi.stubGlobal('queueMicrotask', (callback: () => void) => callback());
        const displayItems: DisplayItem[] = Array.from({ length: count }, (_, index) => ({
            type: 'line', lineIndex: index,
            line: { id: String(index), role: index === 2 ? 'background' : 'main', text: 'Line', words: [], start_time_ms: index * 1000, end_time_ms: (index + 1) * 1000, visual_end_ms: null },
        }));
        const props = {
            displayItems, activeDisplayIndex: 0, activeFocusOffset: 0,
            includeActiveWindow: true, interludeRowHeight: 40, variant: 'side' as const,
            visualShifts: displayItems.map(() => 0),
            parentDisplayIndexMap: new Map<number, number>(),
        };
        const render = function LayoutHarness(patch: Partial<typeof props> = {}) {
            Object.assign(props, patch);
            hooks.cursor = 0;
            hooks.effects.length = 0;
            const measurements = useAnimatedLyricsMeasurements(props.displayItems);
            const layout = useAnimatedLyricsLayout({ ...props, measurements: measurements.snapshot });
            return { ...layout, ...measurements };
        };
        const layout = render();
        const viewport = {} as HTMLDivElement;
        layout.scrollAreaRef.current = viewport;
        const commit = () => hooks.effects.forEach(effect => effect());
        commit();
        const nodes = displayItems.map(() => ({
            querySelector: () => null,
            get offsetHeight() { throw new Error('Forced height read'); },
            get offsetWidth() { throw new Error('Forced width read'); },
        } as HTMLDivElement));
        const disposers = nodes.map((node, index) => layout.observeItem(index, node));
        const deliver = (entries: ResizeObserverEntry[]) => observers[0].callback(entries, {} as ResizeObserver);
        const entry = (height: number, width: number, index: number) => ({
            target: nodes[index], borderBoxSize: [{ blockSize: height, inlineSize: width }],
        } as unknown as ResizeObserverEntry);
        const viewportEntry = (height: number, width: number) => ({
            target: viewport, contentRect: { height, width },
        } as ResizeObserverEntry);
        const measure = (height: number, width: number, index = 0) => {
            const observer = observers.find(candidate => candidate.nodes.has(nodes[index]));
            if (!observer) throw new Error('Row not observed');
            observer.callback([entry(height, width, index)], {} as ResizeObserver);
        };
        return { measure, render, commit, deliver, entry, viewportEntry, observers, disposers, layout };
    };

    it('keeps flow geometry stable when only a background height changes', () => {
        const { measure, render } = setup();
        measure(120, 500);
        const before = render();
        measure(80, 500, 2);
        const after = render();
        expect(after.itemTops).toBe(before.itemTops);
        expect(after.itemHeights).toBe(before.itemHeights);
        expect(after.backgroundHeights[2]).toBe(80);
    });

    it('does not invalidate background geometry for a main row or a width-only measurement', () => {
        const { measure, render } = setup();
        measure(80, 500, 2);
        measure(120, 500);
        const before = render();
        measure(120, 700);
        const widthOnly = render();
        expect(widthOnly.itemTops).toBe(before.itemTops);
        expect(widthOnly.backgroundHeights).toBe(before.backgroundHeights);
        measure(170, 700);
        const heightChanged = render();
        expect(heightChanged.itemTops).not.toBe(before.itemTops);
        expect(heightChanged.backgroundHeights).toBe(before.backgroundHeights);
    });

    it('corrects a transient tall measurement after the window width has settled', () => {
        const { measure, render } = setup();
        measure(220, 400);
        expect(render().itemHeights[0]).toBe(220);
        measure(220, 700);
        measure(100, 700);
        const result = render();
        expect(result.itemHeights[0]).toBe(100);
        expect(result.itemTops[1] - result.itemTops[0]).toBe(100);
    });

    it('accepts font and wrapping height changes even when row width is unchanged', () => {
        const { measure, render } = setup();
        measure(160, 500);
        measure(110, 500);
        expect(render().itemHeights[0]).toBe(110);
        measure(180, 500);
        expect(render().itemHeights[0]).toBe(180);
    });

    it('ignores subpixel jitter and keeps background rows out of the normal flow', () => {
        const { measure, render } = setup();
        measure(120, 500);
        measure(120.2, 500.2);
        measure(80, 500, 2);
        expect(render().itemHeights[0]).toBe(120);
        expect(render().itemHeights[2]).toBe(0);
        expect(render().backgroundHeights[2]).toBe(80);
    });

    it('commits viewport, main and background sizes together, without forced geometry reads', () => {
        const { deliver, entry, viewportEntry, render, commit, observers, layout } = setup();
        const before = hooks.stateWrites;
        deliver([viewportEntry(600, 700), entry(120, 700, 0), entry(80, 700, 2)]);
        expect(hooks.stateWrites - before).toBe(1);
        const result = render();
        expect(result.viewportHeight).toBe(600);
        expect(result.itemHeights).toEqual([120, 90, 0]);
        expect(result.backgroundHeights[2]).toBe(80);
        expect(result.visibleIndices).toEqual([0, 1, 2]);
        expect(result.observeItem).toBe(layout.observeItem);
        commit();
        expect(observers).toHaveLength(1);
        const after = hooks.stateWrites;
        deliver([viewportEntry(600, 700), entry(120, 700, 0), entry(80, 700, 2)]);
        expect(hooks.stateWrites).toBe(after);
    });

    it('includes a new effective target on the first render without waiting for a visibility effect', () => {
        const { deliver, viewportEntry, render, commit } = setup(40);
        deliver([viewportEntry(600, 700)]);
        let result = render();
        commit();
        result.updateSpringVisibleIndices([0, 1, 2, 15]);
        const before = hooks.stateWrites;
        result = render({ activeDisplayIndex: 30 });
        expect(result.visibleIndices).toContain(30);
        expect(result.visibleIndices).toContain(0); // still in the current spring window
        expect(hooks.stateWrites).toBe(before);
        result.updateSpringVisibleIndices([29, 30, 31]);
        result = render();
        expect(result.visibleIndices).not.toContain(0);
        expect(result.visibleIndices).toContain(30);
        commit();
        result.setTargetScrollY(0);
        result.updateSpringVisibleIndices([0, 1]);
        result = render({ includeActiveWindow: false });
        expect(result.visibleIndices).toContain(0);
        expect(result.visibleIndices).not.toContain(30);
    });

    it('skips spring-only changes whose mounted union is unchanged', () => {
        const { deliver, viewportEntry, render, commit } = setup(40);
        deliver([viewportEntry(600, 700)]);
        const result = render();
        commit();
        const before = hooks.stateWrites;
        result.updateSpringVisibleIndices([0, 1, 2]);
        result.updateSpringVisibleIndices([1, 2, 3]);
        expect(hooks.stateWrites).toBe(before);
    });

    it('refreshes a skipped spring snapshot before painting a different target', () => {
        const { deliver, viewportEntry, render, commit } = setup(40);
        deliver([viewportEntry(600, 700)]);
        let result = render();
        commit();
        result.updateSpringVisibleIndices([5, 6]); // already in the target window
        result = render({ activeDisplayIndex: 30 });
        commit();
        // Animator.setSpatialState republishes this snapshot in layout effect.
        result.updateSpringVisibleIndices([5, 6]);
        result = render();
        expect(result.visibleIndices).toContain(5);
        expect(result.visibleIndices).toContain(6);
        expect(result.visibleIndices).toContain(30);
    });

    it('observes the original background content box, not the outer shell', () => {
        const { layout, disposers, observers, deliver, render } = setup();
        disposers[2]();
        const button = {} as HTMLElement;
        const shell = { querySelector: () => button } as unknown as HTMLDivElement;
        layout.observeItem(2, shell);
        expect(observers[0].nodes.has(button)).toBe(true);
        expect(observers[0].nodes.has(shell)).toBe(false);
        deliver([{
            target: button, borderBoxSize: [{ blockSize: 75, inlineSize: 700 }],
        } as unknown as ResizeObserverEntry]);
        expect(render().backgroundHeights[2]).toBe(75);
        expect(render().itemHeights[2]).toBe(0);
    });

    it('completes intersecting harmony groups without keeping distant groups', () => {
        const { deliver, viewportEntry, render } = setup(40);
        deliver([viewportEntry(600, 700)]);
        const result = render({
            parentDisplayIndexMap: new Map([[15, 0], [16, 0], [35, 34]]),
        });
        expect(result.visibleIndices).toContain(15);
        expect(result.visibleIndices).toContain(16);
        expect(result.visibleIndices).not.toContain(35);
    });

    it('rejects late entries from unmounted rows and the previous document', () => {
        const { deliver, entry, render, commit, disposers } = setup();
        disposers[0]();
        const before = hooks.stateWrites;
        deliver([entry(200, 700, 0)]);
        expect(hooks.stateWrites).toBe(before);
        render({ displayItems: [] });
        commit();
        deliver([entry(300, 700, 1)]);
        expect(hooks.stateWrites).toBe(before);
        expect(render().itemHeights).toEqual([]);
    });
});
