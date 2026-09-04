import { useCallback, useInsertionEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FluidSpringParams } from '@/features/player/lyrics/fluidLyricsSpring';
import { FluidLyricsSpring } from '@/features/player/lyrics/fluidLyricsSpring';
import {
    getFluidLyricsRowVisualStyle,
    type FluidLyricsRowVisualStyle,
} from '@/features/player/lyrics/fluidLyricsMotion';
import type { LyricsFrameScheduler } from '@/features/player/lyrics/lyricsFrameScheduler';
import { getLyricsDebugSink } from '@/features/player/lyrics/lyricsDebug';

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
    index: number;
    parent: RowAnimationState | null;
    detachedAt: number | null;
    detachedElement: HTMLDivElement | null;
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
    pendingVisual: FluidLyricsRowVisualStyle | null;
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
    /** Current spring window only; layout adds the target and related rows. */
    onVisibleIndicesChange: (indices: readonly number[]) => void;
    syncRevision?: number;
}

interface LatestTargets {
    modelIdentity: object;
    rowCount: number;
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

const getRowTargetY = (
    index: number,
    visualShifts: readonly number[],
    targetScrollY: number,
    parentDisplayIndexMap?: Map<number, number>,
) => {
    const parentIndex = parentDisplayIndexMap?.get(index);
    // 主行承担整组滚动；背景模型只动画组内偏移，避免两套纵向弹簧产生相位差。
    return (visualShifts[index] ?? 0) - (parentIndex === undefined
        ? targetScrollY : visualShifts[parentIndex] ?? 0);
};

const getRowY = (state: RowAnimationState) =>
    state.translateY.getPosition() + (state.parent?.translateY.getPosition() ?? 0);

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

export class FluidLyricsAnimator {
    private readonly rows = new Map<number, RowAnimationState>();
    private readonly animatingRows = new Set<number>();
    private readonly mountedRows = new Set<RowAnimationState>();
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
    private readonly spatialMembershipScratch = new Set<number>();

    constructor(frameScheduler: LyricsFrameScheduler) {
        this.frameScheduler = frameScheduler;
    }

    beginManualScroll(visualShifts: readonly number[], fallbackScrollY: number) {
        let scrollY = fallbackScrollY;
        let nearestDistance = Infinity;
        const spatial = this.spatialState;
        if (spatial) {
            this.rows.forEach((state, index) => {
                if (!state.element || state.parent) return;
                const center = spatial.itemTops[index] + getRowY(state) + (spatial.itemHeights[index] ?? 0) / 2;
                const distance = Math.abs(center - spatial.viewportHeight / 2);
                if (distance >= nearestDistance) return;
                nearestDistance = distance;
                scrollY = (visualShifts[index] ?? 0) - getRowY(state);
            });
        }
        // 手动接管只停止旧滚动的速度和待执行延迟，保留每行当前坐标与激活缩放。
        this.rows.forEach(state => {
            const y = state.translateY.getPosition();
            state.translateY.setPosition(y);
            state.targetTranslateY = y;
        });
        return scrollY;
    }

