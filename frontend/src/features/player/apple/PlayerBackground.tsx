import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const PlayerBackground = React.memo(({ src }: { src: string | null }) => {
    const renderBlobs = (source: string) => (
        <div
            className="absolute inset-0 w-full h-full mix-blend-normal"
            style={{ filter: 'url(#fluid-warp)' }}
        >
            <div
                className="absolute -top-[20%] -left-[20%] w-[100vmax] h-[100vmax] rounded-[40%] overflow-hidden saturate-[1.5] mix-blend-normal opacity-90"
                style={{ animation: 'fluid-rotate-1 50s infinite linear' }}
            >
                <img
                    src={source}
                    alt=""
                    className="absolute top-0 left-0 w-[200%] h-[200%] max-w-none object-cover will-change-transform"
                    style={{ animation: 'fluid-pan-1 65s infinite alternate ease-in-out' }}
                />
            </div>
            <div
                className="absolute top-[0%] -right-[20%] w-[110vmax] h-[110vmax] rounded-[45%] overflow-hidden saturate-[1.5] mix-blend-normal opacity-90"
                style={{ animation: 'fluid-rotate-2 58s infinite linear' }}
            >
                <img
                    src={source}
                    alt=""
                    className="absolute top-0 left-0 w-[200%] h-[200%] max-w-none object-cover will-change-transform"
                    style={{ animation: 'fluid-pan-2 72s infinite alternate ease-in-out' }}
                />
            </div>
            <div
                className="absolute -bottom-[20%] -left-[10%] w-[90vmax] h-[90vmax] rounded-[35%] overflow-hidden saturate-[1.8] mix-blend-normal opacity-90"
                style={{ animation: 'fluid-rotate-3 42s infinite linear' }}
            >
                <img
                    src={source}
                    alt=""
                    className="absolute top-0 left-0 w-[200%] h-[200%] max-w-none object-cover will-change-transform"
                    style={{ animation: 'fluid-pan-3 68s infinite alternate ease-in-out' }}
                />
            </div>
            <div
                className="absolute -bottom-[15%] -right-[15%] w-[100vmax] h-[100vmax] rounded-[40%] overflow-hidden saturate-[1.5] mix-blend-normal opacity-80"
                style={{ animation: 'fluid-rotate-4 55s infinite linear' }}
            >
                <img
                    src={source}
                    alt=""
                    className="absolute top-0 left-0 w-[200%] h-[200%] max-w-none object-cover will-change-transform"
                    style={{ animation: 'fluid-pan-4 80s infinite alternate ease-in-out' }}
                />
            </div>
        </div>
    );

    return (
        <div className="absolute inset-0 z-0 overflow-hidden select-none pointer-events-none bg-[#1a1a1a]">
            <svg className="hidden">
                <defs>
                    <filter id="fluid-warp" x="-20%" y="-20%" width="140%" height="140%">
                        <feTurbulence
                            type="fractalNoise"
                            baseFrequency="0.005"
                            numOctaves="2"
                            result="noise"
                        />
                        <feDisplacementMap
                            in="SourceGraphic"
                            in2="noise"
                            scale="30"
                            xChannelSelector="R"
                            yChannelSelector="G"
                        />
                    </filter>
                </defs>
            </svg>

            <div
                className="absolute inset-0 w-full h-full opacity-80 dark:opacity-60"
                style={{
                    filter: 'blur(100px)',
                    transform: 'scale(1.2)'
                }}
            >
                <AnimatePresence mode="popLayout">
                    {src && (
                        <motion.div
                            key={src}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 1.5, ease: "easeInOut" }}
                            className="absolute inset-0 w-full h-full"
                        >
                            {renderBlobs(src)}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="absolute inset-0 bg-black/10 z-10" />
        </div>
    );
});
