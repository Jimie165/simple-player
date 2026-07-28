import { useCallback, useInsertionEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FluidSpringParams } from '@/features/player/lyrics/fluidLyricsSpring';
import { FluidLyricsSpring } from '@/features/player/lyrics/fluidLyricsSpring';

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
}

interface FluidLyricsAnimatorArgs {
    activeDisplayIndex: number;
    getDelay: (displayIndex: number) => number;
    modelIdentity: object;
    rowCount: number;
    springParams: FluidSpringParams;
    targetScrollY: number;
    visualShifts: number[];
}

interface LatestTargets {
    activeDisplayIndex: number;
    getDelay: (displayIndex: number) => number;
    springParams: FluidSpringParams;
    targetScrollY: number;
    visualShifts: number[];
}

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
        activeDisplayIndex: number,
    ) {
        if (this.modelIdentity !== modelIdentity) {
            this.resetRows();
            this.modelIdentity = modelIdentity;
        }

        for (let index = 0; index < rowCount; index++) {
            this.ensureModel(index, getTargetY(index), index === activeDisplayIndex ? ACTIVE_SCALE : INACTIVE_SCALE);
        }
        this.rows.forEach((_state, index) => {
            if (index < rowCount) return;
            this.rows.delete(index);
            this.mountedRows.delete(index);
            this.animatingRows.delete(index);
        });
    }

    register(index: number, element: HTMLDivElement, targetY: number, targetScale: number) {
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
        element.style.willChange = 'transform';
        if (state.scaleElement) state.scaleElement.style.willChange = 'transform';
        this.mountedRows.add(index);
        this.renderState(state);
        if (state.translateY.isAnimating() || (state.scaleElement && state.scale.isAnimating())) {
            this.animatingRows.add(index);
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
        activeDisplayIndex: number,
        springParams: FluidSpringParams,
        getDelay: (index: number) => number,
    ) {
        this.mountedRows.forEach(index => {
            this.setTarget(
                index,
                getTargetY(index),
                index === activeDisplayIndex ? ACTIVE_SCALE : INACTIVE_SCALE,
                springParams,
                getDelay(index),
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
        if (state.scaleElement) state.scale.setTarget(scale, SCALE_SPRING, delay);
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
            }
        });

        if (this.animatingRows.size > 0) this.frame = requestAnimationFrame(this.update);
    };

    private renderState(state: RowAnimationState) {
        if (state.element) {
            state.element.style.transform = `translate3d(0, ${state.translateY.getPosition()}px, 0)`;
        }
        if (state.scaleElement) {
            state.scaleElement.style.transform = `scale(${state.scale.getPosition()}) translateZ(0)`;
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
    getDelay,
    modelIdentity,
    rowCount,
    springParams,
    targetScrollY,
    visualShifts,
}: FluidLyricsAnimatorArgs) {
    const [animator] = useState(() => new FluidLyricsAnimator());
    const latestTargetsRef = useRef<LatestTargets>({
        activeDisplayIndex,
        getDelay,
        springParams,
        targetScrollY,
        visualShifts,
    });
    useInsertionEffect(() => {
        latestTargetsRef.current = {
            activeDisplayIndex,
            getDelay,
            springParams,
            targetScrollY,
            visualShifts,
        };
    }, [activeDisplayIndex, getDelay, springParams, targetScrollY, visualShifts]);
    useInsertionEffect(() => {
        const targets = latestTargetsRef.current;
        animator.syncModels(
            modelIdentity,
            rowCount,
            index => (targets.visualShifts[index] ?? 0) - targets.targetScrollY,
            targets.activeDisplayIndex,
        );
    }, [animator, modelIdentity, rowCount]);
    const registerAnimatedRow = useCallback((index: number, element: HTMLDivElement) => {
        const targets = latestTargetsRef.current;
        return animator.register(
            index,
            element,
            (targets.visualShifts[index] ?? 0) - targets.targetScrollY,
            index === targets.activeDisplayIndex ? ACTIVE_SCALE : INACTIVE_SCALE,
        );
    }, [animator]);

    useLayoutEffect(() => {
        animator.setMountedTargets(
            index => (visualShifts[index] ?? 0) - targetScrollY,
            activeDisplayIndex,
            springParams,
            getDelay,
        );
    }, [activeDisplayIndex, animator, getDelay, springParams, targetScrollY, visualShifts]);

    useLayoutEffect(() => () => animator.dispose(), [animator]);

    return registerAnimatedRow;
}
