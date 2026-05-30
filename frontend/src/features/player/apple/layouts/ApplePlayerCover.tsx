import type { RefObject } from 'react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import CoverImage from '@/components/common/CoverImage';
import type { SongMetadata } from '@/types';

export function ApplePlayerCover({
    metadata,
    bgImageSrc,
    coverScale,
    isPlaying,
    compact,
    coverRef,
}: {
    metadata: SongMetadata | null;
    bgImageSrc: string | null;
    coverScale: number;
    isPlaying: boolean;
    compact?: boolean;
    coverRef?: RefObject<HTMLDivElement | null>;
}) {
    return (
        <motion.div
            ref={coverRef}
            layoutId="player-cover"
            className={compact ? "w-[clamp(3rem,14vw,4rem)] aspect-square flex-shrink-0" : "absolute inset-0"}
            transition={{ type: "spring", stiffness: 200, damping: 24, mass: 1 }}
        >
            <motion.div
                className={clsx(
                    "w-full h-full overflow-hidden bg-white/5",
                    compact ? "rounded-[8px]" : "rounded-[12px] md:rounded-[18px]"
                )}
                animate={{
                    scale: coverScale,
                    boxShadow: compact
                        ? (isPlaying ? "0 10px 20px -5px rgba(0, 0, 0, 0.4)" : "0 4px 10px -3px rgba(0, 0, 0, 0.2)")
                        : (isPlaying ? "0 20px 40px -8px rgba(0, 0, 0, 0.5)" : "0 10px 20px -5px rgba(0, 0, 0, 0.3)")
                }}
                transition={{ type: "spring", stiffness: 200, damping: 24, mass: 1 }}
            >
                {bgImageSrc ? (
                    <img
                        src={bgImageSrc}
                        className="w-full h-full object-cover"
                        alt={metadata?.title || "Cover"}
                    />
                ) : (
                    <CoverImage
                        song={metadata}
                        className="w-full h-full object-cover"
                        iconClassName={compact ? "text-white/20 text-4xl" : "text-white/20 text-9xl"}
                    />
                )}
            </motion.div>
        </motion.div>
    );
}
