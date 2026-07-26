import { useEffect, useLayoutEffect, useMemo, useRef, useState, memo, type RefObject } from 'react';
import type { LyricsWord } from '@/types';
import { parseLyricsWordsToChars } from '@/features/player/lyrics/lyricCharSplitting';
import type { FlatCharItem } from '@/features/player/lyrics/lyricCharSplitting';

interface KaraokeTextProps {
    words: LyricsWord[];
    lineEndMs: number | null;
    nextLineStartMs?: number | null;
    enableTightHandoffTailCompression?: boolean;
    currentMs: number;
    preciseMsRef: RefObject<number>;
    isActive: boolean;
    isFocused: boolean;
}

type IndexedCharItem = {
    item: FlatCharItem;
    flatIndex: number;
};

type KaraokeCharStyle = {
    transform: string;
    translateYEm: number;
    scaleValue: number;
    willChange: string;
    fillBackgroundImage: string;
    glowMask: string;
    glowOpacity: number;
    glowShadow: string;
};

type WordPhase = 'future' | 'motion' | 'settled';

const karaokeExitDurationMs = 500;
const completedFillBackground =
    'linear-gradient(to right, rgba(255,255,255,1), rgba(255,255,255,1))';
const settledWordTransform = 'translate3d(0, -0.078em, 0)';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => {
    const x = clamp01(value);
    return x * x * (3 - 2 * x);
};
const scaleEmphasisEase = (value: number) => {
    const x = clamp01(value);
    if (x >= 0.5) return smoothstep((1 - x) / 0.5);

    const attack = smoothstep(x / 0.5);
    return 1 - Math.pow(1 - attack, 1.35);
};

function getKaraokeCharStyle(
    charItem: FlatCharItem,
    timeMs: number,
    isActive: boolean = true
): KaraokeCharStyle {
    const {
        time_ms,
        durationMs,
        groupStartMs,
        groupDurationMs,
        activeCharIndexInWord,
        activeCharCountInWord,
    } = charItem;
    const baseAlpha = isActive ? 0.30 : 1.0;
    const rawProgress = (timeMs - time_ms) / durationMs;
    const progress = clamp01(rawProgress);
    const isComplete = rawProgress >= 1;
    const stopVal = progress * 100;
    const hasProgress = progress > 0;

    const longToneRaw = clamp01((groupDurationMs - 800) / 760);
    const longToneAmount = smoothstep(longToneRaw);
    const edgeWidth = 26 + longToneAmount * 18;
    const edgeAlpha = 0.72 + longToneAmount * 0.2;
    const softEdgeStart = hasProgress ? Math.max(0, stopVal - edgeWidth) : 0;
    const softEdgeEnd = hasProgress ? Math.min(125, stopVal + edgeWidth) : 0;

    const elapsedMs = timeMs - time_ms;
    const hasStarted = elapsedMs > 0;
    const attackMs = Math.max(800, durationMs);
    const lift = hasStarted ? Math.sin((clamp01(elapsedMs / attackMs) * Math.PI) / 2) : 0;

    const charCount = Math.max(1, activeCharCountInWord);
    const charIndex = Math.max(0, activeCharIndexInWord);
    const charDelayMs = (groupDurationMs / 2.5 / charCount) * charIndex;
    const emphasisDurationMs = Math.max(800, groupDurationMs);
    const emphasisProgress = (timeMs - groupStartMs - charDelayMs) / emphasisDurationMs;

    // Scaling follows each character's complete staggered wave. Its slightly
    // broader visible attack keeps trailing characters growing before the short
    // acceleration phase, while the word-level release cannot truncate them.
    const scaleEffect = longToneAmount * scaleEmphasisEase(emphasisProgress);
    const lastCharDelayMs = (groupDurationMs / 2.5 / charCount) * (charCount - 1);
    const glowEndMs = groupStartMs + lastCharDelayMs + emphasisDurationMs;
    const glowReleaseMs = Math.min(720, Math.max(480, groupDurationMs * 0.22));
    const glowRelease = smoothstep((glowEndMs - timeMs) / glowReleaseMs);
    const glowBuild = hasProgress ? 1 - Math.pow(1 - progress, 2) : 0;
    const glowEffect = longToneAmount * glowBuild * glowRelease;

    const emphasisFloatProgress = clamp01((timeMs - (groupStartMs + charDelayMs - 400)) / (emphasisDurationMs * 1.4));
    const emphasisLift = Math.sin(emphasisFloatProgress * Math.PI) * longToneAmount;
    const translateY = lift * -0.078 + emphasisLift * -0.07;
    const scale = 1 + scaleEffect * 0.1;
    const glowOpacity = glowEffect * (0.5 + progress * 0.35);
    const glowRadius = 2.5 + glowEffect * 9;
    const glowShadow = glowEffect > 0.01
        ? `0 0 ${Math.min(5, glowRadius * 0.45)}px rgba(255,255,255,${0.34 + glowEffect * 0.2}), 0 0 ${glowRadius}px rgba(255,255,255,${0.18 + glowEffect * 0.24})`
        : 'none';
    const glowMask = isComplete
        ? 'linear-gradient(to right, #fff, #fff)'
        : hasProgress
            ? `linear-gradient(to right, #fff 0%, #fff ${softEdgeStart}%, rgba(255,255,255,0.72) ${stopVal}%, transparent ${softEdgeEnd}%, transparent 100%)`
            : 'linear-gradient(to right, transparent, transparent)';
    const fillBackgroundImage = isComplete
        ? completedFillBackground
        : hasProgress
            ? `linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,1) ${softEdgeStart}%, rgba(255,255,255,${edgeAlpha}) ${stopVal}%, rgba(255,255,255,${baseAlpha}) ${softEdgeEnd}%, rgba(255,255,255,${baseAlpha}) 100%)`
            : `linear-gradient(to right, rgba(255,255,255,${baseAlpha}), rgba(255,255,255,${baseAlpha}))`;

    return {
        transform: `translate3d(0, ${translateY.toFixed(4)}em, 0) scale(${scale.toFixed(4)})`,
        translateYEm: translateY,
        scaleValue: scale,
        willChange: 'transform',
        fillBackgroundImage,
        glowMask,
        glowOpacity: glowOpacity > 0.01 ? glowOpacity : 0,
        glowShadow,
    };
}

