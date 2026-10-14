import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimatedLyricsAnimator } from '@/features/player/lyrics/useAnimatedLyricsAnimator';
import { LyricsFrameScheduler } from '@/features/player/lyrics/lyricsFrameScheduler';
import type { LyricsDebugEvent } from '@/features/player/lyrics/lyricsDebug';

const params = { stiffness: 100, damping: 18, mass: 1 };
const visual = { filter: 'none', opacity: '1' };

describe('animated row DOM lifetime and style submission', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    const setup = () => {
        let now = 0;
        let pending: FrameRequestCallback | undefined;
        const microtasks: Array<() => void> = [];
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pending = callback; return 1; });
        vi.stubGlobal('cancelAnimationFrame', () => { pending = undefined; });
        vi.stubGlobal('queueMicrotask', (callback: () => void) => microtasks.push(callback));
        const animator = new AnimatedLyricsAnimator(new LyricsFrameScheduler());
        const identity = {};
        animator.syncModels(identity, 1, () => 0, new Set([0]));
        const writes: Array<{ layer: string; property: string; value: unknown }> = [];
        const style = (layer: string) => new Proxy({ transform: '', filter: '', opacity: '', willChange: '' }, {
            set(target, property, value) {
                writes.push({ layer, property: String(property), value });
                return Reflect.set(target, property, value);
            },
        });
        const createNode = () => {
            const scale = { style: style('scale') };
            return { style: style('row'), isConnected: true, querySelector: () => scale } as unknown as HTMLDivElement;
        };
        const node = createNode();
        const mount = (element = node, target = 0) => animator.register(0, element, target, 1, params, 0.05, visual);
        const flush = () => { while (microtasks.length) microtasks.shift()!(); };
        const frame = (ms: number) => {
            now += ms;
            const callback = pending;
            pending = undefined;
            callback?.(now);
        };
        return { animator, node, mount, flush, frame, writes, createNode };
    };

    it('prepares multiple target updates without touching DOM, then commits the final visual once', () => {
        const { animator, mount, writes, frame, node } = setup();
        mount();
        writes.length = 0;
        const targetVisual = { filter: 'blur(2.00px)', opacity: '0.5' };
        animator.prepareTargets(() => -200, new Set([0]), params, () => 0.05, () => visual);
        animator.prepareTargets(() => -200, new Set([0]), params, () => 0.05, () => targetVisual);
        expect(writes).toHaveLength(0);
        animator.commitStyles();
        expect(writes.filter(write => write.property === 'filter').map(write => write.value)).toEqual(['blur(2.00px)']);
        const count = writes.length;
        animator.commitStyles();
        expect(writes).toHaveLength(count);
        frame(40);
        expect(node.style.transform).toBe('translateY(0.0px)');
        frame(30);
        expect(node.style.transform).not.toBe('translateY(0.0px)');
    });

    it('preserves submitted styles during synchronous same-node effect replay', () => {
        const { mount, flush, writes } = setup();
        const unmount = mount();
        const count = writes.length;
        unmount();
        mount();
        flush();
        expect(writes).toHaveLength(count);
    });

    it('releases the replay identity after the microtask even without a debug sink', () => {
        const { mount, flush, writes } = setup();
        mount()();
        flush();
        writes.length = 0;
        // The old identity has expired: even this same connected node must now
        // receive a complete synchronization instead of being treated as replay.
        mount();
        expect(writes.map(write => write.property)).toEqual(['transform', 'transform', 'filter', 'opacity']);
    });

    it('synchronizes a real remount from the still-advancing spring, not its destination', () => {
        const { animator, node, mount, flush, frame, createNode } = setup();
        const unmount = mount();
        animator.setTarget(0, -300, 1, params, 0.05);
        frame(100);
        const before = node.style.transform;
        unmount();
        flush();
        frame(100);
        const replacement = createNode();
        mount(replacement, -300);
        expect(replacement.style.transform).not.toBe(before);
        const y = Number(replacement.style.transform.match(/translateY\(([-\d.]+)px\)/)?.[1]);
        expect(y).toBeGreaterThan(-300);
        expect(y).toBeLessThan(0);
    });

    it('does not let an older cleanup clear a newer mount or double-count its unmount', () => {
        const { mount, flush, createNode } = setup();
        const events: LyricsDebugEvent[] = [];
        vi.stubGlobal('__SIMPLE_PLAYER_LYRICS_DEBUG__', (event: LyricsDebugEvent) => events.push(event));
        mount()();
        const unmount = mount(createNode());
        flush();
        expect(events.filter(event => event.type === 'row-lifecycle' && event.action === 'unmount')).toHaveLength(0);
        unmount();
        flush();
        expect(events.filter(event => event.type === 'row-lifecycle' && event.action === 'unmount')).toHaveLength(1);
    });

    it('writes the motion hint once per run and does not rewrite unchanged final transforms', () => {
        const { animator, mount, frame, writes } = setup();
        mount();
        writes.length = 0;
        animator.setTarget(0, -100, 1, params, 0.05);
        animator.setTarget(0, -100, 1, params, 0.05);
        frame(40);
        animator.setTarget(0, -100, 1, params, 0.05);
        expect(writes.filter(write => write.property === 'willChange').map(write => write.value)).toEqual(['transform']);
        frame(3000);
        expect(writes.filter(write => write.property === 'willChange').map(write => write.value)).toEqual(['transform', '']);
        expect(writes.filter(write => write.layer === 'scale' && write.property === 'transform')).toHaveLength(0);
        const count = writes.length;
        animator.setMountedTargets(() => -100, new Set([0]), params, () => 0.05, () => visual);
        frame(16);
        expect(writes).toHaveLength(count);
    });

    it('refreshes the same spring snapshot on a target change, without adding target indices', () => {
        const { animator } = setup();
        animator.syncModels({}, 20, () => 0, new Set([0]));
        const publish = vi.fn();
        const tops = Array.from({ length: 20 }, (_, index) => index * 100);
        const heights = tops.map(() => 100);
        animator.setSpatialState(tops, heights, 600, [0, 1], publish);
        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish.mock.calls[0][0]).not.toContain(19);
        animator.setSpatialState(tops, heights, 600, [18, 19], publish);
        expect(publish).toHaveBeenCalledTimes(2);
        expect(publish.mock.calls[1][0]).toBe(publish.mock.calls[0][0]);
        animator.setSpatialState(tops, heights, 600, [18, 19], publish);
        expect(publish).toHaveBeenCalledTimes(2);
    });
});
