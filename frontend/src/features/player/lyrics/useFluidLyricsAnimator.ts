import { useCallback, useInsertionEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FluidSpringParams } from '@/features/player/lyrics/fluidLyricsSpring';
import { FluidLyricsSpring } from '@/features/player/lyrics/fluidLyricsSpring';
import {
    getFluidLyricsRowVisualStyle,
    type FluidLyricsRowVisualStyle,
} from '@/features/player/lyrics/fluidLyricsMotion';
import type { LyricsFrameScheduler } from '@/features/player/lyrics/lyricsFrameScheduler';

const SCALE_SPRING: FluidSpringParams = {
    stiffness: 100,
    damping: 25,
    mass: 2,
    restDelta: 0.0001,
    restSpeed: 0.001,
};

const ACTIVE_SCALE = 1;
const INACTIVE_SCALE = 0.98;
const SPATIAL_OVERSCAN_PX = 300;

interface RowAnimationState {
    detachedAt: number | null;
    element: HTMLDivElement | null;
    scaleElement: HTMLElement | null;
    translateY: FluidLyricsSpring;
    scale: FluidLyricsSpring;
    targetTranslateY: number;
    targetScale: number;
    lastRenderedY: string | null;
    lastRenderedScale: string | null;
    lastRenderedFilter: string | null;
    lastRenderedOpacity: string | null;
}

interface FluidLyricsAnimatorArgs {
    activeDisplayIndex: number;
    activeIndices: Set<number>;
    getDelay: (displayIndex: number) => number;
    modelIdentity: object;
    rowCount: number;
    springParams: FluidSpringParams;
    targetScrollY: number;
    visualShifts: number[];
    isUserScrolling: boolean;
    pausedScroll: boolean;
    variant: 'side' | 'narrow';
    parentDisplayIndexMap?: Map<number, number>;
    frameScheduler: LyricsFrameScheduler;
    itemTops: readonly number[];
    itemHeights: readonly number[];
    viewportHeight: number;
    fallbackVisibleIndices: readonly number[];
    onVisibleIndicesChange: (indices: readonly number[]) => void;
    syncRevision: number;
}

interface LatestTargets {
    activeDisplayIndex: number;
    activeIndices: Set<number>;
    getDelay: (displayIndex: number) => number;
    springParams: FluidSpringParams;
    targetScrollY: number;
    visualShifts: number[];
    isUserScrolling: boolean;
    pausedScroll: boolean;
    variant: 'side' | 'narrow';
    parentDisplayIndexMap?: Map<number, number>;
    itemTops: readonly number[];
    itemHeights: readonly number[];
    viewportHeight: number;
    fallbackVisibleIndices: readonly number[];
    onVisibleIndicesChange: (indices: readonly number[]) => void;
}

const getEffectiveIndex = (index: number, parentDisplayIndexMap?: Map<number, number>) =>
    parentDisplayIndexMap?.get(index) ?? index;

// 激活行判定与 getRowVisualStyle 一致：activeIndices 含重叠双亮的非焦点行，
// 使重叠时两行都放大到 ACTIVE_SCALE，而不是只有焦点行放大
const getScaleTarget = (
    index: number,
    activeIndices: Set<number>,
    parentDisplayIndexMap?: Map<number, number>,
) => (activeIndices.has(getEffectiveIndex(index, parentDisplayIndexMap)) ? ACTIVE_SCALE : INACTIVE_SCALE);

export const getRowVisualStyle = (
    index: number,
    activeDisplayIndex: number,
    activeIndices: Set<number>,
    isUserScrolling: boolean,
    pausedScroll: boolean,
    variant: 'side' | 'narrow',
    _delay: number,
    parentDisplayIndexMap?: Map<number, number>,
): FluidLyricsRowVisualStyle => {
    const effectiveIndex = getEffectiveIndex(index, parentDisplayIndexMap);
    // 激活行含重叠双亮的非焦点行：在 activeIndices 中的行不模糊、不透明减淡
    const isActive = activeIndices.has(effectiveIndex);
    const distance = activeDisplayIndex >= 0 ? Math.abs(activeDisplayIndex - effectiveIndex) : 0;
    return getFluidLyricsRowVisualStyle({
        distanceFromActive: distance,
        isActive,
        isUserScrolling,
        pausedScroll,
        variant,
    });
};