function getWordMotionWindow(group: IndexedCharItem[]) {
    let startMs = Number.POSITIVE_INFINITY;
    let endMs = Number.NEGATIVE_INFINITY;

    group.forEach(({ item }) => {
        const charCount = Math.max(1, item.activeCharCountInWord);
        const charIndex = Math.max(0, item.activeCharIndexInWord);
        const charDelayMs = (item.groupDurationMs / 2.5 / charCount) * charIndex;
        const emphasisDurationMs = Math.max(800, item.groupDurationMs);
        const emphasisStartMs = item.groupStartMs + charDelayMs - 400;
        const emphasisEndMs = emphasisStartMs + emphasisDurationMs * 1.4;
        const liftEndMs = item.time_ms + Math.max(800, item.durationMs);
        const hasLongToneMotion = item.groupDurationMs > 800;

        startMs = Math.min(startMs, item.time_ms, hasLongToneMotion ? emphasisStartMs : item.time_ms);
        endMs = Math.max(
            endMs,
            item.time_ms + item.durationMs,
            liftEndMs,
            hasLongToneMotion
                ? item.groupStartMs + charDelayMs + emphasisDurationMs
                : liftEndMs,
            hasLongToneMotion ? emphasisEndMs : liftEndMs,
        );
    });

    return { startMs, endMs };
}

function getWordPhases(wordGroups: IndexedCharItem[][], timeMs: number): WordPhase[] {
    return wordGroups.map(group => {
        if (!group?.length) return 'settled';
        const { startMs, endMs } = getWordMotionWindow(group);
        if (timeMs < startMs) return 'future';
        if (timeMs < endMs) return 'motion';
        return 'settled';
    });
}

const getWordPhaseKey = (phases: WordPhase[]) => phases
    .map(phase => phase === 'future' ? 'f' : phase === 'motion' ? 'm' : 's')
    .join('');

