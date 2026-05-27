import { useEffect, useRef, useState, type RefObject } from 'react';
import { motion } from 'framer-motion';
import {
    interludeExitCollapseDelayMs,
    interludeGapOpenDurationMs,
    interludeExitDurationMs,
} from '@/features/player/lyrics/constants';

const dotIndexes = [0, 1, 2];

// 呼吸动画参数
const BREATH_BASE_MS = 4500;
const BREATH_SCALE_CENTER = 0.95;
const BREATH_SCALE_AMP = 0.1;
const BREATH_PHASE_LEAD_MS = 420;
const DOTS_ENTER_DURATION_MS = 340;

// 离场动画参数
const EXIT_SCALE_MIN = 0.8;
const EXIT_SCALE_MAX = 1.15;
const ENTER_SCALE_DURATION_MS = 320;
const exitDurationSeconds = interludeExitDurationMs / 1000;
const exitCompleteRatio = Math.max(
    0.55,
    Math.min(
        1,
        interludeExitCollapseDelayMs / interludeExitDurationMs
    )
);
const exitMaxRatio = Math.max(0.2, exitCompleteRatio - ENTER_SCALE_DURATION_MS / interludeExitDurationMs);
const exitTimes = [0, 0.2, exitMaxRatio, exitCompleteRatio, 1];

interface InterludeItemProps {
    isActive: boolean;
    forceExiting: boolean;
    forceExitKey: number;
    playbackSyncKey: number;
    suppressDots: boolean;
    currentMs: number;
    preciseMsRef: RefObject<number>;
    startMs: number;
    endMs: number;
}

