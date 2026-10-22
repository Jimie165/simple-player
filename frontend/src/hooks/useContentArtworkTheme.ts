import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { getCoverThumbnailPath, resolveMediaPath } from '@/utils/mediaPath';
import { createArtworkTheme } from '@/utils/artworkTheme';
import type { ArtworkTheme } from '@/utils/artworkTheme';
import { sampleArtworkColor } from '@/utils/artworkColorCache';
import { ArtworkColorCacheContext, PageArtworkThemeContext } from '@/hooks/artworkThemeContexts';

export const ContentThemeContext = createContext<Dispatch<SetStateAction<ArtworkTheme | null>> | null>(null);

export function useContentArtworkTheme(path: string | null | undefined, active: boolean) {
    const publishTheme = useContext(ContentThemeContext);
    const cache = useContext(ArtworkColorCacheContext);
    const publishPageTheme = useContext(PageArtworkThemeContext);
    const systemDark = useThemeStore(state => state.isDark);
    const enabled = useThemeStore(state => state.artworkBackgroundEnabled);
    const libraryVersion = useLibraryStore(state => state.libraryVersion);
    const [sample, setSample] = useState<{ path: string; version: number; color: number | null } | null>(() => {
        const current = path ? cache?.read(path, libraryVersion) : undefined;
        const color = current !== undefined ? current : path ? cache?.read(path) : undefined;
        return path && color !== undefined ? { path, version: current !== undefined ? libraryVersion : -1, color } : null;
    });

    useEffect(() => {
        if (!path || !active || !enabled) return;
        if (sample?.path === path && sample.version === libraryVersion) return;
        const cachedColor = cache?.read(path, libraryVersion);
        if (cachedColor !== undefined) {
            let cancelled = false;
            // Rendering already reads the cache synchronously; retain it for the next uncached cover.
            queueMicrotask(() => {
                if (!cancelled) setSample({ path, version: libraryVersion, color: cachedColor });
            });
            return () => { cancelled = true; };
        }
        let cancelled = false;
        let image: HTMLImageElement | null = null;
        const fail = () => {
            if (!cancelled) setSample({ path, version: libraryVersion, color: null });
        };
        const load = async () => {
            const thumbnail = getCoverThumbnailPath(path, 128);
            const url = await resolveMediaPath(thumbnail ?? path);
            if (cancelled) return;
            if (!url) {
                fail();
                return;
            }
            image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => {
                if (cancelled || !image) return;
                try {
                    const color = sampleArtworkColor(image);
                    cache?.write(path, libraryVersion, color);
                    setSample({ path, version: libraryVersion, color });
                } catch {
                    // Unreadable or cross-origin covers retain the normal application theme.
                    fail();
                }
            };
            image.onerror = () => {
                if (!thumbnail) {
                    fail();
                    return;
                }
                void resolveMediaPath(path).then(original => {
                    if (cancelled || !image) return;
                    if (!original) {
                        fail();
                        return;
                    }
                    image.onerror = fail;
                    image.src = original;
                }).catch(fail);
            };
            image.src = url;
        };
        void load().catch(fail);
        return () => {
            cancelled = true;
            if (image) {
                image.onload = null;
                image.onerror = null;
            }
        };
    }, [path, active, libraryVersion, enabled, sample, cache]);

    // Keep the last palette while revalidating artwork instead of briefly clearing the background.
    const cachedColor = path ? cache?.read(path, libraryVersion) : undefined;
    const color = cachedColor !== undefined ? cachedColor : sample?.color ?? null;
    const hasArtwork = Boolean(path);
    const nextTheme = useMemo(() => (
        enabled && hasArtwork && color !== null
            ? createArtworkTheme(color, systemDark)
            : null
    ), [color, hasArtwork, systemDark, enabled]);
    const background = nextTheme?.background;
    const sidebarBackground = nextTheme?.sidebarBackground;
    const isDark = nextTheme?.isDark;
    // Preserve the published object when different source colors produce the same final palette.
    const theme = useMemo(() => (
        background !== undefined && sidebarBackground !== undefined && isDark !== undefined
            ? { background, sidebarBackground, isDark }
            : null
    ), [background, sidebarBackground, isDark]);

    useLayoutEffect(() => {
        if (!active || !publishTheme) return;
        publishTheme(theme);
        publishPageTheme?.(theme);
        // A covered detail must not clear the newer page's theme during navigation.
        return () => publishTheme(current => current === theme ? null : current);
    }, [active, publishTheme, publishPageTheme, theme]);
}
