import SharedCover from '@/components/common/SharedCover';
import type { CoverTransitionSource } from '@/utils/viewTransition';
import { pageMotion } from '@/utils/viewTransition';
import { memo, useId, useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useScrollViewport } from '@/hooks/useScrollViewport';
import { useViewportOverscan } from '@/hooks/useViewportOverscan';
import { MdPlayArrow, MdShuffle, MdPerson } from 'react-icons/md';
import { AnimatePresence, motion } from 'framer-motion';
import CardPlayButton from '@/components/common/CardPlayButton';
import CoverImage from '@/components/common/CoverImage';
import clsx from 'clsx';
import type { ArtistData } from '@/features/library/components/ArtistGridView';
import type { AlbumData } from '@/features/library/components/AlbumGridView';
import SongListView from '@/features/library/components/SongListView';
import AlbumGridView from '@/features/library/components/AlbumGridView';
import type { SongMetadata } from '@/types';
import { getMusicItemId } from '@/utils/musicItemUtils';
import { useSelectionStore } from '@/store/useSelectionStore';
import { useNavigationStore } from '@/store/useNavigationStore';
import DetailScrollHeader from '@/components/common/DetailScrollHeader';

interface ArtistDetailViewProps {
    artist: ArtistData;
    albums: AlbumData[];
    onShuffle: () => void;
    onPlayAlbum: (album: AlbumData) => void;
    onOpenAlbum: (album: AlbumData, source?: CoverTransitionSource) => void;
    transitionSource?: CoverTransitionSource;
    onPlaySong: (song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean, disableShuffle?: boolean }) => void;
    onDeleteSong?: (song: SongMetadata) => void;
    onDeleteAlbum?: (album: AlbumData) => void;
    onOpenArtistByName?: (name: string) => void;
    onOpenAlbumByName?: (name: string) => void;
}

const ArtistAlbumSection = memo(function ArtistAlbumSection({ album, index, render }: {
    album: AlbumData;
    index: number;
    render: (album: AlbumData, index: number) => ReactNode;
}) {
    return render(album, index);
});

