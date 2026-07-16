import type { Transition } from 'framer-motion';
import type { DisplayItem } from '@/features/player/lyrics/types';

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

interface FluidLyricsMotionArgs {
    activeDisplayIndex: number;
    displayItems: DisplayItem[];
    focusNextLineByVisualEnd: boolean;
    isPlaying: boolean;
    isUserScrolling: boolean;
    variant: 'side' | 'narrow';
}

/** 计算动画优先歌词原有的动态滚动弹簧参数。 */
export function getFluidLyricsSpringParams({
    activeDisplayIndex,
    displayItems,
    isPlaying,
    isUserScrolling,
}: FluidLyricsMotionArgs): Transition {
    if (!isPlaying || isUserScrolling || activeDisplayIndex <= 0 || activeDisplayIndex >= displayItems.length) {
        return { type: 'spring', stiffness: 90, damping: 15, mass: 1 };
    }

    const currentItem = displayItems[activeDisplayIndex];
    const previousItem = displayItems[activeDisplayIndex - 1];
    const currentStartMs = currentItem.type === 'line'
        ? (currentItem.line.time_ms ?? 0)
        : currentItem.startMs;
    const previousStartMs = previousItem.type === 'line'
        ? (previousItem.line.time_ms ?? 0)
        : previousItem.startMs;

    if (currentItem.type === 'interlude' || previousItem.type === 'interlude') {
        return { type: 'spring', stiffness: 90, damping: 15, mass: 1 };
    }

    const clampedInterval = clamp(currentStartMs - previousStartMs, 100, 800);
    let ratio = 1 - (clampedInterval - 100) / 700;
    ratio = Math.pow(ratio, 0.2);

    const stiffness = 170 + ratio * 50;
    return {
        type: 'spring',
        stiffness,
        damping: Math.sqrt(stiffness) * 2.2,
        mass: 1,
    };
}

/** 计算动画优先歌词原有的逐行牵拉延迟。 */
export function getFluidLyricsMotionDelays({
    activeDisplayIndex,
    displayItems,
    focusNextLineByVisualEnd,
    isPlaying,
    isUserScrolling,
    variant,
}: FluidLyricsMotionArgs): number[] {
    const delays = new Array(displayItems.length).fill(0);
    if (isUserScrolling || !isPlaying || activeDisplayIndex < 0) return delays;

    const previousItem = displayItems[activeDisplayIndex - 1];
    const isVisualHandoff =
        focusNextLineByVisualEnd &&
        previousItem?.type === 'line' &&
        typeof previousItem.line.visual_end_ms === 'number' &&
        (typeof previousItem.line.end_ms !== 'number' || previousItem.line.visual_end_ms < previousItem.line.end_ms);
    const visibleRowsAboveFocus = isVisualHandoff ? 2 : (variant === 'narrow' ? 3 : 4);
    const topVisibleIndex = Math.max(0, activeDisplayIndex - visibleRowsAboveFocus);

    if (previousItem?.type === 'interlude') {
        let currentDelay = 0;
        for (let index = 0; index < displayItems.length; index++) {
            if (index <= activeDisplayIndex) continue;
            currentDelay += 0.05;
            delays[index] = currentDelay;
        }
        return delays;
    }

    let currentDelay = 0;
    let baseDelay = isVisualHandoff ? 0.055 : 0.05;
    for (let index = topVisibleIndex; index < displayItems.length; index++) {
        delays[index] = currentDelay;
        currentDelay += baseDelay;
        if (index >= activeDisplayIndex) baseDelay /= 1.05;
    }
    return delays;
}
