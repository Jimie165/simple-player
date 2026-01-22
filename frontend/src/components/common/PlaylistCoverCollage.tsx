import { useState, useEffect } from 'react';
import { IoMusicalNotes } from 'react-icons/io5';
import clsx from 'clsx';
import { resolveCover } from '../../utils/cover';
import type { SongMetadata } from '../../types';

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
        };
    }, [songs]);

    // 无封面：显示默认图标
    if (coverUrls.length === 0) {
        return (
            <div className={clsx("w-full h-full flex items-center justify-center bg-neutral-200 dark:bg-neutral-800", className)}>
                <IoMusicalNotes className={clsx("text-4xl text-neutral-400", iconClassName)} />
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
                        <IoMusicalNotes className="text-neutral-400" />
                    </div>
                )
            ))}
        </div>
    );
}
