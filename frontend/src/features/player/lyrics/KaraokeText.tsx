import { useEffect, useMemo, useRef, memo, type RefObject } from 'react';
import type { LyricsWord } from '@/types';
import { parseLyricsWordsToChars } from '@/features/player/lyrics/lyricCharSplitting';
import type { FlatCharItem } from '@/features/player/lyrics/lyricCharSplitting';

interface KaraokeTextProps {
    words: LyricsWord[];
    lineEndMs: number | null;
    currentMs: number;
    preciseMsRef: RefObject<number>;
    isActive: boolean;
}

type IndexedCharItem = {
    item: FlatCharItem;
    flatIndex: number;
};

function KaraokeTextBase({ words, lineEndMs, currentMs: baseCurrentMs, preciseMsRef, isActive }: KaraokeTextProps) {
    const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const fillRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const glowRefs = useRef<Array<HTMLSpanElement | null>>([]);

    // 1. 获取扁平化的字符序列
    const flatChars = useMemo(() => parseLyricsWordsToChars(words, lineEndMs), [words, lineEndMs]);

    // 2. 按单词分组的字符序列（英文单词换行保护）
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

    // 3. 升级 tick 渲染逻辑至字符级，逐字应用所有原先公式
    useEffect(() => {
        if (!isActive) return;

        const updateWordStyles = (timeMs: number) => {
            flatChars.forEach((charItem, index) => {
                const el = wordRefs.current[index];
                const fillEl = fillRefs.current[index];
                const glowEl = glowRefs.current[index];
                if (!el || !fillEl || !glowEl) return;

                const { time_ms, durationMs, groupStartMs, groupEndMs, groupDurationMs } = charItem;
                const rawProgress = (timeMs - time_ms) / durationMs;
                const progress = rawProgress <= 0 ? 0 : rawProgress >= 1 ? 1 : rawProgress;
                const stopVal = progress * 100;

                // 判断长音（以原单词时长为准进行宏观判断）
                const longToneRaw = Math.min(1, Math.max(0, (groupDurationMs - 650) / 600));
                const longToneAmount = longToneRaw * longToneRaw * (3 - 2 * longToneRaw);

                const baseAlpha = 0.36; // 统一为 0.36，完全恢复未播放长音的亮度一致性
                const edgeWidth = 24 + longToneAmount * 14;
                const edgeAlpha = 0.72 + longToneAmount * 0.18;
                const hasProgress = progress > 0;
                const softEdgeStart = hasProgress ? Math.max(0, stopVal - edgeWidth) : 0;
                const softEdgeEnd = hasProgress ? Math.min(120, stopVal + edgeWidth * 0.9) : 0;

                // 向上浮动的缓动
                const elapsedMs = timeMs - time_ms;
                const hasStarted = elapsedMs > 0;
                const attackMs = 460;
                const attackProgress = Math.min(1, Math.max(0, elapsedMs / attackMs));
                const liftAttack = Math.sin((attackProgress * Math.PI) / 2);
                const lift = hasStarted ? liftAttack : 0;
                const translateY = lift * -0.048;

                // 长音发光缓动包络（对齐单词起止时间，使发光呈现宏观稳定性）
                const toneReleaseMs = Math.min(240, Math.max(120, groupDurationMs * 0.22));
                const releaseProgress = Math.min(1, Math.max(0, (groupEndMs - timeMs) / toneReleaseMs));
                const release = releaseProgress * releaseProgress * (3 - 2 * releaseProgress);
                const toneAttackMs = Math.min(260, Math.max(140, groupDurationMs * 0.24));
                const elapsedGroupMs = timeMs - groupStartMs;
                const toneAttackProgress = Math.min(1, Math.max(0, elapsedGroupMs / toneAttackMs));
                const toneAttack = toneAttackProgress * toneAttackProgress * (3 - 2 * toneAttackProgress);

                const longToneEnvelope = hasStarted ? Math.min(toneAttack, release) : 0;
                const longToneEffect = longToneAmount * longToneEnvelope;
                const glowOpacity = longToneEffect * (0.42 + progress * 0.38);
                const glowRadius = 2.8 + longToneEffect * 5.8;
                const glowShadow = longToneEffect > 0.01
                    ? `0 0 ${glowRadius * 0.45}px rgba(255,255,255,${0.28 + longToneEffect * 0.22}), 0 0 ${glowRadius}px rgba(255,255,255,${0.16 + longToneEffect * 0.2})`
                    : 'none';
                const glowMask = hasProgress
                    ? `linear-gradient(to right, #fff 0%, #fff ${softEdgeStart}%, rgba(255,255,255,0.72) ${stopVal}%, transparent ${softEdgeEnd}%, transparent 100%)`
                    : 'linear-gradient(to right, transparent, transparent)';

                el.style.transform = `translate3d(0, ${translateY}em, 0) scale(${1 + longToneEffect * 0.04})`;
                el.style.willChange = 'transform';

                fillEl.style.backgroundImage = hasProgress
                    ? `linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,1) ${softEdgeStart}%, rgba(255,255,255,${edgeAlpha}) ${stopVal}%, rgba(255,255,255,${baseAlpha}) ${softEdgeEnd}%, rgba(255,255,255,${baseAlpha}) 100%)`
                    : `linear-gradient(to right, rgba(255,255,255,${baseAlpha}), rgba(255,255,255,${baseAlpha}))`;

                glowEl.style.clipPath = 'none';
                glowEl.style.maskImage = glowMask;
                glowEl.style.webkitMaskImage = glowMask;
                glowEl.style.opacity = longToneEffect > 0.01 && hasProgress ? `${glowOpacity}` : '0';
                glowEl.style.textShadow = glowShadow;
            });
        };

        let frame: number;

        const tick = () => {
            updateWordStyles(preciseMsRef.current);
            frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [flatChars, isActive, preciseMsRef]);

    return (
        <>
            {wordGroups.map((group, wordIndex) => {
                if (!group || group.length === 0) return null;

                return (
                    <span
                        key={wordIndex}
                        style={{
                            display: 'inline-block',
                            whiteSpace: 'nowrap',
                            transform: 'none',
                            willChange: 'auto',
                            transition: 'none',
                            backfaceVisibility: 'hidden',
                        }}
                    >
                        {group.map(({ item: charItem, flatIndex }) => {
                            if (!isActive) {
                                return (
                                    <span
                                        key={charItem.charIndexInWord}
                                        style={{
                                            position: 'relative',
                                            display: 'inline-block',
                                            whiteSpace: 'pre-wrap',
                                            transform: 'none',
                                            willChange: 'auto',
                                            transition: 'none',
                                            backfaceVisibility: 'hidden',
                                        }}
                                    >
                                        <span
                                            style={{
                                                position: 'relative',
                                                zIndex: 1,
                                                color: 'currentColor',
                                            }}
                                        >
                                            {charItem.char}
                                        </span>
                                    </span>
                                );
                            }

                            const baseAlpha = 0.36; // 统一为 0.36

                            let currentTransform = 'none';
                            let currentWillChange = 'auto';
                            let glowOpacity = 0;
                            let glowShadow = 'none';
                            let glowMask = 'linear-gradient(to right, transparent, transparent)';
                            let fillBackgroundImage = `linear-gradient(to right, rgba(255,255,255,${baseAlpha}), rgba(255,255,255,${baseAlpha}))`;
                            let longToneEffect = 0;
                            let hasProgress = false;

                            if (isActive) {
                                const renderCurrentMs = baseCurrentMs;
                                const { time_ms, durationMs, groupStartMs, groupEndMs, groupDurationMs } = charItem;

                                const rawProgress = (renderCurrentMs - time_ms) / durationMs;
                                const progress = rawProgress <= 0 ? 0 : rawProgress >= 1 ? 1 : rawProgress;
                                const stopVal = progress * 100;

                                const longToneRaw = Math.min(1, Math.max(0, (groupDurationMs - 650) / 600));
                                const longToneAmount = longToneRaw * longToneRaw * (3 - 2 * longToneRaw);

                                const edgeWidth = 24 + longToneAmount * 14;
                                const edgeAlpha = 0.72 + longToneAmount * 0.18;
                                hasProgress = progress > 0;
                                const softEdgeStart = hasProgress ? Math.max(0, stopVal - edgeWidth) : 0;
                                const softEdgeEnd = hasProgress ? Math.min(120, stopVal + edgeWidth * 0.9) : 0;

                                const elapsedMs = renderCurrentMs - time_ms;
                                const hasStarted = elapsedMs > 0;
                                const attackMs = 460;
                                const attackProgress = Math.min(1, Math.max(0, elapsedMs / attackMs));
                                const liftAttack = Math.sin((attackProgress * Math.PI) / 2);
                                const lift = hasStarted ? liftAttack : 0;
                                const translateY = lift * -0.048;

                                const toneReleaseMs = Math.min(240, Math.max(120, groupDurationMs * 0.22));
                                const releaseProgress = Math.min(1, Math.max(0, (groupEndMs - renderCurrentMs) / toneReleaseMs));
                                const release = releaseProgress * releaseProgress * (3 - 2 * releaseProgress);
                                const toneAttackMs = Math.min(260, Math.max(140, groupDurationMs * 0.24));
                                const elapsedGroupMs = renderCurrentMs - groupStartMs;
                                const toneAttackProgress = Math.min(1, Math.max(0, elapsedGroupMs / toneAttackMs));
                                const toneAttack = toneAttackProgress * toneAttackProgress * (3 - 2 * toneAttackProgress);

                                const longToneEnvelope = hasStarted ? Math.min(toneAttack, release) : 0;
                                longToneEffect = longToneAmount * longToneEnvelope;
                                glowOpacity = longToneEffect * (0.42 + progress * 0.38);
                                const glowRadius = 2.8 + longToneEffect * 5.8;
                                glowShadow = longToneEffect > 0.01
                                    ? `0 0 ${glowRadius * 0.45}px rgba(255,255,255,${0.28 + longToneEffect * 0.22}), 0 0 ${glowRadius}px rgba(255,255,255,${0.16 + longToneEffect * 0.2})`
                                    : 'none';
                                glowMask = hasProgress
                                    ? `linear-gradient(to right, #fff 0%, #fff ${softEdgeStart}%, rgba(255,255,255,0.72) ${stopVal}%, transparent ${softEdgeEnd}%, transparent 100%)`
                                    : 'linear-gradient(to right, transparent, transparent)';

                                currentTransform = `translate3d(0, ${translateY}em, 0) scale(${1 + longToneEffect * 0.04})`;
                                currentWillChange = 'transform';
                                fillBackgroundImage = hasProgress
                                    ? `linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,1) ${softEdgeStart}%, rgba(255,255,255,${edgeAlpha}) ${stopVal}%, rgba(255,255,255,${baseAlpha}) ${softEdgeEnd}%, rgba(255,255,255,${baseAlpha}) 100%)`
                                    : `linear-gradient(to right, rgba(255,255,255,${baseAlpha}), rgba(255,255,255,${baseAlpha}))`;
                            }

                            return (
                                <span
                                    key={charItem.charIndexInWord}
                                    ref={(el) => {
                                        wordRefs.current[flatIndex] = el;
                                    }}
                                    style={{
                                        position: 'relative',
                                        display: 'inline-block',
                                        whiteSpace: 'pre-wrap',
                                        transform: currentTransform,
                                        willChange: currentWillChange,
                                        transition: 'none',
                                        backfaceVisibility: 'hidden',
                                    }}
                                >
                                    <span
                                        aria-hidden="true"
                                        ref={(el) => {
                                            glowRefs.current[flatIndex] = el;
                                        }}
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            pointerEvents: 'none',
                                            whiteSpace: 'pre-wrap',
                                            color: 'rgba(255,255,255,0.95)',
                                            WebkitTextFillColor: 'rgba(255,255,255,0.95)',
                                            clipPath: 'none',
                                            maskImage: glowMask,
                                            WebkitMaskImage: glowMask,
                                            opacity: longToneEffect > 0.01 && hasProgress ? glowOpacity : 0,
                                            textShadow: glowShadow,
                                            willChange: 'opacity, text-shadow, mask-image',
                                            transform: 'translateZ(0)',
                                        }}
                                    >
                                        {charItem.char}
                                    </span>
                                    <span
                                        ref={(el) => {
                                            fillRefs.current[flatIndex] = el;
                                        }}
                                        style={{
                                            position: 'relative',
                                            zIndex: 1,
                                            backgroundImage: fillBackgroundImage,
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
                );
            })}
        </>
    );
}

const KaraokeText = memo(KaraokeTextBase, (prev, next) => {
    if (!prev.isActive && !next.isActive) {
        return prev.words === next.words && prev.lineEndMs === next.lineEndMs;
    }

    return (
        prev.words === next.words &&
        prev.lineEndMs === next.lineEndMs &&
        prev.currentMs === next.currentMs &&
        prev.preciseMsRef === next.preciseMsRef &&
        prev.isActive === next.isActive
    );
});

export default KaraokeText;
