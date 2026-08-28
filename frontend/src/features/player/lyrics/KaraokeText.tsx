import { memo, useContext, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { LyricsWord } from '@/types';
import { parseLyricsWordsToChars } from '@/features/player/lyrics/lyricCharSplitting';
import type { FlatCharItem } from '@/features/player/lyrics/lyricCharSplitting';
import { getKaraokeWordMaskState } from '@/features/player/lyrics/karaokeWordMask';
import {
    LyricsFrameTaskRegistryContext,
    useLyricsFrameScheduler,
} from '@/features/player/lyrics/lyricsFrameScheduler';

interface KaraokeTextProps {
    words: LyricsWord[];
    lineEndMs: number | null;
    nextLineStartMs?: number | null;
    enableTightHandoffTailCompression?: boolean;
    currentMs: number;
    preciseMsRef: RefObject<number>;
    isActive: boolean;
    isFocused: boolean;
    isMotionPrepared: boolean;
    glowDisabled?: boolean;
    fillAlpha?: number;
}

type IndexedCharItem = {
    item: FlatCharItem;
    flatIndex: number;
};

type KaraokeCharStyle = {
    transform: string;
    fillStop: number;
    glowAlpha: number;
};

type KaraokeFloatAnimation = {
    animation: Animation;
    duration: number;
    element: HTMLSpanElement;
    item: FlatCharItem;
    isLastWord: boolean;
    lastCurrentTime: number | null;
};

type KaraokeWordMaskRuntime = {
    charItems: FlatCharItem[];
    charWidths: number[];
    element: HTMLSpanElement;
    endMs: number;
    lastEdgeWidth: string | null;
    lastFillPercent: string | null;
    paddingLeft: number;
    startMs: number;
    totalWidth: number;
};

type WordMotionWindow = {
    startMs: number;
    endMs: number;
};

const animationHeadstartMs = 100;
const karaokeExitDurationMs = 600;
const syllableLiftEm = 0.078;
const restingCharTransform = 'translate3d(0, 0, 0) scale(1)';
const FLOAT_KEYFRAME_COUNT = 16;
const floatKeyframes: Keyframe[] = Array.from(
    { length: FLOAT_KEYFRAME_COUNT + 1 },
    (_, index) => {
        const progress = index / FLOAT_KEYFRAME_COUNT;
        const lift = Math.sin((progress * Math.PI) / 2) * -syllableLiftEm;
        return {
            offset: progress,
            transform: `translateY(${lift.toFixed(4)}em)`,
        };
    },
);
const cjkLayoutCharPattern = /^[\p{Unified_Ideograph}ࠀ-鿼]+$/u;
const whitespaceLayoutCharPattern = /^\s+$/u;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => {
    const x = clamp01(value);
    return x * x * (3 - 2 * x);
};
const evaluateCubicBezier = (
    value: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
) => {
    const x = clamp01(value);
    let parameter = x;

    for (let iteration = 0; iteration < 5; iteration++) {
        const inverse = 1 - parameter;
        const sampledX =
            3 * inverse * inverse * parameter * x1 +
            3 * inverse * parameter * parameter * x2 +
            parameter * parameter * parameter;
        const derivative =
            3 * inverse * inverse * x1 +
            6 * inverse * parameter * (x2 - x1) +
            3 * parameter * parameter * (1 - x2);
        if (Math.abs(derivative) < 0.0001) break;
        parameter = clamp01(
            parameter - (sampledX - x) / derivative
        );
    }

    const inverse = 1 - parameter;
    return (
        3 * inverse * inverse * parameter * y1 +
        3 * inverse * parameter * parameter * y2 +
        parameter * parameter * parameter
    );
};
const getDurationEmphasisAmount = (
    durationMs: number,
    divisorMs: number
) => {
    const ratio = durationMs / divisorMs;
    return ratio > 1 ? Math.sqrt(ratio) : Math.pow(ratio, 3);
};
const getEmphasisDurationMs = (
    groupDurationMs: number,
    isLastWord: boolean
) => (
    Math.max(1000, groupDurationMs) *
    (isLastWord ? 1.2 : 1)
);
const getEmphasisPulse = (value: number) => {
    const x = clamp01(value);
    return x < 0.5
        ? evaluateCubicBezier(
            x / 0.5,
            0.2,
            0.4,
            0.58,
            1
        )
        : 1 - evaluateCubicBezier(
            (x - 0.5) / 0.5,
            0.3,
            0,
            0.58,
            1
        );
};

function getKaraokeCharStyle(
    charItem: FlatCharItem,
    timeMs: number,
    isLastWord: boolean = false,
    glowDisabled = false,
    useWaapiFloat = false,
): KaraokeCharStyle {
    const {
        time_ms,
        durationMs,
        groupStartMs,
        groupDurationMs,
        activeCharIndexInWord,
        activeCharCountInWord,
    } = charItem;
    const fillRawProgress = (timeMs - time_ms) / durationMs;
    const fillProgress = clamp01(fillRawProgress);
    const isFillComplete = fillRawProgress >= 1;
    const hasFillProgress = fillProgress > 0;

    const longToneRaw = clamp01((groupDurationMs - 800) / 760);
    const longToneAmount = smoothstep(longToneRaw);
    const isLongTone = groupDurationMs > 800;
    const glowToneAmount = isLongTone
        ? 0.3 + smoothstep(longToneRaw) * 0.6
        : 0;
    const fillStop = fillProgress * 100;
    const fillEdgeWidth = 26 + longToneAmount * 18;
    const elapsedMs = timeMs - time_ms;
    const motionDurationMs = Math.max(800, durationMs);
    const regularLift = elapsedMs > 0
        ? Math.sin((clamp01(elapsedMs / motionDurationMs) * Math.PI) / 2)
        : 0;
    const charCount = Math.max(1, activeCharCountInWord);
    const charIndex = Math.max(0, activeCharIndexInWord);
    const emphasisDurationMs = getEmphasisDurationMs(
        groupDurationMs,
        isLastWord
    );
    const charDelayMs =
        (emphasisDurationMs / 2.5 / charCount) * charIndex;
    const emphasisProgress = clamp01(
        (timeMs - groupStartMs - charDelayMs) /
        emphasisDurationMs
    );
    const emphasisPulse =
        getEmphasisPulse(emphasisProgress) *
        longToneAmount;
    const motionAmount = Math.min(
        1.2,
        getDurationEmphasisAmount(emphasisDurationMs, 2000) * 0.6
    );
    const glowPulse =
        getEmphasisPulse(emphasisProgress) *
        glowToneAmount;
    const centerOffset = charCount / 2 - charIndex;
    const translateX =
        -emphasisPulse * 0.03 * motionAmount * centerOffset;
    const translateY = useWaapiFloat
        ? 0
        : regularLift * -syllableLiftEm;
    const scale = 1 + emphasisPulse * 0.1 * motionAmount;
    const glowReveal = isFillComplete
        ? 1
        : smoothstep(fillProgress);

    // 按实际输出精度判断 identity，避免 sin(PI) 的浮点残差留下。
    // 静止态和运动态始终使用相同的 3D transform 形式。WebView2 对二维
    // 亚像素文字位移会逐帧重新栅格化，视觉上表现为上浮过程持续抖动。
    const renderedTranslateX = Number(translateX.toFixed(4));
    const renderedTranslateY = Number(translateY.toFixed(4));
    const renderedScale = Number(scale.toFixed(4));
    const transform = renderedTranslateX === 0 && renderedTranslateY === 0 && renderedScale === 1
        ? restingCharTransform
        : `translate3d(${renderedTranslateX.toFixed(4)}em, ${renderedTranslateY.toFixed(4)}em, 0) scale(${renderedScale.toFixed(4)})`;

    return {
        transform,
        fillStop: hasFillProgress || isFillComplete ? fillStop : -(fillEdgeWidth + 1),
        glowAlpha: !isLongTone || glowDisabled ? 0 : glowPulse * glowReveal * 0.75,
    };
}

function getWordMotionWindow(
    group: IndexedCharItem[],
    isLastWord: boolean
): WordMotionWindow {
    let startMs = Number.POSITIVE_INFINITY;
    let endMs = Number.NEGATIVE_INFINITY;

    group.forEach(({ item }) => {
        const liftEndMs = item.time_ms + Math.max(800, item.durationMs);
        const progressionStartMs =
            item.groupStartMs - animationHeadstartMs;
        const progressionEndMs =
            item.groupStartMs + item.groupDurationMs;
        const hasLongToneMotion = item.groupDurationMs > 800;
        const emphasisDurationMs = getEmphasisDurationMs(
            item.groupDurationMs,
            isLastWord
        );
        const charCount = Math.max(
            1,
            item.activeCharCountInWord
        );
        const charIndex = Math.max(
            0,
            item.activeCharIndexInWord
        );
        const charDelayMs =
            (emphasisDurationMs / 2.5 / charCount) * charIndex;
        const emphasisStartMs =
            item.groupStartMs + charDelayMs;
        const emphasisEndMs =
            emphasisStartMs + emphasisDurationMs;
        startMs = Math.min(
            startMs,
            progressionStartMs,
            item.time_ms
        );
        endMs = Math.max(
            endMs,
            item.time_ms + item.durationMs,
            liftEndMs,
            progressionEndMs,
            hasLongToneMotion ? emphasisEndMs : liftEndMs
        );
    });

    return { startMs, endMs };
}

const WORD_PHASE_FUTURE = 0;
const WORD_PHASE_MOTION = 1;
const WORD_PHASE_SETTLED = 2;

const isKaraokeWaapiDisabled = () => typeof window !== 'undefined' &&
    (window as Window & {
        __SIMPLE_PLAYER_DISABLE_KARAOKE_WAAPI__?: boolean;
    }).__SIMPLE_PLAYER_DISABLE_KARAOKE_WAAPI__ === true;

const isKaraokeWordMaskDisabled = () => typeof window !== 'undefined' &&
    (window as Window & {
        __SIMPLE_PLAYER_DISABLE_KARAOKE_WORD_MASK__?: boolean;
    }).__SIMPLE_PLAYER_DISABLE_KARAOKE_WORD_MASK__ === true;

const getWordPhaseCode = ({ startMs, endMs }: WordMotionWindow, timeMs: number) =>
    timeMs < startMs
        ? WORD_PHASE_FUTURE
        : timeMs < endMs
            ? WORD_PHASE_MOTION
            : WORD_PHASE_SETTLED;

function KaraokeTextBase({
    words,
    lineEndMs,
    nextLineStartMs = null,
    enableTightHandoffTailCompression = false,
    preciseMsRef,
    isActive,
    isFocused,
    isMotionPrepared,
    glowDisabled = false,
    fillAlpha = 1,
}: KaraokeTextProps) {
    const frameScheduler = useLyricsFrameScheduler();
    const karaokeFrameRegistry = useContext(LyricsFrameTaskRegistryContext);
    const charRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const charPaintRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const layoutGroupRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const colorsRef = useRef<HTMLSpanElement | null>(null);
    const wasFocusedRef = useRef(isFocused);
    const retainedExitFloatAnimationsRef = useRef<KaraokeFloatAnimation[]>([]);
    const exitFrameRef = useRef<number | null>(null);
    const exitTimerRef = useRef<number | null>(null);
    const useWordMask = !isKaraokeWordMaskDisabled();

    const flatChars = useMemo(
        () => parseLyricsWordsToChars(words, lineEndMs, {
            enabled: enableTightHandoffTailCompression,
            nextLineStartMs,
        }),
        [enableTightHandoffTailCompression, words, lineEndMs, nextLineStartMs]
    );

    const wordGroups = useMemo(() => {
        const groups: IndexedCharItem[][] = [];
        flatChars.forEach((charItem, flatIndex) => {
            if (!groups[charItem.wordIndex]) {
                groups[charItem.wordIndex] = [];
            }
            groups[charItem.wordIndex].push({ item: charItem, flatIndex });
        });
        return groups;
    }, [flatChars]);

    const layoutGroups = useMemo(() => {
        const groups: IndexedCharItem[][] = [];
        let currentGroup: IndexedCharItem[] = [];
        const flushCurrentGroup = () => {
            if (currentGroup.length === 0) return;
            groups.push(currentGroup);
            currentGroup = [];
        };

        flatChars.forEach((charItem, flatIndex) => {
            const indexedChar = { item: charItem, flatIndex };
            if (whitespaceLayoutCharPattern.test(charItem.char)) {
                if (currentGroup.length > 0) {
                    currentGroup.push(indexedChar);
                    flushCurrentGroup();
                } else if (groups.length > 0) {
                    groups[groups.length - 1].push(indexedChar);
                }
                return;
            }
            if (cjkLayoutCharPattern.test(charItem.char)) {
                flushCurrentGroup();
                groups.push([indexedChar]);
                return;
            }
            currentGroup.push(indexedChar);
        });
        flushCurrentGroup();
        return groups;
    }, [flatChars]);

    const wordMaskedCharIndices = useMemo(() => {
        if (!useWordMask) return new Set<number>();
        return new Set(layoutGroups.flatMap(group =>
            group.length > 0 && !cjkLayoutCharPattern.test(group[0].item.char)
                ? group.map(({ flatIndex }) => flatIndex)
                : []
        ));
    }, [layoutGroups, useWordMask]);

    const wordMotionWindows = useMemo(
        () => wordGroups.map((group, wordIndex) =>
            getWordMotionWindow(
                group,
                wordIndex === wordGroups.length - 1
            )
        ),
        [wordGroups]
    );

    useLayoutEffect(() => {
        if (isFocused && retainedExitFloatAnimationsRef.current.length > 0) {
            retainedExitFloatAnimationsRef.current.forEach(({ animation }) => {
                animation.cancel();
            });
            retainedExitFloatAnimationsRef.current = [];
        }
        if (!isActive) return;

        const previousStyles: Array<KaraokeCharStyle | undefined> = [];
        const charElements = charRefs.current;
        const paintElements = charPaintRefs.current;
        const clockRef = preciseMsRef;
        const floatAnimations: Array<KaraokeFloatAnimation | undefined> = [];
        const wordMaskRuntimes: KaraokeWordMaskRuntime[] = useWordMask
            ? layoutGroups.flatMap((group, groupIndex) => {
                const element = layoutGroupRefs.current[groupIndex];
                if (
                    !element ||
                    group.length === 0 ||
                    cjkLayoutCharPattern.test(group[0].item.char)
                ) return [];
                const computedStyle = getComputedStyle(element);
                const charItems = group.map(({ item }) => item);
                return [{
                    charItems,
                    charWidths: group.map(({ flatIndex }) =>
                        charElements[flatIndex]?.offsetWidth ?? 0
                    ),
                    element,
                    endMs: Math.max(...charItems.map(item => item.time_ms + item.durationMs)),
                    lastEdgeWidth: null,
                    lastFillPercent: null,
                    paddingLeft: Number.parseFloat(computedStyle.paddingLeft) || 0,
                    startMs: Math.min(...charItems.map(item => item.time_ms)),
                    totalWidth: element.offsetWidth,
                }];
            })
            : [];
        const canUseWaapiFloat = isFocused &&
            !isKaraokeWaapiDisabled() &&
            typeof Element !== 'undefined' &&
            typeof Element.prototype.animate === 'function';

        if (canUseWaapiFloat) {
            flatChars.forEach((item, flatIndex) => {
                const element = charElements[flatIndex];
                if (!element) return;
                const duration = Number.isFinite(item.durationMs)
                    ? Math.max(800, item.durationMs)
                    : 800;
                try {
                    const animation = element.animate(floatKeyframes, {
                        duration,
                        fill: 'both',
                        composite: 'add',
                        easing: 'linear',
                    });
                    animation.pause();
                    floatAnimations[flatIndex] = {
                        animation,
                        duration,
                        element,
                        item,
                        isLastWord: item.wordIndex === wordGroups.length - 1,
                        lastCurrentTime: null,
                    };
                } catch {
                    // WebView2 versions without additive transform support use
                    // the existing direct-style path below.
                }
            });
        }

        const updateCharStyles = (flatIndex: number, style: KaraokeCharStyle) => {
            const el = charElements[flatIndex];
            const paint = paintElements[flatIndex];
            if (!el || !paint) return;
            const previous = previousStyles[flatIndex];

            // 激活期间由字符自身承载上浮、强调和辉光；退出阶段会反向回放
            // 当前字符状态，因此这里不能在失焦时把字符运动改交给行容器。
            if (isFocused) {
                if (style.transform !== previous?.transform) {
                    if (style.transform === restingCharTransform) {
                        el.style.removeProperty('transform');
                    } else {
                        el.style.transform = style.transform;
                    }
                }
                if (style.glowAlpha !== previous?.glowAlpha) {
                    // 长音的高光归零后仍保留显式的 0，避免与强调 transform
                    // 同时结束时切换绘制状态并重新栅格化字符纹理。
                    if (style.glowAlpha === 0 && !el.classList.contains('karaoke-char-long-tone')) {
                        paint.style.removeProperty('--kg');
                    }
                    else paint.style.setProperty('--kg', String(style.glowAlpha));
                }
            }

            if (
                !wordMaskedCharIndices.has(flatIndex) &&
                style.fillStop !== previous?.fillStop
            ) {
                if (style.fillStop <= 0) paint.style.removeProperty('--kf');
                else paint.style.setProperty('--kf', String(style.fillStop));
            }
            previousStyles[flatIndex] = style;
        };

        const wordMaskPhaseCodes = new Uint8Array(wordMaskRuntimes.length).fill(255);
        const updateWordMaskStyles = (timeMs: number, forceAll = false) => {
            wordMaskRuntimes.forEach((runtime, index) => {
                const phase = timeMs < runtime.startMs
                    ? WORD_PHASE_FUTURE
                    : timeMs < runtime.endMs
                        ? WORD_PHASE_MOTION
                        : WORD_PHASE_SETTLED;
                const phaseChanged = wordMaskPhaseCodes[index] !== phase;
                if (!forceAll && !phaseChanged && phase !== WORD_PHASE_MOTION) return;
                const state = getKaraokeWordMaskState(
                    runtime.charItems,
                    runtime.charWidths,
                    timeMs,
                    runtime.paddingLeft,
                    runtime.totalWidth,
                );
                const fillPercent = state.fillPercent.toFixed(3);
                const edgeWidth = `${state.edgeWidthPx.toFixed(2)}px`;
                if (runtime.lastFillPercent !== fillPercent) {
                    runtime.element.style.setProperty('--kw', fillPercent);
                    runtime.lastFillPercent = fillPercent;
                }
                if (runtime.lastEdgeWidth !== edgeWidth) {
                    runtime.element.style.setProperty('--kwfe', edgeWidth);
                    runtime.lastEdgeWidth = edgeWidth;
                }
                wordMaskPhaseCodes[index] = phase;
            });
        };

        const wordPhaseCodes = new Uint8Array(wordMotionWindows.length).fill(255);
        const updateWordStyles = (timeMs: number, forceAll = false) => {
            wordMotionWindows.forEach((window, wordIndex) => {
                const phase = getWordPhaseCode(window, timeMs);
                const phaseChanged = wordPhaseCodes[wordIndex] !== phase;
                if (!forceAll && !phaseChanged && phase !== WORD_PHASE_MOTION) return;
                const isLastWord =
                    wordIndex === wordGroups.length - 1;
                wordGroups[wordIndex]?.forEach(({ item: charItem, flatIndex }) => {
                    const floatAnimation = floatAnimations[flatIndex];
                    if (floatAnimation) {
                        const currentTime = Math.min(
                            floatAnimation.duration,
                            Math.max(0, timeMs - floatAnimation.item.time_ms),
                        );
                        if (floatAnimation.lastCurrentTime !== currentTime) {
                            floatAnimation.animation.currentTime = currentTime;
                            floatAnimation.lastCurrentTime = currentTime;
                        }
                    }
                    const style = getKaraokeCharStyle(
                        charItem,
                        timeMs,
                        isLastWord,
                        glowDisabled,
                        floatAnimation !== undefined,
                    );
                    updateCharStyles(flatIndex, style);
                });
                wordPhaseCodes[wordIndex] = phase;
            });
        };

        let frame: number | null = null;
        let lastTimeMs = Number.NaN;

        const tick = () => {
            const audioMs = preciseMsRef.current;
            if (audioMs !== null && audioMs !== lastTimeMs) {
                const hasPreviousTime =
                    Number.isFinite(lastTimeMs);
                const hasTimelineJump =
                    hasPreviousTime &&
                    (
                        audioMs < lastTimeMs ||
                        audioMs - lastTimeMs > 200
                    );
                updateWordStyles(audioMs, hasTimelineJump);
                updateWordMaskStyles(audioMs, hasTimelineJump);
                lastTimeMs = audioMs;
            }
        };

        const initialMs = preciseMsRef.current;
        if (initialMs !== null) {
            updateWordStyles(initialMs, true);
            updateWordMaskStyles(initialMs, true);
            lastTimeMs = initialMs;
        }
        const unsubscribeFrame = karaokeFrameRegistry
            ? karaokeFrameRegistry.subscribe(tick)
            : frameScheduler
                ? frameScheduler.subscribe('content', tick)
                : undefined;
        const requestNextFrame = () => {
            frame = requestAnimationFrame(() => {
                tick();
                requestNextFrame();
            });
        };
        if (!frameScheduler) requestNextFrame();

        return () => {
            unsubscribeFrame?.();
            if (frame !== null) cancelAnimationFrame(frame);
            const retainedAnimations: KaraokeFloatAnimation[] = [];
            floatAnimations.forEach(floatAnimation => {
                if (!floatAnimation) return;
                // Keep the existing additive Y animation alive on line exit,
                // matching reverse-playback handoff. Only materialize
                // X/scale underneath it; the exit effect reverses Y to zero.
                const timeMs = clockRef.current;
                if (timeMs !== null) {
                    const style = getKaraokeCharStyle(
                        floatAnimation.item,
                        timeMs,
                        floatAnimation.isLastWord,
                        glowDisabled,
                        true,
                    );
                    if (style.transform === restingCharTransform) {
                        floatAnimation.element.style.removeProperty('transform');
                    } else {
                        floatAnimation.element.style.transform = style.transform;
                    }
                }
                floatAnimation.animation.pause();
                retainedAnimations.push(floatAnimation);
            });
            if (retainedAnimations.length > 0) {
                retainedExitFloatAnimationsRef.current = retainedAnimations;
            }
        };
    }, [
        isActive,
        preciseMsRef,
        flatChars,
        wordGroups,
        wordMotionWindows,
        glowDisabled,
        isFocused,
        frameScheduler,
        karaokeFrameRegistry,
        layoutGroups,
        useWordMask,
        wordMaskedCharIndices,
    ]);

    useLayoutEffect(() => () => {
        retainedExitFloatAnimationsRef.current.forEach(({ animation }) => {
            animation.cancel();
        });
        retainedExitFloatAnimationsRef.current = [];
    }, []);

    useLayoutEffect(() => {
        const wasFocused = wasFocusedRef.current;
        wasFocusedRef.current = isFocused;

        if (isFocused) {
            if (exitFrameRef.current !== null) {
                cancelAnimationFrame(exitFrameRef.current);
                exitFrameRef.current = null;
            }
            if (exitTimerRef.current !== null) {
                window.clearTimeout(exitTimerRef.current);
                exitTimerRef.current = null;
            }
            colorsRef.current?.classList.remove(
                'karaoke-line-exiting',
                'karaoke-line-returning',
                'karaoke-line-settled'
            );
            return;
        }

        if (!wasFocused) {
            // CSS 默认值已经是静止态；不要在虚拟窗口挂载时逐字重复写入。
            return;
        }

        // 保留每个字符当前的 transform，下一帧
        // 再逐字符回到静止态，确保浏览器把它识别为一次连续的反向过渡。
        const exitingElements = charRefs.current.flatMap((motion, index) => {
            const paint = charPaintRefs.current[index];
            return motion && paint && (
                motion.style.transform !== '' ||
                paint.style.getPropertyValue('--kg') !== ''
            ) ? [{ motion, paint }] : [];
        });
        colorsRef.current?.classList.add('karaoke-line-exiting');
        const exitFloatAnimations = retainedExitFloatAnimationsRef.current;
        exitFloatAnimations.forEach(({ animation }) => {
            const currentTime = Number(animation.currentTime ?? 0);
            if (!Number.isFinite(currentTime) || currentTime <= 0) {
                animation.cancel();
                return;
            }
            // Preserve that speed for short progress, 
            // but cap long/long-tone returns to the shared exit
            // window so the character settles while its row is moving up.
            animation.playbackRate = -Math.max(
                1,
                currentTime / karaokeExitDurationMs,
            );
            animation.play();
        });
        exitingElements.forEach(({ motion, paint }) => {
            if (motion.classList.contains('karaoke-char-long-tone')) {
                paint.style.setProperty('--kg', '0');
            }
        });
        exitFrameRef.current = requestAnimationFrame(() => {
            exitFrameRef.current = null;
            const colors = colorsRef.current;
            if (colors?.classList.contains('karaoke-line-exiting')) {
                exitingElements.forEach(({ motion }) => {
                    motion.style.removeProperty('transform');
                });
                colors.classList.add('karaoke-line-returning');
            }
        });
        exitTimerRef.current = window.setTimeout(() => {
            exitTimerRef.current = null;
            exitFloatAnimations.forEach(({ animation }) => animation.cancel());
            if (retainedExitFloatAnimationsRef.current === exitFloatAnimations) {
                retainedExitFloatAnimationsRef.current = [];
            }
            const colors = colorsRef.current;
            colors?.classList.remove(
                'karaoke-line-exiting',
                'karaoke-line-returning'
            );
            // 保留动画状态，仅由父级屏蔽历史 transform/辉光，避免逐字符回收形成尖峰。
            colors?.classList.add('karaoke-line-settled');
        }, karaokeExitDurationMs);
        return () => {
            exitFloatAnimations.forEach(({ animation }) => animation.cancel());
            if (retainedExitFloatAnimationsRef.current === exitFloatAnimations) {
                retainedExitFloatAnimationsRef.current = [];
            }
            if (exitFrameRef.current !== null) {
                cancelAnimationFrame(exitFrameRef.current);
                exitFrameRef.current = null;
            }
            if (exitTimerRef.current !== null) {
                window.clearTimeout(exitTimerRef.current);
                exitTimerRef.current = null;
            }
        };
    }, [flatChars, glowDisabled, isFocused, preciseMsRef, wordGroups.length]);

    return (
        <span
            className={isMotionPrepared ? 'karaoke-motion-region' : undefined}
            style={{ display: 'block' }}
        >
            <span
                ref={colorsRef}
                className="karaoke-text-colors"
                style={{
                    display: 'block',
                    fontKerning: 'none',
                    fontVariantLigatures: 'none',
                    '--kb': 0.30,
                    // glowDisabled 只关闭辉光；背景和声仍需要逐字填充透明度变化。
                    '--kfa': isFocused ? fillAlpha : 0,
                    '--kwp': isFocused ? 1 : 0,
                } as React.CSSProperties}
            >
                {layoutGroups.map((group, groupIndex) => {
                    if (!group || group.length === 0) return null;
                    const isCjkLayoutGroup = cjkLayoutCharPattern.test(group[0].item.char);
                    const useGroupWordMask = useWordMask && !isCjkLayoutGroup;
                    const baseAlpha = 0.30;
                    const groupLongToneAmount = Math.max(...group.map(({ item }) =>
                        smoothstep(clamp01((item.groupDurationMs - 800) / 760))
                    ));
                    const groupFillEdgeAlpha = fillAlpha >= 1
                        ? 0.72 + groupLongToneAmount * 0.2
                        : fillAlpha;
                    const groupFillEdgeMaskAlpha = fillAlpha > baseAlpha
                        ? (groupFillEdgeAlpha - baseAlpha) / (fillAlpha * (1 - baseAlpha))
                        : 1;
                    const filledMaskAlpha = baseAlpha + fillAlpha * (1 - baseAlpha);
                    const filledEdgeMaskAlpha = baseAlpha +
                        fillAlpha * groupFillEdgeMaskAlpha * (1 - baseAlpha);

                    return (
                        <span
                            key={group[0].flatIndex}
                            ref={(element) => {
                                layoutGroupRefs.current[groupIndex] = element;
                            }}
                            className={useGroupWordMask ? 'karaoke-word-mask' : undefined}
                            style={{
                                display: 'inline-block',
                                whiteSpace: 'nowrap',
                                verticalAlign: 'bottom',
                                contain: isCjkLayoutGroup ? undefined : 'layout style',
                                ...(useGroupWordMask ? {
                                    '--kwbt': filledMaskAlpha,
                                    '--kwmt': filledEdgeMaskAlpha,
                                    '--kwd': baseAlpha,
                                } : {}),
                            } as React.CSSProperties}
                        >
                            {group.map(({ item: charItem, flatIndex }) => {
                                const longToneRaw = clamp01((charItem.groupDurationMs - 800) / 760);
                                const longToneAmount = smoothstep(longToneRaw);
                                const isLongTone = charItem.groupDurationMs > 800;
                                const fillEdgeWidth = 26 + longToneAmount * 18;
                                const fillEdgeAlpha = fillAlpha >= 1
                                    ? 0.72 + longToneAmount * 0.2
                                    : fillAlpha;
                                const baseAlpha = 0.30;
                                const fillEdgeMaskAlpha = fillAlpha > baseAlpha
                                    ? (fillEdgeAlpha - baseAlpha) / (fillAlpha * (1 - baseAlpha))
                                    : 1;

                                return (
                                    <span
                                        key={flatIndex}
                                        ref={(element) => {
                                            charRefs.current[flatIndex] = element;
                                        }}
                                        className={isLongTone
                                            ? 'karaoke-char karaoke-char-long-tone'
                                            : 'karaoke-char'}
                                        data-c={charItem.char}
                                    >
                                        <span
                                            ref={(element) => {
                                                charPaintRefs.current[flatIndex] = element;
                                            }}
                                            className="karaoke-char-paint"
                                            data-c={charItem.char}
                                            style={{
                                                '--kfe': fillEdgeWidth,
                                                '--kfem': fillEdgeMaskAlpha,
                                            } as React.CSSProperties}
                                        >
                                            {charItem.char}
                                        </span>
                                    </span>
                                );
                            })}
                        </span>
                    );
                })}
            </span>
        </span>
    );
}

const KaraokeText = memo(KaraokeTextBase, (prev, next) => {
    return (
        prev.words === next.words &&
        prev.lineEndMs === next.lineEndMs &&
        prev.nextLineStartMs === next.nextLineStartMs &&
        prev.enableTightHandoffTailCompression === next.enableTightHandoffTailCompression &&
        prev.preciseMsRef === next.preciseMsRef &&
        prev.isActive === next.isActive &&
        prev.isFocused === next.isFocused &&
        prev.isMotionPrepared === next.isMotionPrepared &&
        prev.glowDisabled === next.glowDisabled &&
        prev.fillAlpha === next.fillAlpha
    );
});

export default KaraokeText;
