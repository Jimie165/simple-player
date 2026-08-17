import { useCallback, useInsertionEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FluidSpringParams } from '@/features/player/lyrics/fluidLyricsSpring';
import { FluidLyricsSpring } from '@/features/player/lyrics/fluidLyricsSpring';
import {
    getFluidLyricsRowVisualStyle,
    type FluidLyricsRowVisualStyle,
} from '@/features/player/lyrics/fluidLyricsMotion';

const SCALE_SPRING: FluidSpringParams = {
    stiffness: 100,
    damping: 25,
    mass: 2,
    restDelta: 0.0001,
    restSpeed: 0.001,
};

const ACTIVE_SCALE = 1;
const INACTIVE_SCALE = 0.98;

interface RowAnimationState {
    detachedAt: number | null;
    element: HTMLDivElement | null;
    scaleElement: HTMLElement | null;
    translateY: FluidLyricsSpring;
    scale: FluidLyricsSpring;
    targetTranslateY: number;
    targetScale: number;
    lastRenderedYNum: number | null;
    lastRenderedScaleNum: number | null;
    lastRenderedFilter: string | null;
    lastRenderedOpacity: string | null;
    lastRenderedTransition: string | null;
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
    delay: number,
    parentDisplayIndexMap?: Map<number, number>,
): FluidLyricsRowVisualStyle => {
    const effectiveIndex = getEffectiveIndex(index, parentDisplayIndexMap);
    // 激活行含重叠双亮的非焦点行：在 activeIndices 中的行不模糊、不透明减淡
    const isActive = activeIndices.has(effectiveIndex);
    const distance = activeDisplayIndex >= 0 ? Math.abs(activeDisplayIndex - effectiveIndex) : 0;
    return getFluidLyricsRowVisualStyle({
        delay,
        distanceFromActive: distance,
        isActive,
        isUserScrolling,
        pausedScroll,
        variant,
    });
};

