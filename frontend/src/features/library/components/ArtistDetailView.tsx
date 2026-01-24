import { useState, useMemo } from 'react';
import { MdPlayArrow, MdShuffle } from 'react-icons/md';
import { IoPerson } from 'react-icons/io5';
import CardPlayButton from '../../../components/common/CardPlayButton';
import CoverImage from '../../../components/common/CoverImage';
import clsx from 'clsx';
import type { ArtistData } from './ArtistGridView';
import type { AlbumData } from './AlbumGridView';
import SongListView from './SongListView';
import AlbumGridView from './AlbumGridView';
import type { SongMetadata } from '../../../types';
import { useSelectionStore } from '../../../store/useSelectionStore';

interface ArtistDetailViewProps {
    artist: ArtistData;
    albums: AlbumData[];
    allArtistSongs: SongMetadata[]; // 该艺人的所有歌曲（用于队列视图）
    onPlayAll: () => void;
    onShuffle: () => void;
    onPlayAlbum: (album: AlbumData) => void;
    onOpenAlbum: (album: AlbumData) => void;
    onPlaySong: (song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean }) => void;
    onDeleteSong?: (song: SongMetadata) => void;
    onDeleteAlbum?: (album: AlbumData) => void;
    onOpenArtistByName?: (name: string) => void;
    onOpenAlbumByName?: (name: string) => void;
}