class FluidLyricsAnimator {
    private readonly rows = new Map<number, RowAnimationState>();
    private readonly animatingRows = new Set<number>();
    private modelIdentity: object | null = null;
    private readonly frameScheduler: LyricsFrameScheduler;
    private unsubscribeFrame: (() => void) | null = null;
    private spatialState: {
        itemTops: readonly number[];
        itemHeights: readonly number[];
        viewportHeight: number;
        fallbackVisibleIndices: readonly number[];
        onVisibleIndicesChange: (indices: readonly number[]) => void;
    } | null = null;
    private visibleIndices: readonly number[] = [];
    private readonly spatialScratch: number[] = [];

    constructor(frameScheduler: LyricsFrameScheduler) {
        this.frameScheduler = frameScheduler;
    }

    syncModels(
        modelIdentity: object,
        rowCount: number,
        getTargetY: (index: number) => number,
        activeIndices: Set<number>,
        parentDisplayIndexMap?: Map<number, number>,
    ) {
        if (this.modelIdentity !== modelIdentity) {
            this.resetRows();
            this.modelIdentity = modelIdentity;
        }

        for (let index = 0; index < rowCount; index++) {
            this.ensureModel(index, getTargetY(index), getScaleTarget(index, activeIndices, parentDisplayIndexMap));
        }
        this.rows.forEach((_state, index) => {
            if (index < rowCount) return;
            this.rows.delete(index);
            this.animatingRows.delete(index);
        });
    }

    register(
        index: number,
        element: HTMLDivElement,
        targetY: number,
        targetScale: number,
        springParams: FluidSpringParams,
        delay: number,
        rowVisualStyle: FluidLyricsRowVisualStyle,
    ) {
        const state = this.ensureModel(index, targetY, targetScale);
        if (state.detachedAt !== null) {
            // Detached models are advanced by the panel scheduler as well;
            // do not replay elapsed time here or a re-entry would jump ahead.
            state.detachedAt = null;
        }
        // A row may have received a new target while its DOM was detached.
        // Keep its spring position/velocity and continue from that model state
        // instead of snapping to the new target on re-entry.
        if (state.targetTranslateY !== targetY) {
            state.translateY.setTarget(targetY, springParams, delay);
            state.targetTranslateY = targetY;
        }
        if (state.targetScale !== targetScale) {
            state.scale.setTarget(targetScale, SCALE_SPRING, 0);
            state.targetScale = targetScale;
        }
        state.element = element;
        state.scaleElement = element.querySelector<HTMLElement>('[data-fluid-lyrics-scale]');
        state.lastRenderedY = null;
        state.lastRenderedScale = null;
        state.lastRenderedFilter = null;
        state.lastRenderedOpacity = null;
        this.renderState(state);
        this.renderRowVisual(state, rowVisualStyle);
        if (state.translateY.isAnimating() || (state.scaleElement && state.scale.isAnimating())) {
            this.animatingRows.add(index);
            if (state.scaleElement) state.scaleElement.style.willChange = 'transform';
            this.start();
        }

        return () => {
            if (state.element !== element) return;
            // DOM 内容可以销毁；位置、速度和目标继续保存在轻量模型中。
            state.detachedAt = performance.now();
            state.element = null;
            state.scaleElement = null;
        };
    }

    setSpatialState(
        itemTops: readonly number[],
        itemHeights: readonly number[],
        viewportHeight: number,
        fallbackVisibleIndices: readonly number[],
        onVisibleIndicesChange: (indices: readonly number[]) => void,
    ) {
        this.spatialState = {
            itemTops,
            itemHeights,
            viewportHeight,
            fallbackVisibleIndices,
            onVisibleIndicesChange,
        };
        this.updateSpatialVisibility();
    }

