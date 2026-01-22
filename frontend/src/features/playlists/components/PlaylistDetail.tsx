import { useState, useEffect, useCallback } from 'react';
import { MdPlayArrow, MdShuffle, MdEdit } from 'react-icons/md';
import { IoHeart } from 'react-icons/io5';
import clsx from 'clsx';

import SortableSongList from './SortableSongList';
import EditPlaylistDialog from './EditPlaylistDialog';
import CoverImage from '../../../components/common/CoverImage';
import PlaylistCoverCollage from '../../../components/common/PlaylistCoverCollage';

import { libraryService } from '../../../services/libraryService';
import { usePlayerStore } from '../../../store/usePlayerStore';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { audioService } from '../../../services/audioService';
import type { SongMetadata, Playlist } from '../../../types';

interface PlaylistDetailProps {
    id: number | 'favorites';
    name: string;
    onClose?: () => void;
}

export default function PlaylistDetail({ id, name: initialName }: PlaylistDetailProps) {
    const [songs, setSongs] = useState<SongMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const [playlistInfo, setPlaylistInfo] = useState<Playlist | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);

    // Store Actions
    const { setMetadata, setIsPlaying, setShuffleState } = usePlayerStore();
    const { setPlaylist, setCurrentSongIndex, addToRecent, toggleShuffleList, libraryVersion } = useLibraryStore();

    // Load Data
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Load Songs
            let list: SongMetadata[] = [];
            if (id === 'favorites') {
                list = await libraryService.getFavorites();
            } else {
                list = await libraryService.getPlaylistSongs(id);
            }
            setSongs(list);

            // 2. Load Playlist Info (for description, cover updates)
            if (id !== 'favorites') {
                const playlists = await libraryService.getPlaylists();
                const pl = playlists.find(p => p.id === id);
                if (pl) setPlaylistInfo(pl);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [id, libraryVersion]);

    useEffect(() => { loadData(); }, [loadData]);

    // Actions
    const handlePlaySong = async (song: SongMetadata, index: number) => {
        if (!song.path) return;

        await audioService.play(song.path, song);
        setMetadata(song);
        setIsPlaying(true);
        setPlaylist(songs);

        if (usePlayerStore.getState().isShuffling) {
            setCurrentSongIndex(index);
            toggleShuffleList(true);
        } else {
            setCurrentSongIndex(index);
        }

        addToRecent({
            id: song.path,
            type: 'file',
            title: song.title,
            description: song.artist,
            cover: song.cover,
            cover_path: song.cover_path,
            path: song.path,
            lastPlayed: Date.now(),
            artist: song.artist,
            isLibraryItem: true
        });
    };

    const handlePlayAll = async () => {
        if (songs.length > 0) {
            handlePlaySong(songs[0], 0);
            // Track playlist play time
            if (id !== 'favorites' && typeof id === 'number') {
                libraryService.markPlaylistAsPlayed(id).catch(console.error);
            }
        }
    };

    const handleShuffle = async () => {
        if (songs.length > 0) {
            const randomIndex = Math.floor(Math.random() * songs.length);
            const song = songs[randomIndex];

            setPlaylist(songs);
            setCurrentSongIndex(randomIndex);
            toggleShuffleList(true);
            setShuffleState(true);

            if (!song.path) return;
            await audioService.play(song.path, song);
            setMetadata(song);
            setIsPlaying(true);

            addToRecent({
                id: song.path,
                type: 'file',
                title: song.title,
                description: song.artist,
                cover: song.cover,
                path: song.path,
                lastPlayed: Date.now(),
                artist: song.artist
            });

            // Track playlist play time
            if (id !== 'favorites' && typeof id === 'number') {
                libraryService.markPlaylistAsPlayed(id).catch(console.error);
            }
        }
    };

    // Modification Actions
    const handleReorder = async (newOrder: SongMetadata[]) => {
        setSongs(newOrder); // Optimistic update
        if (id !== 'favorites') {
            const songIds = newOrder.map(s => s.id!);
            await libraryService.reorderPlaylistSongs(id as number, songIds);
        }
    };

    const handleRemove = async (song: SongMetadata) => {
        if (id === 'favorites') {
            await libraryService.toggleFavorite(song.id!);
            loadData();
        } else {
            await libraryService.removeFromPlaylist(id as number, song.id!);
            setSongs(prev => prev.filter(s => s.id !== song.id));
        }
    };

    const handleUpdateInfo = async (name: string, description: string | undefined, coverPath: string | undefined) => {
        if (id !== 'favorites') {
            await libraryService.updatePlaylistInfo(id as number, name, description);

            if (coverPath !== playlistInfo?.cover_path) {
                await libraryService.updatePlaylistCover(id as number, coverPath || "");
            }
            loadData();
        }
    };

    // Derived State
    const totalDuration = songs.reduce((acc, curr) => acc + curr.duration, 0);
    const formatTotalDuration = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        if (h > 0) return `${h} 小时 ${m} 分钟`;
        return `${m} 分钟`;
    };

    const isFavorites = id === 'favorites';
    const displayName = isFavorites ? '喜爱歌曲' : (playlistInfo?.name || initialName);
    const displayDesc = isFavorites ? undefined : playlistInfo?.description;
    const coverPath = isFavorites ? undefined : playlistInfo?.cover_path;

    return (
        <div className="w-full min-h-full pb-8">
            <EditPlaylistDialog
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                onConfirm={handleUpdateInfo}
                initialName={displayName}
                initialDescription={displayDesc || ''}
                initialCover={coverPath || undefined}
            />

            {/* Header Section */}
            <div className="relative w-full overflow-hidden bg-surface-container-low dark:bg-black/20">
                {/* Blurred Background */}
                <div className="absolute inset-0 opacity-30 pointer-events-none overflow-hidden">
                    {coverPath ? (
                        <CoverImage src={coverPath} className="w-full h-full object-cover blur-3xl scale-125" />
                    ) : (
                        <div className="absolute inset-0 w-full h-full">
                            {/* Use collage as blur background if available, or gradient */}
                            {songs.length > 0 && !isFavorites ? (
                                <PlaylistCoverCollage songs={songs} className="w-full h-full blur-3xl scale-125 opacity-70" />
                            ) : (
                                <div className={clsx(
                                    "w-full h-full bg-gradient-to-br opacity-50",
                                    isFavorites ? "from-red-500/50 to-pink-600/50" : "from-primary/20 to-secondary/20"
                                )} />
                            )}
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent dark:from-[#121212] dark:to-transparent" />
                </div>

                <div className="relative z-10 p-8 pt-12 flex flex-col md:flex-row gap-8 items-center md:items-end">
                    {/* Cover Art */}
                    <div className="shrink-0 group relative">
                        <div className={clsx(
                            "w-48 h-48 md:w-56 md:h-56 rounded-xl shadow-2xl flex items-center justify-center overflow-hidden",
                            isFavorites ? "bg-gradient-to-br from-red-500 to-pink-600" : "bg-neutral-200 dark:bg-neutral-800"
                        )}>
                            {isFavorites ? (
                                <IoHeart className="text-8xl text-white drop-shadow-md" />
                            ) : coverPath ? (
                                <CoverImage src={coverPath} className="w-full h-full object-cover" />
                            ) : (
                                <PlaylistCoverCollage
                                    songs={songs}
                                    className="w-full h-full"
                                />
                            )}
                        </div>

                        {/* Edit Button Overlay */}
                        {!isFavorites && (
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                                <button
                                    onClick={() => setIsEditOpen(true)}
                                    className="p-3 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-all transform hover:scale-105"
                                    title="编辑信息"
                                >
                                    <MdEdit className="text-2xl" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 flex flex-col gap-2 text-center md:text-left items-center md:items-start">
                        <h1 className="text-3xl md:text-5xl font-bold text-on-surface text-balance">
                            {displayName}
                        </h1>

                        {displayDesc && (
                            <p className="text-on-surface-variant/80 max-w-lg line-clamp-2">
                                {displayDesc}
                            </p>
                        )}

                        <div className="flex items-center gap-2 text-sm text-on-surface-variant font-medium mt-1">
                            <span>{songs.length} 首歌曲</span>
                            <span>•</span>
                            <span>{formatTotalDuration(totalDuration)}</span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 mt-4">
                            <button
                                onClick={handlePlayAll}
                                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary rounded-full hover:bg-primary/90 transition-all font-medium shadow-lg hover:shadow-xl active:scale-95"
                            >
                                <MdPlayArrow className="text-2xl" />
                                播放
                            </button>
                            <button
                                onClick={handleShuffle}
                                className="flex items-center gap-2 btn-blur text-primary px-6 py-2.5 rounded-full font-medium transition-all hover:bg-surface-container-highest"
                            >
                                <MdShuffle className="text-xl" />
                                随机播放
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* List */}
            {loading ? (
                <div className="flex h-64 items-center justify-center text-neutral-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-500"></div>
                </div>
            ) : (
                <div className="px-2 pb-16">
                    <SortableSongList
                        songs={songs}
                        onPlay={handlePlaySong}
                        onRemoveFromPlaylist={handleRemove}
                        onReorder={handleReorder}
                        disableReorder={id === 'favorites'}
                    />
                </div>
            )}
        </div>
    );
}
