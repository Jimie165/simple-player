import { AnimatePresence, motion } from 'framer-motion';
import { memo, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import type { LowFrequencyFrame } from '@/features/player/apple/background/audioResponse';
import { BlurredCoverBackground } from '@/features/player/apple/background/BlurredCoverBackground';
import { FluidRenderer } from '@/features/player/apple/background/fluidRenderer';

function FluidCanvas({
    src,
    active,
    lowFrequencyRef,
}: {
    src: string;
    active: boolean;
    lowFrequencyRef?: RefObject<LowFrequencyFrame>;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<FluidRenderer | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let renderer: FluidRenderer;
        try {
            renderer = new FluidRenderer(canvas, lowFrequencyRef);
        } catch (error) {
            console.error('网格背景初始化失败', error);
            return;
        }
        rendererRef.current = renderer;
        void renderer.setArtwork(src);
        const resizeObserver = new ResizeObserver(() => renderer.resize());
        resizeObserver.observe(canvas);
        const handleVisibility = () => renderer.setVisible(!document.hidden);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            resizeObserver.disconnect();
            renderer.dispose();
            rendererRef.current = null;
        };
    }, [lowFrequencyRef, src]);

    useEffect(() => {
        rendererRef.current?.setActive(active);
    }, [active]);

    return <canvas ref={canvasRef} className="invisible absolute inset-0 h-full w-full" aria-hidden />;
}

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
                        <FluidCanvas
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
        {variant === 'blurred' && (
            <>
                <div className="absolute inset-0 z-10 bg-white/0.06" />
                <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_48%,rgba(12,15,18,0.12)_100%)]" />
            </>
        )}
    </div>
));