    syncModels(
        modelIdentity: object,
        rowCount: number,
        getTargetY: (index: number) => number,
        activeIndices: Set<number>,
        parentDisplayIndexMap?: Map<number, number>,
    ) {
        // 行注册会检查模型是否仍存在；正常重渲染不重复重建整组。
        if (this.modelIdentity === modelIdentity && this.rows.size === rowCount) return;
        if (this.modelIdentity !== modelIdentity) {
            this.resetRows();
            this.modelIdentity = modelIdentity;
        }

        for (let index = 0; index < rowCount; index++) {
            this.ensureModel(index, getTargetY(index), getScaleTarget(index, activeIndices, parentDisplayIndexMap));
        }
        this.rows.forEach((state, index) => {
            const parentIndex = parentDisplayIndexMap?.get(index);
            state.parent = parentIndex === undefined ? null : this.rows.get(parentIndex) ?? null;
        });
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
        const wasAttached = state.element === element;
        const wasDetached = state.detachedAt !== null;
        // React StrictMode replays layout effects without removing the DOM
        // node. Keep the submitted-style cache for that same node; a real
        // spatial re-entry always receives a different element and is synced
        // from the model below.
        const isEffectReplay = wasDetached && state.detachedElement === element && element.isConnected;
        if (state.detachedAt !== null) {
            // Detached models are advanced by the panel scheduler as well;
            // do not replay elapsed time here or a re-entry would jump ahead.
            state.detachedAt = null;
            state.detachedElement = null;
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
        this.mountedRows.add(state);
        state.scaleElement = element.querySelector<HTMLElement>('[data-fluid-lyrics-scale]');
        if (!isEffectReplay) {
            state.lastRenderedY = null;
            state.lastRenderedScale = null;
            state.lastRenderedFilter = null;
            state.lastRenderedOpacity = null;
            this.renderState(state);
            this.renderRowVisual(state, rowVisualStyle);
        }
        if (!wasAttached && !isEffectReplay) {
            getLyricsDebugSink()?.({
                type: 'row-lifecycle',
                action: 'mount',
                index,
                reason: wasDetached ? 'spatial-reentry' : 'initial-mount',
            });
        }
        if (state.translateY.isAnimating() || (state.scaleElement && state.scale.isAnimating())) {
            this.animatingRows.add(index);
            this.setScaleWillChange(state, 'transform');
            this.start();
        }

        return () => {
            if (state.element !== element) return;
            // DOM 内容可以销毁；位置、速度和目标继续保存在轻量模型中。
            state.detachedAt = performance.now();
            state.detachedElement = element;
            state.element = null;
            state.scaleElement = null;
            state.pendingVisual = null;
            this.mountedRows.delete(state);
            const debugSink = getLyricsDebugSink();
            // The strong identity is needed only during synchronous effect
            // replay. Release it even with diagnostics disabled, otherwise a
            // lightweight offscreen model retains the entire character DOM.
            queueMicrotask(() => {
                if (state.element !== null || state.detachedElement !== element) return;
                state.detachedElement = null;
                if (this.rows.get(index) === state) {
                    debugSink?.({
                        type: 'row-lifecycle',
                        action: 'unmount',
                        index,
                        reason: 'spatial-window',
                    });
                }
            });
        };
    }

    setSpatialState(
        itemTops: readonly number[],
        itemHeights: readonly number[],
        viewportHeight: number,
        fallbackVisibleIndices: readonly number[],
        onVisibleIndicesChange: (indices: readonly number[]) => void,
    ) {
        const previous = this.spatialState;
        const targetChanged = !previous || previous.fallbackVisibleIndices.length !== fallbackVisibleIndices.length ||
            previous.fallbackVisibleIndices.some((index, offset) => index !== fallbackVisibleIndices[offset]);
        if (previous && !targetChanged && previous.itemTops === itemTops &&
            previous.itemHeights === itemHeights && previous.viewportHeight === viewportHeight &&
            previous.onVisibleIndicesChange === onVisibleIndicesChange) return;
        this.spatialState = {
            itemTops,
            itemHeights,
            viewportHeight,
            fallbackVisibleIndices,
            onVisibleIndicesChange,
        };
        this.updateSpatialVisibility(targetChanged);
    }

    /**
     * Publish a hard-sync target before the browser paints the seek commit.
     * The springs themselves remain untouched, so click-seek still keeps its
     * real stagger delay and current position/velocity.
     */
    syncTargets(
        getTargetY: (index: number) => number,
        activeIndices: Set<number>,
        springParams: FluidSpringParams,
        getDelay: (index: number) => number,
        parentDisplayIndexMap?: Map<number, number>,
    ) {
        this.rows.forEach((_state, index) => {
            this.setTarget(
                index,
                getTargetY(index),
                getScaleTarget(index, activeIndices, parentDisplayIndexMap),
                springParams,
                getDelay(index),
            );
        });
    }

    setMountedTargets(
        getTargetY: (index: number) => number,
        activeIndices: Set<number>,
        springParams: FluidSpringParams,
        getDelay: (index: number) => number,
        getRowVisual: (index: number, delay: number) => FluidLyricsRowVisualStyle,
        parentDisplayIndexMap?: Map<number, number>,
    ) {
        this.prepareTargets(getTargetY, activeIndices, springParams, getDelay, getRowVisual, parentDisplayIndexMap);
        this.commitStyles();
    }

    /** Model-only phase: safe before child layout effects register new rows. */
    prepareTargets(
        getTargetY: (index: number) => number,
        activeIndices: Set<number>,
        springParams: FluidSpringParams,
        getDelay: (index: number) => number,
        getRowVisual: (index: number, delay: number) => FluidLyricsRowVisualStyle,
        parentDisplayIndexMap?: Map<number, number>,
    ) {
        this.rows.forEach((state, index) => {
            const delay = getDelay(index);
            this.setTarget(
                index,
                getTargetY(index),
                getScaleTarget(index, activeIndices, parentDisplayIndexMap),
                springParams,
                delay,
                true,
            );
            // New mounts receive their visual from register(); hidden models
            // need no retained style objects or per-frame DOM work.
            if (state.element) state.pendingVisual = getRowVisual(index, delay);
        });
    }

    commitStyles() {
        this.mountedRows.forEach(state => {
            if (state.pendingVisual) {
                this.renderRowVisual(state, state.pendingVisual);
                state.pendingVisual = null;
            }
            this.setScaleWillChange(state,
                state.translateY.isAnimating() || state.scale.isAnimating() ? 'transform' : '');
        });
    }

    setTarget(
        index: number,
        translateY: number,
        scale: number,
        springParams: FluidSpringParams,
        delay: number,
        deferStyles = false,
    ) {
        const state = this.rows.get(index);
        if (!state) return;
        state.targetTranslateY = translateY;
        state.targetScale = scale;

        if (!state.element) {
            // 尚未显示过的远端行也推进轻量模型，避免大幅跳播首次挂载时已瞬移到终点。
            // 只有 syncModels 创建新文档时，才直接初始化在目标位置。
            state.translateY.setTarget(translateY, springParams, delay);
            state.scale.setTarget(scale, SCALE_SPRING, 0);
            if (state.translateY.isAnimating() || state.scale.isAnimating()) {
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
            if (!deferStyles) this.setScaleWillChange(state, 'transform');
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
        });

        // 先推进所有模型再绘制，和声始终读取父行在本帧的位置（包括最后一帧）。
        this.mountedRows.forEach(state => {
            if (!this.animatingRows.has(state.index) &&
                !(state.parent && this.animatingRows.has(state.parent.index))) return;
            // The snapped final value passes through the same formatted-string
            // cache; an identical final transform needs no extra DOM write.
            if (state.element) this.renderState(state);
        });
        this.animatingRows.forEach(index => {
            const state = this.rows.get(index);
            if (!state) return;
            const isAnimating = state.translateY.isAnimating() || state.scale.isAnimating();
            if (!isAnimating) {
                this.animatingRows.delete(index);
                this.setScaleWillChange(state, '');
            }
        });

        this.updateSpatialVisibility();

        if (this.animatingRows.size === 0) {
            this.unsubscribeFrame?.();
            this.unsubscribeFrame = null;
        }
    };

    private setScaleWillChange(state: RowAnimationState, value: '' | 'transform') {
        const element = state.scaleElement;
        if (!element || element.style.willChange === value) return;
        element.style.willChange = value;
        // This records a hint write, NOT an actual Chromium layer allocation.
        getLyricsDebugSink()?.({
            type: 'row-layer-hint', index: state.index, value,
            reason: value === '' ? 'motion-settled' : 'motion-running',
            positionAnimating: state.translateY.isAnimating(),
            scaleAnimating: state.scale.isAnimating(),
        });
    }

    private renderState(state: RowAnimationState) {
        if (state.element) {
            const y = getRowY(state);
            const transform = `translateY(${y.toFixed(1)}px)`;
            if (state.lastRenderedY !== transform) {
                state.lastRenderedY = transform;
                state.element.style.transform = transform;
            }
        }
        if (state.scaleElement) {
            const s = state.scale.getPosition();
            const transform = `scale(${s.toFixed(3)}) translateZ(0)`;
            if (state.lastRenderedScale !== transform) {
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
            index,
            parent: null,
            detachedAt: null,
            detachedElement: null,
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
            pendingVisual: null,
        };
        this.rows.set(index, state);
        return state;
    }

    private resetRows() {
        this.unsubscribeFrame?.();
        this.unsubscribeFrame = null;
        this.rows.clear();
        this.mountedRows.clear();
        this.animatingRows.clear();
        this.spatialState = null;
        this.visibleIndices = [];
    }

    private updateSpatialVisibility(targetChanged = false) {
        const spatialState = this.spatialState;
        if (!spatialState || spatialState.viewportHeight <= 0) return;

        const minimum = -SPATIAL_OVERSCAN_PX;
        const maximum = spatialState.viewportHeight + SPATIAL_OVERSCAN_PX;
        const membership = this.spatialMembershipScratch;
        membership.clear();
        for (let index = 0; index < spatialState.itemTops.length; index++) {
            const state = this.rows.get(index);
            if (!state) continue;
            const top = spatialState.itemTops[index] + getRowY(state);
            const height = spatialState.itemHeights[index] ?? 0;
            if (top + height >= minimum && top <= maximum) membership.add(index);
        }

        const springVisibleCount = membership.size;
        // Publish only current spring visibility. Layout unions this snapshot
        // with its effective target during render, so a new target does not
        // need a layout-effect -> setState -> second commit to mount content.
        const next = this.spatialScratch;
        next.length = 0;
        // Iterating the numeric model order keeps the published collection
        // sorted without an allocation or an O(n²) `includes` scan. React is
        // notified only after the complete set is assembled.
        for (let index = 0; index < spatialState.itemTops.length; index++) {
            if (membership.has(index)) next.push(index);
        }

        const previous = this.visibleIndices;
        if (previous.length === next.length && previous.every((value, index) => value === next[index])) {
            // Layout may have skipped a spring snapshot whose union with the
            // old target was unchanged. Refresh it before painting a new target.
            if (targetChanged) spatialState.onVisibleIndicesChange(previous);
            return;
        }
        const published = [...next];
        this.visibleIndices = published;
        getLyricsDebugSink()?.({
            type: 'row-visibility',
            scope: 'spring-window',
            previousCount: previous.length,
            nextCount: published.length,
            springCount: springVisibleCount,
            targetCount: spatialState.fallbackVisibleIndices.length,
        });
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
    syncRevision = 0,
}: FluidLyricsAnimatorArgs) {
    const [animator] = useState(() => new FluidLyricsAnimator(frameScheduler));
    const latestTargetsRef = useRef<LatestTargets>({
        modelIdentity,
        rowCount,
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
            modelIdentity,
            rowCount,
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
        const targets = latestTargetsRef.current;
        animator.syncModels(
            modelIdentity,
            rowCount,
            index => getRowTargetY(index, targets.visualShifts, targets.targetScrollY, targets.parentDisplayIndexMap),
            targets.activeIndices,
            targets.parentDisplayIndexMap,
        );
        animator.prepareTargets(
            index => getRowTargetY(index, targets.visualShifts, targets.targetScrollY, targets.parentDisplayIndexMap),
            targets.activeIndices,
            targets.springParams,
            targets.getDelay,
            (index, delay) => getRowVisualStyle(
                index, targets.activeDisplayIndex, targets.activeIndices,
                targets.isUserScrolling, targets.pausedScroll, targets.variant,
                delay, targets.parentDisplayIndexMap,
            ),
            targets.parentDisplayIndexMap,
        );
    }, [activeDisplayIndex, activeIndices, animator, fallbackVisibleIndices, getDelay, isUserScrolling, itemHeights, itemTops, modelIdentity, onVisibleIndicesChange, parentDisplayIndexMap, pausedScroll, rowCount, springParams, syncRevision, targetScrollY, variant, viewportHeight, visualShifts]);
    const registerAnimatedRow = useCallback((index: number, element: HTMLDivElement) => {
        const targets = latestTargetsRef.current;
        // StrictMode 会重放 layout effect，但不会重放 insertion effect。
        // 必须先恢复完整组（含未挂载的父行），再让背景行注册并绘制局部坐标。
        animator.syncModels(
            targets.modelIdentity,
            targets.rowCount,
            index => getRowTargetY(index, targets.visualShifts, targets.targetScrollY, targets.parentDisplayIndexMap),
            targets.activeIndices,
            targets.parentDisplayIndexMap,
        );
        return animator.register(
            index,
            element,
            getRowTargetY(index, targets.visualShifts, targets.targetScrollY, targets.parentDisplayIndexMap),
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

    useLayoutEffect(() => {
        // Targets are already prepared before child registration. Submit
        // visuals once, without retargeting all springs a second time.
        animator.commitStyles();
        animator.setSpatialState(itemTops, itemHeights, viewportHeight, fallbackVisibleIndices, onVisibleIndicesChange);
    });

    useLayoutEffect(() => () => animator.dispose(), [animator]);

    const beginManualScroll = useCallback(() => {
        const targets = latestTargetsRef.current;
        return animator.beginManualScroll(targets.visualShifts, targets.targetScrollY);
    }, [animator]);

    return { registerAnimatedRow, beginManualScroll };
}