    setMountedTargets(
        getTargetY: (index: number) => number,
        activeIndices: Set<number>,
        springParams: FluidSpringParams,
        getDelay: (index: number) => number,
        getRowVisual: (index: number, delay: number) => FluidLyricsRowVisualStyle,
        parentDisplayIndexMap?: Map<number, number>,
        forcePosition = false,
    ) {
        this.rows.forEach((_state, index) => {
            const delay = getDelay(index);
            this.setTarget(
                index,
                getTargetY(index),
                getScaleTarget(index, activeIndices, parentDisplayIndexMap),
                springParams,
                delay,
                forcePosition,
            );
            const state = this.rows.get(index);
            if (state?.element) this.renderRowVisual(state, getRowVisual(index, delay));
        });
    }

    setTarget(
        index: number,
        translateY: number,
        scale: number,
        springParams: FluidSpringParams,
        delay: number,
        forcePosition = false,
    ) {
        const state = this.rows.get(index);
        if (!state) return;
        state.targetTranslateY = translateY;
        state.targetScale = scale;

        if (forcePosition) {
            state.translateY.setPosition(translateY);
            state.scale.setPosition(scale);
            state.detachedAt = state.element ? null : state.detachedAt;
            this.animatingRows.delete(index);
            if (state.scaleElement) state.scaleElement.style.willChange = '';
            // A seek is a synchronous relocation: do not leave a mounted row
            // displaying its pre-seek transform until a motion frame arrives.
            if (state.element) this.renderState(state, true);
            return;
        }

        if (!state.element) {
            // Models created before their first mount start at the target.
            // Detached models retain a pending delayed spring and are advanced
            // from detachedAt when their DOM re-enters the spatial window.
            if (state.detachedAt === null) {
                state.translateY.setPosition(translateY);
                state.scale.setPosition(scale);
            } else {
                state.translateY.setTarget(translateY, springParams, delay);
                state.scale.setTarget(scale, SCALE_SPRING, 0);
            }
            if (state.detachedAt !== null && (state.translateY.isAnimating() || state.scale.isAnimating())) {
                this.animatingRows.add(index);
                this.start();
            } else {
                this.animatingRows.delete(index);
            }
            return;
        }

        state.translateY.setTarget(translateY, springParams, delay);
        // scale 是激活状态响应，不应受滚动牵拉延迟影响（重叠时 B 激活应立即放大，
        // 与性能优先模式 CSS 无延迟一致）；否则要等 getDelay 耗尽才开始放大
        if (state.scaleElement) state.scale.setTarget(scale, SCALE_SPRING, 0);
        else state.scale.setPosition(scale);
        if (state.translateY.isAnimating() || (state.scaleElement && state.scale.isAnimating())) {
            this.animatingRows.add(index);
            if (state.scaleElement) state.scaleElement.style.willChange = 'transform';
            this.start();
        }
    }

    dispose() {
        this.resetRows();
        this.modelIdentity = null;
    }

    private start() {
        if (this.unsubscribeFrame !== null) return;
        this.unsubscribeFrame = this.frameScheduler.subscribe('motion', this.update);
    }

    private readonly update = (_time: number, deltaMs: number) => {
        const deltaSeconds = Math.max(0, deltaMs) / 1000;

        this.animatingRows.forEach(index => {
            const state = this.rows.get(index);
            if (!state) {
                this.animatingRows.delete(index);
                return;
            }
            state.translateY.advance(deltaSeconds);
            state.scale.advance(deltaSeconds);
            const isAnimating = state.translateY.isAnimating() || state.scale.isAnimating();
            // 阈值去重可能跳过弹簧尾部的微小变化；停止帧强制提交一次，
            // 保证 DOM transform 与已经吸附到目标值的弹簧模型完全一致。
            if (state.element) this.renderState(state, !isAnimating);
            if (!isAnimating) {
                this.animatingRows.delete(index);
                if (state.scaleElement) state.scaleElement.style.willChange = '';
            }
        });

        this.updateSpatialVisibility();

        if (this.animatingRows.size === 0) {
            this.unsubscribeFrame?.();
            this.unsubscribeFrame = null;
        }
    };

