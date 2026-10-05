import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import type { LyricsDebugEvent } from '@/features/player/lyrics/lyricsDebug';

const hooks = vi.hoisted(() => ({
    floatMode: 'character' as 'character' | 'word',
    cursor: 0,
    slots: [] as unknown[],
    insertion: [] as Array<() => void>,
    layout: [] as Array<() => void>,
    callbacks: new Set<() => void>(),
    slot(create: () => unknown) {
        const index = this.cursor++;
        if (index === this.slots.length) this.slots.push(create());
        return this.slots[index];
    },
    memo(create: () => unknown, deps: readonly unknown[]) {
        const slot = this.slot(() => ({ value: create(), deps })) as { value: unknown; deps: readonly unknown[] };
        if (!deps.every((value, i) => Object.is(value, slot.deps[i]))) {
            slot.value = create(); slot.deps = deps;
        }
        return slot.value;
    },
    effect(effect: () => void | (() => void), deps: readonly unknown[] | undefined, insertion = false) {
        const slot = this.slot(() => ({})) as { deps?: readonly unknown[]; cleanup?: () => void };
        if (deps && slot.deps && deps.every((value, i) => Object.is(value, slot.deps![i]))) return;
        (insertion ? this.insertion : this.layout).push(() => {
            slot.cleanup?.(); slot.cleanup = effect() ?? undefined; slot.deps = deps;
        });
    },
}));

vi.mock('react', async importOriginal => ({
    ...await importOriginal<typeof import('react')>(),
    useRef: (current: unknown) => hooks.slot(() => ({ current })),
    useMemo: (create: () => unknown, deps: readonly unknown[]) => hooks.memo(create, deps),
    useInsertionEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => hooks.effect(effect, deps, true),
    useLayoutEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => hooks.effect(effect, deps),
}));
const registry = {
    subscribe(callback: () => void) {
        hooks.callbacks.add(callback);
        return () => { hooks.callbacks.delete(callback); };
    },
};
vi.mock('@/features/player/lyrics/lyricsFrameScheduler', () => ({ useLyricsFrameTaskRegistry: () => registry }));
vi.mock('@/store/useThemeStore', () => ({
    useThemeStore: (selector: (state: { lyricFillMode: 'character'; lyricFloatMode: 'character' | 'word' }) => unknown) =>
        selector({ lyricFillMode: 'character', lyricFloatMode: hooks.floatMode }),
}));

import KaraokeText from '@/features/player/lyrics/KaraokeText';

class NodeDouble {
    offsetWidth = 24;
    values: Record<string, string> = {};
    writes: string[] = [];
    classes = new Set<string>();
    classList = {
        contains: (name: string) => this.classes.has(name),
        add: (name: string) => { this.classes.add(name); },
        remove: (name: string) => { this.classes.delete(name); },
    };
    style = {
        setProperty: (name: string, value: string) => { this.values[name] = value; this.writes.push(name); },
        removeProperty: (name: string) => { delete this.values[name]; this.writes.push(name); },
    };
    constructor() {
        Object.defineProperty(this.style, 'transform', {
            get: () => this.values.transform ?? '',
            set: (value: string) => { this.values.transform = value; this.writes.push('transform'); },
        });
    }
}

