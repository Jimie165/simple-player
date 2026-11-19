import { useContext, useEffect, useRef, useState } from 'react';
import { hexFromArgb } from '@material/material-color-utilities';
import CoverImage from '@/components/common/CoverImage';
import { ArtworkColorCacheContext } from '@/hooks/artworkThemeContexts';
import { useLibraryStore } from '@/store/useLibraryStore';
import { sampleArtworkColor } from '@/utils/artworkColorCache';

export default function ArtistPortrait({ src }: { src?: string | null }) {
    const cache = useContext(ArtworkColorCacheContext);
    const version = useLibraryStore(state => state.libraryVersion);
    const [sample, setSample] = useState<{ src: string; color: number | null }>();
    const request = useRef<number | undefined>(undefined);

    useEffect(() => () => {
        if (request.current !== undefined) window.cancelIdleCallback(request.current);
    }, [src]);

    const onImageLoad = (image: HTMLImageElement) => {
        if (!src) return;
        const cached = cache?.read(src, version);
        if (cached !== undefined) {
            setSample({ src, color: cached });
            return;
        }

        if (request.current !== undefined) window.cancelIdleCallback(request.current);
        const imageSrc = image.currentSrc;
        request.current = window.requestIdleCallback(() => {
            request.current = undefined;
            if (image.currentSrc !== imageSrc) return;

            // 封面可以显示时，像素读取仍可能被跨域限制阻止。
            let color = cache?.read(src, version);
            if (color === undefined) {
                try {
                    color = sampleArtworkColor(image);
                    cache?.write(src, version, color);
                } catch {
                    color = null;
                }
            }
            setSample({ src, color });
        }, { timeout: 500 });
    };

    const color = sample && sample.src === src ? sample.color : null;
    const base = color === null ? undefined : hexFromArgb(color);
    const background = base
        ? `linear-gradient(180deg in oklab, color-mix(in oklab, ${base} 47%, black), color-mix(in oklab, ${base} 88%, white))`
        : undefined;

    return (
        <div className="absolute inset-0 grid place-items-center" style={{ background }}>
            <div className="size-4/5 overflow-hidden rounded-full">
                <CoverImage src={src} fallback="artist" iconClassName="opacity-40" onImageLoad={onImageLoad} />
            </div>
        </div>
    );
}
