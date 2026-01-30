import { useState, useEffect, useRef } from 'react';
import { MdMusicNote } from 'react-icons/md';
import clsx from 'clsx';
import { resolveCover } from '../../utils/cover';
import type { SongMetadata } from '../../types';
import { useLibraryStore } from '../../store/useLibraryStore';

interface PlaylistCoverCollageProps {
    songs: SongMetadata[];
    className?: string;
    iconClassName?: string;
}

/**
 * 播放列表封面拼接组件
 * - 4首及以上歌曲: 显示2x2拼接封面
 * - 少于4首歌曲: 显示第一首歌曲封面
 * - 无歌曲: 显示默认图标
 */
export default function PlaylistCoverCollage({ songs, className, iconClassName }: PlaylistCoverCollageProps) {
    const [coverUrls, setCoverUrls] = useState<(string | null)[]>([]);
    const libraryVersion = useLibraryStore(s => s.libraryVersion);
    const blobUrlsRef = useRef<string[]>([]);

    useEffect(() => {
        let isMounted = true;

        const loadCovers = async () => {
            if (songs.length === 0) {
                if (isMounted) setCoverUrls([]);
                return;
            }

            // 取前4首不同封面的歌曲
            const uniqueCovers = new Map<string, SongMetadata>();
            for (const song of songs) {
                const key = song.cover_path || song.cover || song.path || '';
                if (key && !uniqueCovers.has(key) && uniqueCovers.size < 4) {
                    uniqueCovers.set(key, song);
                }
            }

            const songsToResolve = Array.from(uniqueCovers.values());

            // 如果少于4首不同封面，只取第一首
            if (songsToResolve.length < 4) {
                const url = await resolveCover(songs[0]);
                if (isMounted) setCoverUrls(url ? [url] : []);
                return;
            }

            // 解析4张封面
            const urls = await Promise.all(
                songsToResolve.slice(0, 4).map(song => resolveCover(song))
            );
            if (isMounted) setCoverUrls(urls);
        };

        loadCovers();

        return () => {
            isMounted = false;
            blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
            blobUrlsRef.current = [];
        };
    }, [songs, libraryVersion]);

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
