import { useState, useEffect, useRef } from 'react';
import { MdMusicNote } from 'react-icons/md';
import clsx from 'clsx';
import { resolveCover } from '../../utils/cover';
import type { SongMetadata } from '../../types';
import { useLibraryStore } from '../../store/useLibraryStore';

interface CoverImageProps {
    song?: SongMetadata | null;
    src?: string | null; // Allow direct src
    className?: string;
    iconClassName?: string;
}

export default function CoverImage({ song, src, className, iconClassName }: CoverImageProps) {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const libraryVersion = useLibraryStore(s => s.libraryVersion);
    const blobUrlRef = useRef<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const loadCover = async () => {
            // 检查 src 是否有实际值（非空、非 null、非 undefined）
            if (src && src.length > 0) {
                if (blobUrlRef.current) {
                    URL.revokeObjectURL(blobUrlRef.current);
                    blobUrlRef.current = null;
                }
                setImageSrc(src);
                return;
            }

            if (!song) {
                if (blobUrlRef.current) {
                    URL.revokeObjectURL(blobUrlRef.current);
                    blobUrlRef.current = null;
                }
                setImageSrc(null);
                return;
            }

            const url = await resolveCover(song);
            if (isMounted) {
                if (blobUrlRef.current) {
                    URL.revokeObjectURL(blobUrlRef.current);
                    blobUrlRef.current = null;
                }
                if (url && url.startsWith('blob:')) {
                    blobUrlRef.current = url;
                }
                setImageSrc(url);
            }
        };

        loadCover();

        return () => {
            isMounted = false;
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, [song, src, libraryVersion]);

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
