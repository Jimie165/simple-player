import { useEffect, useState } from 'react';
import { resolveCover } from '@/utils/mediaPath';
import { useLibraryStore } from '@/store/useLibraryStore';
import type { SongMetadata } from '@/types';

export function useCoverBackground(metadata: SongMetadata | null) {
    const [bgImageSrc, setBgImageSrc] = useState<string | null>(null);
    const libraryVersion = useLibraryStore((state) => state.libraryVersion);

    useEffect(() => {
        let cancelled = false;
        let pendingImage: HTMLImageElement | null = null;

        const loadBg = async () => {
            if (!metadata) {
                setBgImageSrc(null);
                return;
            }

            const resolved = await resolveCover(metadata);
            if (cancelled) return;
            if (!resolved) {
                setBgImageSrc(null);
                return;
            }

            // A deleted cover can leave a failed asset response in Chromium's
            // cache. The library revision retries with a fresh request URL once
            // the cover cache has been regenerated.
            const separator = resolved.includes('?') ? '&' : '?';
            const revisedSrc = `${resolved}${separator}libraryVersion=${libraryVersion}`;

            pendingImage = new Image();
            pendingImage.onload = () => {
                if (!cancelled) setBgImageSrc(revisedSrc);
            };
            pendingImage.onerror = () => {
                if (!cancelled) setBgImageSrc(null);
            };
            pendingImage.src = revisedSrc;
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
    }, [metadata, libraryVersion]);

    return bgImageSrc;
}
