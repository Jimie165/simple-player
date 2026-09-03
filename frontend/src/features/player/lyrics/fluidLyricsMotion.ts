import type { FluidSpringParams } from '@/features/player/lyrics/fluidLyricsSpring';
import type { DisplayItem } from '@/features/player/lyrics/types';

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

interface FluidLyricsMotionArgs {
    activeDisplayIndex: number;
    displayItems: DisplayItem[];
    isPlaying: boolean;
    isUserScrolling: boolean;
}

interface FluidLyricsMotionDelayArgs extends FluidLyricsMotionArgs {
    itemTops: readonly number[];
    itemHeights: readonly number[];
    visualShifts: readonly number[];
    targetScrollY: number;
    parentDisplayIndexMap: ReadonlyMap<number, number>;
    backgroundHeights: Readonly<Record<number, number>>;
    activeIndices: ReadonlySet<number>;
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

/** 只有目标底部进入视口的歌词组才累计牵引延迟。 */
export function getFluidLyricsMotionDelays({
    activeDisplayIndex,
    displayItems,
    isPlaying,
    isUserScrolling,
    itemTops,
    itemHeights,
    visualShifts,
    targetScrollY,
    parentDisplayIndexMap,
    backgroundHeights,
    activeIndices,
}: FluidLyricsMotionDelayArgs): number[] {
    const delays = new Array<number>(displayItems.length).fill(0);
    if (isUserScrolling || !isPlaying || activeDisplayIndex < 0) return delays;

    const groupBottoms = itemTops.map((top, index) =>
        top + (visualShifts[index] ?? 0) + (itemHeights[index] ?? 0) - targetScrollY
    );
    parentDisplayIndexMap.forEach((parentIndex, index) => {
        if (!activeIndices.has(index)) return;
        groupBottoms[parentIndex] = Math.max(
            groupBottoms[parentIndex], groupBottoms[index] + (backgroundHeights[index] ?? 0)
        );
    });

    let delay = 0;
    let baseDelay = 0.05;
    displayItems.forEach((item, index) => {
        const parentIndex = parentDisplayIndexMap.get(index);
        if (parentIndex !== undefined) {
            delays[index] = delays[parentIndex];
            return;
        }
        delays[index] = delay;
        // 背景和声与父行只算一组，间奏占位不额外增加一个歌词组。
        if (item.type === 'interlude') return;
        if (groupBottoms[index] >= 0) {
            delay += baseDelay;
            if (index >= activeDisplayIndex) baseDelay /= 1.05;
        }
    });
    return delays;
}
