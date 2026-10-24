import SharedCover from '@/components/common/SharedCover';
import type { CoverTransitionSource } from '@/utils/viewTransition';
import { useMemo } from 'react';
import { MdPlayArrow, MdShuffle } from 'react-icons/md';
import SongListView from '@/features/library/components/SongListView';
import CoverImage from '@/components/common/CoverImage';
import SmartMusicContextMenu from '@/components/common/SmartMusicContextMenu';
import type { AlbumData } from '@/features/library/components/AlbumGridView';
import type { SongMetadata } from '@/types';
import DetailScrollHeader from '@/components/common/DetailScrollHeader';
import { useDialogStore } from '@/store/useDialogStore';

interface AlbumDetailViewProps {
    transitionSource?: CoverTransitionSource;
    album: AlbumData;
    onPlay: (song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean, disableShuffle?: boolean }) => void;
    onPlayAll: () => void;
    onShuffle: () => void;
    onDeleteSong?: (song: SongMetadata) => void;
    onAlbumDeleted?: () => void;
    onOpenArtistByName?: (name: string) => void;
    onOpenAlbumByName?: (name: string) => void;
}

export default function AlbumDetailView({
    album,
    onPlay,
    onPlayAll,
    onShuffle,
    onDeleteSong,
    onAlbumDeleted,
    onOpenArtistByName,
    transitionSource,
}: AlbumDetailViewProps) {
    const openEditAlbum = useDialogStore(state => state.openEditAlbum);

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
        <div className="flex flex-col h-full relative isolate">
            <DetailScrollHeader />

            {/* Header Area using Material 3 Styling */}
            <div className="flex flex-col md:flex-row gap-8 mb-8 px-6 pt-6 relative z-10">
                {/* Cover: Elevation, Large Radius */}
                <SharedCover source={transitionSource} className="w-67.5 h-67.5 rounded-xl shadow-xl shadow-black/10 bg-neutral-200 dark:bg-neutral-800 overflow-hidden shrink-0 relative z-10">
                    <CoverImage
                        song={album.songs[0]}
                        src={album.cover}
                        className="w-full h-full object-cover"
                        iconClassName="text-7xl"
                    />
                </SharedCover>

                {/* Details */}
                <div className="flex flex-col justify-center gap-2 min-w-0 flex-1 pb-2">
                    <h1 className="text-2xl md:text-[28px] font-bold text-on-surface wrap-break-words leading-snug tracking-tight mt-2">
                        {album.name}
                    </h1>
                    <h2 className="text-lg md:text-xl font-medium text-primary wrap-break-words">
                        {album.artist}
                    </h2>

                    <div className="text-sm text-on-surface-variant mt-2 font-medium flex flex-wrap items-center gap-2">
                        <span className="bg-on-surface/8 text-on-surface-variant px-2 py-0.5 rounded-md text-xs">Album</span>
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
                    <div className="flex flex-wrap items-center gap-3 mt-6">
                        <button
                            onClick={onPlayAll}
                            className="flex items-center gap-2 bg-primary base-theme:dark:bg-primary-container base-theme:dark:text-on-primary-container hover:bg-primary/90 base-theme:dark:hover:bg-on-primary text-on-primary px-6 py-2.5 rounded-full font-medium transition-all shadow-md hover:shadow-lg active:scale-95"
                        >
                            <MdPlayArrow className="text-xl" />
                            播放
                        </button>

                        <button
                            onClick={onShuffle}
                            className="flex items-center gap-2 btn-blur text-primary base-theme:bg-secondary-container base-theme:text-on-secondary-container base-theme:hover:bg-secondary-container/80 px-6 py-2.5 rounded-full font-medium transition-all hover:bg-surface-container-highest"
                        >
                            <MdShuffle className="text-xl" />
                            随机播放
                        </button>

                        <SmartMusicContextMenu
                            className="ml-auto"
                            buttonClassName="h-10 w-10 rounded-full btn-blur text-2xl hover:bg-surface-container-highest"
                            variant="clean"
                            tooltipText="更多"
                            items={album}
                            context="album_detail"
                            onPlay={onPlayAll}
                            onShuffle={onShuffle}
                            onEdit={() => openEditAlbum(album)}
                            onDeleted={onAlbumDeleted}
                            hideSelect
                        />
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