export default function ArtistDetailView({
    artist,
    albums,
    allArtistSongs,
    onPlayAll,
    onShuffle,
    onPlayAlbum,
    onOpenAlbum,
    onPlaySong,
    onDeleteSong,
    onDeleteAlbum,
    onOpenAlbumByName
}: ArtistDetailViewProps) {
    // Helper to robustly handle album opening by name
    const handleOpenAlbumByName = (name: string) => {
        if (onOpenAlbumByName) {
            onOpenAlbumByName(name);
            return;
        }
        // Fallback: search in local albums list
        const found = albums.find(a => a.name === name);
        if (found) {
            onOpenAlbum(found);
        }
    };

    // 默认显示用户上次选择的视图，如果没有则默认为 'songs'
    const [activeTab, setActiveTab] = useState<'albums' | 'songs'>(() => {
        try {
            const saved = localStorage.getItem('artist_detail_active_tab');
            return (saved === 'albums' || saved === 'songs') ? saved : 'songs';
        } catch {
            return 'songs';
        }
    });

    const handleTabChange = (tab: 'albums' | 'songs') => {
        useSelectionStore.getState().clearSelection();
        setActiveTab(tab);
        try {
            localStorage.setItem('artist_detail_active_tab', tab);
        } catch { }
    };

    // 计算总时长
    const totalDuration = useMemo(() => {
        return allArtistSongs.reduce((acc, song) => acc + song.duration, 0);
    }, [allArtistSongs]);

    const formatDuration = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        if (h > 0) {
            return `${h} 小时 ${m} 分钟`;
        }
        return `${m} 分钟`;
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row gap-6 md:items-end mb-8 pt-6 px-6 relative">
                {/* (Back Button Removed) */}

                {/* Artist Cover */}
                <div className="w-40 h-40 md:w-48 md:h-48 rounded-full shadow-lg bg-neutral-200 dark:bg-neutral-800 overflow-hidden shrink-0 mx-auto md:mx-0 mt-8 md:mt-0">
                    {artist.songs.length > 0 ? (
                        <CoverImage
                            song={artist.songs[0]}
                            className="w-full h-full object-cover"
                            iconClassName="text-6xl"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-400">
                            <IoPerson className="text-6xl" />
                        </div>
                    )}
                </div>

                {/* Info & Actions */}
                <div className="flex flex-col gap-4 text-center md:text-left flex-1">
                    <div>
                        <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">
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
                    <div className="flex items-center justify-center md:justify-start gap-3">
                        <button
                            onClick={onPlayAll}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary hover:bg-primary/90 text-on-primary shadow-md transition-all active:scale-95"
                        >
                            <MdPlayArrow className="text-xl" />
                            <span className="font-medium">播放</span>
                        </button>
                        <button
                            onClick={onShuffle}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-full btn-blur text-primary transition-all active:scale-95 hover:bg-surface-container-highest"
                        >
                            <MdShuffle className="text-xl" />
                            <span className="font-medium">随机播放</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex items-center gap-8 px-4 border-b border-neutral-200 dark:border-neutral-800 mb-4">
                <button
                    onClick={() => handleTabChange('albums')}
                    className={clsx(
                        "pb-3 text-sm font-medium transition-all relative",
                        activeTab === 'albums'
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                    )}
                >
                    专辑 ({albums.length})
                    {activeTab === 'albums' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />
                    )}
                </button>
                <button
                    onClick={() => handleTabChange('songs')}
                    className={clsx(
                        "pb-3 text-sm font-medium transition-all relative",
                        activeTab === 'songs'
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                    )}
                >
                    歌曲 ({artist.songs.length})
                    {activeTab === 'songs' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />
                    )}
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 px-2 pb-8">
                {activeTab === 'albums' ? (
                    <AlbumGridView
                        albums={albums}
                        onPlayAlbum={onPlayAlbum}
                        onOpenAlbum={onOpenAlbum}
                        onDeleteAlbum={onDeleteAlbum}
                        hideArtist={true} // In Artist View, hide Artist info/options
                    />
                ) : (
                    // Modified Songs View (Grouped by Album, mimicking Apple Music)
                    <div className="flex flex-col gap-12 mt-4">
                        {albums.map(album => (
                            <div key={album.name} className="flex flex-col md:flex-row gap-6 md:gap-8 animate-in fade-in duration-500">
                                {/* Left: Album Info */}
                                <div className="w-40 md:w-48 shrink-0 flex flex-col gap-3">
                                    <div
                                        className="aspect-square w-full rounded-xl shadow-lg bg-neutral-200 dark:bg-neutral-800 overflow-hidden cursor-pointer group relative"
                                        onClick={() => onPlayAlbum(album)}
                                    >
                                        {album.songs.length > 0 ? (
                                            <CoverImage
                                                song={album.songs[0]}
                                                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                                                iconClassName="text-6xl"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-neutral-400">
                                                <IoPerson className="text-6xl" />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <CardPlayButton
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onPlayAlbum(album);
                                                }}
                                                className="!static !inset-auto !translate-x-0 scale-125 hover:!scale-[1.35] active:!scale-110"
                                            />
                                        </div>
                                    </div>
                                    <div className="px-1 text-center md:text-left">
                                        <h3
                                            className="font-bold text-neutral-900 dark:text-neutral-50 text-lg leading-tight cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                            onClick={() => onOpenAlbum(album)}
                                        >
                                            {album.name}
                                        </h3>
                                        <div className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                                            {/* Artist Name */}
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

                                {/* Right: Song List */}
                                <div className="flex-1 min-w-0 bg-neutral-50/50 dark:bg-white/5 rounded-2xl p-2 md:p-4">
                                    <SongListView
                                        songs={album.songs}
                                        onPlay={(song, _index, options) => {
                                            // We need to play from the context of "All Artist Songs" because the parent
                                            // handler expects an index into `artist.songs`.
                                            // Find the index of this song in the full artist list
                                            const globalIndex = allArtistSongs.findIndex(s => s.path === song.path);
                                            if (globalIndex !== -1) {
                                                onPlaySong(song, globalIndex, options);
                                            }
                                        }}
                                        onDelete={onDeleteSong}
                                        hideCover={true}
                                        hideArtist={true}
                                        hideAlbum={true}
                                        disableSort={true}
                                        enableDelete={true}
                                        onOpenAlbum={handleOpenAlbumByName}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
