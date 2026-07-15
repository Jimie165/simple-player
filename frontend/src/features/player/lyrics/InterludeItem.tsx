import { useEffect, useRef, type RefObject } from 'react';
import { motion } from 'framer-motion';
import {
    interludeGapOpenDurationMs,
    interludeNextLineFocusLeadMs,
} from '@/features/player/lyrics/constants';

const dotIndexes = [0, 1, 2];

const TARGET_BREATHE_DURATION_MS = 1500;
const BREATH_SCALE_CENTER = 0.93;
const BREATH_SCALE_AMPLITUDE = 0.11;
const EXIT_GROWTH_DURATION_MS = 420;
const EXIT_OPACITY_WINDOW_MS = 250;
const EXIT_PHASE_MIN = 0.02;
const EXIT_PHASE_MAX = 0.08;
const EXIT_SCALE_MAX = 1.12;
const FORCED_EXIT_DURATION_MS = 250;

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);
const clamp01 = (value: number) => clamp(value, 0, 1);

const easeOutExpo = (value: number) =>
    value === 1 ? 1 : 1 - 2 ** (-10 * value);

const easeOutSine = (value: number) =>
    Math.sin(clamp01(value) * Math.PI / 2);
const easeInCubic = (value: number) => value ** 3;

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
    isActive,
    forceExiting,
    forceExitKey,
    playbackSyncKey,
    suppressDots,
    currentMs,
    preciseMsRef,
    startMs,
    endMs,
}: InterludeItemProps) {
    const dotsContainerRef = useRef<HTMLSpanElement | null>(null);
    const dotRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const animationEndMs = Math.max(startMs, endMs - interludeNextLineFocusLeadMs);
    const isWithinAnimationWindow = currentMs >= startMs && currentMs < animationEndMs;
    const canAnimateDots =
        !suppressDots &&
        isWithinAnimationWindow &&
        currentMs >= startMs + interludeGapOpenDurationMs;

    useEffect(() => {
        const container = dotsContainerRef.current;
        if (!container) return;

        if (!canAnimateDots) {
            if (!forceExiting) {
                container.style.transform = 'scale(0)';
                dotRefs.current.forEach(dot => {
                    if (dot) dot.style.opacity = '0';
                });
            }
            return;
        }

        const interludeDurationMs = Math.max(1, animationEndMs - startMs);
        const nominalBreatheDurationMs =
            interludeDurationMs /
            Math.ceil(interludeDurationMs / TARGET_BREATHE_DURATION_MS);
        const exitPeakDurationMs = Math.max(
            0,
            interludeDurationMs - EXIT_OPACITY_WINDOW_MS
        );
        const exitStartDurationMs = Math.max(
            0,
            exitPeakDurationMs - EXIT_GROWTH_DURATION_MS
        );
        const nominalCyclePosition =
            exitStartDurationMs /
            (Math.PI * nominalBreatheDurationMs);
        let breatheDurationMs = nominalBreatheDurationMs;
        let closestBreatheDurationDistance = Number.POSITIVE_INFINITY;

        for (
            let cycleIndex = 0;
            cycleIndex <= Math.ceil(nominalCyclePosition) + 1;
            cycleIndex++
        ) {
            const exitPhase = clamp(
                nominalCyclePosition - cycleIndex,
                EXIT_PHASE_MIN,
                EXIT_PHASE_MAX
            );
            const alignedCyclePosition = cycleIndex + exitPhase;
            if (alignedCyclePosition <= 0) continue;

            const candidateBreatheDurationMs =
                exitStartDurationMs /
                (Math.PI * alignedCyclePosition);
            const durationDistance = Math.abs(
                Math.log(
                    candidateBreatheDurationMs /
                    nominalBreatheDurationMs
                )
            );
            if (durationDistance >= closestBreatheDurationDistance) continue;

            closestBreatheDurationDistance = durationDistance;
            breatheDurationMs = candidateBreatheDurationMs;
        }

        const getBreathScale = (durationMs: number) => {
            const angle =
                1.5 * Math.PI - (durationMs / breatheDurationMs) * 2;

            return (
                BREATH_SCALE_CENTER +
                BREATH_SCALE_AMPLITUDE * Math.sin(angle)
            );
        };
        const dotsVisibleStartDurationMs = interludeGapOpenDurationMs;
        const dotsWhiteningDurationMs = Math.max(
            1,
            exitStartDurationMs - dotsVisibleStartDurationMs
        );
        const exitMotionDurationMs = Math.max(
            1,
            exitPeakDurationMs - exitStartDurationMs
        );
        const exitStartScale = getBreathScale(exitStartDurationMs);
        const exitScaleDistance = EXIT_SCALE_MAX - exitStartScale;
        let frame: number;

        const tick = () => {
            const preciseMs = clamp(preciseMsRef.current, startMs, animationEndMs);
            const currentDurationMs = preciseMs - startMs;
            const remainingMs = animationEndMs - preciseMs;
            const breathAngle =
                1.5 * Math.PI - (currentDurationMs / breatheDurationMs) * 2;
            let scale =
                BREATH_SCALE_CENTER +
                BREATH_SCALE_AMPLITUDE * Math.sin(breathAngle);
            let globalOpacity = 1;

            if (currentDurationMs < 2000) {
                scale *= easeOutExpo(clamp01(currentDurationMs / 2000));
            }

            if (currentDurationMs < 500) {
                globalOpacity = 0;
            } else if (currentDurationMs < 1000) {
                globalOpacity *= (currentDurationMs - 500) / 500;
            }

            if (currentDurationMs >= exitStartDurationMs) {
                const exitElapsedMs =
                    currentDurationMs - exitStartDurationMs;

                const exitProgress = clamp01(
                    exitElapsedMs / exitMotionDurationMs
                );
                const easedExitProgress = easeOutSine(exitProgress);

                scale =
                    exitStartScale +
                    exitScaleDistance * easedExitProgress;
            }

            if (remainingMs < EXIT_OPACITY_WINDOW_MS) {
                const collapseProgress = clamp01(
                    1 - remainingMs / EXIT_OPACITY_WINDOW_MS
                );
                const collapseScale = 1 - easeInCubic(collapseProgress);

                scale *= collapseScale;
                globalOpacity *= 1 - collapseProgress;
            }

            container.style.transform = `scale(${Math.max(0, scale)})`;

            dotIndexes.forEach(dotIndex => {
                const dot = dotRefs.current[dotIndex];
                if (!dot) return;

                const whiteningProgress = clamp01(
                    (currentDurationMs - dotsVisibleStartDurationMs) /
                    dotsWhiteningDurationMs
                );
                const dotWhiteningProgress = clamp01(
                    whiteningProgress * dotIndexes.length - dotIndex
                );
                const dotOpacity =
                    0.25 + dotWhiteningProgress * 0.75;
                dot.style.opacity = `${clamp01(globalOpacity * dotOpacity)}`;
            });

            frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [
        animationEndMs,
        canAnimateDots,
        forceExiting,
        playbackSyncKey,
        preciseMsRef,
        startMs,
    ]);

    const shouldKeepContainer =
        !suppressDots &&
        (isWithinAnimationWindow || forceExiting);

    return (
        <div
            className="px-[clamp(1.2rem,2.2vw,2rem)] flex items-center overflow-hidden"
            aria-hidden={!isActive && !forceExiting}
            style={{
                height: 'clamp(2.5rem,6vmin,4rem)'
            }}
        >
            <motion.span
                data-force-exit-key={forceExitKey}
                className="origin-left"
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{
                    opacity: shouldKeepContainer && !forceExiting ? 1 : 0,
                }}
                transition={{
                    duration: FORCED_EXIT_DURATION_MS / 1000,
                    ease: 'easeOut',
                }}
            >
                <span
                    ref={dotsContainerRef}
                    className="flex items-center gap-[clamp(0.28rem,0.9vmin,0.56rem)] origin-left"
                >
                    {dotIndexes.map(dotIndex => (
                        <span
                            key={dotIndex}
                            ref={node => {
                                dotRefs.current[dotIndex] = node;
                            }}
                            className="block rounded-full bg-white"
                            style={{
                                width: 'clamp(0.48rem, 1.42vmin, 0.97rem)',
                                height: 'clamp(0.48rem, 1.42vmin, 0.97rem)',
                                opacity: 0,
                            }}
                        />
                    ))}
                </span>
            </motion.span>
        </div>
    );
}
