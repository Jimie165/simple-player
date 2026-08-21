import clsx from 'clsx';
import { MdFavorite } from 'react-icons/md';

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
        <div className="flex min-w-0 justify-start">
            <button
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
                className="group relative flex h-16 min-w-0 max-w-full items-start overflow-hidden rounded-md p-1 pt-1.5 pr-3 text-left transition-colors hover:bg-black/4.5 dark:hover:bg-white/7.5"
            >
                <div className={clsx(
                    "relative shrink-0 flex items-center justify-center overflow-hidden bg-neutral-200 shadow-sm ring-1 ring-black/5 transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)] dark:bg-neutral-800 dark:ring-white/10",
                    isFullScreen
                        ? "w-0 h-14 opacity-0 -translate-y-12 scale-150 mr-0"
                        : "w-14 h-14 opacity-100 translate-y-0 scale-100 mr-3 rounded-md"
                )}>
                    <CoverImage
                        thumbnail={128}
song={metadata}
                        className="w-full h-full object-cover"
                        iconClassName="text-2xl text-neutral-400"
                    />
                </div>

                <div className="flex min-w-0 max-w-[min(34vw,420px)] flex-1 flex-col justify-start pr-2 pt-0.5 transition-all duration-500 max-md:max-w-[min(28vw,220px)]">
                    <div className="flex w-full min-w-0 items-center gap-2 text-sm font-semibold leading-4 text-neutral-900 transition-colors dark:text-white/92">
                        <OverflowMarquee
                            className="flex-1"
                            resetToken={`title-${metadata?.path || metadata?.title || 'empty'}`}
                        >
                            <span className="whitespace-nowrap">{metadata?.title || "未播放音乐"}</span>
                        </OverflowMarquee>
                        {metadata?.is_favorite && <MdFavorite className="text-red-500 text-xs shrink-0" />}
                    </div>
                    <OverflowMarquee
                        className="mt-0.5 w-full text-xs leading-4 text-neutral-600 dark:text-white/56"
                        contentClassName="flex w-max items-center whitespace-nowrap"
                        resetToken={`meta-${metadata?.path || metadata?.artist || 'empty'}`}
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
                    </OverflowMarquee>
                </div>
            </button>
        </div>
    );
}
