import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

import { audioService } from '@/services/audioService';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { usePlayerStore } from '@/store/usePlayerStore';
import type { PlaybackSnapshot } from '@/types';

/**
 * Keeps media-side effects alive independently of the bottom player UI.
 * The component is mounted once from App so covered visual layers can be frozen
 * without stopping SMTC, ended-track handling, or the shared position clock.
 */
function usePlaybackRuntime() {
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const mediaKind = usePlayerStore(state => state.mediaKind);
    const isSeeking = usePlayerStore(state => state.isSeeking);
    const currentTime = usePlayerStore(state => state.currentTime);
    const metadata = usePlayerStore(state => state.metadata);
    const restartTrigger = usePlayerStore(state => state.restartTrigger);
    const playbackPath = usePlayerStore(state => state.playbackPath);
    const playbackSessionId = usePlayerStore(state => state.playbackSessionId);
    const setPlaybackSnapshot = usePlayerStore(state => state.setPlaybackSnapshot);
    const setPlaybackTime = usePlayerStore(state => state.setPlaybackTime);
    const resetPlaybackClock = usePlayerStore(state => state.resetPlaybackClock);
    const {
        handlePlaybackEnded,
        pausePlayback,
        playNext,
        playPrev,
        resumePlayback,
        seek,
    } = usePlaybackActions();

    const currentTimeRef = useRef(currentTime);
    const isSeekingRef = useRef(isSeeking);
    const callbacksRef = useRef({
        handlePlaybackEnded,
        pausePlayback,
        playNext,
        playPrev,
        resumePlayback,
        seek,
    });
    const positionAnchorRef = useRef({
        position: currentTime,
        updatedAt: 0,
    });

    useEffect(() => {
        currentTimeRef.current = currentTime;
        isSeekingRef.current = isSeeking;
    }, [currentTime, isSeeking]);

    useEffect(() => {
        callbacksRef.current = {
            handlePlaybackEnded,
            pausePlayback,
            playNext,
            playPrev,
            resumePlayback,
            seek,
        };
    }, [handlePlaybackEnded, pausePlayback, playNext, playPrev, resumePlayback, seek]);

    useEffect(() => {
        let disposed = false;
        const unlisten: Array<() => void> = [];

        const register = async <T,>(
            event: string,
            handler: (payload: T) => void | Promise<void>,
        ) => {
            const cleanup = await listen<T>(event, (eventData) => {
                if (!disposed) void handler(eventData.payload);
            });
            if (disposed) {
                cleanup();
            } else {
                unlisten.push(cleanup);
            }
        };

        void register('smtc:next', () => callbacksRef.current.playNext());
        void register('smtc:previous', () => callbacksRef.current.playPrev(currentTimeRef.current));
        void register('smtc:play', () => callbacksRef.current.resumePlayback());
        void register('smtc:pause', () => callbacksRef.current.pausePlayback());
        void register<number>('smtc:seek', (requestedTime) => {
            const time = Number(requestedTime);
            if (Number.isFinite(time)) void callbacksRef.current.seek(time);
        });
        void register<number>('audio:ended', (endedSessionId) => {
            const currentSessionId = usePlayerStore.getState().playbackSessionId;
            if (
                Number.isFinite(endedSessionId) &&
                currentSessionId !== 0 &&
                endedSessionId !== currentSessionId
            ) return;
            void callbacksRef.current.handlePlaybackEnded();
        });
        void register<PlaybackSnapshot>('audio:state-changed', (snapshot) => {
            const state = usePlayerStore.getState();
            if (
                state.mediaKind === 'video' ||
                (snapshot.session_id !== 0 &&
                    state.playbackSessionId !== 0 &&
                    snapshot.session_id < state.playbackSessionId)
            ) return;
            positionAnchorRef.current = {
                position: snapshot.position,
                updatedAt: performance.now(),
            };
            state.setPlaybackSnapshot(snapshot);
        });

        return () => {
            disposed = true;
            for (const cleanup of unlisten) cleanup();
        };
    }, []);

    useEffect(() => {
        const trackKey = metadata?.path ?? '';
        if (!trackKey || trackKey === playbackPath) return;
        resetPlaybackClock(trackKey);
    }, [metadata?.path, playbackPath, resetPlaybackClock]);

    useEffect(() => {
        if (!isPlaying || mediaKind !== 'audio' || isSeeking) {
            positionAnchorRef.current = {
                position: currentTime,
                updatedAt: performance.now(),
            };
        }
    }, [currentTime, isPlaying, isSeeking, mediaKind]);

    const previousSessionId = useRef(playbackSessionId);
    useEffect(() => {
        if (previousSessionId.current === playbackSessionId) return;
        previousSessionId.current = playbackSessionId;
        positionAnchorRef.current = {
            position: currentTime,
            updatedAt: performance.now(),
        };
    }, [currentTime, playbackSessionId]);

    const previousRestartTrigger = useRef(restartTrigger);
    useEffect(() => {
        if (previousRestartTrigger.current !== restartTrigger) {
            resetPlaybackClock(metadata?.path ?? null);
            previousRestartTrigger.current = restartTrigger;
        }
    }, [metadata?.path, resetPlaybackClock, restartTrigger]);

    useEffect(() => {
        if (!isPlaying || mediaKind !== 'audio') return;

        let disposed = false;
        const poll = async () => {
            if (disposed || isSeekingRef.current) return;
            try {
                const snapshot = await audioService.getPlaybackSnapshot();
                if (!disposed && !isSeekingRef.current) {
                    positionAnchorRef.current = {
                        position: snapshot.position,
                        updatedAt: performance.now(),
                    };
                    setPlaybackSnapshot(snapshot);
                }
            } catch (error) {
                if (!disposed) console.warn('Failed to sync playback snapshot', error);
            }
        };

        void poll();
        const interval = window.setInterval(() => void poll(), 1000);
        const clock = window.setInterval(() => {
            const state = usePlayerStore.getState();
            if (disposed || state.mediaKind !== 'audio' || !state.isPlaying || state.isSeeking) return;

            const elapsed = (performance.now() - positionAnchorRef.current.updatedAt) / 1000;
            const duration = state.metadata?.duration;
            const nextPosition = duration && duration > 0
                ? Math.min(positionAnchorRef.current.position + elapsed, duration)
                : positionAnchorRef.current.position + elapsed;
            setPlaybackTime(nextPosition);
        }, 100);
        return () => {
            disposed = true;
            window.clearInterval(interval);
            window.clearInterval(clock);
        };
    }, [isPlaying, mediaKind, setPlaybackSnapshot, setPlaybackTime]);

}

/** Isolates playback-store subscriptions from the application render tree. */
export function PlaybackRuntime() {
    usePlaybackRuntime();
    return null;
}
