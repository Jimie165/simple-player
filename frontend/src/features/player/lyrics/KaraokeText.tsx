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
                if (!el) return;

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
                const releaseProgress = Math.min(1, Math.max(0, (nextStart - timeMs) / 220));
                const release = releaseProgress * releaseProgress * (3 - 2 * releaseProgress);
                const toneAttackProgress = Math.min(1, Math.max(0, elapsedMs / 160));
                const toneAttack = toneAttackProgress * toneAttackProgress * (3 - 2 * toneAttackProgress);
                const longToneEnvelope = hasStarted ? Math.min(toneAttack, release) : 0;
                const longToneEffect = longToneAmount * longToneEnvelope;

                el.style.transform = `translate3d(0, ${translateY}em, 0) scale(${1 + longToneEffect * 0.018})`;
                el.style.filter = longToneEffect > 0.01
                    ? `drop-shadow(0 0 ${longToneEffect * 2.4}px rgba(255, 255, 255, ${longToneEffect * 0.28}))`
                    : 'none';
                el.style.willChange = longToneAmount > 0.01 ? 'transform, filter' : 'transform';
                el.style.backgroundImage = hasProgress
                    ? `linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,1) ${softEdgeStart}%, rgba(255,255,255,${edgeAlpha}) ${stopVal}%, rgba(255,255,255,${baseAlpha}) ${softEdgeEnd}%, rgba(255,255,255,${baseAlpha}) 100%)`
                    : `linear-gradient(to right, rgba(255,255,255,${baseAlpha}), rgba(255,255,255,${baseAlpha}))`;
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
                const releaseProgress = Math.min(1, Math.max(0, (nextStart - renderCurrentMs) / 220));
                const toneAttackProgress = Math.min(1, Math.max(0, elapsedMs / 160));
                const toneAttack = toneAttackProgress * toneAttackProgress * (3 - 2 * toneAttackProgress);
                const longToneEnvelope = hasStarted
                    ? Math.min(toneAttack, releaseProgress * releaseProgress * (3 - 2 * releaseProgress))
                    : 0;
                const longToneEffect = longToneAmount * longToneEnvelope;

                const currentTransform = `translate3d(0, ${translateY}em, 0) scale(${1 + longToneEffect * 0.018})`;

                const currentFilter = longToneEffect > 0.01
                    ? `drop-shadow(0 0 ${longToneEffect * 2.4}px rgba(255, 255, 255, ${longToneEffect * 0.28}))`
                    : 'none';

                const currentWillChange = longToneAmount > 0.01 ? 'transform, filter' : 'transform';

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
                            filter: currentFilter,
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
                );
            })}
        </>
    );
}
