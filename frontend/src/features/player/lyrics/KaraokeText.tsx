import { useEffect, useMemo, useRef } from 'react';
import type { LyricsWord } from '@/types';
import { usePlayerStore } from '@/store/usePlayerStore';

interface KaraokeTextProps {
    words: LyricsWord[];
    lineEndMs: number | null;
    currentMs: number;
}

export default function KaraokeText({ words, lineEndMs, currentMs: baseCurrentMs }: KaraokeTextProps) {
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const targetMsRef = useRef(baseCurrentMs);
    const currentMsRef = useRef(baseCurrentMs);
    const lastTick = useRef(0);
    const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const fillRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const glowRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const metrics = useMemo(() => words.map((word, index) => {
        const nextStart = index + 1 < words.length ? words[index + 1].time_ms : lineEndMs ?? word.time_ms + 600;
        return {
            nextStart,
            durationMs: Math.max(80, nextStart - word.time_ms),
        };
    }), [lineEndMs, words]);

    useEffect(() => {
        targetMsRef.current = baseCurrentMs;
        if (Math.abs(baseCurrentMs - currentMsRef.current) > 3000) {
            currentMsRef.current = baseCurrentMs;
        }
    }, [baseCurrentMs]);

    useEffect(() => {
        const updateWordStyles = (timeMs: number) => {
            words.forEach((word, index) => {
                const el = wordRefs.current[index];
                const fillEl = fillRefs.current[index];
                const glowEl = glowRefs.current[index];
                if (!el || !fillEl || !glowEl) return;

                const { nextStart, durationMs } = metrics[index];
                const rawProgress = (timeMs - word.time_ms) / durationMs;
                const progress = rawProgress <= 0 ? 0 : rawProgress >= 1 ? 1 : rawProgress;
                const stopVal = progress * 100;
                const longToneRaw = Math.min(1, Math.max(0, (durationMs - 650) / 600));
                const longToneAmount = longToneRaw * longToneRaw * (3 - 2 * longToneRaw);

                const baseAlpha = 0.36; // 统一为 0.36，完全恢复未播放长音的亮度一致性
                const edgeWidth = 24 + longToneAmount * 14;
                const edgeAlpha = 0.72 + longToneAmount * 0.18;
                const hasProgress = progress > 0;
                const softEdgeStart = hasProgress ? Math.max(0, stopVal - edgeWidth) : 0;
                const softEdgeEnd = hasProgress ? Math.min(120, stopVal + edgeWidth * 0.9) : 0;
                const elapsedMs = timeMs - word.time_ms;
                const hasStarted = elapsedMs > 0;
                const attackMs = 460;
                const attackProgress = Math.min(1, Math.max(0, elapsedMs / attackMs));
                const liftAttack = Math.sin((attackProgress * Math.PI) / 2);
                const lift = hasStarted ? liftAttack : 0;
                const translateY = lift * -0.048;
                const toneReleaseMs = Math.min(240, Math.max(120, durationMs * 0.22));
                const releaseProgress = Math.min(1, Math.max(0, (nextStart - timeMs) / toneReleaseMs));
                const release = releaseProgress * releaseProgress * (3 - 2 * releaseProgress);
                const toneAttackMs = Math.min(260, Math.max(140, durationMs * 0.24));
                const toneAttackProgress = Math.min(1, Math.max(0, elapsedMs / toneAttackMs));
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
                el.style.willChange = longToneAmount > 0.01 ? 'transform' : 'transform';
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

        const tick = (now: number) => {
            if (!lastTick.current) lastTick.current = now;
            const delta = isPlaying ? now - lastTick.current : 0;
            lastTick.current = now;

            let nextMs = isPlaying ? currentMsRef.current + delta : targetMsRef.current;
            const diff = targetMsRef.current - nextMs;
            if (diff > 50) nextMs += diff * 0.15;
            currentMsRef.current = nextMs;
            updateWordStyles(nextMs);
            frame = requestAnimationFrame(tick);
        };

        lastTick.current = performance.now();
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [isPlaying, metrics, words]);

    return (
        <>
            {words.map((word, index) => {
                const { nextStart, durationMs } = metrics[index];
                const renderCurrentMs = currentMsRef.current;
                const rawProgress = (renderCurrentMs - word.time_ms) / durationMs;
                const progress = rawProgress <= 0 ? 0 : rawProgress >= 1 ? 1 : rawProgress;
                const stopVal = progress * 100;
                const longToneRaw = Math.min(1, Math.max(0, (durationMs - 650) / 600));
                const longToneAmount = longToneRaw * longToneRaw * (3 - 2 * longToneRaw);

                const baseAlpha = 0.36; // 统一为 0.36，彻底恢复未高亮长音的基础亮度一致
                const edgeWidth = 24 + longToneAmount * 14;
                const edgeAlpha = 0.72 + longToneAmount * 0.18;
                const hasProgress = progress > 0;
                const softEdgeStart = hasProgress ? Math.max(0, stopVal - edgeWidth) : 0;
                const softEdgeEnd = hasProgress ? Math.min(120, stopVal + edgeWidth * 0.9) : 0;
                const elapsedMs = renderCurrentMs - word.time_ms;
                const hasStarted = elapsedMs > 0;
                const attackMs = 460;
                const attackProgress = Math.min(1, Math.max(0, elapsedMs / attackMs));
                const liftAttack = Math.sin((attackProgress * Math.PI) / 2);
                const lift = hasStarted ? liftAttack : 0;
                const translateY = lift * -0.048;
                const toneReleaseMs = Math.min(240, Math.max(120, durationMs * 0.22));
                const releaseProgress = Math.min(1, Math.max(0, (nextStart - renderCurrentMs) / toneReleaseMs));
                const toneAttackMs = Math.min(260, Math.max(140, durationMs * 0.24));
                const toneAttackProgress = Math.min(1, Math.max(0, elapsedMs / toneAttackMs));
                const toneAttack = toneAttackProgress * toneAttackProgress * (3 - 2 * toneAttackProgress);
                const longToneEnvelope = hasStarted
                    ? Math.min(toneAttack, releaseProgress * releaseProgress * (3 - 2 * releaseProgress))
                    : 0;
                const longToneEffect = longToneAmount * longToneEnvelope;
                const glowOpacity = longToneEffect * (0.42 + progress * 0.38);
                const glowRadius = 2.8 + longToneEffect * 5.8;
                const glowShadow = longToneEffect > 0.01
                    ? `0 0 ${glowRadius * 0.45}px rgba(255,255,255,${0.28 + longToneEffect * 0.22}), 0 0 ${glowRadius}px rgba(255,255,255,${0.16 + longToneEffect * 0.2})`
                    : 'none';
                const glowMask = hasProgress
                    ? `linear-gradient(to right, #fff 0%, #fff ${softEdgeStart}%, rgba(255,255,255,0.72) ${stopVal}%, transparent ${softEdgeEnd}%, transparent 100%)`
                    : 'linear-gradient(to right, transparent, transparent)';

                const currentTransform = `translate3d(0, ${translateY}em, 0) scale(${1 + longToneEffect * 0.04})`;

                const currentWillChange = 'transform';

                return (
                    <span
                        key={index}
                        ref={(el) => {
                            wordRefs.current[index] = el;
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
                                glowRefs.current[index] = el;
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
                            {word.text}
                        </span>
                        <span
                            ref={(el) => {
                                fillRefs.current[index] = el;
                            }}
                            style={{
                                position: 'relative',
                                zIndex: 1,
                                backgroundImage: hasProgress
                                    ? `linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,1) ${softEdgeStart}%, rgba(255,255,255,${edgeAlpha}) ${stopVal}%, rgba(255,255,255,${baseAlpha}) ${softEdgeEnd}%, rgba(255,255,255,${baseAlpha}) 100%)`
                                    : `linear-gradient(to right, rgba(255,255,255,${baseAlpha}), rgba(255,255,255,${baseAlpha}))`,
                                WebkitBackgroundClip: 'text',
                                backgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                color: 'transparent',
                            }}
                        >
                            {word.text}
                        </span>
                    </span>
                );
            })}
        </>
    );
}
