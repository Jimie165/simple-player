import { useState, useEffect, useRef } from 'react';
import { MdMusicNote } from 'react-icons/md';
import clsx from 'clsx';
import { getCoverThumbnailPath, resolveMediaPath } from '@/utils/mediaPath';
import type { SongMetadata } from '@/types';
import { useLibraryStore } from '@/store/useLibraryStore';

interface PlaylistCoverCollageProps {
    songs: SongMetadata[];
    className?: string;
    iconClassName?: string;
    coverPaths?: string[];
}

/**
 * 播放列表封面拼接组件
 * - 4首及以上歌曲: 显示2x2拼接封面
 * - 少于4首歌曲: 显示第一首歌曲封面
 * - 无歌曲: 显示默认图标
 */
export default function PlaylistCoverCollage({ songs, className, iconClassName, coverPaths }: PlaylistCoverCollageProps) {
    const [coverUrls, setCoverUrls] = useState<(string | null)[]>([]);
    const libraryVersion = useLibraryStore(s => s.libraryVersion);
    const blobUrlsRef = useRef<string[]>([]);

    useEffect(() => {
        let isMounted = true;

        const loadCovers = async () => {
            const paths = coverPaths?.length
                ? coverPaths.slice(0, 4)
                : Array.from(new Set(
                    songs.map(song => song.cover_path).filter((path): path is string => !!path)
                )).slice(0, 4);

            if (paths.length === 0) {
                if (isMounted) setCoverUrls([]);
                return;
            }

            const selectedPaths = paths.length < 4 ? paths.slice(0, 1) : paths;
            const urls = await Promise.all(selectedPaths.map(async path => {
                const thumbnailPath = getCoverThumbnailPath(path, 512);
                return resolveMediaPath(thumbnailPath ?? path);
            }));
            if (isMounted) setCoverUrls(urls);
        };
        loadCovers();

        return () => {
            isMounted = false;
            blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
            blobUrlsRef.current = [];
        };
    }, [songs, coverPaths, libraryVersion]);

    useEffect(() => {
        const nextBlobUrls = coverUrls.filter((u): u is string => !!u && u.startsWith('blob:'));
        const prev = blobUrlsRef.current;
        prev.forEach(u => {
            if (!nextBlobUrls.includes(u)) URL.revokeObjectURL(u);
        });
        blobUrlsRef.current = nextBlobUrls;
    }, [coverUrls]);

    // 无封面：显示默认图标
    if (coverUrls.length === 0) {
        return (
            <div className={clsx("w-full h-full flex items-center justify-center bg-neutral-200 dark:bg-neutral-800", className)}>
                <MdMusicNote className={clsx("text-4xl text-neutral-400", iconClassName)} />
            </div>
        );
    }

    // 单封面（少于4首歌曲）
    if (coverUrls.length === 1 && coverUrls[0]) {
        return (
            <img
                src={coverUrls[0]}
                className={clsx("w-full h-full object-cover", className)}
                alt="Playlist Cover"
            />
        );
    }

    // 4封面拼接
    return (
        <div className={clsx("w-full h-full grid grid-cols-2 grid-rows-2", className)}>
            {coverUrls.slice(0, 4).map((url, index) => (
                url ? (
                    <img key={index} src={url} className="w-full h-full object-cover" alt="" />
                ) : (
                    <div key={index} className="w-full h-full bg-neutral-300 dark:bg-neutral-700 flex items-center justify-center">
                        <MdMusicNote className="text-neutral-400" />
                    </div>
                )
            ))}
        </div>
    );
}
