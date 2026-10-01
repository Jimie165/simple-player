import { AnimatePresence, motion } from 'framer-motion';
import { memo, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import type { LowFrequencyFrame } from '@/features/player/now-playing/background/audioResponse';
import { FluidRenderer } from '@/features/player/now-playing/background/fluidRenderer';
import { IsolationRenderer } from '@/features/player/now-playing/background/isolationRenderer';
import { useThemeStore } from '@/store/useThemeStore';

type BackgroundRenderer = FluidRenderer | IsolationRenderer;

function BackgroundCanvas({
    src,
    active,
    variant,
    lowFrequencyRef,
}: {
    src: string;
    active: boolean;
    variant: 'fluid' | 'isolation';
    lowFrequencyRef?: RefObject<LowFrequencyFrame>;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<BackgroundRenderer | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const handleContextLost = (event: Event) => {
            event.preventDefault();
            rendererRef.current?.setActive(false);
            useThemeStore.getState().setGraphicsUnavailable();
        };
        let renderer: BackgroundRenderer;
        try {
            renderer = variant === 'fluid'
                ? new FluidRenderer(canvas, lowFrequencyRef)
                : new IsolationRenderer(canvas);
        } catch (error) {
            console.error(`${variant === 'fluid' ? '网格' : 'Isolation'}背景初始化失败`, error);
            useThemeStore.getState().setGraphicsUnavailable();
            return;
        }
        rendererRef.current = renderer;
        canvas.addEventListener('webglcontextlost', handleContextLost);
        const resizeObserver = new ResizeObserver(() => renderer.resize());
        resizeObserver.observe(canvas);
        const handleVisibility = () => renderer.setVisible(!document.hidden);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            canvas.removeEventListener('webglcontextlost', handleContextLost);
            document.removeEventListener('visibilitychange', handleVisibility);
            resizeObserver.disconnect();
            renderer.dispose();
            rendererRef.current = null;
        };
    }, [lowFrequencyRef, variant]);

    useEffect(() => {
        void rendererRef.current?.setArtwork(src);
    }, [src]);

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
    variant?: 'fluid' | 'isolation';
    active?: boolean;
    lowFrequencyRef?: RefObject<LowFrequencyFrame>;
}) => {
    const simplifiedEffects = useThemeStore((state) => state.reducedVisualEffects || state.graphicsUnavailable);
    return (
        <div className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden bg-[#24262c]">
            <AnimatePresence mode="popLayout">
                {src && (
                    <motion.div
                        key={`${variant}-background`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.2, ease: 'easeInOut' }}
                        className="absolute inset-0"
                    >
                        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
                        <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/20 to-black/40" />
                        {!simplifiedEffects && (
                            <BackgroundCanvas
                                src={src}
                                active={active}
                                variant={variant}
                                lowFrequencyRef={lowFrequencyRef}
                            />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});
