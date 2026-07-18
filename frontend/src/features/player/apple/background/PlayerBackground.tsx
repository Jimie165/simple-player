import { AnimatePresence, motion } from 'framer-motion';
import { memo } from 'react';
import type { RefObject } from 'react';

import { FluidBackground } from '@/features/player/apple/background/FluidBackground';
import { BlurredCoverBackground } from '@/features/player/apple/background/BlurredCoverBackground';
import type { LowFrequencyFrame } from '@/features/player/apple/hooks/useLowFrequencyLevel';

export const PlayerBackground = memo(({
    src,
    variant = 'fluid',
    active = true,
    lowFrequencyRef,
}: {
    src: string | null;
    variant?: 'fluid' | 'blurred';
    active?: boolean;
    lowFrequencyRef?: RefObject<LowFrequencyFrame>;
}) => (
    <div className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden bg-[#777a7c]">
        {variant === 'fluid' ? (
            <AnimatePresence mode="popLayout">
                {src && (
                    <motion.div
                        key={src}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.2, ease: 'easeInOut' }}
                        className="absolute inset-0"
                    >
                        <FluidBackground
                            src={src}
                            active={active}
                            lowFrequencyRef={lowFrequencyRef}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        ) : (
            <BlurredCoverBackground src={src} />
        )}
        <div className="absolute inset-0 z-10 bg-white/0.06" />
        <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_48%,rgba(12,15,18,0.12)_100%)]" />
    </div>
));
