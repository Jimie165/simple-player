import { useEffect, useRef, useState } from 'react';
import type { LyricsWord } from '@/types';
import { usePlayerStore } from '@/store/usePlayerStore';

interface KaraokeTextProps {
    words: LyricsWord[];
    lineEndMs: number | null;
    currentMs: number;
}

export default function KaraokeText({ words, lineEndMs, currentMs: baseCurrentMs }: KaraokeTextProps) {
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const [currentMs, setCurrentMs] = useState(baseCurrentMs);
    const targetMsRef = useRef(baseCurrentMs);
    const lastTick = useRef(0);

    useEffect(() => {
        targetMsRef.current = baseCurrentMs;

        if (Math.abs(baseCurrentMs - currentMs) <= 3000) return;
        const frame = requestAnimationFrame(() => {
            setCurrentMs(baseCurrentMs);
        });
        return () => cancelAnimationFrame(frame);
    }, [baseCurrentMs, currentMs]);

    useEffect(() => {
        if (!isPlaying) return;
        let frame: number;

        const tick = (now: number) => {
            if (!lastTick.current) lastTick.current = now;
            const delta = now - lastTick.current;
            lastTick.current = now;

            setCurrentMs(prev => {
                let nextMs = prev + delta;
                const diff = targetMsRef.current - nextMs;
                if (diff > 50) nextMs += diff * 0.15;
                return nextMs;
            });
            frame = requestAnimationFrame(tick);
        };

        lastTick.current = performance.now();
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [isPlaying]);

    return (
        <>
            {words.map((word, index) => {
                const nextStart =
                    index + 1 < words.length ? words[index + 1].time_ms : lineEndMs ?? word.time_ms + 600;
                const durationMs = Math.max(80, nextStart - word.time_ms);
                const rawProgress = (currentMs - word.time_ms) / durationMs;
                const progress = rawProgress <= 0 ? 0 : rawProgress >= 1 ? 1 : rawProgress;
                const stopVal = progress * 100;
                const edgeWidth = 20;
                const hasProgress = progress > 0;
                const softEdgeStart = hasProgress ? Math.max(0, stopVal - edgeWidth) : 0;
                const softEdgeEnd = hasProgress ? Math.min(120, stopVal + edgeWidth) : 0;
                const elapsedMs = currentMs - word.time_ms;
                const hasStarted = elapsedMs > 0;
                const attackMs = 300;
                const attackProgress = Math.min(1, Math.max(0, elapsedMs / attackMs));
                const liftAttack = attackProgress * attackProgress * (3 - 2 * attackProgress);
                const lift = hasStarted ? liftAttack : 0;
                const translateY = lift * -0.04;

                return (
                    <span
                        key={index}
                        style={{
                            position: 'relative',
                            display: 'inline-block',
                            whiteSpace: 'pre-wrap',
                            transform: `translateY(${translateY}em)`,
                            willChange: 'transform',
                            transition: 'transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                            backgroundImage: hasProgress
                                ? `linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,1) ${softEdgeStart}%, rgba(255,255,255,0.72) ${stopVal}%, rgba(255,255,255,0.36) ${softEdgeEnd}%, rgba(255,255,255,0.36) 100%)`
                                : 'linear-gradient(to right, rgba(255,255,255,0.36), rgba(255,255,255,0.36))',
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