class FluidLyricsAnimator {
    private readonly rows = new Map<number, RowAnimationState>();
    private readonly mountedRows = new Set<number>();
    private readonly animatingRows = new Set<number>();
    private modelIdentity: object | null = null;
    private frame: number | null = null;
    private lastFrameTime = 0;

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
            this.mountedRows.delete(index);
            this.animatingRows.delete(index);
        });
    }

    register(
        index: number,
        element: HTMLDivElement,
        targetY: number,
        targetScale: number,
        rowVisualStyle: FluidLyricsRowVisualStyle,
    ) {
        const state = this.ensureModel(index, targetY, targetScale);
        if (state.detachedAt !== null) {
            const elapsedSeconds = Math.max(0, performance.now() - state.detachedAt) / 1000;
            state.translateY.advance(elapsedSeconds);
            state.scale.advance(elapsedSeconds);
            state.detachedAt = null;
        }
        if (state.targetTranslateY !== targetY || state.targetScale !== targetScale) {
            state.translateY.setPosition(targetY);
            state.scale.setPosition(targetScale);
            state.targetTranslateY = targetY;
            state.targetScale = targetScale;
        }
        state.element = element;
        state.scaleElement = element.querySelector<HTMLElement>('[data-fluid-lyrics-scale]');
        state.lastRenderedYNum = null;
        state.lastRenderedScaleNum = null;
        state.lastRenderedFilter = null;
        state.lastRenderedOpacity = null;
        state.lastRenderedTransition = null;
        element.style.willChange = 'transform';
        this.mountedRows.add(index);
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
            this.mountedRows.delete(index);
            this.animatingRows.delete(index);
        };
    }

    setMountedTargets(
        getTargetY: (index: number) => number,
        activeIndices: Set<number>,
        springParams: FluidSpringParams,
        getDelay: (index: number) => number,
        getRowVisual: (index: number, delay: number) => FluidLyricsRowVisualStyle,
        parentDisplayIndexMap?: Map<number, number>,
    ) {
        this.mountedRows.forEach(index => {
            const delay = getDelay(index);
            this.setTarget(
                index,
                getTargetY(index),
                getScaleTarget(index, activeIndices, parentDisplayIndexMap),
                springParams,
                delay,
            );
            const state = this.rows.get(index);
            if (state) this.renderRowVisual(state, getRowVisual(index, delay));
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
        state.targetTranslateY = translateY;
        state.targetScale = scale;

        if (!state.element) {
            state.translateY.setPosition(translateY);
            state.scale.setPosition(scale);
            state.detachedAt = null;
            this.animatingRows.delete(index);
            return;
        }

        state.translateY.setTarget(translateY, springParams, delay);
        // scale 是激活状态响应，不应受滚动牵拉延迟影响（重叠时 B 激活应立即放大，
        // 与性能优先模式 CSS 无延迟一致）；否则要等 getDelay 耗尽才开始放大
        if (state.scaleElement) state.scale.setTarget(scale, SCALE_SPRING, 0);
        else state.scale.setPosition(scale);
        if (state.translateY.isAnimating() || (state.scaleElement && state.scale.isAnimating())) {
            this.animatingRows.add(index);
            state.element.style.willChange = 'transform';
            if (state.scaleElement) state.scaleElement.style.willChange = 'transform';
            this.start();
        }
    }

    dispose() {
        this.resetRows();
        this.modelIdentity = null;
    }

    private start() {
        if (this.frame !== null) return;
        this.lastFrameTime = performance.now();
        this.frame = requestAnimationFrame(this.update);
    }

    private readonly update = (time: number) => {
        this.frame = null;
        const deltaSeconds = Math.max(0, time - this.lastFrameTime) / 1000;
        this.lastFrameTime = time;

        this.animatingRows.forEach(index => {
            const state = this.rows.get(index);
            if (!state?.element) {
                this.animatingRows.delete(index);
                return;
            }
            state.translateY.advance(deltaSeconds);
            if (state.scaleElement) state.scale.advance(deltaSeconds);
            this.renderState(state);
            if (!state.translateY.isAnimating() && (!state.scaleElement || !state.scale.isAnimating())) {
                this.animatingRows.delete(index);
                if (state.scaleElement) state.scaleElement.style.willChange = '';
            }
        });

        if (this.animatingRows.size > 0) this.frame = requestAnimationFrame(this.update);
    };

    private renderState(state: RowAnimationState) {
        if (state.element) {
            const y = state.translateY.getPosition();
            if (state.lastRenderedYNum === null || Math.abs(y - state.lastRenderedYNum) >= 0.05) {
                state.lastRenderedYNum = y;
                state.element.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
            }
        }
        if (state.scaleElement) {
            const s = state.scale.getPosition();
            if (state.lastRenderedScaleNum === null || Math.abs(s - state.lastRenderedScaleNum) >= 0.0005) {
                state.lastRenderedScaleNum = s;
                state.scaleElement.style.transform = `scale(${s.toFixed(4)}) translateZ(0)`;
            }
        }
    }

    private renderRowVisual(state: RowAnimationState, style: FluidLyricsRowVisualStyle) {
        // 位移、模糊和透明度由同一个外层窗口项承载，
        // 避免 filter/opacity 作用在 transform 外层的
        // 子树上，导致换行时重复建立渲染表面。
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
        if (state.lastRenderedTransition !== style.transition) {
            element.style.transition = style.transition;
            state.lastRenderedTransition = style.transition;
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
            lastRenderedYNum: null,
            lastRenderedScaleNum: null,
            lastRenderedFilter: null,
            lastRenderedOpacity: null,
            lastRenderedTransition: null,
        };
        this.rows.set(index, state);
        return state;
    }

    private resetRows() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
        this.rows.clear();
        this.mountedRows.clear();
        this.animatingRows.clear();
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
}: FluidLyricsAnimatorArgs) {
    const [animator] = useState(() => new FluidLyricsAnimator());
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
        );
    }, [activeDisplayIndex, activeIndices, animator, getDelay, isUserScrolling, parentDisplayIndexMap, pausedScroll, springParams, targetScrollY, variant, visualShifts]);

    useLayoutEffect(() => () => animator.dispose(), [animator]);

    return registerAnimatedRow;
}
