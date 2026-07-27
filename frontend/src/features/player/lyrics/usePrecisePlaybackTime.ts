import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { audioService } from '@/services/audioService';

const RENDER_TICK_MS = 75;
const CALIBRATION_INTERVAL_MS = 1500;
const SOFT_SYNC_MS = 150;
const HARD_SYNC_MS = 600;
const SOFT_NUDGE_DURATION_MS = 900;
const BACKGROUND_PAUSE_DELAY_MS = 10_000;

export function usePrecisePlaybackTime(
    currentTime: number,
    getRenderKey?: (currentMs: number) => number,
    subscribeToPlayerTime = false,
) {
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const playbackRevision = usePlayerStore(state => state.playbackRevision);
    const [renderCurrentMs, setRenderCurrentMs] = useState(currentTime * 1000);
    const [syncRevision, setSyncRevision] = useState(0);
    const [isVisibilityActive, setIsVisibilityActive] = useState(!document.hidden);
    const lastTick = useRef(0);
    const lastExternalMs = useRef(currentTime * 1000);
    const lastRenderTickRef = useRef(0);
    const lastCalibrationRef = useRef(0);
    const currentTimeRef = useRef(currentTime);
    const preciseMsRef = useRef(currentTime * 1000);
    const softNudgeRemainingMsRef = useRef(0);
    const softNudgeTimeLeftMsRef = useRef(0);
    const calibrationRequestRef = useRef(false);
    const isPlayingRef = useRef(isPlaying);
    const backgroundPauseTimerRef = useRef<number | null>(null);
    const backgroundPausedAtRef = useRef<number | null>(null);
    const externalSyncFrameRef = useRef<number | null>(null);
    const lastRenderKeyRef = useRef(getRenderKey?.(currentTime * 1000));

    const publishRenderTime = useCallback((ms: number, force = false) => {
        if (getRenderKey) {
            const renderKey = getRenderKey(ms);
            if (!force && renderKey === lastRenderKeyRef.current) return;
            lastRenderKeyRef.current = renderKey;
        }
        setRenderCurrentMs(ms);
    }, [getRenderKey]);

    const hardSync = useCallback((ms: number) => {
        preciseMsRef.current = ms;
        softNudgeRemainingMsRef.current = 0;
        softNudgeTimeLeftMsRef.current = 0;
        publishRenderTime(ms, true);
        setSyncRevision(revision => revision + 1);
    }, [publishRenderTime]);

    const calibrateFromAudio = useCallback(async () => {
        if (calibrationRequestRef.current) return;
        calibrationRequestRef.current = true;

        try {
            const audioMs = (await audioService.getCurrentTime()) * 1000;
            const driftMs = audioMs - preciseMsRef.current;
            const absDriftMs = Math.abs(driftMs);

            if (absDriftMs > HARD_SYNC_MS) {
                hardSync(audioMs);
            } else if (absDriftMs > SOFT_SYNC_MS) {
                softNudgeRemainingMsRef.current = driftMs;
                softNudgeTimeLeftMsRef.current = SOFT_NUDGE_DURATION_MS;
            } else {
                softNudgeRemainingMsRef.current = 0;
                softNudgeTimeLeftMsRef.current = 0;
            }
        } catch (error) {
            console.warn('Failed to calibrate lyric clock', error);
        } finally {
            calibrationRequestRef.current = false;
        }
    }, [hardSync]);

    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    useEffect(() => {
        const clearBackgroundPauseTimer = () => {
            if (backgroundPauseTimerRef.current === null) return;
            window.clearTimeout(backgroundPauseTimerRef.current);
            backgroundPauseTimerRef.current = null;
        };

        const handleVisibilityChange = () => {
            clearBackgroundPauseTimer();

            if (document.hidden) {
                // 短暂最小化时维持热状态，避免频繁切回窗口造成歌词动画冷启动。
                backgroundPauseTimerRef.current = window.setTimeout(() => {
                    const now = performance.now();
                    if (isPlayingRef.current) {
                        preciseMsRef.current += Math.max(0, now - lastTick.current);
                    }
                    lastTick.current = now;
                    backgroundPausedAtRef.current = now;
                    backgroundPauseTimerRef.current = null;
                    setIsVisibilityActive(false);
                }, BACKGROUND_PAUSE_DELAY_MS);
                return;
            }

            const now = performance.now();
            const pausedAt = backgroundPausedAtRef.current;
            if (pausedAt !== null && isPlayingRef.current) {
                preciseMsRef.current += Math.max(0, now - pausedAt);
            } else if (isPlayingRef.current) {
                preciseMsRef.current += Math.max(0, now - lastTick.current);
            }
            backgroundPausedAtRef.current = null;
            lastTick.current = now;
            lastExternalMs.current = preciseMsRef.current;
            publishRenderTime(preciseMsRef.current, true);
            setIsVisibilityActive(true);
            void calibrateFromAudio();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearBackgroundPauseTimer();
        };
    }, [calibrateFromAudio, publishRenderTime]);

    useEffect(() => {
        currentTimeRef.current = currentTime;
    }, [currentTime]);

    useEffect(() => {
        const handleSeeked = (event: Event) => {
            const detail = (event as CustomEvent<{ time?: unknown }>).detail;
            if (!detail || typeof detail.time !== 'number' || !Number.isFinite(detail.time)) return;

            const seekMs = Math.max(0, detail.time * 1000);
            if (externalSyncFrameRef.current !== null) {
                cancelAnimationFrame(externalSyncFrameRef.current);
                externalSyncFrameRef.current = null;
            }
            currentTimeRef.current = seekMs / 1000;
            lastExternalMs.current = seekMs;
            hardSync(seekMs);
        };

        window.addEventListener('playback:seeked', handleSeeked);
        return () => window.removeEventListener('playback:seeked', handleSeeked);
    }, [hardSync]);

    useEffect(() => {
        if (!subscribeToPlayerTime) return;

        const unsubscribe = usePlayerStore.subscribe((state, previousState) => {
            if (state.currentTime === previousState.currentTime) return;
            currentTimeRef.current = state.currentTime;
            const externalMs = state.currentTime * 1000;
            const externalStepMs = Math.abs(externalMs - lastExternalMs.current);
            const driftMs = Math.abs(externalMs - preciseMsRef.current);

            if (
                isVisibilityActive &&
                (!isPlayingRef.current || externalStepMs > HARD_SYNC_MS || driftMs > HARD_SYNC_MS)
            ) {
                if (externalSyncFrameRef.current !== null) {
                    cancelAnimationFrame(externalSyncFrameRef.current);
                }
                externalSyncFrameRef.current = requestAnimationFrame(() => {
                    externalSyncFrameRef.current = null;
                    hardSync(externalMs);
                });
            }
            lastExternalMs.current = externalMs;
        });

        return () => {
            unsubscribe();
            if (externalSyncFrameRef.current !== null) {
                cancelAnimationFrame(externalSyncFrameRef.current);
                externalSyncFrameRef.current = null;
            }
        };
    }, [hardSync, isVisibilityActive, subscribeToPlayerTime]);

    useEffect(() => {
        const externalMs = currentTime * 1000;
        const externalStepMs = Math.abs(externalMs - lastExternalMs.current);
        const driftMs = Math.abs(externalMs - preciseMsRef.current);
        let frame: number | null = null;

        if (isVisibilityActive && (!isPlaying || externalStepMs > HARD_SYNC_MS || driftMs > HARD_SYNC_MS)) {
            frame = requestAnimationFrame(() => hardSync(externalMs));
        }
        lastExternalMs.current = externalMs;

        return () => {
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [currentTime, hardSync, isPlaying, isVisibilityActive]);

    useEffect(() => {
        const syncFrame = requestAnimationFrame(() => {
            hardSync(currentTimeRef.current * 1000);
        });
        if (!isPlaying || !isVisibilityActive) {
            return () => cancelAnimationFrame(syncFrame);
        }

        let frame: number;
        const tick = (now: number) => {
            const delta = now - lastTick.current;
            lastTick.current = now;
            let nudgeMs = 0;
            if (softNudgeTimeLeftMsRef.current > 0) {
                const nudgeStepMs = Math.min(delta, softNudgeTimeLeftMsRef.current);
                const nudgeRatio = nudgeStepMs / softNudgeTimeLeftMsRef.current;
                nudgeMs = softNudgeRemainingMsRef.current * nudgeRatio;
                softNudgeRemainingMsRef.current -= nudgeMs;
                softNudgeTimeLeftMsRef.current -= nudgeStepMs;
                if (softNudgeTimeLeftMsRef.current <= 0) {
                    softNudgeRemainingMsRef.current = 0;
                }
            }
            const advancedMs = preciseMsRef.current + delta + nudgeMs;
            preciseMsRef.current = advancedMs;

            if (getRenderKey) {
                publishRenderTime(advancedMs);
            } else if (now - lastRenderTickRef.current >= RENDER_TICK_MS) {
                lastRenderTickRef.current = now;
                publishRenderTime(advancedMs);
            }

            if (now - lastCalibrationRef.current >= CALIBRATION_INTERVAL_MS) {
                lastCalibrationRef.current = now;
                void calibrateFromAudio();
            }

            frame = requestAnimationFrame(tick);
        };

        lastTick.current = performance.now();
        lastRenderTickRef.current = lastTick.current;
        lastCalibrationRef.current = lastTick.current;
        frame = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(syncFrame);
            cancelAnimationFrame(frame);
        };
    }, [calibrateFromAudio, getRenderKey, hardSync, isPlaying, isVisibilityActive, playbackRevision, publishRenderTime]);

    return { renderCurrentMs, preciseMsRef, syncRevision };
}