    private renderState(state: RowAnimationState, force = false) {
        if (state.element) {
            const y = state.translateY.getPosition();
            const transform = `translateY(${y.toFixed(1)}px)`;
            if (force || state.lastRenderedY !== transform) {
                state.lastRenderedY = transform;
                state.element.style.transform = transform;
            }
        }
        if (state.scaleElement) {
            const s = state.scale.getPosition();
            const transform = `scale(${s.toFixed(3)}) translateZ(0)`;
            if (force || state.lastRenderedScale !== transform) {
                state.lastRenderedScale = transform;
                state.scaleElement.style.transform = transform;
            }
        }
    }

    private renderRowVisual(state: RowAnimationState, style: FluidLyricsRowVisualStyle) {
        const element = state.element;
        if (!element) return;
        if (state.lastRenderedFilter !== style.filter) {
            element.style.filter = style.filter;
            state.lastRenderedFilter = style.filter;
        }
        if (state.lastRenderedOpacity !== style.opacity) {
            element.style.opacity = style.opacity;
            state.lastRenderedOpacity = style.opacity;
        }
    }

    private ensureModel(index: number, targetY: number, targetScale: number) {
        const current = this.rows.get(index);
        if (current) return current;

        const state: RowAnimationState = {
            detachedAt: null,
            element: null,
            scaleElement: null,
            translateY: new FluidLyricsSpring(targetY, { stiffness: 90, damping: 15, mass: 1 }),
            scale: new FluidLyricsSpring(targetScale, SCALE_SPRING),
            targetTranslateY: targetY,
            targetScale,
            lastRenderedY: null,
            lastRenderedScale: null,
            lastRenderedFilter: null,
            lastRenderedOpacity: null,
        };
        this.rows.set(index, state);
        return state;
    }

    private resetRows() {
        this.unsubscribeFrame?.();
        this.unsubscribeFrame = null;
        this.rows.clear();
        this.animatingRows.clear();
        this.spatialState = null;
        this.visibleIndices = [];
    }

    private updateSpatialVisibility() {
        const spatialState = this.spatialState;
        if (!spatialState || spatialState.viewportHeight <= 0) return;

        const minimum = -SPATIAL_OVERSCAN_PX;
        const maximum = spatialState.viewportHeight + SPATIAL_OVERSCAN_PX;
        const next = this.spatialScratch;
        next.length = 0;
        for (let index = 0; index < spatialState.itemTops.length; index++) {
            const state = this.rows.get(index);
            if (!state) continue;
            const top = spatialState.itemTops[index] + state.translateY.getPosition();
            const height = spatialState.itemHeights[index] ?? 0;
            if (top + height >= minimum && top <= maximum) next.push(index);
        }

        // Mount the target window together with the current spring window.
        // The target window contains the next lyric before its start time;
        // waiting for its spring position to enter the viewport would otherwise
        // make the line appear only after playback has already begun. Once the
        // spring settles the two windows converge, so this does not retain the
        // whole document or change any animation value.
        spatialState.fallbackVisibleIndices.forEach(index => {
            if (
                index < 0 ||
                index >= spatialState.itemTops.length ||
                next.includes(index)
            ) return;
            next.push(index);
        });
        next.sort((left, right) => left - right);

        const previous = this.visibleIndices;
        if (previous.length === next.length && previous.every((value, index) => value === next[index])) return;
        const published = [...next];
        this.visibleIndices = published;
        spatialState.onVisibleIndicesChange(published);
    }
}

