import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DisplayItem } from '@/features/player/lyrics/types';
import { getAnimatedLyricsMotionDelays, getAnimatedLyricsSpringParams } from '@/features/player/lyrics/animatedLyricsMotion';
import { AnimatedLyricsAnimator } from '@/features/player/lyrics/useAnimatedLyricsAnimator';
import { AnimatedLyricsSpring } from '@/features/player/lyrics/animatedLyricsSpring';
import { LyricsFrameScheduler } from '@/features/player/lyrics/lyricsFrameScheduler';

const displayItems: DisplayItem[] = Array.from({ length: 5 }, (_, i) => ({
    type: 'line', lineIndex: i,
    line: { id: String(i), role: 'main', text: 'line', words: [], start_time_ms: i * 1000, end_time_ms: (i + 1) * 1000, visual_end_ms: null },
}));
const delayArgs = {
    displayItems, activeDisplayIndex: 2, isPlaying: true, isUserScrolling: false,
    itemTops: [0, 100, 200, 300, 400], itemHeights: [100, 100, 100, 100, 100],
    visualShifts: [0, 0, 0, 0, 0], targetScrollY: 150,
    parentDisplayIndexMap: new Map<number, number>(), backgroundHeights: {}, activeIndices: new Set([2]),
};

describe('geometry-based group delays', () => {
    it('uses target geometry and preserves a nonzero focus delay', () => {
        const delays = getAnimatedLyricsMotionDelays(delayArgs);
        expect(delays.slice(0, 4)).toEqual([0, 0, 0.05, 0.1]);
        expect(delays[4]).toBeCloseTo(0.1 + 0.05 / 1.05);
        expect(getAnimatedLyricsMotionDelays({ ...delayArgs, targetScrollY: 50 })[2]).toBe(0.1);
        expect(getAnimatedLyricsMotionDelays({ ...delayArgs, targetScrollY: 200 })[2]).toBe(0.05);
    });

    it('does not switch delay rules when tail compression appears or disappears', () => {
        const compressed = displayItems.map(item => item.type === 'line'
            ? { ...item, line: { ...item.line, visual_end_ms: item.line.end_time_ms! - 100 } } : item);
        expect(getAnimatedLyricsMotionDelays({ ...delayArgs, displayItems: compressed })).toEqual(getAnimatedLyricsMotionDelays(delayArgs));
    });

    it('counts an expanded background as part of its parent, not a separate step', () => {
        const args = {
            ...delayArgs, parentDisplayIndexMap: new Map([[1, 0]]), activeIndices: new Set([0, 1]),
            itemTops: [0, 100, 100, 200, 300], itemHeights: [100, 0, 100, 100, 100],
            visualShifts: [0, 0, 100, 100, 100], backgroundHeights: { 1: 100 },
        };
        expect(getAnimatedLyricsMotionDelays(args).slice(0, 3)).toEqual([0, 0, 0.05]);
        expect(getAnimatedLyricsMotionDelays({ ...args, activeIndices: new Set(), visualShifts: [0, 0, 0, 0, 0] })[2]).toBe(0);
    });

    it('does not count an interlude as another lyric group', () => {
        const items: DisplayItem[] = [...displayItems];
        items[1] = { type: 'interlude', afterLineIndex: 0, startMs: 1000, endMs: 9000 };
        expect(getAnimatedLyricsMotionDelays({ ...delayArgs, displayItems: items })[2]).toBe(0);
    });

    it('removes stagger for manual scrolling and paused playback', () => {
        expect(getAnimatedLyricsMotionDelays({ ...delayArgs, isUserScrolling: true })).toEqual([0, 0, 0, 0, 0]);
        expect(getAnimatedLyricsMotionDelays({ ...delayArgs, isPlaying: false })).toEqual([0, 0, 0, 0, 0]);
    });

    it('preserves spring values', () => {
        expect(getAnimatedLyricsSpringParams(delayArgs)).toEqual({ stiffness: 100, damping: 18, mass: 1 });
        expect(getAnimatedLyricsSpringParams({ ...delayArgs, isPlaying: false })).toEqual({ stiffness: 90, damping: 15, mass: 1 });
    });
});