describe('DOM-owned karaoke runtime', () => {
    afterEach(() => {
        for (const slot of hooks.slots) (slot as { cleanup?: () => void }).cleanup?.();
        hooks.floatMode = 'character';
        hooks.cursor = 0; hooks.slots.length = 0;
        hooks.insertion.length = 0; hooks.layout.length = 0; hooks.callbacks.clear();
        vi.useRealTimers(); vi.unstubAllGlobals();
    });

    const setup = () => {
        vi.useFakeTimers();
        vi.stubGlobal('window', globalThis);
        vi.stubGlobal('getComputedStyle', () => ({ fontSize: '20px' }));
        const events: LyricsDebugEvent[] = [];
        vi.stubGlobal('__SIMPLE_PLAYER_LYRICS_DEBUG__', (event: LyricsDebugEvent) => events.push(event));
        const props = {
            words: [{ text: '雨', start_time_ms: 1000, end_time_ms: 1400 }, { text: '天', start_time_ms: 2200, end_time_ms: 2800 }],
            lineEndMs: 2800, nextLineStartMs: 3000, currentMs: 0, preciseMsRef: { current: 0 },
            isActive: false, isFocused: false, isPlaying: true, playbackSyncKey: 0, glowDisabled: false,
        };
        const nodes = new Map<string, NodeDouble>();
        const render = (patch: Partial<typeof props> = {}) => {
            Object.assign(props, patch);
            hooks.cursor = 0; hooks.insertion.length = 0; hooks.layout.length = 0;
            const tree = KaraokeText.type(props);
            let charIndex = 0;
            let wordIndex = 0;
            const visit = (node: ReactNode) => {
                if (Array.isArray(node)) { node.forEach(visit); return; }
                if (!isValidElement<{ children?: ReactNode; className?: string; ref?: { current: HTMLSpanElement | null } | ((node: HTMLSpanElement) => void); 'data-c'?: string }>(node)) return;
                const { ref, children } = node.props;
                if (ref) {
                    const key = node.props.className === 'karaoke-word-motion' ? `word-${wordIndex++}`
                        : node.props['data-c'] === undefined ? 'content' : `char-${charIndex++}`;
                    if (!nodes.has(key)) nodes.set(key, new NodeDouble());
                    const element = nodes.get(key)! as unknown as HTMLSpanElement;
                    if (typeof ref === 'function') ref(element); else ref.current = element;
                }
                visit(children);
            };
            visit(tree);
            hooks.insertion.forEach(run => run()); hooks.layout.forEach(run => run());
        };
        const frame = (time: number) => {
            props.preciseMsRef.current = time;
            hooks.callbacks.forEach(callback => callback());
        };
        render();
        return { props, render, frame, events, nodes, char: (index = 0) => nodes.get(`char-${index}`)! };
    };

    it('moves and fills one timed group with paused seek synchronization', () => {
        hooks.floatMode = 'word';
        const { props, render, frame, nodes, char } = setup();
        render({ words: [{ text: 'hello', start_time_ms: 1000, end_time_ms: 2000 }], isActive: true, isFocused: true });
        frame(1300);
        const word = nodes.get('word-0')!;
        expect(word.values.transform).not.toBe('translateY(0.000000em)');
        expect(char().values.transform).toBeUndefined();
        expect(char(1).values.transform).toBeUndefined();
        expect(Number(word.values['--kf'])).toBeGreaterThan(0);
        expect(Number(word.values['--kf'])).toBeLessThan(100);
        expect(char().values['--kf']).toBeUndefined();
        expect(char(1).values['--kf']).toBeUndefined();
        const fillWrites = nodes.get('word-0')!.writes.filter(name => name === '--kf').length;
        frame(1400);
        expect(word.writes.filter(name => name === '--kf')).toHaveLength(fillWrites + 1);
        const before = word.values.transform;
        render({ isPlaying: false });
        expect(hooks.callbacks.size).toBe(0);
        expect(word.values.transform).toBe(before);
        props.preciseMsRef.current = 500;
        render({ playbackSyncKey: 1 });
        expect(word.values.transform).toBe('translateY(0.000000em)');
        expect(Number(word.values['--kf'])).toBeLessThan(0);
        render({ isFocused: false });
        expect(word.values.transform).toBe('');
        vi.advanceTimersByTime(250);
        expect(word.values.transform).toBe('translateY(0em)');
    });

    it('delays word lift by 100ms without delaying fill and completes the delayed motion', () => {
        hooks.floatMode = 'word';
        const { render, frame, nodes } = setup();
        render({ words: [{ text: 'a', start_time_ms: 1000, end_time_ms: 1400 }], isActive: true, isFocused: true });
        const word = nodes.get('word-0')!;
        frame(1050);
        expect(word.values.transform).toBe('translateY(0.000000em)');
        expect(Number(word.values['--kf'])).toBeGreaterThan(0);
        frame(1100);
        expect(word.values.transform).toBe('translateY(0.000000em)');
        frame(1150);
        expect(word.values.transform).not.toBe('translateY(0.000000em)');
        for (let time = 1200; time <= 2100; time += 100) frame(time);
        expect(word.values.transform).toBe('translateY(-0.078000em)');
    });

    it('keeps staggered character emphasis inside a floating long-tone group', () => {
        hooks.floatMode = 'word';
        const { props, render, frame, nodes, char } = setup();
        render({ words: [{ text: 'hello', start_time_ms: 1000, end_time_ms: 4000 }], isActive: true, isFocused: true });
        frame(1800);
        const word = nodes.get('word-0')!;
        expect(word.values.transform).toMatch(/^translateY\(/);
        expect(word.values.transform).not.toContain('scale');
        expect(char().values.transform).toContain('scale');
        expect(char().values.transform).not.toBe(char(4).values.transform);
        expect(Number(char().values['--kg'])).toBeGreaterThan(Number(char(4).values['--kg']));
        const before = char().values.transform;
        render({ isPlaying: false });
        expect(hooks.callbacks.size).toBe(0);
        expect(char().values.transform).toBe(before);
        render({ isFocused: false });
        expect(word.values.transform).toBe('');
        expect(char().values.transform).toBe('');
        render({ isFocused: true });
        expect(char().values.transform).toBe(before);
        props.preciseMsRef.current = 500;
        render({ playbackSyncKey: 1 });
        expect(Number(char().values['--kg'])).toBe(0);
        expect(char().values.transform).toContain('scale(1.0000)');
    });

    it('adds no character lift to the word height while long-tone glow fades', () => {
        hooks.floatMode = 'word';
        const { render, frame, char } = setup();
        render({ words: [{ text: 'hello', start_time_ms: 1000, end_time_ms: 4000 }], isActive: true, isFocused: true });
        const verticalOffset = () => Number(char().values.transform.match(/translate3d\([^,]+, ([-\d.]+)em/)?.[1]);
        frame(2800);
        const peak = verticalOffset();
        const peakGlow = Number(char().values['--kg']);
        expect(peak).toBe(0);
        frame(3800);
        expect(verticalOffset()).toBe(peak);
        expect(Number(char().values['--kg'])).toBeLessThan(peakGlow);
        frame(4700);
        expect(verticalOffset()).toBe(peak);
        expect(Number(char().values['--kg'])).toBe(0);
    });

    it('initializes before activation and keeps the callback and runtime across pause/resume', () => {
        const { props, render, events, frame, char } = setup();
        expect(events.filter(e => e.type === 'karaoke-runtime' && e.action === 'create')).toHaveLength(1);
        expect(hooks.callbacks.size).toBe(0);
        props.preciseMsRef.current = 1000;
        render({ isActive: true, isFocused: true });
        const callback = [...hooks.callbacks][0];
        frame(1400);
        expect(Number(char().values.transform.match(/translateY\(([-\d.]+)em\)/)?.[1])).toBeLessThan(0);
        const before = char().values.transform;
        render({ isPlaying: false });
        expect(hooks.callbacks.size).toBe(0);
        render({ isPlaying: true });
        expect([...hooks.callbacks][0]).toBe(callback);
        expect(char().values.transform).toBe(before);
        expect(events.filter(e => e.type === 'karaoke-runtime' && e.action === 'create')).toHaveLength(1);
    });

    it('reacquires CSS-owned motion at the same media time and cancels the old exit', () => {
        const { props, render, frame, char, nodes } = setup();
        render({ isActive: true, isFocused: true }); frame(1400);
        const before = char().values.transform;
        render({ isPlaying: false, isFocused: false });
        expect(nodes.get('content')!.classes.has('karaoke-text-exiting')).toBe(true);
        expect(char().values.transform).toBe('');
        props.preciseMsRef.current = 1400;
        render({ isFocused: true });
        expect(nodes.get('content')!.classes.size).toBe(0);
        expect(char().values.transform).toBe(before);
        vi.advanceTimersByTime(300);
        expect(char().values.transform).toBe(before);
    });

    it('keeps filling an unfocused tail without taking motion back from CSS', () => {
        const { render, frame, char } = setup();
        render({ isActive: true, isFocused: true }); frame(1200);
        expect(char().values['--kf']).toBe('50');
        render({ isFocused: false }); frame(1300);
        expect(char().values['--kf']).toBe('75');
        expect(char().values.transform).toBe('');
        vi.advanceTimersByTime(250);
        expect(char().values.transform).toBe('translateY(0em)');
    });

    it('synchronizes paused forward and reverse seeks without rebuilding the line', () => {
        const { props, render, events, char } = setup();
        render({ isActive: true, isFocused: true, isPlaying: false });
        props.preciseMsRef.current = 2600;
        render({ playbackSyncKey: 1 });
        expect(Number(char(1).values['--kf'])).toBeCloseTo(200 / 3);
        props.preciseMsRef.current = 900;
        render({ playbackSyncKey: 2 });
        expect(Number(char(1).values['--kf'])).toBeLessThan(0);
        expect(Number(char().values.transform.match(/translateY\(([-\d.]+)em\)/)?.[1])).toBeCloseTo(0);
        expect(events.filter(e => e.type === 'karaoke-runtime' && e.action === 'create')).toHaveLength(1);
    });
});
