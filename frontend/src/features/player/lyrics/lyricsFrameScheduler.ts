import { createContext, useContext } from 'react';
import { getLyricsDebugSink } from '@/features/player/lyrics/lyricsDebug';

export type LyricsFramePhase = 'clock' | 'motion' | 'content';
export type LyricsFrameCallback = (now: number, deltaMs: number) => void;
const LYRICS_FRAME_PHASES: readonly LyricsFramePhase[] = ['clock', 'motion', 'content'];

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
    private running = false;
    private dispatching = false;
    private readonly pendingAdds: Record<LyricsFramePhase, Set<LyricsFrameCallback>> = {
        clock: new Set(),
        motion: new Set(),
        content: new Set(),
    };
    private readonly pendingRemoves: Record<LyricsFramePhase, Set<LyricsFrameCallback>> = {
        clock: new Set(),
        motion: new Set(),
        content: new Set(),
    };

    subscribe(phase: LyricsFramePhase, callback: LyricsFrameCallback) {
        const phaseTasks = this.tasks[phase];
        const pendingAdds = this.pendingAdds[phase];
        if (pendingAdds.has(callback)) return () => undefined;
        if (phaseTasks.has(callback)) {
            // A callback removed and re-added during the same frame keeps its
            // original task slot; cancel the pending removal instead of
            // counting it as a second subscription.
            if (this.pendingRemoves[phase].delete(callback)) {
                this.taskCount += 1;
                return () => this.unsubscribe(phase, callback);
            }
            return () => undefined;
        }
        if (this.dispatching) pendingAdds.add(callback);
        else phaseTasks.add(callback);
        this.taskCount += 1;
        getLyricsDebugSink()?.({
            type: 'scheduler-subscription',
            action: 'subscribe',
            phase,
            taskCount: this.taskCount,
            pendingRaf: this.frame !== null,
        });
        this.start();
        return () => this.unsubscribe(phase, callback);
    }

    dispose() {
        this.tasks.clock.clear();
        this.tasks.motion.clear();
        this.tasks.content.clear();
        this.pendingAdds.clock.clear();
        this.pendingAdds.motion.clear();
        this.pendingAdds.content.clear();
        this.pendingRemoves.clock.clear();
        this.pendingRemoves.motion.clear();
        this.pendingRemoves.content.clear();
        this.taskCount = 0;
        this.stop();
    }

    private start() {
        // A callback can subscribe while update() is dispatching. The loop is
        // already running in that case; resetting the anchor here shortens the
        // next delta and makes spring motion visibly pause for one frame.
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.frame = requestAnimationFrame(this.update);
    }

    private stop() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
        this.running = false;
        this.dispatching = false;
        this.lastTime = 0;
    }

    private unsubscribe(phase: LyricsFramePhase, callback: LyricsFrameCallback) {
        const phaseTasks = this.tasks[phase];
        const pendingAdds = this.pendingAdds[phase];
        if (pendingAdds.delete(callback)) {
            this.taskCount -= 1;
        } else if (phaseTasks.has(callback)) {
            if (this.pendingRemoves[phase].has(callback)) return;
            if (this.dispatching) {
                this.pendingRemoves[phase].add(callback);
            } else {
                phaseTasks.delete(callback);
            }
            this.taskCount -= 1;
        } else {
            return;
        }

        getLyricsDebugSink()?.({
            type: 'scheduler-subscription',
            action: 'unsubscribe',
            phase,
            taskCount: this.taskCount,
            pendingRaf: this.frame !== null,
        });

        if (this.taskCount === 0 && !this.dispatching) this.stop();
    }

    private applyPendingSubscriptions() {
        LYRICS_FRAME_PHASES.forEach(phase => {
            const phaseTasks = this.tasks[phase];
            this.pendingRemoves[phase].forEach(callback => phaseTasks.delete(callback));
            this.pendingRemoves[phase].clear();
            this.pendingAdds[phase].forEach(callback => phaseTasks.add(callback));
            this.pendingAdds[phase].clear();
        });
    }

    private readonly update = (now: number) => {
        this.frame = null;
        if (!this.running || this.taskCount === 0) {
            this.stop();
            return;
        }

        const deltaMs = Math.max(0, now - this.lastTime);
        this.lastTime = now;
        this.dispatching = true;
        LYRICS_FRAME_PHASES.forEach(phase => {
            // New subscriptions are kept in pendingAdds, so iterating the
            // existing set does not allocate a callback snapshot per frame.
            this.tasks[phase].forEach(callback => {
                if (!this.pendingRemoves[phase].has(callback)) callback(now, deltaMs);
            });
        });
        this.dispatching = false;
        this.applyPendingSubscriptions();

        if (this.taskCount > 0) {
            // `running` remains true while subscribers are replaced, so this
            // is the only place that schedules the next frame.
            this.frame = requestAnimationFrame(this.update);
        } else {
            this.stop();
        }
        getLyricsDebugSink()?.({
            type: 'scheduler-frame',
            now,
            deltaMs,
            taskCount: this.taskCount,
            pendingAdds: this.pendingAdds.clock.size + this.pendingAdds.motion.size + this.pendingAdds.content.size,
            pendingRemoves: this.pendingRemoves.clock.size + this.pendingRemoves.motion.size + this.pendingRemoves.content.size,
            pendingRaf: this.frame !== null,
        });
    };
}