export function useFluidLyricsAnimator({
    activeDisplayIndex,
    activeIndices,
    getDelay,
    modelIdentity,
    rowCount,
    springParams,
    targetScrollY,
    visualShifts,
    isUserScrolling,
    pausedScroll,
    variant,
    parentDisplayIndexMap,
    frameScheduler,
    itemTops,
    itemHeights,
    viewportHeight,
    fallbackVisibleIndices,
    onVisibleIndicesChange,
    syncRevision,
}: FluidLyricsAnimatorArgs) {
    const [animator] = useState(() => new FluidLyricsAnimator(frameScheduler));
    const latestTargetsRef = useRef<LatestTargets>({
        activeDisplayIndex,
        activeIndices,
        getDelay,
        springParams,
        targetScrollY,
        visualShifts,
        isUserScrolling,
        pausedScroll,
        variant,
        parentDisplayIndexMap,
        itemTops,
        itemHeights,
        viewportHeight,
        fallbackVisibleIndices,
        onVisibleIndicesChange,
    });
    useInsertionEffect(() => {
        latestTargetsRef.current = {
            activeDisplayIndex,
            activeIndices,
            getDelay,
            springParams,
            targetScrollY,
            visualShifts,
            isUserScrolling,
            pausedScroll,
            variant,
            parentDisplayIndexMap,
            itemTops,
            itemHeights,
            viewportHeight,
            fallbackVisibleIndices,
            onVisibleIndicesChange,
        };
    }, [activeDisplayIndex, activeIndices, fallbackVisibleIndices, getDelay, isUserScrolling, itemHeights, itemTops, onVisibleIndicesChange, parentDisplayIndexMap, pausedScroll, springParams, targetScrollY, variant, viewportHeight, visualShifts]);
    useInsertionEffect(() => {
        const targets = latestTargetsRef.current;
        animator.syncModels(
            modelIdentity,
            rowCount,
            index => (targets.visualShifts[index] ?? 0) - targets.targetScrollY,
            targets.activeIndices,
            targets.parentDisplayIndexMap,
        );
    }, [animator, modelIdentity, rowCount]);
    const registerAnimatedRow = useCallback((index: number, element: HTMLDivElement) => {
        const targets = latestTargetsRef.current;
        return animator.register(
            index,
            element,
            (targets.visualShifts[index] ?? 0) - targets.targetScrollY,
            getScaleTarget(index, targets.activeIndices, targets.parentDisplayIndexMap),
            targets.springParams,
            targets.getDelay(index),
            getRowVisualStyle(
                index,
                targets.activeDisplayIndex,
                targets.activeIndices,
                targets.isUserScrolling,
                targets.pausedScroll,
                targets.variant,
                targets.getDelay(index),
                targets.parentDisplayIndexMap,
            ),
        );
    }, [animator]);

    const previousTargetScrollRef = useRef(targetScrollY);
    const previousSyncRevisionRef = useRef(syncRevision);

    useLayoutEffect(() => {
        const targetJump = Math.abs(targetScrollY - previousTargetScrollRef.current);
        const didSync = previousSyncRevisionRef.current !== syncRevision;
        previousTargetScrollRef.current = targetScrollY;
        previousSyncRevisionRef.current = syncRevision;
        const forcePosition = didSync && targetJump > SPATIAL_OVERSCAN_PX;
        animator.setMountedTargets(
            index => (visualShifts[index] ?? 0) - targetScrollY,
            activeIndices,
            springParams,
            getDelay,
            (index, delay) => getRowVisualStyle(
                index,
                activeDisplayIndex,
                activeIndices,
                isUserScrolling,
                pausedScroll,
                variant,
                delay,
                parentDisplayIndexMap,
            ),
            parentDisplayIndexMap,
            forcePosition,
        );
        animator.setSpatialState(itemTops, itemHeights, viewportHeight, fallbackVisibleIndices, onVisibleIndicesChange);
    }, [activeDisplayIndex, activeIndices, animator, fallbackVisibleIndices, getDelay, isUserScrolling, itemHeights, itemTops, onVisibleIndicesChange, parentDisplayIndexMap, pausedScroll, springParams, syncRevision, targetScrollY, variant, viewportHeight, visualShifts]);

    useLayoutEffect(() => () => animator.dispose(), [animator]);

    return registerAnimatedRow;
}
