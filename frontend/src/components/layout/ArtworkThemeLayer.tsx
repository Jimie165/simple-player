import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion, useIsPresent } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import clsx from 'clsx';
import { PageArtworkThemeContext } from '@/hooks/artworkThemeContexts';
import type { ArtworkTheme } from '@/utils/artworkTheme';
import { getArtworkThemeStyle } from '@/utils/artworkThemeStyle';

/** Keep the existing opaque page layer, including its palette, throughout the exit animation. */
export default function ArtworkThemeLayer({ children, className, style, ...props }: Omit<HTMLMotionProps<'div'>, 'children'> & { children: ReactNode }) {
    const [theme, setTheme] = useState<ArtworkTheme | null>(null);
    const [exitFinished, setExitFinished] = useState(false);
    const isPresent = useIsPresent();
    // A missing cover receiver must not keep a completed page exit painted.
    if (exitFinished && !isPresent) return null;
    return (
        <PageArtworkThemeContext.Provider value={setTheme}>
            <motion.div
                {...props}
                onAnimationStart={(definition) => {
                    if (isPresent) setExitFinished(false);
                    props.onAnimationStart?.(definition);
                }}
                onAnimationComplete={(definition) => {
                    if (!isPresent && definition === 'exit') setExitFinished(true);
                    props.onAnimationComplete?.(definition);
                }}
                inert={props.inert || !isPresent}
                className={clsx(className, 'transition-colors duration-200', theme && 'bg-surface dark:bg-surface-container-low', theme?.isDark && 'dark')}
                style={{ translate: isPresent ? 'none' : undefined, ...getArtworkThemeStyle(theme), ...style }}
            >
                {children}
            </motion.div>
        </PageArtworkThemeContext.Provider>
    );
}