/**
 * Coalesces a group of same-phase callbacks into one scheduler subscription.
 * Karaoke lines can register independently, while the panel still pays for
 * only one content-phase callback per frame.
 */
export class LyricsFrameTaskRegistry {
    private readonly tasks = new Set<LyricsFrameCallback>();
    private readonly pendingAdds = new Set<LyricsFrameCallback>();
    private readonly pendingRemoves = new Set<LyricsFrameCallback>();
    private unsubscribe: (() => void) | null = null;
    private dispatching = false;
    private readonly scheduler: LyricsFrameScheduler;
    private readonly phase: LyricsFramePhase;

    constructor(scheduler: LyricsFrameScheduler, phase: LyricsFramePhase) {
        this.scheduler = scheduler;
        this.phase = phase;
    }

    subscribe(callback: LyricsFrameCallback) {
        if (this.pendingAdds.has(callback)) return () => undefined;
        if (this.tasks.has(callback)) {
            if (this.pendingRemoves.delete(callback)) {
                if (this.unsubscribe === null) {
                    this.unsubscribe = this.scheduler.subscribe(this.phase, this.update);
                }
                return () => this.remove(callback);
            }
            return () => undefined;
        }
        if (this.dispatching) this.pendingAdds.add(callback);
        else this.tasks.add(callback);
        if (this.unsubscribe === null) {
            this.unsubscribe = this.scheduler.subscribe(this.phase, this.update);
        }
        getLyricsDebugSink()?.({
            type: 'scheduler-subscription',
            action: 'subscribe',
            phase: `registry:${this.phase}`,
            taskCount: this.tasks.size + this.pendingAdds.size,
            pendingRaf: this.unsubscribe !== null,
        });
        return () => this.remove(callback);
    }

    dispose() {
        this.tasks.clear();
        this.pendingAdds.clear();
        this.pendingRemoves.clear();
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.dispatching = false;
    }

    private remove(callback: LyricsFrameCallback) {
        if (this.pendingAdds.delete(callback)) return;
        if (!this.tasks.has(callback)) return;
        if (this.pendingRemoves.has(callback)) return;
        if (this.dispatching) this.pendingRemoves.add(callback);
        else this.tasks.delete(callback);
        getLyricsDebugSink()?.({
            type: 'scheduler-subscription',
            action: 'unsubscribe',
            phase: `registry:${this.phase}`,
            taskCount: this.tasks.size - this.pendingRemoves.size + this.pendingAdds.size,
            pendingRaf: this.unsubscribe !== null,
        });
        this.stopIfEmpty();
    }

    private stopIfEmpty() {
        if (this.tasks.size - this.pendingRemoves.size + this.pendingAdds.size !== 0) return;
        this.unsubscribe?.();
        this.unsubscribe = null;
    }

    private applyPendingSubscriptions() {
        this.pendingRemoves.forEach(callback => this.tasks.delete(callback));
        this.pendingRemoves.clear();
        this.pendingAdds.forEach(callback => this.tasks.add(callback));
        this.pendingAdds.clear();
    }

    private readonly update: LyricsFrameCallback = (now, deltaMs) => {
        getLyricsDebugSink()?.({
            type: 'registry-frame',
            phase: this.phase,
            callbackCount: this.tasks.size,
            deltaMs,
        });
        this.dispatching = true;
        this.tasks.forEach(callback => {
            if (!this.pendingRemoves.has(callback)) callback(now, deltaMs);
        });
        this.dispatching = false;
        this.applyPendingSubscriptions();
        this.stopIfEmpty();
    };
}

export const LyricsFrameSchedulerContext = createContext<LyricsFrameScheduler | null>(null);

export const LyricsFrameTaskRegistryContext = createContext<LyricsFrameTaskRegistry | null>(null);

export const useLyricsFrameScheduler = () => useContext(LyricsFrameSchedulerContext);

/**
 * Returns the panel-owned content registry. A null value is intentional:
 * non-fluid lyrics keep their existing standalone rendering path.
 */
export const useLyricsFrameTaskRegistry = () => useContext(LyricsFrameTaskRegistryContext);
