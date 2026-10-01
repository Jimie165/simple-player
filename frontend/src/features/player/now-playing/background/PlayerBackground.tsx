import { AnimatePresence, motion } from 'framer-motion';
import { memo, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import type { LowFrequencyFrame } from '@/features/player/now-playing/background/audioResponse';
import { FluidRenderer } from '@/features/player/now-playing/background/fluidRenderer';
import { IsolationRenderer } from '@/features/player/now-playing/background/isolationRenderer';
import { useThemeStore } from '@/store/useThemeStore';
import { preprocessArtwork } from '@/features/player/now-playing/background/artworkPreprocess';

type BackgroundRenderer = FluidRenderer | IsolationRenderer;

function StaticBackground({ src }: { src: string }) {
    const [artwork, setArtwork] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            if (cancelled) return;
            try {
                // Blur the small bitmap once on the CPU, without CSS filters or WebGL.
                const pixels = preprocessArtwork(image);
                const small = document.createElement('canvas');
                small.width = pixels.width;
                small.height = pixels.height;
                const smallContext = small.getContext('2d');
                if (!smallContext) throw new Error('无法创建静态背景画布');
                smallContext.putImageData(pixels, 0, 0);
                const output = document.createElement('canvas');
                output.width = output.height = 256;
                const context = output.getContext('2d');
                if (!context) throw new Error('无法创建静态背景输出画布');
                context.imageSmoothingQuality = 'high';
                context.drawImage(small, 0, 0, 256, 256);
                setArtwork(output.toDataURL());
            } catch (error) {
                console.error('静态背景模糊失败', error);
                setArtwork(src);
            }
        };
        image.onerror = () => {
            if (!cancelled) setArtwork(null);
        };
        image.src = src;
        return () => {
            cancelled = true;
            image.onload = image.onerror = null;
        };
    }, [src]);

    return artwork ? <img src={artwork} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" /> : null;
}

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
                        <StaticBackground src={src} />
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
