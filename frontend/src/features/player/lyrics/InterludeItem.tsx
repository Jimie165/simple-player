import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { interludeGapOpenDurationMs, interludeExitDurationMs } from '@/features/player/lyrics/constants';
import { usePlayerStore } from '@/store/usePlayerStore';

const dotIndexes = [0, 1, 2];
const breathDurationMs = 4500;
const exitDurationSeconds = interludeExitDurationMs / 1000;
const exitPeakRatio = 0.4;

interface InterludeItemProps {
    isActive: boolean;
    forceExiting: boolean;
    forceExitKey: number;
    suppressDots: boolean;
    currentTime: number;
    startMs: number;
    endMs: number;
}

export default function InterludeItem({
    isActive: isCurrentlyActive,
    forceExiting,
    forceExitKey,
    suppressDots,
    currentTime,
    startMs,
    endMs
}: InterludeItemProps) {
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const [preciseMs, setPreciseMs] = useState(currentTime * 1000);
    const [hasShownDots, setHasShownDots] = useState(false);
    const lastTick = useRef(0);
    const lastExternalMs = useRef(currentTime * 1000);
    const currentTimeRef = useRef(currentTime);

    useEffect(() => {
        currentTimeRef.current = currentTime;
    }, [currentTime]);

    useEffect(() => {
        const external = currentTime * 1000;
        const diff = Math.abs(external - lastExternalMs.current);
        let frame: number | null = null;

        if (diff > 1000) {
            frame = requestAnimationFrame(() => setPreciseMs(external));
        }
        lastExternalMs.current = external;

        return () => {
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [currentTime]);

    useEffect(() => {
        const syncFrame = requestAnimationFrame(() => {
            setPreciseMs(currentTimeRef.current * 1000);
        });
        if (!isPlaying) {
            return () => cancelAnimationFrame(syncFrame);
        }

        let frame: number;
        const tick = (now: number) => {
            const delta = now - lastTick.current;
            lastTick.current = now;
            setPreciseMs(prev => prev + delta);
            frame = requestAnimationFrame(tick);
        };
        lastTick.current = performance.now();
        frame = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(syncFrame);
            cancelAnimationFrame(frame);
        };
    }, [isPlaying]);

    const remainingMs = endMs - preciseMs;
    const isActuallyActive = isCurrentlyActive && remainingMs > 1000;
    const isWithinInterludeWindow = preciseMs >= startMs && preciseMs < endMs;
    const areDotsVisible =
        !suppressDots &&
        isActuallyActive &&
        preciseMs >= startMs + interludeGapOpenDurationMs;

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
    const progress = Math.max(0, Math.min(1, (preciseMs - startMs) / (endMs - startMs)));
    const dotOpacities = dotIndexes.map((dotIndex) => {
        const phaseStart = dotIndex / 3;
        const normalized = Math.max(0, Math.min(1, (progress - phaseStart) * 3));
        return 0.24 + normalized * 0.76;
    });
    const cycleProgress = (preciseMs % breathDurationMs) / breathDurationMs;
    const currentScale = 0.95 + 0.1 * Math.sin(cycleProgress * 2 * Math.PI - Math.PI / 2);
    const exitScaleFrames = forceExiting ? [1, 1.15, 0] : [null, 1.15, 0];
    const exitOpacityFrames = forceExiting ? [0.85, 1, 0] : [null, 1, 0];

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
                    times: [0, exitPeakRatio, 1]
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
                            times: [0, exitPeakRatio, 1]
                        }}
                    />
                ))}
            </motion.span>
        </div>
    );
}
