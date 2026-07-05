import { useEffect, useState } from 'react';
import { resolveMediaPath } from '@/utils/mediaPath';
import type { SongMetadata } from '@/types';

export function useCoverBackground(metadata: SongMetadata | null) {
    const [bgImageSrc, setBgImageSrc] = useState<string | null>(null);
    const coverPath = metadata?.cover_path ?? null;

    useEffect(() => {
        let cancelled = false;
        let pendingImage: HTMLImageElement | null = null;

        const loadBg = async () => {
            if (!coverPath) {
                setBgImageSrc(null);
                return;
            }

            const resolved = await resolveMediaPath(coverPath);
            if (cancelled) return;
            if (!resolved) {
                setBgImageSrc(null);
                return;
            }

            pendingImage = new Image();
            pendingImage.onload = () => {
                if (!cancelled) setBgImageSrc(resolved);
            };
            pendingImage.onerror = () => {
                if (!cancelled) setBgImageSrc(null);
            };
            pendingImage.src = resolved;
        };

        loadBg();
        return () => {
            cancelled = true;
            if (pendingImage) {
                pendingImage.onload = null;
                pendingImage.onerror = null;
                pendingImage = null;
            }
        };
    }, [coverPath]);

    return bgImageSrc;
}
