/**
 * Optional, low-overhead diagnostics sink for the lyrics renderer.
 *
 * The production path does not allocate an event when the sink is absent.
 * CDP profiling scripts install the sink on `window` for a short sampling
 * window; animation code must never depend on the sink being present.
 */
export type LyricsDebugEvent =
    | {
        type: 'row-layer-hint';
        index: number;
        value: '' | 'transform';
        reason: 'motion-running' | 'motion-settled';
        positionAnimating: boolean;
        scaleAnimating: boolean;
    }
    | {
        type: 'scheduler-subscription';
        action: 'subscribe' | 'unsubscribe';
        phase: string;
        taskCount: number;
        pendingRaf: boolean;
    }
    | {
        type: 'scheduler-frame';
        now: number;
        deltaMs: number;
        taskCount: number;
        pendingAdds: number;
        pendingRemoves: number;
        pendingRaf: boolean;
    }
    | {
        type: 'registry-frame';
        phase: string;
        callbackCount: number;
        deltaMs: number;
    }
    | {
        type: 'karaoke-runtime';
        action: 'create' | 'destroy';
        charCount: number;
        wordCount: number;
    }
    | {
        type: 'karaoke-sync';
        mode: 'full' | 'incremental';
        reason: string;
        timeMs: number;
        wordCount: number;
        charCount: number;
        evaluatedWordCount: number;
        activeWordCount: number;
    }
    | {
        type: 'karaoke-style-writes';
        transform: number;
        fill: number;
        glow: number;
    }
    | {
        type: 'karaoke-ownership';
        transformOwner: 'runtime' | 'css';
        fillOwner: 'runtime';
        glowOwner: 'runtime' | 'css';
        reason: string;
    }
    | {
        type: 'row-lifecycle';
        action: 'mount' | 'unmount';
        index: number;
        reason: string;
    }
    | {
        type: 'row-visibility';
        scope: 'spring-window';
        previousCount: number;
        nextCount: number;
        springCount: number;
        targetCount: number;
    }
    | {
        type: 'measurement-batch';
        entries: number;
    }
    | {
        type: 'measurement-change';
        changed: number;
    }
    | {
        type: 'react-commit';
        displayItemCount: number;
        visibleRowCount: number;
        activeDisplayIndex: number;
    };

export type LyricsDebugSink = (event: LyricsDebugEvent) => void;

interface LyricsDebugGlobal {
    __SIMPLE_PLAYER_LYRICS_DEBUG__?: LyricsDebugSink;
}

export const getLyricsDebugSink = (): LyricsDebugSink | null => {
    const global = globalThis as typeof globalThis & LyricsDebugGlobal;
    return global.__SIMPLE_PLAYER_LYRICS_DEBUG__ ?? null;
};
