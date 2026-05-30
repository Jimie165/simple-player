import { useEffect, useState } from 'react';
import { resolveCover } from '@/utils/mediaPath';
import type { SongMetadata } from '@/types';

export function useCoverBackground(metadata: SongMetadata | null) {
    const [bgImageSrc, setBgImageSrc] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const loadBg = async () => {
            if (metadata) {
                const src = await resolveCover(metadata);
                if (isMounted) setBgImageSrc(src);
            } else {
                if (isMounted) setBgImageSrc(null);
            }
        };
        loadBg();
        return () => { isMounted = false; };
    }, [metadata]);

    return bgImageSrc;
}
