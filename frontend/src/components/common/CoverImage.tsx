import { useState, useEffect } from 'react';
import { MdMusicNote } from 'react-icons/md';
import clsx from 'clsx';
import { resolveCover } from '../../utils/cover';
import type { SongMetadata } from '../../types';

interface CoverImageProps {
    song?: SongMetadata | null;
    src?: string | null; // Allow direct src
    className?: string;
    iconClassName?: string;
}

export default function CoverImage({ song, src, className, iconClassName }: CoverImageProps) {
    const [imageSrc, setImageSrc] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const loadCover = async () => {
            // 检查 src 是否有实际值（非空、非 null、非 undefined）
            if (src && src.length > 0) {
                setImageSrc(src);
                return;
            }

            if (!song) {
                setImageSrc(null);
                return;
            }

            const url = await resolveCover(song);
            if (isMounted) {
                setImageSrc(url);
            }
        };

        loadCover();

        return () => {
            isMounted = false;
        };
    }, [song, src]);

    if (imageSrc) {
        return (
            <img
                src={imageSrc}
                className={clsx("w-full h-full object-cover", className)}
                alt={song?.title || "Cover"}
            />
        );
    }

    return (
        <div className={clsx("w-full h-full flex items-center justify-center text-neutral-400 bg-neutral-200 dark:bg-neutral-800", className)}>
            <MdMusicNote className={clsx("text-2xl", iconClassName)} />
        </div>
    );
}
