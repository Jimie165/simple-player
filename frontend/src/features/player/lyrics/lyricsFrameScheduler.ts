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

export const LyricsFrameSchedulerContext = createContext<LyricsFrameScheduler | null>(null);

export const useLyricsFrameScheduler = () => useContext(LyricsFrameSchedulerContext);
