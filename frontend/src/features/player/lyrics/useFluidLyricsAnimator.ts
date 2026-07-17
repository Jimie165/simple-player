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

interface RowAnimationState {
    element: HTMLDivElement | null;
    scaleElement: HTMLElement | null;
    translateY: FluidLyricsSpring;
    scale: FluidLyricsSpring;
}

interface FluidLyricsAnimatorArgs {
    activeDisplayIndex: number;
    getDelay: (displayIndex: number) => number;
    springParams: FluidSpringParams;
    targetScrollY: number;
    visibleIndices: number[];
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
    private readonly animatingRows = new Set<number>();
    private frame: number | null = null;
    private lastFrameTime = 0;

    register(index: number, element: HTMLDivElement, targetY: number, targetScale: number) {
        let state = this.rows.get(index);
        if (!state) {
            state = {
                element,
                scaleElement: element.querySelector<HTMLElement>('[data-fluid-lyrics-scale]'),
                translateY: new FluidLyricsSpring(targetY, { stiffness: 90, damping: 15, mass: 1 }),
                scale: new FluidLyricsSpring(targetScale, SCALE_SPRING),
            };
            this.rows.set(index, state);
        } else {
            state.element = element;
            state.scaleElement = element.querySelector<HTMLElement>('[data-fluid-lyrics-scale]');
            state.translateY.setPosition(targetY);
            state.scale.setPosition(targetScale);
        }
        this.renderState(state);

        return () => {
            if (state.element !== element) return;
            state.element = null;
            state.scaleElement = null;
            this.animatingRows.delete(index);
            this.rows.delete(index);
        };
    }

    setTarget(
        index: number,
        translateY: number,
        scale: number,
        springParams: FluidSpringParams,
        delay: number,
    ) {
        const state = this.rows.get(index);
        if (!state?.element) return;
        state.translateY.setTarget(translateY, springParams, delay);
        state.scale.setTarget(scale, SCALE_SPRING, delay);
        if (state.translateY.isAnimating() || state.scale.isAnimating()) {
            this.animatingRows.add(index);
            state.element.style.willChange = 'transform';
            if (state.scaleElement) state.scaleElement.style.willChange = 'transform';
            this.start();
        }
    }

    dispose() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
        this.rows.clear();
        this.animatingRows.clear();
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
            state.scale.advance(deltaSeconds);
            this.renderState(state);
            if (!state.translateY.isAnimating() && !state.scale.isAnimating()) {
                state.element.style.willChange = 'auto';
                if (state.scaleElement) state.scaleElement.style.willChange = 'auto';
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
}

export function useFluidLyricsAnimator({
    activeDisplayIndex,
    getDelay,
    springParams,
    targetScrollY,
    visibleIndices,
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
    const registerAnimatedRow = useCallback((index: number, element: HTMLDivElement) => {
        const targets = latestTargetsRef.current;
        return animator.register(
            index,
            element,
            (targets.visualShifts[index] ?? 0) - targets.targetScrollY,
            index === targets.activeDisplayIndex ? 1.05 : 1,
        );
    }, [animator]);

    useLayoutEffect(() => {
        visibleIndices.forEach(index => {
            animator.setTarget(
                index,
                (visualShifts[index] ?? 0) - targetScrollY,
                index === activeDisplayIndex ? 1.05 : 1,
                springParams,
                getDelay(index),
            );
        });
    }, [activeDisplayIndex, animator, getDelay, springParams, targetScrollY, visibleIndices, visualShifts]);

    useLayoutEffect(() => () => animator.dispose(), [animator]);

    return registerAnimatedRow;
}
