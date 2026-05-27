import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { audioService } from '@/services/audioService';

const RENDER_TICK_MS = 75;
const CALIBRATION_INTERVAL_MS = 1500;
const SOFT_SYNC_MS = 150;
const HARD_SYNC_MS = 600;
const SOFT_NUDGE_DURATION_MS = 900;

export function usePrecisePlaybackTime(currentTime: number) {
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const playbackRevision = usePlayerStore(state => state.playbackRevision);
    const [renderCurrentMs, setRenderCurrentMs] = useState(currentTime * 1000);
    const lastTick = useRef(0);
    const lastExternalMs = useRef(currentTime * 1000);
    const lastRenderTickRef = useRef(0);
    const lastCalibrationRef = useRef(0);
    const currentTimeRef = useRef(currentTime);
    const preciseMsRef = useRef(currentTime * 1000);
    const softNudgeRemainingMsRef = useRef(0);
    const softNudgeTimeLeftMsRef = useRef(0);
    const calibrationRequestRef = useRef(false);

    const hardSync = useCallback((ms: number) => {
        preciseMsRef.current = ms;
        softNudgeRemainingMsRef.current = 0;
        softNudgeTimeLeftMsRef.current = 0;
        setRenderCurrentMs(ms);
    }, []);

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
        currentTimeRef.current = currentTime;
    }, [currentTime]);

    useEffect(() => {
        const externalMs = currentTime * 1000;
        const externalStepMs = Math.abs(externalMs - lastExternalMs.current);
        const driftMs = Math.abs(externalMs - preciseMsRef.current);
        let frame: number | null = null;

        if (!isPlaying || externalStepMs > HARD_SYNC_MS || driftMs > HARD_SYNC_MS) {
            frame = requestAnimationFrame(() => hardSync(externalMs));
        }
        lastExternalMs.current = externalMs;

        return () => {
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [currentTime, hardSync, isPlaying]);

    useEffect(() => {
        const syncFrame = requestAnimationFrame(() => {
            hardSync(currentTimeRef.current * 1000);
        });
        if (!isPlaying) {
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

            if (now - lastRenderTickRef.current >= RENDER_TICK_MS) {
                lastRenderTickRef.current = now;
                setRenderCurrentMs(advancedMs);
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
    }, [calibrateFromAudio, hardSync, isPlaying, playbackRevision]);

    return { renderCurrentMs, preciseMsRef };
}
