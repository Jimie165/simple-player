import type { FluidSpringParams } from '@/features/player/lyrics/fluidLyricsSpring';
import type { DisplayItem } from '@/features/player/lyrics/types';

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

const countLineSteps = (displayItems: DisplayItem[], startIndex: number, endIndex: number) => {
    let steps = 0;
    for (let index = startIndex; index < endIndex; index++) {
        if (displayItems[index]?.type === 'line') steps++;
    }
    return steps;
};

interface FluidLyricsMotionArgs {
    activeDisplayIndex: number;
    displayItems: DisplayItem[];
    focusNextLineByVisualEnd: boolean;
    isPlaying: boolean;
    isUserScrolling: boolean;
    variant: 'side' | 'narrow';
}

interface FluidLyricsRowVisualArgs {
    delay: number;
    distanceFromActive: number;
    isActive: boolean;
    isUserScrolling: boolean;
    pausedScroll: boolean;
    variant: 'side' | 'narrow';
}

export interface FluidLyricsRowVisualStyle {
    filter: string;
    opacity: string;
    transition: string;
}

export function getFluidLyricsRowVisualStyle({
    delay,
    distanceFromActive,
    isActive,
    isUserScrolling,
    pausedScroll,
    variant,
}: FluidLyricsRowVisualArgs): FluidLyricsRowVisualStyle {
    const blurPx = isActive
        ? 0
        : variant === 'narrow'
            ? Math.min(2.8, 0.3 + distanceFromActive * 0.45)
            : Math.min(5.4, 0.8 + distanceFromActive * 1.05);
    const rowOpacity = isActive
        ? 1
        : variant === 'narrow'
            ? Math.max(0.35, 0.85 - distanceFromActive * 0.07)
            : Math.max(0.22, 0.82 - distanceFromActive * 0.12);
    const showAll = isUserScrolling || pausedScroll;
    const transitionDelay = delay * 0.2;

    return {
        filter: showAll ? 'blur(0px)' : `blur(${blurPx}px)`,
        opacity: String(showAll ? 1 : rowOpacity),
        transition: [
            `filter 380ms ease-out ${transitionDelay}s`,
            `opacity 350ms ease-out ${transitionDelay}s`,
        ].join(', '),
    };
}

/** 计算动画优先歌词的纵向滚动弹簧参数。 */
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
    if (currentItem.type === 'interlude' || previousItem.type === 'interlude') {
        return { stiffness: 90, damping: 15, mass: 1 };
    }

    const currentStartMs = currentItem.line.time_ms ?? 0;
    const previousStartMs = previousItem.line.time_ms ?? 0;
    const clampedInterval = clamp(currentStartMs - previousStartMs, 100, 800);
    let speedRatio = 1 - (clampedInterval - 100) / 700;
    speedRatio = Math.pow(speedRatio, 0.2);

    // 以 100/18/1 为慢速基准；快速切行只小幅提高刚度，
    // 阻尼比固定为 0.9，使不同速度下都保留一致的细微自然超调。
    const stiffness = 100 + speedRatio * 30;
    return {
        stiffness,
        damping: Math.sqrt(stiffness) * 1.8,
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
    let topVisibleIndex = activeDisplayIndex;
    let remainingRowsAboveFocus = visibleRowsAboveFocus;
    while (topVisibleIndex > 0 && remainingRowsAboveFocus > 0) {
        topVisibleIndex--;
        if (displayItems[topVisibleIndex]?.type === 'line') remainingRowsAboveFocus--;
    }

    if (previousItem?.type === 'interlude') {
        return displayIndex > activeDisplayIndex
            ? (displayIndex - activeDisplayIndex) * 0.05
            : 0;
    }

    if (displayIndex < topVisibleIndex) return 0;
    const baseDelay = isVisualHandoff ? 0.055 : 0.05;
    if (displayIndex <= activeDisplayIndex) {
        return countLineSteps(displayItems, topVisibleIndex, displayIndex) * baseDelay;
    }

    const delayAtActive = countLineSteps(displayItems, topVisibleIndex, activeDisplayIndex) * baseDelay;
    const rowsAfterActive = countLineSteps(displayItems, activeDisplayIndex + 1, displayIndex + 1);
    const decay = 1 / 1.05;
    const trailingDelay = baseDelay * (1 - Math.pow(decay, rowsAfterActive)) / (1 - decay);
    return delayAtActive + trailingDelay;
}