export default function InterludeItem({
    isActive: isCurrentlyActive,
    forceExiting,
    forceExitKey,
    playbackSyncKey,
    suppressDots,
    currentMs,
    preciseMsRef,
    startMs,
    endMs
}: InterludeItemProps) {
    const [hasShownDots, setHasShownDots] = useState(false);
    const dotsContainerRef = useRef<HTMLSpanElement | null>(null);
    const dotRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const dotsVisibleSinceRef = useRef<number | null>(null);
    const remainingMs = endMs - currentMs;
    const isActuallyActive = isCurrentlyActive && remainingMs > interludeExitDurationMs;
    const isWithinInterludeWindow = currentMs >= startMs && currentMs < endMs;
    const areDotsVisible =
        !suppressDots &&
        isActuallyActive &&
        currentMs >= startMs + interludeGapOpenDurationMs;

    useEffect(() => {
        const frame = requestAnimationFrame(() => setHasShownDots(false));
        return () => cancelAnimationFrame(frame);
    }, [playbackSyncKey, startMs, endMs]);

    useEffect(() => {
        let frame: number | null = null;

        if (areDotsVisible) {
            frame = requestAnimationFrame(() => setHasShownDots(true));
            return () => {
                if (frame !== null) cancelAnimationFrame(frame);
            };
        }

        if (suppressDots || (!isWithinInterludeWindow && !forceExiting)) {
            frame = requestAnimationFrame(() => setHasShownDots(false));
        }

        return () => {
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [areDotsVisible, forceExiting, isWithinInterludeWindow, suppressDots]);

    const canPlayDotsExit = !suppressDots && (forceExiting || hasShownDots);
    useEffect(() => {
        const container = dotsContainerRef.current;
        if (!areDotsVisible || !container) return;

        dotsVisibleSinceRef.current = performance.now();
        let frame: number;
        const tick = (now: number) => {
            const preciseMs = preciseMsRef.current;
            const breathStartMs = startMs + interludeGapOpenDurationMs;
            const visibleEndMs = Math.max(breathStartMs, endMs - interludeExitDurationMs);
            const visibleDurationMs = visibleEndMs - breathStartMs;
            const progress = visibleDurationMs <= 0
                ? 1
                : Math.max(0, Math.min(1, (preciseMs - breathStartMs) / visibleDurationMs));
            const elapsedInBreath = Math.max(0, preciseMs - breathStartMs + BREATH_PHASE_LEAD_MS);
            const cycleProgress = (elapsedInBreath % BREATH_BASE_MS) / BREATH_BASE_MS;
            const breathScale = BREATH_SCALE_CENTER + BREATH_SCALE_AMP * Math.sin(cycleProgress * 2 * Math.PI - Math.PI / 2);
            const visibleSince = dotsVisibleSinceRef.current ?? now;
            const enterRaw = Math.max(0, Math.min(1, (now - visibleSince) / DOTS_ENTER_DURATION_MS));
            const enterEase = 1 - Math.pow(1 - enterRaw, 3);
            const currentScale = breathScale * enterEase;

            container.style.transform = `scale(${currentScale})`;
            dotIndexes.forEach((dotIndex) => {
                const dot = dotRefs.current[dotIndex];
                if (!dot) return;
                const phaseStart = dotIndex / 3;
                const normalized = Math.max(0, Math.min(1, (progress - phaseStart) * 3));
                dot.style.opacity = `${0.24 + normalized * 0.76}`;
            });

            frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
        return () => {
            dotsVisibleSinceRef.current = null;
            cancelAnimationFrame(frame);
        };
    }, [areDotsVisible, endMs, preciseMsRef, startMs]);

    // 离场四阶段关键帧：变白+缩至最小 → 放大至最大 → 缩小消失
    const exitScaleFrames = forceExiting
        ? [1, EXIT_SCALE_MIN, EXIT_SCALE_MAX, 0, 0]
        : [null, EXIT_SCALE_MIN, EXIT_SCALE_MAX, 0, 0];
    const exitOpacityFrames = forceExiting
        ? [1, 1, 1, 0, 0]
        : [null, 1, 1, 0, 0];

    return (
        <div
            className="px-[clamp(1.2rem,2.2vw,2rem)] flex items-center overflow-hidden"
            aria-hidden={!isActuallyActive}
            style={{
                height: 'clamp(2.5rem,6vmin,4rem)'
            }}
        >
            <motion.span
                key={forceExiting ? `force-exit-${forceExitKey}` : 'normal'}
                className="origin-left"
                aria-hidden
                initial={forceExiting ? { scale: 1 } : { scale: 0 }}
                animate={areDotsVisible ? {
                    scale: 1
                } : suppressDots ? {
                    scale: 0
                } : canPlayDotsExit ? {
                    scale: exitScaleFrames
                } : {
                    scale: 0
                }}
                transition={areDotsVisible ? {
                    duration: 0,
                } : {
                    duration: exitDurationSeconds,
                    ease: 'easeInOut',
                    times: exitTimes
                }}
            >
                <span
                    ref={dotsContainerRef}
                    className="flex items-center gap-[clamp(0.28rem,0.9vmin,0.56rem)] origin-left"
                >
                    {dotIndexes.map((dotIndex) => (
                        <motion.span
                            key={dotIndex}
                            initial={{ opacity: forceExiting ? 1 : 0 }}
                            animate={areDotsVisible ? {
                                opacity: 1
                            } : suppressDots ? {
                                opacity: 0
                            } : canPlayDotsExit ? {
                                opacity: exitOpacityFrames
                            } : {
                                opacity: 0
                            }}
                            transition={areDotsVisible ? {
                                duration: 0.24, ease: 'easeOut'
                            } : {
                                duration: exitDurationSeconds,
                                ease: 'easeInOut',
                                times: exitTimes
                            }}
                        >
                            <span
                                ref={(node) => {
                                    dotRefs.current[dotIndex] = node;
                                }}
                                className="block rounded-full bg-white"
                                style={{
                                    width: 'clamp(0.48rem, 1.42vmin, 0.97rem)',
                                    height: 'clamp(0.48rem, 1.42vmin, 0.97rem)',
                                }}
                            />
                        </motion.span>
                    ))}
                </span>
            </motion.span>
        </div>
    );
}