export default function ArtistDetailView({
    artist,
    albums,
    onShuffle,
    onPlayAlbum,
    onOpenAlbum,
    onPlaySong,
    onDeleteSong,
    onDeleteAlbum,
    onOpenAlbumByName,
    transitionSource,
}: ArtistDetailViewProps) {

    // Helper to robustly handle album opening by name
    const handleOpenAlbumByName = useCallback((name: string) => {
        if (onOpenAlbumByName) {
            onOpenAlbumByName(name);
            return;
        }
        // Fallback: search in local albums list
        const found = albums.find(a => a.name === name);
        if (found) {
            onOpenAlbum(found);
        }
    }, [onOpenAlbumByName, albums, onOpenAlbum]);

    const lastArtistDetailTab = useNavigationStore(state => state.lastArtistDetailTab);
    const setArtistDetailTab = useNavigationStore(state => state.setArtistDetailTab);
    const detailRef = useRef<HTMLDivElement>(null);
    const scrollParent = useScrollViewport(true, detailRef);
    const overscan = useViewportOverscan(scrollParent);

    // Use persistent tab state from store
    const tabIndicatorId = useId();
    const [activeTab, setActiveTab] = useState<'albums' | 'songs'>(() => {
        return (lastArtistDetailTab === 'albums' || lastArtistDetailTab === 'songs')
            ? lastArtistDetailTab
            : 'songs';
    });

    const handleTabChange = (tab: 'albums' | 'songs') => {
        useSelectionStore.getState().clearSelection();
        setActiveTab(tab);
        setArtistDetailTab(tab);
    };

    // 计算总时长
    const totalDuration = useMemo(() => {
        return artist.songs.reduce((acc, song) => acc + song.duration, 0);
    }, [artist.songs]);

    const formatDuration = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        if (h > 0) {
            return `${h} 小时 ${m} 分钟`;
        }
        return `${m} 分钟`;
    };

    const sortedAlbums = useMemo(() => {
        const list = albums.map((album, originalIndex) => {
            const year = album.songs.reduce((max, song) => Math.max(max, song.year ?? 0), 0);
            return { album, originalIndex, year: year > 0 ? year : null };
        });

        list.sort((a, b) => {
            if (a.year !== null && b.year !== null) {
                if (a.year !== b.year) return b.year - a.year;
                // Year matched, use original order
                return a.originalIndex - b.originalIndex;
            }
            if (a.year !== null && b.year === null) return -1;
            if (a.year === null && b.year !== null) return 1;
            return a.originalIndex - b.originalIndex;
        });

        return list.map(x => x.album);
    }, [albums]);

    const sortedSongs = useMemo(() => {
        return sortedAlbums.flatMap(album => album.songs);
    }, [sortedAlbums]);

    const isSelectionMode = useSelectionStore(state => state.isSelectionMode);
    const selectAllRequested = useSelectionStore(state => state.selectAllRequested);
    useEffect(() => {
        if (activeTab !== 'songs' || !isSelectionMode || detailRef.current?.closest('[inert]')) return;
        useSelectionStore.getState().setSelectableIds(sortedSongs.map(getMusicItemId).filter(Boolean));
    }, [activeTab, isSelectionMode, sortedSongs]);

    useEffect(() => {
        if (activeTab !== 'songs' || !isSelectionMode || !selectAllRequested || detailRef.current?.closest('[inert]')) return;
        const selection = useSelectionStore.getState();
        selection.selectAll(sortedSongs.map(song => ({ id: getMusicItemId(song), data: song })).filter(item => item.id !== ''), 'song');
        selection.setSelectAllRequested(false);
    }, [activeTab, isSelectionMode, selectAllRequested, sortedSongs]);

    const renderAlbum = useCallback((album: AlbumData, index: number) => (
        <div
            key={`${album.name}::${album.artist}`}
            className={index === sortedAlbums.length - 1 ? "" : "pb-12"}
        >
            <div
                className="flex flex-col md:flex-row gap-6 md:gap-8"
            >
                <div className="w-67.5 shrink-0 flex flex-col gap-3">
                    <div
                        className="aspect-square w-full rounded-xl shadow-lg bg-neutral-200 dark:bg-neutral-800 overflow-hidden cursor-pointer group relative"
                        onClick={() => onPlayAlbum(album)}
                    >
                        {album.songs.length > 0 ? (
                            <CoverImage
                                song={album.songs[0]}
                                className="w-full h-full object-cover"
                                iconClassName="text-6xl"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-400">
                                <MdPerson className="text-6xl" />
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <CardPlayButton
                                variant="cover"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPlayAlbum(album);
                                }}
                                className="static! inset-auto!"
                            />
                        </div>
                    </div>
                    <div className="px-1 text-center md:text-left">
                        <h3
                            className="font-bold text-neutral-900 dark:text-neutral-50 text-lg leading-tight cursor-pointer hover:text-primary transition-colors"
                            onClick={() => onOpenAlbum(album)}
                        >
                            {album.name}
                        </h3>
                        <div className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                            {album.artist}
                        </div>
                        <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5 flex gap-2">
                            <span>{album.songs[0]?.year || "Unknown Year"}</span>
                            {album.songs[0]?.genre && (
                                <>
                                    <span>•</span>
                                    <span>{album.songs[0]?.genre}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-w-0">
                    <SongListView
                        songs={album.songs}
                        onPlay={(song, _index, options) => {
                            const globalIndex = sortedSongs.findIndex(s => s.path === song.path);
                            if (globalIndex !== -1) {
                                onPlaySong(song, globalIndex, { ...options, disableShuffle: true });
                            }
                        }}
                        onDelete={onDeleteSong}
                        hideCover={true}
                        hideArtist={true}
                        hideAlbum={true}
                        disableSort={true}
                        enableDelete={true}
                        virtualize={false}
                        manageSelection={false}
                        onOpenAlbum={handleOpenAlbumByName}
                        context="artist_detail"
                    />
                </div>
            </div>
        </div>
    ), [sortedAlbums.length, sortedSongs, onPlayAlbum, onOpenAlbum, onPlaySong, onDeleteSong, handleOpenAlbumByName]);

    return (
        <div ref={detailRef} className="flex flex-col h-full relative isolate">
            <DetailScrollHeader />

            {/* Header Section */}
            <div className="flex flex-col md:flex-row gap-8 mb-8 px-6 pt-6 relative z-10">
                {/* (Back Button Removed) */}

                {/* Artist Cover */}
                <SharedCover source={transitionSource} className="w-67.5 h-67.5 rounded-full shadow-lg bg-neutral-200 dark:bg-neutral-800 overflow-hidden shrink-0 mx-auto md:mx-0 mt-8 md:mt-0">
                    {artist.songs.length > 0 ? (
                        <CoverImage
                            song={artist.songs[0]}
                            className="w-full h-full object-cover"
                            iconClassName="text-6xl"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-400">
                            <MdPerson className="text-6xl" />
                        </div>
                    )}
                </SharedCover>

                {/* Info & Actions */}
                <div className="flex flex-col justify-center gap-4 text-center md:text-left min-w-0 flex-1 pb-2">
                    <div>
                        <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-neutral-50 mb-2 wrap-break-words leading-tight">
                            {artist.name}
                        </h2>
                        <div className="text-neutral-500 dark:text-neutral-400 font-medium flex flex-wrap items-center justify-center md:justify-start gap-2">
                            <span>{artist.albumCount} 个专辑</span>
                            <span>•</span>
                            <span>{artist.count} 首歌曲</span>
                            <span>•</span>
                            <span>{formatDuration(totalDuration)}</span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-center md:justify-start gap-3 mt-2">
                        <button
                            onClick={() => {
                                if (sortedSongs.length > 0) {
                                    onPlaySong(sortedSongs[0], 0, { restartIfCurrent: true, disableShuffle: true });
                                }
                            }}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary base-theme:dark:bg-primary-container base-theme:dark:text-on-primary-container hover:bg-primary/90 base-theme:dark:hover:bg-on-primary text-on-primary shadow-xs transition-all active:scale-95"
                        >
                            <MdPlayArrow className="text-xl" />
                            <span className="font-medium">播放</span>
                        </button>
                        <button
                            onClick={onShuffle}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-full btn-blur text-primary base-theme:bg-secondary-container base-theme:text-on-secondary-container base-theme:hover:bg-secondary-container/80 transition-all active:scale-95 hover:bg-surface-container-highest"
                        >
                            <MdShuffle className="text-xl" />
                            <span className="font-medium">随机播放</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex items-center gap-8 px-4 mb-4">
                <button
                    onClick={() => handleTabChange('albums')}
                    className={clsx(
                        "pb-3 text-sm font-medium transition-all relative",
                        activeTab === 'albums'
                            ? "text-primary"
                            : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                    )}
                >
                    专辑 ({albums.length})
                    {activeTab === 'albums' && (
                        <motion.div layoutId={tabIndicatorId} className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
                    )}
                </button>
                <button
                    onClick={() => handleTabChange('songs')}
                    className={clsx(
                        "pb-3 text-sm font-medium transition-all relative",
                        activeTab === 'songs'
                            ? "text-primary"
                            : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                    )}
                >
                    歌曲 ({artist.songs.length})
                    {activeTab === 'songs' && (
                        <motion.div layoutId={tabIndicatorId} className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
                    )}
                </button>
            </div>

            {/* Content Area */}
            <div className="grid flex-1 min-h-[clamp(28rem,60vh,52rem)] px-2 pb-20">
                <AnimatePresence mode="wait" initial={false}>
                    {activeTab === 'albums' ? (
                        <motion.div
                            key="albums"
                            {...pageMotion}
                            className="col-start-1 row-start-1 w-full min-w-0"
                        >
                            <AlbumGridView
                                coverScope={`artist-albums-${getMusicItemId(artist)}`}
                                albums={sortedAlbums}
                                onPlayAlbum={onPlayAlbum}
                                onOpenAlbum={onOpenAlbum}
                                onDeleteAlbum={onDeleteAlbum}
                                hideArtist={true}
                            />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="songs"
                            {...pageMotion}
                            className="col-start-1 row-start-1 w-full min-w-0"
                        >
                            <div className="mt-4">
                                {scrollParent && <Virtuoso
                                    data={sortedAlbums}
                                    customScrollParent={scrollParent}
                                    overscan={overscan}
                                    computeItemKey={(_index, album) => `${album.name}::${album.artist}`}
                                    itemContent={(index, album) => <ArtistAlbumSection album={album} index={index} render={renderAlbum} />}
                                />}
                                <div className="h-20 w-full" />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
