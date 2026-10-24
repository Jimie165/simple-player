import clsx from 'clsx';
import { MdFavorite } from 'react-icons/md';
import { FiMaximize2 } from 'react-icons/fi';

import type { SongMetadata } from '@/types';
import CoverImage from '@/components/common/CoverImage';
import OverflowMarquee from '@/components/common/OverflowMarquee';
import { useNavigationStore } from '@/store/useNavigationStore';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';

interface SongInfoProps {
    metadata: SongMetadata | null;
    isFullScreen: boolean;
    onToggleFullScreen: () => void;
}

import { usePlayerStore } from '@/store/usePlayerStore';

export default function SongInfo({ metadata, isFullScreen, onToggleFullScreen }: SongInfoProps) {
    const setVideoMode = usePlayerStore(s => s.setVideoMode);
    const setMediaKind = usePlayerStore(s => s.setMediaKind);
    const { pausePlayback } = usePlaybackActions();
    const { push } = useNavigationStore();
    const canNavigate = !!metadata && typeof metadata.id === 'number';

    return (
        <div className="player-song-info flex min-w-0 justify-start transition-[filter] duration-200">
            <div
                className="group relative flex h-16 w-full min-w-0 items-center rounded-md pb-2 text-left"
            >
                <button
                    type="button"
                    aria-label="展开正在播放"
                    onClick={() => {
                        const isVideo = metadata?.path?.match(/\.(mp4|mkv|webm|avi|mov|flv)$/i);
                        if (isVideo) {
                            void pausePlayback()
                                .then(() => {
                                    setVideoMode(true);
                                    setMediaKind('video');
                                })
                                .catch((error) => console.error('Failed to pause audio before video playback', error));
                        } else {
                            onToggleFullScreen();
                        }
                    }}
                    className={clsx(
                        "group/cover relative shrink-0 flex items-center justify-center overflow-hidden bg-neutral-200 shadow-sm ring-1 ring-black/5 transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)] dark:bg-neutral-800 dark:ring-white/10",
                        isFullScreen
                            ? "w-0 h-14 opacity-0 -translate-y-12 scale-150 mr-0"
                            : "w-12 h-12 opacity-100 translate-y-0 scale-100 mr-2.5 rounded-sm hover:scale-105 focus-visible:scale-105"
                    )}>
                    <CoverImage
                        thumbnail={128}
                        song={metadata}
                        className="w-full h-full object-cover"
                        iconClassName="text-2xl text-neutral-400"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white opacity-0 transition-opacity duration-150 group-hover/cover:opacity-100 group-focus-visible/cover:opacity-100">
                        <FiMaximize2 className="rotate-90 text-xl" />
                    </span>
                </button>

                <div className="flex min-w-0 flex-1 flex-col justify-center pr-1">
                    <div className="flex w-full min-w-0 items-center gap-1 text-[15px] font-semibold leading-5 text-neutral-900 transition-colors dark:text-white/92">
                        <OverflowMarquee
                            className="flex-1"
                            resetToken={`title-${metadata?.path || metadata?.title || 'empty'}`}
                        >
                            <span className="whitespace-nowrap">{metadata?.title || "未播放音乐"}</span>
                        </OverflowMarquee>
                        {metadata?.is_favorite && <MdFavorite className="text-red-500 text-xs shrink-0" />}
                    </div>
                    <OverflowMarquee
                        className="mt-0.5 w-full text-sm leading-5 text-neutral-600 dark:text-white/56"
                        contentClassName="flex w-max items-center whitespace-nowrap"
                        resetToken={`meta-${metadata?.path || metadata?.artist || 'empty'}-${metadata?.album || ''}`}
                    >
                        <span
                            onClick={(e) => {
                                if (!canNavigate || !metadata?.artist) return;
                                e.stopPropagation();
                                e.preventDefault();
                                push({ type: 'artist_detail', data: { name: metadata.artist, count: 0, albumCount: 0, songs: [], cover: null } });
                            }}
                            className={clsx(
                                canNavigate && metadata?.artist
                                    ? "cursor-pointer hover:text-neutral-700 hover:underline dark:hover:text-neutral-200"
                                    : "cursor-default"
                            )}
                        >
                            {metadata?.artist || "Simple Player"}
                        </span>
                        {metadata?.album && <>
                            <span>{' — '}</span>
                            <button
                                type="button"
                                disabled={!canNavigate}
                                onClick={() => push({ type: 'album_detail', data: { name: metadata.album, artist: metadata.artist, songs: [], cover: metadata.cover_path || null, count: 0 } })}
                                className="text-left enabled:cursor-pointer enabled:hover:text-neutral-700 enabled:hover:underline dark:enabled:hover:text-neutral-200"
                            >
                                {metadata.album}
                            </button>
                        </>}
                    </OverflowMarquee>
                </div>
            </div>
        </div>
    );
}
