import { useMemo } from 'react';
import { MdPlayArrow, MdShuffle } from 'react-icons/md';
import SongListView from '@/features/library/components/SongListView';
import CoverImage from '@/components/common/CoverImage';
import type { AlbumData } from '@/features/library/components/AlbumGridView';
import type { SongMetadata } from '@/types';
import { useScrollBlur } from '@/hooks/useScrollBlur';
import clsx from 'clsx';
import CustomTooltip from '@/components/common/CustomTooltip';

interface AlbumDetailViewProps {
    album: AlbumData;
    onPlay: (song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean, disableShuffle?: boolean }) => void;
    onPlayAll: () => void;
    onShuffle: () => void;
    onDeleteSong?: (song: SongMetadata) => void;
    onOpenArtistByName?: (name: string) => void;
    onOpenAlbumByName?: (name: string) => void;
}

export default function AlbumDetailView({
    album,
    onPlay,
    onPlayAll,
    onShuffle,
    onDeleteSong,
    onOpenArtistByName
}: AlbumDetailViewProps) {
    const { isScrolled, topSentinelRef } = useScrollBlur();

    const totalDuration = useMemo(() => {
        if (!album || !album.songs) return 0;
        return album.songs.reduce((acc, song) => acc + song.duration, 0);
    }, [album]);

    if (!album) return null;

    const formatDuration = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        if (h > 0) {
            return `${h} 小时 ${m} 分钟`;
        }
        return `${m} 分钟`;
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in zoom-in-95 duration-300 relative isolate">
            <div ref={topSentinelRef} className="absolute top-0 h-1 w-full pointer-events-none z-0" />

            {/* Sticky Header Guard (Blurs content that scrolls under TitleBar) */}
            <div className={clsx(
                "sticky top-0 left-0 right-0 h-10 z-[60] transition-all duration-300 border-b",
                isScrolled
                    ? "bg-surface/60 dark:bg-black/40 backdrop-blur-xl border-outline-variant/10 opacity-100 pointer-events-auto"
                    : "bg-transparent border-transparent opacity-0 pointer-events-none"
            )} data-tauri-drag-region />

            {/* Header Area using Material 3 Styling */}
            <div className="flex flex-col md:flex-row gap-8 mb-4 px-6 pt-6 relative z-10 -mt-10">
                {/* Cover: Elevation, Large Radius */}
                <div className="w-48 h-48 md:w-60 md:h-60 rounded-3xl shadow-xl shadow-black/10 bg-neutral-200 dark:bg-neutral-800 overflow-hidden shrink-0 relative z-10">
                    <CoverImage
                        song={album.songs[0]}
                        src={album.cover}
                        className="w-full h-full object-cover"
                        iconClassName="text-7xl"
                    />
                </div>

                {/* Details */}
                <div className="flex flex-col justify-center gap-2 min-w-0 flex-1 pb-2">
                    <CustomTooltip text={album.name} className="block min-w-0">
                        <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 dark:text-neutral-50 truncate leading-tight tracking-tight mt-2">
                            {album.name}
                        </h1>
                    </CustomTooltip>
                    <CustomTooltip text={album.artist} className="block min-w-0">
                        <h2 className="text-2xl font-medium text-primary truncate">
                            {album.artist}
                        </h2>
                    </CustomTooltip>

                    <div className="text-sm text-neutral-500 dark:text-neutral-400 mt-2 font-medium flex items-center gap-2">
                        <span className="bg-neutral-100 dark:bg-white/10 px-2 py-0.5 rounded-md text-xs">Album</span>
                        <span>•</span>
                        <span>{album.songs[0]?.year || 'Unknown Year'}</span>
                        <span>•</span>
                        <span>{album.songs[0]?.genre || 'Unknown Genre'}</span>
                        <span>•</span>
                        <span>{album.songs.length} 首歌</span>
                        <span>•</span>
                        <span>{formatDuration(totalDuration)}</span>
                    </div>

                    {/* Actions Row */}
                    <div className="flex flex-wrap gap-3 mt-6">
                        <button
                            onClick={onPlayAll}
                            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-on-primary px-6 py-2.5 rounded-full font-medium transition-all shadow-md hover:shadow-lg active:scale-95"
                        >
                            <MdPlayArrow className="text-xl" />
                            播放
                        </button>

                        <button
                            onClick={onShuffle}
                            className="flex items-center gap-2 btn-blur text-primary px-6 py-2.5 rounded-full font-medium transition-all hover:bg-surface-container-highest"
                        >
                            <MdShuffle className="text-xl" />
                            随机播放
                        </button>
                    </div>
                </div>
            </div>

            {/* Song List */}
            <div className="flex-1 pb-16">
                <SongListView
                    songs={album.songs}
                    onPlay={onPlay}
                    onDelete={onDeleteSong}
                    enableDelete={!!onDeleteSong}
                    hideCover={true}
                    hideArtist={true}
                    hideAlbum={true}
                    disableSort={true}
                    onOpenArtist={onOpenArtistByName}
                    context="album_detail"
                    footerSpacerClassName="h-16"
                />
            </div>
        </div>
    );
}