describe('shared group translation', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    const setup = () => {
        let now = 0;
        let pending: FrameRequestCallback | null = null;
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pending = callback; return 1; });
        vi.stubGlobal('cancelAnimationFrame', () => { pending = null; });
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        const scheduler = new LyricsFrameScheduler();
        const animator = new AnimatedLyricsAnimator(scheduler);
        const parents = new Map([[1, 0], [2, 0]]);
        const active = new Set([0, 1, 2]);
        const params = { stiffness: 100, damping: 18, mass: 1 };
        const visual = { filter: 'none', opacity: '1' };
        animator.syncModels({}, 3, () => 0, active, parents);
        // DOM double: the animator only needs style and the optional scale-layer lookup.
        const element = () => ({ style: {}, querySelector: () => null }) as unknown as HTMLDivElement;
        const nodes = [element(), element(), element()];
        const mount = (index: number, target = 0) => animator.register(index, nodes[index], target, 1, params, 0.05, visual);
        const move = (target: number, offset = 0) => animator.setMountedTargets(
            index => index === 0 ? target : index === 2 ? offset : 0,
            active, params, () => 0.05, () => visual, parents,
        );
        const frame = (ms: number) => {
            now += ms;
            const callback = pending;
            pending = null;
            callback?.(now);
        };
        const y = (index: number) => Number(nodes[index].style.transform.match(/translateY\(([-\d.]+)px\)/)?.[1]);
        return { animator, params, nodes, mount, move, frame, y };
    };

    it('moves children with the parent in the same frame, without advancing the shared motion twice', () => {
        const { params, mount, move, frame, y } = setup();
        mount(0); mount(1); mount(2);
        move(-100);
        frame(40);
        expect(y(0)).toBe(0);
        frame(60);
        const reference = new AnimatedLyricsSpring(0, params);
        reference.setTarget(-100, params, 0.05);
        reference.advance(0.1);
        expect(y(0)).toBeCloseTo(reference.getPosition(), 1);
        expect(y(1)).toBe(y(0));
        expect(y(2)).toBe(y(0));
        frame(2000);
        expect(y(1)).toBe(-100);
    });

    it('continues the shared translation when only a background row is mounted', () => {
        const { mount, move, frame, y } = setup();
        mount(1);
        move(-100);
        frame(150);
        expect(y(1)).toBeLessThan(0);
        expect(y(1)).toBeGreaterThan(-100);
        mount(0, -100);
        expect(y(0)).toBe(y(1));
    });

    it('retains parent motion across unmount and child remount', () => {
        const { mount, move, frame, y } = setup();
        const unmountParent = mount(0);
        const unmountChild = mount(1);
        move(-100);
        frame(100);
        unmountParent(); unmountChild();
        frame(100);
        mount(1);
        mount(0, -100);
        expect(y(1)).toBe(y(0));
        expect(y(1)).toBeLessThan(-20);
    });

    it('keeps group history when an unseen parent is retargeted with its children detached', () => {
        const { mount, move, frame, y } = setup();
        const unmountChild = mount(1);
        move(-100);
        frame(100);
        unmountChild();
        move(-200);
        frame(100);
        mount(1);
        expect(y(1)).toBeLessThan(-20);
        expect(y(1)).toBeGreaterThan(-200);
    });

    it('preserves local background spacing and animates a large group retarget', () => {
        const { mount, move, frame, y } = setup();
        mount(0); mount(1); mount(2);
        move(-100, 40);
        frame(2000);
        expect(y(0)).toBe(-100);
        expect(y(1)).toBe(-100);
        expect(y(2)).toBe(-60);
        move(-500, 60);
        expect(y(0)).toBe(-100);
        expect(y(2)).toBe(-60);
        frame(2000);
        expect(y(0)).toBe(-500);
        expect(y(1)).toBe(-500);
        expect(y(2)).toBe(-440);
    });

    it('keeps never-mounted distant rows in motion before their first appearance', () => {
        const { animator, params, mount, frame, y } = setup();
        animator.syncModels({}, 3, () => 0, new Set([0]));
        mount(0);
        animator.setMountedTargets(() => -800, new Set([2]), params, () => 0.05, () => ({ filter: 'none', opacity: '1' }));
        frame(150);
        mount(2, -800);
        expect(y(2)).toBeLessThan(0);
        expect(y(2)).toBeGreaterThan(-800);
        expect(y(2)).toBe(y(0));
    });

    it('does not restart a pending delay when the same layout is resubmitted', () => {
        const { mount, move, frame, y } = setup();
        mount(0); mount(1);
        move(-100);
        frame(40);
        move(-100);
        frame(20);
        expect(y(0)).toBeLessThan(0);
        expect(y(1)).toBe(y(0));
    });

    it('preserves spring velocity and delay when measured layout retargets an ongoing line change', () => {
        const { params, mount, move, frame, y } = setup();
        mount(0); mount(1);
        const reference = new AnimatedLyricsSpring(0, params);
        move(-100);
        reference.setTarget(-100, params, 0.05);
        frame(100);
        reference.advance(0.1);
        const before = y(0);

        // A newly mounted row's real height adjusts the ongoing scroll target.
        move(-120);
        reference.setTarget(-120, params, 0.05);
        expect(y(0)).toBe(before);
        frame(20);
        reference.advance(0.02);
        expect(y(0)).toBeCloseTo(reference.getPosition(), 1);
        expect(y(0)).toBeLessThan(before);
        expect(y(0)).toBeGreaterThan(-100);
        expect(y(1)).toBe(y(0));
        frame(80);
        reference.advance(0.08);
        expect(y(0)).toBeCloseTo(reference.getPosition(), 1);
        frame(2000);
        expect(y(0)).toBe(-120);
    });

    it('clears group relationships on a document change', () => {
        const { animator, mount, move, frame, y } = setup();
        mount(0); mount(1);
        move(-100); frame(100);
        animator.syncModels({}, 2, () => 0, new Set([0]));
        mount(0); mount(1);
        move(-100);
        frame(2000);
        expect(y(0)).toBe(-100);
        expect(y(1)).toBe(0);
    });

    it.each([-60, 60])('starts a manual delta %s from the visible position rather than the auto-scroll destination', delta => {
        const { animator, params, mount, move, frame, y } = setup();
        mount(0); mount(1);
        animator.setSpatialState([300, 400, 400], [100, 0, 0], 600, [0, 1], () => {});
        move(-800);
        frame(150);
        const before = y(0);
        const scrollY = animator.beginManualScroll([0, 0, 0], 800);
        // itemTops belongs to normal document flow, not the row's translation.
        expect(scrollY).toBeCloseTo(-before, 1);
        expect(y(0)).toBe(before);
        animator.setMountedTargets(
            index => index === 0 ? -(scrollY + delta) : 0,
            new Set([0, 1]), params, () => 0, () => ({ filter: 'none', opacity: '1' }), new Map([[1, 0], [2, 0]]),
        );
        frame(50);
        if (delta < 0) expect(y(0)).toBeGreaterThan(before);
        else expect(y(0)).toBeLessThan(before);
        expect(y(1)).toBe(y(0));
    });

    it('cancels pending auto-scroll delays when manual scrolling takes over', () => {
        const { animator, mount, move, frame, y } = setup();
        mount(0);
        animator.setSpatialState([300, 400, 400], [100, 0, 0], 600, [0], () => {});
        move(-800);
        frame(20);
        expect(animator.beginManualScroll([0, 0, 0], 800)).toBe(0);
        frame(1000);
        expect(y(0)).toBe(0);
    });
});
