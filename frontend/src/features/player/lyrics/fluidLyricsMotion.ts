import type { FluidSpringParams } from '@/features/player/lyrics/fluidLyricsSpring';
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
}: FluidLyricsMotionArgs): FluidSpringParams {
    if (!isPlaying || isUserScrolling || activeDisplayIndex <= 0 || activeDisplayIndex >= displayItems.length) {
        return { stiffness: 90, damping: 15, mass: 1 };
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
        return { stiffness: 90, damping: 15, mass: 1 };
    }

    const clampedInterval = clamp(currentStartMs - previousStartMs, 100, 800);
    let ratio = 1 - (clampedInterval - 100) / 700;
    ratio = Math.pow(ratio, 0.2);

    const stiffness = 170 + ratio * 50;
    return {
        stiffness,
        damping: Math.sqrt(stiffness) * 2.2,
        mass: 1,
    };
}

/** 计算动画优先歌词原有的逐行牵拉延迟。 */
export function getFluidLyricsMotionDelay({
    activeDisplayIndex,
    displayItems,
    focusNextLineByVisualEnd,
    isPlaying,
    isUserScrolling,
    variant,
}: FluidLyricsMotionArgs, displayIndex: number): number {
    if (isUserScrolling || !isPlaying || activeDisplayIndex < 0) return 0;

    const previousItem = displayItems[activeDisplayIndex - 1];
    const isVisualHandoff =
        focusNextLineByVisualEnd &&
        previousItem?.type === 'line' &&
        typeof previousItem.line.visual_end_ms === 'number' &&
        (typeof previousItem.line.end_ms !== 'number' || previousItem.line.visual_end_ms < previousItem.line.end_ms);
    const visibleRowsAboveFocus = isVisualHandoff ? 2 : (variant === 'narrow' ? 3 : 4);
    const topVisibleIndex = Math.max(0, activeDisplayIndex - visibleRowsAboveFocus);

    if (previousItem?.type === 'interlude') {
        return displayIndex > activeDisplayIndex
            ? (displayIndex - activeDisplayIndex) * 0.05
            : 0;
    }

    if (displayIndex < topVisibleIndex) return 0;
    const baseDelay = isVisualHandoff ? 0.055 : 0.05;
    if (displayIndex <= activeDisplayIndex) {
        return (displayIndex - topVisibleIndex) * baseDelay;
    }

    const delayAtActive = (activeDisplayIndex - topVisibleIndex) * baseDelay;
    const rowsAfterActive = displayIndex - activeDisplayIndex;
    const decay = 1 / 1.05;
    const trailingDelay = baseDelay * (1 - Math.pow(decay, rowsAfterActive)) / (1 - decay);
    return delayAtActive + trailingDelay;
}
