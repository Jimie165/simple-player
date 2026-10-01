import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

const WIDTH = 320;
const STROKE = 4;
const GAP = 4;
const WAVELENGTH = 40;

function wavePath(end: number, amplitude: number, phase: number) {
    const height = (x: number) => 8 + amplitude * Math.sin((x / WAVELENGTH + phase) * Math.PI * 2);
    let path = `M ${STROKE / 2} ${height(STROKE / 2)}`;
    for (let x = STROKE / 2 + 1; x < end; x += 1) {
        path += ` L ${x} ${height(x)}`;
    }
    return `${path} L ${end} ${height(end)}`;
}

export function LinearWavyProgress({ percent }: { percent: number }) {
    const reducedMotion = useReducedMotion();
    const [phase, setPhase] = useState(0);
    const progress = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) / 100 : 0;
    const [displayedProgress, setDisplayedProgress] = useState(progress);
    const displayedProgressRef = useRef(progress);
    // Completion, a new preparation pass, and reduced motion must never lag.
    const visibleProgress = reducedMotion || progress === 1 || progress < displayedProgress
        ? progress : displayedProgress;
    const end = Math.max(STROKE / 2, Math.min(WIDTH - STROKE / 2, visibleProgress * WIDTH));
    const amplitude = progress > 0 && progress < 1 ? 2.5 : 0;
    const moving = !reducedMotion && amplitude > 0;
    // Each round cap extends 2px beyond its center; leave 4px of visible track gap.
    const trackStart = end + Math.min(GAP, Math.max(0, visibleProgress * WIDTH - STROKE / 2)) + STROKE;

    useEffect(() => {
        const from = displayedProgressRef.current;
        const immediate = reducedMotion || progress === 1 || progress < from;
        if (immediate) displayedProgressRef.current = progress;
        const start = performance.now();
        let frame: number;
        const animate = (time: number) => {
            const fraction = immediate ? 1 : Math.min(1, Math.max(0, (time - start) / 200));
            const eased = 1 - (1 - fraction) ** 3;
            const next = from + (progress - from) * eased;
            displayedProgressRef.current = next;
            setDisplayedProgress(next);
            if (fraction < 1) frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frame);
    }, [progress, reducedMotion]);

    useEffect(() => {
        if (!moving) return;
        let frame: number;
        const animate = (time: number) => {
            setPhase((time % 4000) / 4000);
            frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frame);
    }, [moving]);

    return (
        <svg
            className="w-full h-4 mb-3 text-primary overflow-hidden"
            viewBox={`0 0 ${WIDTH} 16`}
            preserveAspectRatio="none"
            role="progressbar"
            aria-label="视频准备进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
        >
            {trackStart < WIDTH - STROKE / 2 && (
                <line
                    x1={progress === 0 ? STROKE / 2 : trackStart}
                    x2={WIDTH - STROKE / 2} y1="8" y2="8"
                    stroke="currentColor" strokeOpacity="0.35"
                    strokeWidth={STROKE} strokeLinecap="round"
                />
            )}
            {progress > 0 && (
                <path
                    d={wavePath(end, amplitude, reducedMotion ? 0 : phase)}
                    fill="none" stroke="currentColor"
                    strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round"
                />
            )}
        </svg>
    );
}
