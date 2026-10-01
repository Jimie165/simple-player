import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import '@/features/player/video/LinearWavyProgress.css';

const WIDTH = 320;
const WAVELENGTH = 40;

function wavePath(amplitude: number) {
    let path = 'M -40 8';
    for (let x = -40; x < WIDTH + WAVELENGTH; x += WAVELENGTH) {
        path += ` Q ${x + 10} ${8 - amplitude * 2} ${x + 20} 8`;
        path += ` Q ${x + 30} ${8 + amplitude * 2} ${x + 40} 8`;
    }
    return path;
}

export function LinearWavyProgress({ percent }: { percent: number }) {
    const clipId = useId();
    const reducedMotion = useReducedMotion();
    const progress = Math.max(0, Math.min(100, percent)) / 100;
    const end = progress * (WIDTH - 4) + 2;
    const amplitude = 3 * Math.min(1, progress / 0.1, (1 - progress) / 0.1);
    const progressTransition = { duration: reducedMotion ? 0 : 0.3 };

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
            <defs>
                <clipPath id={clipId}>
                    <rect
                        x="2" y="0" height="16" rx="2"
                        width={end - 2}
                    />
                </clipPath>
            </defs>
            <line
                x1={Math.min(WIDTH - 2, end + 8)}
                opacity={progress === 1 ? 0 : 0.25}
                x2={WIDTH - 2} y1="8" y2="8"
                stroke="currentColor" strokeWidth="4" strokeLinecap="round"
            />
            <g clipPath={`url(#${clipId})`}>
                <motion.path
                    className="video-prepare-wave"
                    initial={false}
                    animate={{ d: wavePath(amplitude) }}
                    transition={progressTransition}
                    fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
                />
            </g>
            {progress < 1 && <circle cx={WIDTH - 2} cy="8" r="2" fill="currentColor" />}
        </svg>
    );
}
