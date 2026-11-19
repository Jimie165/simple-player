import { useState, useEffect, useRef, useContext } from 'react';
import { MdMusicNote, MdPerson, MdVideocam } from 'react-icons/md';
import clsx from 'clsx';
import { getCoverThumbnailPath, resolveCover, resolveMediaPath } from '@/utils/mediaPath';
import type { CoverThumbnailSize } from '@/utils/mediaPath';
import type { SongMetadata } from '@/types';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useThemeStore } from '@/store/useThemeStore';
import { ArtworkColorCacheContext } from '@/hooks/artworkThemeContexts';
// Actually MusicGrid logic is not exported or complex. We can just check extension.
const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'm4v', '3gp', 'ts', 'rmvb', 'wmv', 'asf', 'ogv'];
const isVideo = (song?: SongMetadata | null) => {
    if (!song) return false;
    const path = song.path || (typeof song.id === 'string' ? song.id : '');
    if (!path) return false;
    const ext = path.split('.').pop()?.toLowerCase() || '';
    return VIDEO_EXTENSIONS.includes(ext);
};

interface CoverImageProps {
    song?: SongMetadata | null;
    src?: string | null; // Allow direct src
    className?: string;
    iconClassName?: string;
    thumbnail?: CoverThumbnailSize | false;
    fallbackToSongCover?: boolean;
    fallback?: 'media' | 'artist';
    onImageLoad?: (image: HTMLImageElement) => void;
}

export default function CoverImage({
    song,
    src,
    className,
    iconClassName,
    thumbnail = 512,
    fallbackToSongCover = true,
    fallback = 'media',
    onImageLoad,
}: CoverImageProps) {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [fallbackSrc, setFallbackSrc] = useState<string | null>(null);
    const [imageIdentity, setImageIdentity] = useState<{ path: string; version: number } | null>(null);
    const libraryVersion = useLibraryStore(s => s.libraryVersion);
    const blobUrlRef = useRef<string | null>(null);
    const artworkCache = useContext(ArtworkColorCacheContext);
    const artworkBackgroundEnabled = useThemeStore(state => state.artworkBackgroundEnabled);

    useEffect(() => {
        let isMounted = true;

        const loadCover = async () => {
            // Clean up previous blob
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }

            const originalPath = src || (fallbackToSongCover ? song?.cover_path : null);
            if (originalPath) {
                const thumbnailPath = thumbnail ? getCoverThumbnailPath(originalPath, thumbnail) : null;
                const [url, originalUrl] = await Promise.all([
                    resolveMediaPath(thumbnailPath ?? originalPath),
                    thumbnailPath ? resolveMediaPath(originalPath) : Promise.resolve(null),
                ]);
                if (isMounted) {
                    if (url && url.startsWith('blob:')) blobUrlRef.current = url;
                    setImageIdentity({ path: originalPath, version: libraryVersion });
                    setFallbackSrc(originalUrl);
                    setImageSrc(url);
                }
                return;
            }

            // 2. Try song metadata
            if (!song) {
                if (isMounted) {
                    setImageIdentity(null);
                    setImageSrc(null);
                }
                return;
            }

            const url = await resolveCover(song);
            if (isMounted) {
                if (url && url.startsWith('blob:')) blobUrlRef.current = url;
                setImageIdentity(null);
                setImageSrc(url);
            }
        };

        void (loadCover()).catch(console.error);

        return () => {
            isMounted = false;
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, [song, src, libraryVersion, thumbnail, fallbackToSongCover]);

    if (imageSrc) {
        const currentPath = src || (fallbackToSongCover ? song?.cover_path : null);
        return (
            <img
                crossOrigin={onImageLoad && !imageSrc.startsWith('blob:') && !imageSrc.startsWith('data:') ? 'anonymous' : undefined}
                src={imageSrc}
                className={clsx("w-full h-full object-cover", className)}
                alt={song?.title || "Cover"}
                loading="lazy"
                decoding="async"
                onLoad={event => {
                    if (imageIdentity?.path === currentPath && imageIdentity?.version === libraryVersion) {
                        onImageLoad?.(event.currentTarget);
                    }
                    if (artworkBackgroundEnabled && imageIdentity) {
                        artworkCache?.prime(imageIdentity.path, imageIdentity.version, event.currentTarget);
                    }
                }}
                onError={() => {
                    if (fallbackSrc && imageSrc !== fallbackSrc) {
                        setImageSrc(fallbackSrc);
                        setFallbackSrc(null);
                    }
                }}
            />
        );
    }

    return (
        <div className={clsx("w-full h-full flex items-center justify-center text-neutral-400 bg-neutral-200 dark:bg-neutral-800", className)}>
            {isVideo(song) ? (
                <MdVideocam className={clsx("w-1/2 h-1/2", iconClassName)} />
            ) : fallback === 'artist' ? (
                <MdPerson className={clsx("w-1/2 h-1/2", iconClassName)} />
            ) : (
                <MdMusicNote className={clsx("w-1/2 h-1/2", iconClassName)} />
            )}
        </div>
    );
}