function KaraokeTextBase({
    words,
    lineEndMs,
    nextLineStartMs = null,
    enableTightHandoffTailCompression = false,
    currentMs: baseCurrentMs,
    preciseMsRef,
    isActive,
    isFocused,
}: KaraokeTextProps) {
    const baseWordRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const charRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const fillRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const glowRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const wordPhaseKeyRef = useRef('');
    const [richLayerState, setRichLayerState] = useState({
        focused: isFocused,
        visible: isFocused,
        settling: false,
    });
    if (richLayerState.focused !== isFocused) {
        setRichLayerState({
            focused: isFocused,
            visible: isFocused || richLayerState.visible,
            settling: false,
        });
    }
    const keepRichLayer = richLayerState.visible;

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
    const [wordPhaseSnapshot, setWordPhaseSnapshot] = useState(() => ({
        phases: getWordPhases(wordGroups, baseCurrentMs),
        timeMs: baseCurrentMs,
    }));
    const renderWordPhases = wordPhaseSnapshot.phases.length === wordGroups.length
        ? wordPhaseSnapshot.phases
        : getWordPhases(wordGroups, baseCurrentMs);
    const renderTimeMs = wordPhaseSnapshot.timeMs;

    useLayoutEffect(() => {
        if (!isActive || !isFocused) return;

        const previousStyles: Array<KaraokeCharStyle | undefined> = [];
        const updateWordStyles = (timeMs: number) => {
            const nextPhases = getWordPhases(wordGroups, timeMs);
            const nextPhaseKey = getWordPhaseKey(nextPhases);
            if (nextPhaseKey !== wordPhaseKeyRef.current) {
                wordPhaseKeyRef.current = nextPhaseKey;
                setWordPhaseSnapshot({ phases: nextPhases, timeMs });
            }

            nextPhases.forEach((phase, wordIndex) => {
                if (phase !== 'motion') return;
                const group = wordGroups[wordIndex];
                group?.forEach(({ item: charItem, flatIndex }) => {
                    const el = charRefs.current[flatIndex];
                    const fillEl = fillRefs.current[flatIndex];
                    const glowEl = glowRefs.current[flatIndex];
                    if (!el || !fillEl) return;

                    const style = getKaraokeCharStyle(charItem, timeMs, true);
                    const previousStyle = previousStyles[flatIndex];
                    if (style.transform !== previousStyle?.transform) {
                        el.style.transform = style.transform;
                    }
                    if (style.willChange !== previousStyle?.willChange) {
                        el.style.willChange = style.willChange;
                    }
                    if (style.fillBackgroundImage !== previousStyle?.fillBackgroundImage) {
                        fillEl.style.backgroundImage = style.fillBackgroundImage;
                    }
                    if (glowEl && style.glowMask !== previousStyle?.glowMask) {
                        glowEl.style.maskImage = style.glowMask;
                        glowEl.style.webkitMaskImage = style.glowMask;
                    }
                    if (glowEl && style.glowOpacity !== previousStyle?.glowOpacity) {
                        glowEl.style.opacity = String(style.glowOpacity);
                    }
                    if (glowEl && style.glowShadow !== previousStyle?.glowShadow) {
                        glowEl.style.textShadow = style.glowShadow;
                    }
                    previousStyles[flatIndex] = style;
                });
            });
        };

        let frame: number;
        let lastTimeMs = Number.NaN;

        const tick = () => {
            const timeMs = preciseMsRef.current;
            if (timeMs !== lastTimeMs) {
                updateWordStyles(timeMs);
                lastTimeMs = timeMs;
            }
            frame = requestAnimationFrame(tick);
        };

        const initialTimeMs = preciseMsRef.current;
        const initialPhases = getWordPhases(wordGroups, initialTimeMs);
        wordPhaseKeyRef.current = getWordPhaseKey(initialPhases);
        setWordPhaseSnapshot(previous =>
            getWordPhaseKey(previous.phases) === wordPhaseKeyRef.current
                ? previous
                : { phases: initialPhases, timeMs: initialTimeMs }
        );
        frame = requestAnimationFrame(tick);
        // 在焦点切换的提交阶段、浏览器绘制退出态之前同步停掉逐帧写入。
        // 否则旧 rAF 可能把少数尾字重新写成未完成渐变并留在退出层中。
        return () => cancelAnimationFrame(frame);
    }, [isActive, isFocused, preciseMsRef, wordGroups]);

    useLayoutEffect(() => {
        if (!keepRichLayer) return;

        const range = document.createRange();
        wordGroups.forEach((group, wordIndex) => {
            const baseWord = baseWordRefs.current[wordIndex];
            const textNode = baseWord?.firstChild;
            if (!baseWord || !textNode || textNode.nodeType !== Node.TEXT_NODE || !group?.length) return;

            const baseRect = baseWord.getBoundingClientRect();
            if (baseRect.width <= 0 || baseRect.height <= 0) return;
            let textOffset = 0;
            group.forEach(({ item, flatIndex }) => {
                const charElement = charRefs.current[flatIndex];
                const nextOffset = textOffset + item.char.length;
                if (charElement) {
                    range.setStart(textNode, textOffset);
                    range.setEnd(textNode, nextOffset);
                    const charRect = range.getBoundingClientRect();
                    charElement.style.left =
                        `${((charRect.left - baseRect.left) / baseRect.width) * 100}%`;
                    charElement.style.top = '0';
                    charElement.style.width = `${(charRect.width / baseRect.width) * 100}%`;
                }
                textOffset = nextOffset;
            });
        });
        range.detach();
    }, [keepRichLayer, wordGroups]);

    useLayoutEffect(() => {
        if (isFocused || !keepRichLayer) return;

        const timeMs = preciseMsRef.current;
        const phases = getWordPhases(wordGroups, timeMs);
        wordPhaseKeyRef.current = getWordPhaseKey(phases);
        setWordPhaseSnapshot(previous =>
            previous.timeMs === timeMs
                ? previous
                : { phases, timeMs }
        );
    }, [isFocused, keepRichLayer, preciseMsRef, wordGroups]);

    useEffect(() => {
        if (!keepRichLayer) return;
        if (isFocused) return;

        let settleFrame = 0;
        let releaseFrame = 0;
        const timer = window.setTimeout(() => {
            setRichLayerState(state => state.focused ? state : { ...state, settling: true });

            // Let the stable glyph nodes paint without transforms before removing
            // only their expensive glow effects.
            settleFrame = requestAnimationFrame(() => {
                releaseFrame = requestAnimationFrame(() => {
                    setRichLayerState(state => state.focused
                        ? state
                        : { ...state, visible: false, settling: false });
                });
            });
        }, karaokeExitDurationMs);

        return () => {
            window.clearTimeout(timer);
            cancelAnimationFrame(settleFrame);
            cancelAnimationFrame(releaseFrame);
        };
    }, [isFocused, keepRichLayer]);

    const renderWordGroups = () => wordGroups.map((group, wordIndex) => {
                if (!group || group.length === 0) return null;

                const phase = keepRichLayer
                    ? renderWordPhases[wordIndex] ?? 'settled'
                    : 'settled';
                const shouldRenderCharLayer = keepRichLayer;
                const isSettlingLayer = keepRichLayer && !isFocused && richLayerState.settling;
                const isExitLayer = keepRichLayer && !isFocused && !isSettlingLayer;
                const wordText = group.map(({ item }) => item.char).join('');
                const baseWordFillBackground = isFocused && phase === 'future'
                    ? 'linear-gradient(to right, rgba(255,255,255,0.30), rgba(255,255,255,0.30))'
                    : completedFillBackground;
                const baseWordExitStyle = isExitLayer && phase === 'settled'
                    ? {
                        animation: `karaoke-char-exit ${karaokeExitDurationMs}ms ease-in-out both`,
                        '--karaoke-char-exit-y': '-0.078em',
                        '--karaoke-char-exit-scale': '1',
                    }
                    : undefined;

                return (
                    <span
                        key={wordIndex}
                        style={{
                            position: 'relative',
                            display: 'inline-block',
                            whiteSpace: 'nowrap',
                            fontKerning: 'none',
                            fontVariantLigatures: 'none',
                            transform: 'none',
                            willChange: 'auto',
                            transition: 'none',
                            backfaceVisibility: 'hidden',
                            overflow: 'visible',
                        }}
                    >
                        <span
                            ref={(el) => {
                                baseWordRefs.current[wordIndex] = el;
                            }}
                            style={{
                                display: 'inline-block',
                                whiteSpace: 'pre-wrap',
                                visibility: shouldRenderCharLayer ? 'hidden' : 'visible',
                                backgroundImage: baseWordFillBackground,
                                WebkitBackgroundClip: 'text',
                                backgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                color: 'transparent',
                                transform: isFocused && phase === 'settled'
                                    ? settledWordTransform
                                    : 'none',
                                transformOrigin: 'center',
                                backfaceVisibility: 'hidden',
                                ...baseWordExitStyle,
                            }}
                        >
                            {wordText}
                        </span>
                        {shouldRenderCharLayer && (
                            <span
                                aria-hidden="true"
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    pointerEvents: 'none',
                                    overflow: 'visible',
                                }}
                            >
                                {group.map(({ item: charItem, flatIndex }) => {
                                    const style = getKaraokeCharStyle(
                                        charItem,
                                        renderTimeMs,
                                        true
                                    );
                                    const hasGlowEffect = charItem.groupDurationMs > 800;
                                    const exitStyle = isExitLayer ? {
                                        animation: `karaoke-char-exit ${karaokeExitDurationMs}ms ease-in-out both`,
                                        '--karaoke-char-exit-y': `${style.translateYEm.toFixed(4)}em`,
                                        '--karaoke-char-exit-scale': style.scaleValue.toFixed(4),
                                    } : isSettlingLayer ? {
                                        animation: 'none',
                                        transform: 'none',
                                    } : undefined;

                                    return (
                                        <span
                                            key={charItem.charIndexInWord}
                                            ref={(el) => {
                                                charRefs.current[flatIndex] = el;
                                            }}
                                            style={{
                                                position: 'absolute',
                                                display: 'inline-block',
                                                whiteSpace: 'pre-wrap',
                                                transform: style.transform,
                                                willChange: isSettlingLayer ? 'auto' : style.willChange,
                                                transition: 'none',
                                                backfaceVisibility: 'hidden',
                                                overflow: 'visible',
                                                ...exitStyle,
                                            }}
                                        >
                                            {hasGlowEffect && (
                                                <span
                                                    key="glow"
                                                    aria-hidden="true"
                                                    ref={(el) => {
                                                        glowRefs.current[flatIndex] = el;
                                                    }}
                                                    style={{
                                                        position: 'absolute',
                                                        inset: '-0.45em',
                                                        padding: '0.45em',
                                                        pointerEvents: 'none',
                                                        whiteSpace: 'pre-wrap',
                                                        color: 'rgba(255,255,255,0.95)',
                                                        WebkitTextFillColor: 'rgba(255,255,255,0.95)',
                                                        clipPath: 'none',
                                                        maskImage: style.glowMask,
                                                        WebkitMaskImage: style.glowMask,
                                                        opacity: style.glowOpacity,
                                                        textShadow: style.glowShadow,
                                                        willChange: isSettlingLayer
                                                            ? 'auto'
                                                            : 'opacity, text-shadow, mask-image',
                                                        transform: 'translateZ(0)',
                                                        overflow: 'visible',
                                                        animation: isExitLayer
                                                            ? `karaoke-glow-exit ${karaokeExitDurationMs}ms ease-in-out both`
                                                            : undefined,
                                                        ...(isExitLayer ? {
                                                            '--karaoke-glow-exit-opacity': String(style.glowOpacity),
                                                            '--karaoke-glow-exit-shadow': style.glowShadow,
                                                        } : undefined),
                                                        ...(isSettlingLayer ? {
                                                            opacity: 0,
                                                            textShadow: 'none',
                                                        } : undefined),
                                                    }}
                                                >
                                                    {charItem.char}
                                                </span>
                                            )}
                                            <span
                                                key="fill"
                                                ref={(el) => {
                                                    fillRefs.current[flatIndex] = el;
                                                }}
                                                style={{
                                                    position: 'relative',
                                                    zIndex: 1,
                                                    // 退出层必须使用完成态填充，避免低频 currentTime
                                                    // 覆盖高精度时钟已经推进完成的尾字颜色。
                                                    backgroundImage: isFocused
                                                        ? style.fillBackgroundImage
                                                        : completedFillBackground,
                                                    WebkitBackgroundClip: 'text',
                                                    backgroundClip: 'text',
                                                    WebkitTextFillColor: 'transparent',
                                                    color: 'transparent',
                                                }}
                                            >
                                                {charItem.char}
                                            </span>
                                        </span>
                                    );
                                })}
                            </span>
                        )}
                    </span>
                );
            });

    return (
        <span style={{ display: 'block' }}>
            <span style={{ display: 'block' }}>
                {renderWordGroups()}
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
        prev.isFocused === next.isFocused
    );
});

export default KaraokeText;
