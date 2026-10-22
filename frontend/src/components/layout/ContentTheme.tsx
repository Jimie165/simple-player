import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { ContentThemeContext } from '@/hooks/useContentArtworkTheme';
import type { ArtworkTheme } from '@/utils/artworkTheme';
import { getArtworkThemeStyle } from '@/utils/artworkThemeStyle';
import { ArtworkColorCache } from '@/utils/artworkColorCache';
import { ArtworkColorCacheContext } from '@/hooks/artworkThemeContexts';
import { useThemeStore } from '@/store/useThemeStore';

export function ContentTheme({ children }: { children: ReactNode }) {
    const [pageTheme, setTheme] = useState<ArtworkTheme | null>(null);
    const [cache] = useState(() => new ArtworkColorCache());
    useEffect(() => () => cache.dispose(), [cache]);
    const enabled = useThemeStore(state => state.artworkBackgroundEnabled);
    const theme = enabled ? pageTheme : null;
    const style = getArtworkThemeStyle(theme);
    const rootRef = useRef<HTMLDivElement>(null);
    const previousTheme = useRef(theme);

    useLayoutEffect(() => {
        if (previousTheme.current === theme) return;
        previousTheme.current = theme;
        const root = rootRef.current;
        if (!root) return;
        // Commit inherited colors together; restore interaction transitions after one painted frame.
        root.setAttribute('data-artwork-updating', '');
        let restoreFrame = 0;
        const paintFrame = requestAnimationFrame(() => {
            restoreFrame = requestAnimationFrame(() => root.removeAttribute('data-artwork-updating'));
        });
        return () => {
            cancelAnimationFrame(paintFrame);
            cancelAnimationFrame(restoreFrame);
            root.removeAttribute('data-artwork-updating');
        };
    }, [theme]);

    return (
        <ArtworkColorCacheContext.Provider value={cache}>
            <ContentThemeContext.Provider value={setTheme}>
                <div
                    ref={rootRef}
                    className={clsx('flex min-h-0 flex-1 overflow-hidden relative', theme?.isDark && 'dark')}
                    data-artwork-theme={theme ? 'active' : undefined}
                    style={style}
                >
                    {children}
                </div>
            </ContentThemeContext.Provider>
        </ArtworkColorCacheContext.Provider>
    );
}
