import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import clsx from 'clsx';
import { PageArtworkThemeContext } from '@/hooks/artworkThemeContexts';
import type { ArtworkTheme } from '@/utils/artworkTheme';
import { getArtworkThemeStyle } from '@/utils/artworkThemeStyle';

/** Keep the existing opaque page layer, including its palette, throughout the exit animation. */
export default function ArtworkThemeLayer({ children, className, style, ...props }: Omit<HTMLMotionProps<'div'>, 'children'> & { children: ReactNode }) {
    const [theme, setTheme] = useState<ArtworkTheme | null>(null);
    return (
        <PageArtworkThemeContext.Provider value={setTheme}>
            <motion.div
                {...props}
                className={clsx(className, 'transition-colors duration-200', theme && 'bg-surface dark:bg-surface-container-low', theme?.isDark && 'dark')}
                style={{ ...getArtworkThemeStyle(theme), ...style }}
            >
                {children}
            </motion.div>
        </PageArtworkThemeContext.Provider>
    );
}
