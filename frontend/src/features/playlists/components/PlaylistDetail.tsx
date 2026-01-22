import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MdPlayArrow, MdShuffle, MdEdit, MdSort, MdCheck, MdSearch, MdClose } from 'react-icons/md';
import { IoHeart } from 'react-icons/io5';
import clsx from 'clsx';


import SortableSongList from './SortableSongList';
import type { SortKey, SortOrder } from './SortableSongList';
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
    const initialLoadRef = useRef(true);

    // Sort State - Load initial state from store if available, else default
    const { getPlaylistSettings, setPlaylistSettings } = useLibraryStore();
    const savedSettings = getPlaylistSettings(id.toString());

    const [sortKey, setLocalSortKey] = useState<SortKey>(savedSettings.sortKey);
    const [sortOrder, setLocalSortOrder] = useState<SortOrder>(savedSettings.sortOrder);
    const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

    // Sync state changes to store
    const updateSortKey = (key: SortKey) => {
        setLocalSortKey(key);
        setPlaylistSettings(id.toString(), { sortKey: key, sortOrder });
    };

    const updateSortOrder = (order: SortOrder) => {
        setLocalSortOrder(order);
        setPlaylistSettings(id.toString(), { sortKey, sortOrder: order });
    };

    // Reload settings and reset state when ID changes
    useEffect(() => {
        const settings = getPlaylistSettings(id.toString());
        setLocalSortKey(settings.sortKey);
        setLocalSortOrder(settings.sortOrder);

        // When switching playlists, we want a clean slate and a fresh loader
        setSongs([]);
        initialLoadRef.current = true;
    }, [id, getPlaylistSettings]);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    // Store Actions
    // Store Actions
    const { setMetadata, setIsPlaying, setShuffleState } = usePlayerStore();
    const { setPlaylist, setCurrentSongIndex, addToRecent, toggleShuffleList, libraryVersion } = useLibraryStore();

    // Scroll Detection for Sticky Header
    const [isScrolled, setIsScrolled] = useState(false);
    const topSentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsScrolled(!entry.isIntersecting);
            },
            { threshold: [0] }
        );

        if (topSentinelRef.current) {
            observer.observe(topSentinelRef.current);
        }

        return () => observer.disconnect();
    }, []);

    // Load Data

    // Load Data
    const loadData = useCallback(async () => {
        if (initialLoadRef.current) {
            setLoading(true);
        }
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
            initialLoadRef.current = false;
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

    const handleToggleFavorite = async (song: SongMetadata) => {
        if (!song.id) return;

        // 1. Optimistic Update (Immediate Feedback)
        setSongs(prev => prev.map(s =>
            s.id === song.id ? { ...s, is_favorite: !s.is_favorite } : s
        ));

        try {
            // 2. API Call (Silent)
            await libraryService.toggleFavorite(song.id);
            // We consciously DO NOT call triggeringLibraryUpdate() or loadData() here 
            // to avoid full re-render flickering.

            // If we are in 'favorites' playlist and un-favoriting, we might want to remove it visually
            // but usually it's better to let it stay until refresh or navigate away, 
            // or we could remove it locally if that's the desired UX.
            if (id === 'favorites') {
                // If the user wants realtime removal for Favorites list:
                setSongs(prev => prev.filter(s => s.id !== song.id));
            }

        } catch (e) {
            console.error(e);
            // Revert on error
            setSongs(prev => prev.map(s =>
                s.id === song.id ? { ...s, is_favorite: !s.is_favorite } : s
            ));
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

    // Sort & Filter Songs
    const sortedSongs = useMemo(() => {
        if (sortKey === 'manual') {
            return sortOrder === 'asc' ? songs : [...songs].reverse();
        }

        return [...songs].sort((a, b) => {
            let key = sortKey as keyof SongMetadata;
            let valA = a[key];
            let valB = b[key];

            // Handle Duration separately
            if (sortKey === 'duration') {
                const numA = typeof valA === 'number' ? valA : 0;
                const numB = typeof valB === 'number' ? valB : 0;
                return sortOrder === 'asc' ? numA - numB : numB - numA;
            }

            if (valA === undefined || valA === null) valA = '';
            if (valB === undefined || valB === null) valB = '';

            if (typeof valA === 'string' && typeof valB === 'string') {
                const isAsciiA = /^[\x00-\x7F]/.test(valA);
                const isAsciiB = /^[\x00-\x7F]/.test(valB);

                if (isAsciiA && !isAsciiB) return sortOrder === 'asc' ? -1 : 1;
                if (!isAsciiA && isAsciiB) return sortOrder === 'asc' ? 1 : -1;

                return sortOrder === 'asc'
                    ? valA.localeCompare(valB, 'zh-CN', { numeric: true, sensitivity: 'base' })
                    : valB.localeCompare(valA, 'zh-CN', { numeric: true, sensitivity: 'base' });
            }

            // Default fallback
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [songs, sortKey, sortOrder]);

    const filteredSongs = useMemo(() => {
        if (!searchQuery) return sortedSongs;
        const query = searchQuery.toLowerCase();
        return sortedSongs.filter((s: SongMetadata) =>
            (s.title && s.title.toLowerCase().includes(query)) ||
            (s.artist && s.artist.toLowerCase().includes(query)) ||
            (s.album && s.album.toLowerCase().includes(query))
        );
    }, [sortedSongs, searchQuery]);

    const isFavorites = id === 'favorites';
    const displayName = isFavorites ? '喜爱歌曲' : (playlistInfo?.name || initialName);
    const displayDesc = isFavorites ? undefined : playlistInfo?.description;
    const coverPath = isFavorites ? undefined : playlistInfo?.cover_path;

    return (
        <div className="w-full min-h-full relative isolate">
            <div ref={topSentinelRef} className="absolute top-0 h-1 w-full pointer-events-none z-0" />

            {/* Sticky Header Guard (Blurs content that scrolls under TitleBar) */}
            <div className={clsx(
                "sticky top-0 left-0 right-0 h-10 z-[60] transition-all duration-300 border-b",
                isScrolled
                    ? "bg-surface/60 dark:bg-black/40 backdrop-blur-xl border-outline-variant/10 opacity-100 pointer-events-auto"
                    : "bg-transparent border-transparent opacity-0 pointer-events-none"
            )} data-tauri-drag-region />

            <EditPlaylistDialog
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                onConfirm={handleUpdateInfo}
                initialName={displayName}
                initialDescription={displayDesc || ''}
                initialCover={coverPath || undefined}
            />

            {/* Immersive Background */}
            <div className="fixed inset-0 z-0 select-none pointer-events-none overflow-hidden bg-neutral-100 dark:bg-surface-container-low">
                {coverPath ? (
                    <CoverImage src={coverPath} className="w-full h-full object-cover blur-[100px] opacity-40 dark:opacity-20 scale-110" />
                ) : (
                    sortedSongs.length > 0 && !isFavorites ? (
                        <PlaylistCoverCollage songs={sortedSongs} className="w-full h-full object-cover blur-[100px] opacity-40 dark:opacity-20 scale-110" />
                    ) : (
                        <div className={clsx(
                            "w-full h-full bg-gradient-to-br opacity-30",
                            isFavorites ? "from-red-500 to-pink-600" : "from-primary/20 to-secondary/20"
                        )} />
                    )
                )}
                {/* Gradient Scrim for Readability - Optimized gradient for smoother transition */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-surface/50 to-surface dark:via-surface-container/60 dark:to-surface-container" />
            </div>

            {/* Header Section */}
            <div className="relative w-full z-20 -mt-10">

                {/* Top Right Controls (Search & Sort) */}
                <div className="absolute top-16 right-6 z-50 flex items-center gap-1">
                    {/* Search Input/Button */}
                    <div className={clsx(
                        "flex items-center transition-all duration-300 overflow-hidden rounded-full",
                        isSearchOpen ? "w-64 bg-surface-container-highest/50 backdrop-blur-md border border-outline-variant/20 mr-2" : "w-10"
                    )}>
                        {isSearchOpen ? (
                            <div className="flex items-center w-full px-3 py-1.5">
                                <MdSearch className="text-xl text-on-surface-variant shrink-0" />
                                <input
                                    autoFocus
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="搜索歌单内..."
                                    className="w-full bg-transparent border-none focus:outline-none text-sm text-on-surface ml-2 placeholder:text-on-surface-variant/50"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                            setSearchQuery('');
                                            setIsSearchOpen(false);
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setIsSearchOpen(false);
                                    }}
                                    className="p-1 hover:bg-on-surface/10 rounded-full text-on-surface-variant transition-colors"
                                >
                                    <MdClose />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsSearchOpen(true)}
                                className="w-10 h-10 flex items-center justify-center rounded-full btn-blur text-on-surface-variant hover:bg-surface-container-highest transition-colors"
                                title="搜索列表"
                            >
                                <MdSearch className="text-xl" />
                            </button>
                        )}
                    </div>

                    {/* Sort Button */}
                    <div className="relative">
                        <button
                            onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                            className={clsx(
                                "w-10 h-10 flex items-center justify-center rounded-full transition-colors",
                                isSortMenuOpen ? "bg-primary text-on-primary shadow-lg" : "btn-blur text-on-surface-variant hover:bg-surface-container-highest"
                            )}
                            title="排序方式"
                        >
                            <MdSort className="text-xl" />
                        </button>

                        {isSortMenuOpen && (
                            <>
                                {/* Backdrop to close menu */}
                                <div
                                    className="fixed inset-0 z-50"
                                    onClick={() => setIsSortMenuOpen(false)}
                                />
                                <div className="absolute right-0 mt-2 w-56 bg-surface-container-high border border-outline-variant/20 rounded-xl shadow-2xl py-2 z-[70] backdrop-blur-3xl animate-in fade-in zoom-in duration-200 origin-top-right">
                                    <div className="px-3 py-1.5 text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-wider">排序依据</div>
                                    {[
                                        { label: '播放列表顺序', key: 'manual' as SortKey },
                                        { label: '标题', key: 'title' as SortKey },
                                        { label: '专辑', key: 'album' as SortKey },
                                        { label: '艺人', key: 'artist' as SortKey },
                                        { label: '时长', key: 'duration' as SortKey },
                                    ].map((item) => (
                                        <button
                                            key={item.key}
                                            onClick={() => {
                                                updateSortKey(item.key);
                                                setIsSortMenuOpen(false);
                                            }}
                                            className="w-full flex items-center justify-between px-4 py-2 text-sm text-on-surface hover:bg-primary/10 transition-colors"
                                        >
                                            {item.label}
                                            {sortKey === item.key && <MdCheck className="text-primary text-lg" />}
                                        </button>
                                    ))}

                                    <div className="my-1.5 border-t-2 border-outline-variant/30" />

                                    {[
                                        { label: '升序', order: 'asc' as SortOrder },
                                        { label: '降序', order: 'desc' as SortOrder },
                                    ].map((item) => (
                                        <button
                                            key={item.order}
                                            onClick={() => {
                                                updateSortOrder(item.order);
                                                setIsSortMenuOpen(false);
                                            }}
                                            className="w-full flex items-center justify-between px-4 py-2 text-sm text-on-surface hover:bg-primary/10 transition-colors"
                                        >
                                            {item.label}
                                            {sortOrder === item.order && <MdCheck className="text-primary text-lg" />}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="relative z-10 p-8 pt-10 flex flex-col md:flex-row gap-8 items-center md:items-end">
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
                                    songs={sortedSongs}
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
                            <span>{filteredSongs.length} 首歌曲</span>
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
                <div className="px-2 pb-16 relative z-10">
                    <SortableSongList
                        songs={filteredSongs}
                        onPlay={handlePlaySong}
                        onRemoveFromPlaylist={handleRemove}
                        onReorder={handleReorder}
                        onToggleFavorite={handleToggleFavorite}
                        disableReorder={id === 'favorites' || !!searchQuery}
                        sortKey={sortKey}
                        sortOrder={sortOrder}
                    />
                </div>
            )}
        </div>
    );
}
