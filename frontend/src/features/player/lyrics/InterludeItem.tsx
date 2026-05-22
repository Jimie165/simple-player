import { useEffect, useState } from 'react';
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
    startMs,
    endMs
}: InterludeItemProps) {
    const [hasShownDots, setHasShownDots] = useState(false);
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
    const progress = Math.max(0, Math.min(1, (currentMs - startMs) / (endMs - startMs)));
    const dotOpacities = dotIndexes.map((dotIndex) => {
        const phaseStart = dotIndex / 3;
        const normalized = Math.max(0, Math.min(1, (progress - phaseStart) * 3));
        return 0.24 + normalized * 0.76;
    });
    // 呼吸相位：从点出现时开始自然循环，不强制对齐离场时刻
    // 不同间奏因时长差异，离场时自然处于不同呼吸阶段（峰值或谷值），产生视觉变化
    const breathStartMs = startMs + interludeGapOpenDurationMs;
    const elapsedInBreath = Math.max(0, currentMs - breathStartMs);
    const cycleProgress = (elapsedInBreath % BREATH_BASE_MS) / BREATH_BASE_MS;
    const currentScale = BREATH_SCALE_CENTER + BREATH_SCALE_AMP * Math.sin(cycleProgress * 2 * Math.PI - Math.PI / 2);

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
                className="flex items-center gap-[clamp(0.28rem,0.9vmin,0.56rem)] origin-left"
                aria-hidden
                initial={forceExiting ? { scale: 1 } : { scale: 0 }}
                animate={areDotsVisible ? {
                    scale: currentScale
                } : suppressDots ? {
                    scale: 0
                } : canPlayDotsExit ? {
                    scale: exitScaleFrames
                } : {
                    scale: 0
                }}
                transition={areDotsVisible ? {
                    duration: 0.24,
                    ease: 'easeOut'
                } : {
                    duration: exitDurationSeconds,
                    ease: 'easeInOut',
                    times: exitTimes
                }}
            >
                {dotIndexes.map((dotIndex) => (
                    <motion.span
                        key={dotIndex}
                        className="rounded-full bg-white"
                        style={{
                            width: 'clamp(0.48rem, 1.42vmin, 0.97rem)',
                            height: 'clamp(0.48rem, 1.42vmin, 0.97rem)',
                        }}
                        initial={{ opacity: forceExiting ? 1 : 0 }}
                        animate={areDotsVisible ? {
                            opacity: dotOpacities[dotIndex]
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
                    />
                ))}
            </motion.span>
        </div>
    );
}
