import { useCallback, useInsertionEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FluidSpringParams } from '@/features/player/lyrics/fluidLyricsSpring';
import { FluidLyricsSpring } from '@/features/player/lyrics/fluidLyricsSpring';
import {
    getFluidLyricsRowVisualStyle,
    isFluidLyricsRowSpatiallyVisible,
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
    element: HTMLDivElement | null;
    scaleElement: HTMLElement | null;
    translateY: FluidLyricsSpring;
    scale: FluidLyricsSpring;
    layoutTop: number;
    height: number;
    targetY: number;
    targetScale: number;
    delay: number;
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
    itemHeights: number[];
    itemTops: number[];
    onVisibleIndicesChange: (indices: readonly number[]) => void;
    preserveMotionOnSync: boolean;
    suppressRowDelay: boolean;
    syncRevision: number;
    viewportHeight: number;
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
    private readonly frameScheduler: LyricsFrameScheduler;
    private modelIdentity: object | null = null;
    private unsubscribeFrame: (() => void) | null = null;
    private lastSyncRevision: number | null = null;
    private onVisibleIndicesChange: ((indices: readonly number[]) => void) | null = null;
    private viewportHeight = 0;
    private rowCount = 0;
    private spatialVisibility = new Uint8Array(0);

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

        if (this.rowCount !== rowCount) {
            this.rowCount = rowCount;
            this.spatialVisibility = new Uint8Array(rowCount);
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

    setSpatialViewport(
        itemTops: readonly number[],
        itemHeights: readonly number[],
        viewportHeight: number,
        onVisibleIndicesChange: (indices: readonly number[]) => void,
    ) {
        this.viewportHeight = viewportHeight;
        this.onVisibleIndicesChange = onVisibleIndicesChange;
        this.rows.forEach((state, index) => {
            state.layoutTop = itemTops[index] ?? 0;
            state.height = itemHeights[index] ?? 0;
        });
        this.publishSpatialVisibility();
    }

    register(
        index: number,
        element: HTMLDivElement,
        targetY: number,
        targetScale: number,
        rowVisualStyle: FluidLyricsRowVisualStyle,
    ) {
        const state = this.ensureModel(index, targetY, targetScale);
        state.element = element;
        state.scaleElement = element.querySelector<HTMLElement>('[data-fluid-lyrics-scale]');
        state.lastRenderedY = null;
        state.lastRenderedScale = null;
        state.lastRenderedFilter = null;
        state.lastRenderedOpacity = null;
        element.style.willChange = 'transform';
        // 与 AMLL 的 lyricLineWrapper 一致：已进入 overscan 的行在整个挂载期
        // 保持稳定合成表面，避免进入真实视口时集中 Layerize 或重新栅格化。
        if (state.scaleElement) state.scaleElement.style.willChange = 'transform';
        // 先提交 filter/opacity，再提交 scale/translate，保证点击跳转时
        // 视觉目标与位置目标在同一批 DOM 写入中建立。
        this.renderRowVisual(state, rowVisualStyle);
        this.renderState(state);
        if (state.translateY.isAnimating() || state.scale.isAnimating()) {
            this.animatingRows.add(index);
            if (state.scaleElement) state.scaleElement.style.willChange = 'transform';
            this.start();
        }

        return () => {
            if (state.element !== element) return;
            // DOM 内容可以销毁；位置、速度和目标继续保存在轻量模型中。
            state.element = null;
            state.scaleElement = null;
        };
    }

    setMountedTargets(
        getTargetY: (index: number) => number,
        activeIndices: Set<number>,
        springParams: FluidSpringParams,
        getDelay: (index: number) => number,
        getRowVisual: (index: number) => FluidLyricsRowVisualStyle,
        suppressRowDelay: boolean,
        parentDisplayIndexMap?: Map<number, number>,
    ) {
        // 布局提交会更新所有 lyric group，而不仅是当前 DOM 中的行。
        // 未挂载行只更新轻量弹簧模型，不触发任何 DOM 写入；这样它们重新进入
        // overscan 区域时可以接续真实运动，而不是从新目标位置瞬移。
        this.rows.forEach((_state, index) => {
            const delay = suppressRowDelay ? 0 : getDelay(index);
            const state = this.rows.get(index);
            if (state?.element) {
                this.renderRowVisual(state, getRowVisual(index));
            }
            this.setTarget(
                index,
                getTargetY(index),
                getScaleTarget(index, activeIndices, parentDisplayIndexMap),
                springParams,
                delay,
            );
        });
    }

    setTarget(
        index: number,
        translateY: number,
        scale: number,
        springParams: FluidSpringParams,
        delay: number,
    ) {
        const state = this.rows.get(index);
        if (!state) return;

        state.translateY.setTarget(translateY, springParams, delay);
        // scale 是激活状态响应，不应受滚动牵拉延迟影响（重叠时 B 激活应立即放大，
        // 与性能优先模式 CSS 无延迟一致）；否则要等 getDelay 耗尽才开始放大
        state.scale.setTarget(scale, SCALE_SPRING, 0);
        state.targetY = translateY;
        state.targetScale = scale;
        state.delay = delay;
        if (state.translateY.isAnimating() || state.scale.isAnimating()) {
            this.animatingRows.add(index);
            if (state.element) {
                state.element.style.willChange = 'transform';
                if (state.scaleElement) state.scaleElement.style.willChange = 'transform';
            }
            this.start();
        } else {
            this.animatingRows.delete(index);
            if (this.animatingRows.size === 0) this.stop();
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
            const isAnimating = state.translateY.isAnimating() ||
                state.scale.isAnimating();
            if (state.element) this.renderState(state);
            if (!isAnimating) {
                this.animatingRows.delete(index);
            }
        });
        this.publishSpatialVisibility();

        if (this.animatingRows.size === 0) this.stop();
    };

    private stop() {
        this.unsubscribeFrame?.();
        this.unsubscribeFrame = null;
    }

    private renderState(state: RowAnimationState) {
        if (state.element) {
            const transform = `translateY(${state.translateY.getPosition().toFixed(1)}px)`;
            if (state.lastRenderedY !== transform) {
                state.lastRenderedY = transform;
                state.element.style.transform = transform;
            }
        }
        if (state.scaleElement) {
            const transform = `scale(${state.scale.getPosition().toFixed(3)})`;
            if (state.lastRenderedScale !== transform) {
                state.lastRenderedScale = transform;
                state.scaleElement.style.transform = transform;
            }
        }
    }

    synchronizeToTargets(syncRevision: number, preserveMotion: boolean) {
        if (this.lastSyncRevision === null) {
            this.lastSyncRevision = syncRevision;
            return;
        }
        if (this.lastSyncRevision === syncRevision) return;
        this.lastSyncRevision = syncRevision;
        // 点击 Seek 会重建激活组并切换到稳定弹簧，但仍从当前位置运动到
        // 新目标；仅普通时钟硬同步继续立即对齐，避免累计漂移。
        if (preserveMotion) return;
        this.rows.forEach((state, index) => {
            state.translateY.setPosition(state.targetY);
            state.scale.setPosition(state.targetScale);
            this.animatingRows.delete(index);
            if (state.element) this.renderState(state);
        });
        this.publishSpatialVisibility();
        if (this.animatingRows.size === 0) this.stop();
    }

    private renderRowVisual(state: RowAnimationState, style: FluidLyricsRowVisualStyle) {
        const element = state.element;
        if (!element) return;
        // 行壳的固定 CSS transition 同时覆盖激活和失活，避免只在失活时
        // 过渡导致旧行仍然高亮而新行已经完成聚焦。
        if (state.lastRenderedFilter !== style.filter) {
            element.style.filter = style.filter;
            state.lastRenderedFilter = style.filter;
        }
        if (state.lastRenderedOpacity !== style.opacity) {
            element.style.opacity = style.opacity;
            state.lastRenderedOpacity = style.opacity;
        }
    }

    private publishSpatialVisibility() {
        if (!this.onVisibleIndicesChange || this.viewportHeight <= 0) return;
        let spatialStateChanged = false;
        for (let index = 0; index < this.rowCount; index++) {
            const state = this.rows.get(index);
            if (!state) continue;
            const top = state.layoutTop + state.translateY.getPosition();
            const isSpatiallyVisible = isFluidLyricsRowSpatiallyVisible(
                top,
                state.height,
                this.viewportHeight,
                SPATIAL_OVERSCAN_PX,
            );
            const nextSpatialValue = isSpatiallyVisible ? 1 : 0;
            if (this.spatialVisibility[index] !== nextSpatialValue) {
                this.spatialVisibility[index] = nextSpatialValue;
                spatialStateChanged = true;
            }
        }
        if (!spatialStateChanged) return;

        // 行模型始终按 display index 建立，按索引扫描即可保持顺序；只有可见
        // 集合真正变化时才创建一次数组并通知 React，避免每个运动帧产生垃圾。
        const visible: number[] = [];
        for (let index = 0; index < this.rowCount; index++) {
            if (this.spatialVisibility[index] === 1) visible.push(index);
        }
        this.onVisibleIndicesChange(visible);
    }

    private ensureModel(index: number, targetY: number, targetScale: number) {
        const current = this.rows.get(index);
        if (current) return current;

        const state: RowAnimationState = {
            element: null,
            scaleElement: null,
            translateY: new FluidLyricsSpring(targetY, { stiffness: 90, damping: 15, mass: 1 }),
            scale: new FluidLyricsSpring(targetScale, SCALE_SPRING),
            layoutTop: 0,
            height: 0,
            targetY,
            targetScale,
            delay: 0,
            lastRenderedY: null,
            lastRenderedScale: null,
            lastRenderedFilter: null,
            lastRenderedOpacity: null,
        };
        this.rows.set(index, state);
        return state;
    }

    private resetRows() {
        this.stop();
        this.rows.clear();
        this.animatingRows.clear();
        this.lastSyncRevision = null;
        this.rowCount = 0;
        this.spatialVisibility = new Uint8Array(0);
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
    itemHeights,
    itemTops,
    onVisibleIndicesChange,
    preserveMotionOnSync,
    suppressRowDelay,
    syncRevision,
    viewportHeight,
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
        };
    }, [activeDisplayIndex, activeIndices, getDelay, isUserScrolling, parentDisplayIndexMap, pausedScroll, springParams, targetScrollY, variant, visualShifts]);
    // 这是纯内存且幂等的模型同步，不写 DOM，也不触发 React 更新。放在渲染阶段
    // 可保证空间虚拟化第一次计算前所有行都已有状态；若依赖 insertion effect，
    // 面板切换/并发重建时可能只由首屏 register() 懒创建少量模型。
    animator.syncModels(
        modelIdentity,
        rowCount,
        index => (visualShifts[index] ?? 0) - targetScrollY,
        activeIndices,
        parentDisplayIndexMap,
    );
    useLayoutEffect(() => {
        animator.setSpatialViewport(itemTops, itemHeights, viewportHeight, onVisibleIndicesChange);
    }, [animator, itemHeights, itemTops, onVisibleIndicesChange, viewportHeight]);
    const registerAnimatedRow = useCallback((index: number, element: HTMLDivElement) => {
        const targets = latestTargetsRef.current;
        return animator.register(
            index,
            element,
            (targets.visualShifts[index] ?? 0) - targets.targetScrollY,
            getScaleTarget(index, targets.activeIndices, targets.parentDisplayIndexMap),
            getRowVisualStyle(
                index,
                targets.activeDisplayIndex,
                targets.activeIndices,
                targets.isUserScrolling,
                targets.pausedScroll,
                targets.variant,
                targets.parentDisplayIndexMap,
            ),
        );
    }, [animator]);

    useLayoutEffect(() => {
        animator.setMountedTargets(
            index => (visualShifts[index] ?? 0) - targetScrollY,
            activeIndices,
            springParams,
            getDelay,
            index => getRowVisualStyle(
                index,
                activeDisplayIndex,
                activeIndices,
                isUserScrolling,
                pausedScroll,
                variant,
                parentDisplayIndexMap,
            ),
            suppressRowDelay,
            parentDisplayIndexMap,
        );
        animator.synchronizeToTargets(syncRevision, preserveMotionOnSync);
    }, [activeDisplayIndex, activeIndices, animator, getDelay, isUserScrolling, parentDisplayIndexMap, pausedScroll, preserveMotionOnSync, springParams, suppressRowDelay, syncRevision, targetScrollY, variant, visualShifts]);

    useLayoutEffect(() => () => animator.dispose(), [animator]);

    return registerAnimatedRow;
}
