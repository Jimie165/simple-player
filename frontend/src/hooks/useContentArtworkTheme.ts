import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { getCoverThumbnailPath, resolveMediaPath } from '@/utils/mediaPath';
import { selectArtworkColor, createArtworkTheme } from '@/utils/artworkTheme';
import type { ArtworkTheme } from '@/utils/artworkTheme';

export const ContentThemeContext = createContext<Dispatch<SetStateAction<ArtworkTheme | null>> | null>(null);

export function useContentArtworkTheme(path: string | null | undefined, active: boolean) {
    const publishTheme = useContext(ContentThemeContext);
    const systemDark = useThemeStore(state => state.isDark);
    const enabled = useThemeStore(state => state.artworkBackgroundEnabled);
    const libraryVersion = useLibraryStore(state => state.libraryVersion);
    const [sample, setSample] = useState<{ path: string; version: number; color: number | null } | null>(null);

    useEffect(() => {
        if (!path || !active || !enabled) return;
        if (sample?.path === path && sample.version === libraryVersion) return;
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
                    const canvas = document.createElement('canvas');
                    canvas.width = canvas.height = 32;
                    const context = canvas.getContext('2d', { willReadFrequently: true });
                    if (!context) {
                        fail();
                        return;
                    }
                    context.drawImage(image, 0, 0, 32, 32);
                    const color = selectArtworkColor(context.getImageData(0, 0, 32, 32).data);
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
    }, [path, active, libraryVersion, enabled, sample]);

    // Keep the last palette while revalidating artwork instead of briefly clearing the background.
    const color = sample?.color ?? null;
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

    useEffect(() => {
        if (!active || !publishTheme) return;
        publishTheme(theme);
        // A covered detail must not clear the newer page's theme during navigation.
        return () => publishTheme(current => current === theme ? null : current);
    }, [active, publishTheme, theme]);
}
