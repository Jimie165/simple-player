import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { getCoverThumbnailPath, resolveMediaPath } from '@/utils/mediaPath';
import { averageArtworkColor, createArtworkTheme } from '@/utils/artworkTheme';
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
        let cancelled = false;
        let image: HTMLImageElement | null = null;
        const load = async () => {
            const thumbnail = getCoverThumbnailPath(path, 128);
            const url = await resolveMediaPath(thumbnail ?? path);
            if (!url || cancelled) return;
            image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => {
                if (cancelled || !image) return;
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = canvas.height = 32;
                    const context = canvas.getContext('2d', { willReadFrequently: true });
                    if (!context) return;
                    context.drawImage(image, 0, 0, 32, 32);
                    const color = averageArtworkColor(context.getImageData(0, 0, 32, 32).data);
                    setSample({ path, version: libraryVersion, color });
                } catch {
                    // Unreadable or cross-origin covers retain the normal application theme.
                }
            };
            image.onerror = () => {
                if (!thumbnail) return;
                void resolveMediaPath(path).then(original => {
                    if (cancelled || !image || !original) return;
                    image.onerror = null;
                    image.src = original;
                }).catch(() => { /* Keep the normal theme if the original cannot be resolved. */ });
            };
            image.src = url;
        };
        void load().catch(() => { /* Missing artwork falls back to the application theme. */ });
        return () => {
            cancelled = true;
            if (image) {
                image.onload = null;
                image.onerror = null;
            }
        };
    }, [path, active, libraryVersion, enabled]);

    const theme = useMemo(() => (
        enabled && sample && sample.path === path && sample.version === libraryVersion && sample.color !== null
            ? createArtworkTheme(sample.color, systemDark)
            : null
    ), [sample, path, libraryVersion, systemDark, enabled]);

    useEffect(() => {
        if (!active || !publishTheme) return;
        publishTheme(theme);
        // A covered detail must not clear the newer page's theme during navigation.
        return () => publishTheme(current => current === theme ? null : current);
    }, [active, publishTheme, theme]);
}
