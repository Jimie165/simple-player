import type { FluidSpringParams } from '@/features/player/lyrics/fluidLyricsSpring';
import type { DisplayItem } from '@/features/player/lyrics/types';

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

export const isFluidLyricsRowSpatiallyVisible = (
    top: number,
    height: number,
    viewportHeight: number,
    overscanPx = 300,
) => top + height >= -overscanPx && top <= viewportHeight + overscanPx;

interface FluidLyricsMotionArgs {
    activeDisplayIndex: number;
    displayItems: DisplayItem[];
    focusNextLineByVisualEnd: boolean;
    isPlaying: boolean;
    isSeeking: boolean;
    isUserScrolling: boolean;
    variant: 'side' | 'narrow';
}

interface FluidLyricsRowVisualArgs {
    distanceFromActive: number;
    isActive: boolean;
    isUserScrolling: boolean;
    pausedScroll: boolean;
    variant: 'side' | 'narrow';
}

export interface FluidLyricsRowVisualStyle {
    filter: string;
    opacity: string;
}

export function getFluidLyricsRowVisualStyle({
    distanceFromActive,
    isActive,
    isUserScrolling,
    pausedScroll,
    variant,
}: FluidLyricsRowVisualArgs): FluidLyricsRowVisualStyle {
    // 激活行（含重叠双亮的非焦点行）不模糊、不透明减淡；
    // 未激活行按距离模糊 + 降低不透明度。
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
    return {
        filter: showAll || blurPx <= 0.01 ? 'none' : `blur(${blurPx.toFixed(2)}px)`,
        opacity: String(showAll ? 1 : rowOpacity),
    };
}

/** 计算动画优先歌词的纵向滚动弹簧参数。 */
export function getFluidLyricsSpringParams({
    activeDisplayIndex,
    displayItems,
    isPlaying,
    isSeeking,
    isUserScrolling,
}: FluidLyricsMotionArgs): FluidSpringParams {
    if (!isPlaying || isSeeking || isUserScrolling || activeDisplayIndex <= 0 || activeDisplayIndex >= displayItems.length) {
        return { stiffness: 90, damping: 15, mass: 1 };
    }

    const currentItem = displayItems[activeDisplayIndex];
    const previousItem = displayItems[activeDisplayIndex - 1];
    if (currentItem.type === 'interlude' || previousItem.type === 'interlude') {
        return { stiffness: 90, damping: 15, mass: 1 };
    }

    const currentStartMs = currentItem.line.start_time_ms ?? 0;
    const previousStartMs = previousItem.line.start_time_ms ?? 0;
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
export function getFluidLyricsMotionDelay(args: FluidLyricsMotionArgs, displayIndex: number): number {
    return getFluidLyricsMotionDelays(args)[displayIndex] ?? 0;
}

/** 一次性计算当前激活组的牵引延迟，避免在挂载行更新时对每一行重复扫描歌词。 */
export function getFluidLyricsMotionDelays(
    args: FluidLyricsMotionArgs,
): number[] {
    const {
        activeDisplayIndex,
        displayItems,
        focusNextLineByVisualEnd,
        isPlaying,
        isUserScrolling,
        variant,
    } = args;
    const delays = new Array<number>(displayItems.length).fill(0);
    if (isUserScrolling || !isPlaying || activeDisplayIndex < 0) return delays;

    const previousItem = displayItems[activeDisplayIndex - 1];
    const isVisualHandoff = focusNextLineByVisualEnd &&
        previousItem?.type === 'line' &&
        typeof previousItem.line.visual_end_ms === 'number' &&
        (typeof previousItem.line.end_time_ms !== 'number' || previousItem.line.visual_end_ms < previousItem.line.end_time_ms);
    const visibleRowsAboveFocus = isVisualHandoff ? 2 : (variant === 'narrow' ? 3 : 4);
    let topVisibleIndex = activeDisplayIndex;
    let remainingRowsAboveFocus = visibleRowsAboveFocus;
    while (topVisibleIndex > 0 && remainingRowsAboveFocus > 0) {
        topVisibleIndex--;
        if (displayItems[topVisibleIndex]?.type === 'line') remainingRowsAboveFocus--;
    }

    if (previousItem?.type === 'interlude') {
        for (let index = activeDisplayIndex + 1; index < displayItems.length; index++) {
            delays[index] = (index - activeDisplayIndex) * 0.05;
        }
        return delays;
    }

    const baseDelay = isVisualHandoff ? 0.055 : 0.05;
    let rowsBeforeActive = 0;
    for (let index = topVisibleIndex; index <= activeDisplayIndex; index++) {
        delays[index] = rowsBeforeActive * baseDelay;
        if (index < activeDisplayIndex && displayItems[index]?.type === 'line') {
            rowsBeforeActive++;
        }
    }

    const delayAtActive = rowsBeforeActive * baseDelay;
    const decay = 1 / 1.05;
    let rowsAfterActive = 0;
    for (let index = activeDisplayIndex + 1; index < displayItems.length; index++) {
        if (displayItems[index]?.type === 'line') rowsAfterActive++;
        const trailingDelay = baseDelay * (1 - Math.pow(decay, rowsAfterActive)) / (1 - decay);
        delays[index] = delayAtActive + trailingDelay;
    }
    return delays;
}
