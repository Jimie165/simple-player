import { createContext, useContext } from 'react';

export type LyricsFramePhase = 'clock' | 'motion' | 'content';
export type LyricsFrameCallback = (now: number, deltaMs: number) => void;

/** 一个歌词面板只使用一个 rAF，按时钟、行运动、内容动画的顺序统一推进。 */
export class LyricsFrameScheduler {
    private readonly tasks: Record<LyricsFramePhase, Set<LyricsFrameCallback>> = {
        clock: new Set(),
        motion: new Set(),
        content: new Set(),
    };
    private taskCount = 0;
    private frame: number | null = null;
    private lastTime = 0;

    subscribe(phase: LyricsFramePhase, callback: LyricsFrameCallback) {
        const phaseTasks = this.tasks[phase];
        if (phaseTasks.has(callback)) return () => undefined;
        phaseTasks.add(callback);
        this.taskCount += 1;
        this.start();
        return () => {
            if (!phaseTasks.delete(callback)) return;
            this.taskCount -= 1;
            if (this.taskCount === 0) this.stop();
        };
    }

    dispose() {
        this.tasks.clock.clear();
        this.tasks.motion.clear();
        this.tasks.content.clear();
        this.taskCount = 0;
        this.stop();
    }

    private start() {
        if (this.frame !== null) return;
        this.lastTime = performance.now();
        this.frame = requestAnimationFrame(this.update);
    }

    private stop() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
        this.lastTime = 0;
    }

    private readonly update = (now: number) => {
        this.frame = null;
        if (this.taskCount === 0) return;

        const deltaMs = Math.max(0, now - this.lastTime);
        this.lastTime = now;
        this.tasks.clock.forEach(callback => callback(now, deltaMs));
        this.tasks.motion.forEach(callback => callback(now, deltaMs));
        this.tasks.content.forEach(callback => callback(now, deltaMs));

        if (this.taskCount > 0) this.frame = requestAnimationFrame(this.update);
    };
}

/**
 * Coalesces a group of same-phase callbacks into one scheduler subscription.
 * Karaoke lines can register independently, while the panel still pays for
 * only one content-phase callback per frame.
 */
export class LyricsFrameTaskRegistry {
    private readonly tasks = new Set<LyricsFrameCallback>();
    private unsubscribe: (() => void) | null = null;
    private readonly scheduler: LyricsFrameScheduler;
    private readonly phase: LyricsFramePhase;

    constructor(scheduler: LyricsFrameScheduler, phase: LyricsFramePhase) {
        this.scheduler = scheduler;
        this.phase = phase;
    }

    subscribe(callback: LyricsFrameCallback) {
        if (this.tasks.has(callback)) return () => undefined;
        this.tasks.add(callback);
        if (this.unsubscribe === null) {
            this.unsubscribe = this.scheduler.subscribe(this.phase, this.update);
        }
        return () => {
            if (!this.tasks.delete(callback)) return;
            if (this.tasks.size === 0) {
                this.unsubscribe?.();
                this.unsubscribe = null;
            }
        };
    }

    dispose() {
        this.tasks.clear();
        this.unsubscribe?.();
        this.unsubscribe = null;
    }

    private readonly update: LyricsFrameCallback = (now, deltaMs) => {
        this.tasks.forEach(callback => callback(now, deltaMs));
    };
}

export const LyricsFrameSchedulerContext = createContext<LyricsFrameScheduler | null>(null);

export const LyricsFrameTaskRegistryContext = createContext<LyricsFrameTaskRegistry | null>(null);

export const useLyricsFrameScheduler = () => useContext(LyricsFrameSchedulerContext);
