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
                const softEdgeStart = Math.max(0, stopVal - 1);
                const bounce = Math.sin(progress * Math.PI);
                const translateY = bounce * -0.15;
                const scale = 1 + bounce * 0.05;

                // 精细化苹果音乐的发光等级 (Bloom Tiers)
                let blurBase = 0;
                let opacityBase = 0;
                let hasTail = false;

                if (durationMs < 200) {
                    // <200ms: 几乎无 glow
                    blurBase = 2;
                    opacityBase = 0.05;
                } else if (durationMs < 500) {
                    // 200~500ms: 微 glow
                    const t = (durationMs - 200) / 300;
                    blurBase = 2 + t * 4;           // 2 ~ 6px
                    opacityBase = 0.05 + t * 0.15;  // 0.05 ~ 0.2
                } else if (durationMs < 800) {
                    // 500~800ms: 中 glow
                    const t = (durationMs - 500) / 300;
                    blurBase = 6 + t * 6;           // 6 ~ 12px
                    opacityBase = 0.2 + t * 0.2;    // 0.2 ~ 0.4
                } else if (durationMs < 1200) {
                    // 800~1200ms: 强 glow
                    const t = (durationMs - 800) / 400;
                    blurBase = 12 + t * 6;          // 12 ~ 18px
                    opacityBase = 0.4 + t * 0.15;   // 0.4 ~ 0.55
                } else {
                    // >1200ms: 满 bloom + 拖尾 (超长音)
                    blurBase = 18;
                    opacityBase = 0.6;
                    hasTail = true;
                }

                const currentOpacity = bounce * opacityBase;
                const currentBlur = bounce * blurBase;

                let filter = 'none';
                if (currentOpacity > 0.01) {
                    filter = `drop-shadow(0 0 ${currentBlur}px rgba(255, 255, 255, ${currentOpacity}))`;
                    if (hasTail) {
                        // 叠加第二层庞大的散射拖尾光晕
                        filter += ` drop-shadow(0 0 ${currentBlur * 2.5}px rgba(255, 255, 255, ${currentOpacity * 0.6}))`;
                    }
                }

                return (
                    <span
                        key={index}
                        style={{
                            backgroundImage: `linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,1) ${softEdgeStart}%, rgba(255,255,255,0.3) ${stopVal}%, rgba(255,255,255,0.3) 100%)`,
                            WebkitBackgroundClip: 'text',
                            backgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            color: 'transparent',
                            whiteSpace: 'pre-wrap',
                            transform: `translateY(${translateY}em) scale(${scale})`,
                            filter,
                            display: 'inline-block',
                            willChange: 'transform, filter',
                        }}
                    >
                        {word.text}
                    </span>
                );
            })}
        </>
    );
}
