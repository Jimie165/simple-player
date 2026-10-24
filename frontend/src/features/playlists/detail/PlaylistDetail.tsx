import SharedCover from '@/components/common/SharedCover';
import type { CoverTransitionSource } from '@/utils/viewTransition';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useIsPresent } from 'framer-motion';
import { MdPlayArrow, MdShuffle, MdEdit } from 'react-icons/md';
import favoritesCover from '@/assets/favorites-cover.svg';
import clsx from 'clsx';
import CustomTooltip from '@/components/common/CustomTooltip';
import DetailScrollHeader from '@/components/common/DetailScrollHeader';
import { ContentBackground } from '@/components/layout/ContentSurface';
import { useThemeStore } from '@/store/useThemeStore';
import { useContentArtworkTheme } from '@/hooks/useContentArtworkTheme';
import { useNavigationStore } from '@/store/useNavigationStore';


import SortableSongList from '@/features/playlists/songlist/SortableSongList';
import type { SortKey, SortOrder } from '@/utils/songSort';
import { sortSongs } from '@/utils/songSort';
import EditPlaylistDialog from '@/features/playlists/dialogs/EditPlaylistDialog';
import CoverImage from '@/components/common/CoverImage';
import PlaylistCoverCollage from '@/components/common/PlaylistCoverCollage';
import PlaylistSearchControl from '@/features/playlists/detail/PlaylistSearchControl';
import PlaylistSortControl from '@/features/playlists/detail/PlaylistSortControl';
import { runPlaylistDataRefresh } from '@/features/playlists/playlistDataRefresh';

import { libraryService } from '@/services/libraryService';
import { useLibraryStore } from '@/store/useLibraryStore';
import type { RecentItem, SongMetadata, Playlist } from '@/types';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';

interface PlaylistDetailProps {
    id: number | 'favorites';
    name: string;
    isVisible: boolean;
    onClose?: () => void;
    transitionSource?: CoverTransitionSource;
}

export default function PlaylistDetail({ id, name: initialName, transitionSource, isVisible }: PlaylistDetailProps) {
    const isPresent = useIsPresent();
    const entered = useNavigationStore(state => state.playlistDetailEntered);
    const [songs, setSongs] = useState<SongMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const [playlistInfo, setPlaylistInfo] = useState<Playlist | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [dataRefreshVersion, setDataRefreshVersion] = useState(0);
    const initialLoadRef = useRef(true);

    // Sort State - Load initial state from store if available, else default
    const getPlaylistSettings = useLibraryStore(state => state.getPlaylistSettings);
    const setPlaylistSettings = useLibraryStore(state => state.setPlaylistSettings);
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
    // 当用户通过点击 × 关闭搜索时，短暂抑制 Tooltip 显示，直到鼠标移出搜索按钮区域
    const [suppressTooltip, setSuppressTooltip] = useState(false);
    const [suppressSortTooltip, setSuppressSortTooltip] = useState(false);

    // Store Actions
    // Store Actions
    const triggerLibraryUpdate = useLibraryStore(state => state.triggerLibraryUpdate);
    const triggerPlaylistUpdate = useLibraryStore(state => state.triggerPlaylistUpdate);
    const favoriteSet = useLibraryStore(state => state.favoriteSet);
    const favoritesLoaded = useLibraryStore(state => isVisible && state.favoritesLoaded);
    const updateRecentItemCover = useLibraryStore(state => state.updateRecentItemCover);
    const playlistVersion = useLibraryStore(state => isVisible ? state.playlistVersion : 0);
    const favoritesLibraryVersion = useLibraryStore(state => isVisible && id === 'favorites' ? state.libraryVersion : 0);
    const loadedDataVersionRef = useRef<string | null>(null);
    const { playSong, playList, shufflePlay } = usePlaybackActions();

    // Scroll Detection for Sticky Header (reusable)


    // Load Data

    // Load Data
    const loadData = useCallback(async (isCurrent: () => boolean) => {
        if (initialLoadRef.current) {
            setLoading(true);
        }
        try {
            // 1. Load Songs
            let list: SongMetadata[] = [];
            if (id === 'favorites') {
                list = await libraryService.getFavorites(sortKey === 'manual' ? (sortOrder as 'asc' | 'desc') : 'asc');
            } else {
                list = await libraryService.getPlaylistSongs(id);
            }
            if (!isCurrent()) return false;
            setSongs(list);

            // 2. Load Playlist Info (for description, cover updates)
            if (id !== 'favorites') {
                const playlists = await libraryService.getPlaylists();
                if (!isCurrent()) return false;
                const pl = playlists.find(p => p.id === id);
                if (pl) setPlaylistInfo(pl);
            }
            return true;
        } catch (error) {
            console.error(error);
            return false;
        } finally {
            if (isCurrent()) {
                setLoading(false);
                initialLoadRef.current = false;
            }
        }
    }, [id, sortKey, sortOrder]);

    const dataVersion = `${id}:${sortKey}:${sortOrder}:${playlistVersion}:${id === 'favorites' ? favoritesLibraryVersion : ''}:${dataRefreshVersion}`;
    useEffect(() => {
        let cancelled = false;
        void runPlaylistDataRefresh({
            isVisible,
            loadedVersion: loadedDataVersionRef.current,
            currentVersion: dataVersion,
            isCurrent: () => !cancelled,
            load: () => loadData(() => !cancelled),
        }).then(result => {
            if (result?.data) loadedDataVersionRef.current = result.version;
        });
        return () => { cancelled = true; };
    }, [dataVersion, isVisible, loadData]);

    // Actions
    const buildRecentForSong = (song: SongMetadata): RecentItem => ({
        id: song.path || '',
        type: 'file',
        title: song.title,
        description: song.artist,
        cover: null,
        cover_path: song.cover_path || null,
        path: song.path || '',
        lastPlayed: Date.now(),
        artist: song.artist,
        album: song.album,
        isLibraryItem: true
    });

    const handlePlaySong = async (song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean }) => {
        await playSong({
            song,
            index,
            playlist: songs,
            options: {
                ...options,
                buildRecentItem: buildRecentForSong
            },
            context: {
                type: 'playlist_detail',
                name: displayName,
                id: id.toString()
            }
        });
    };

    const handlePlayAll = async () => {
        if (songs.length > 0) {
            await playList({
                songs,
                startIndex: 0,
                options: {
                    restartIfCurrent: true,
                    buildRecentItem: buildRecentForSong
                },
                context: {
                    type: 'playlist_detail',
                    name: displayName,
                    id: id.toString()
                }
            });
            // Track playlist play time
            if (id !== 'favorites' && typeof id === 'number') {
                void libraryService.markPlaylistAsPlayed(id).then(triggerPlaylistUpdate).catch(console.error);
            }
        }
    };

    const handleShuffle = async () => {
        if (songs.length > 0) {
            await shufflePlay({
                songs,
                options: {
                    buildRecentItem: buildRecentForSong
                },
                context: {
                    type: 'playlist_detail',
                    name: displayName,
                    id: id.toString()
                }
            });

            // Track playlist play time
            if (id !== 'favorites' && typeof id === 'number') {
                void libraryService.markPlaylistAsPlayed(id).then(triggerPlaylistUpdate).catch(console.error);
            }
        }
    };

    // Modification Actions
    // Modification Actions
    const handleReorder = async (newOrder: SongMetadata[]) => {
        setSongs(newOrder); // Optimistic update
        if (id !== 'favorites') {
            const songIds = newOrder.map(s => s.id!);
            await libraryService.reorderPlaylistSongs(id as number, songIds);
            triggerLibraryUpdate();
            triggerPlaylistUpdate();
        }
    };



    const handleUpdateInfo = async (name: string, description: string | undefined, coverPath: string | undefined) => {
        if (id !== 'favorites') {
            await libraryService.updatePlaylistInfo(id as number, name, description);

            if (coverPath !== playlistInfo?.cover_path) {
                await libraryService.updatePlaylistCover(id as number, coverPath || "");
                updateRecentItemCover(`playlist:${id}`, coverPath || null);
            }
            triggerLibraryUpdate();
            setDataRefreshVersion(version => version + 1);
        }
    };

    const totalDuration = songs.reduce((acc, curr) => acc + curr.duration, 0);
    const formatTotalDuration = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        if (h > 0) return `${h} 小时 ${m} 分钟`;
        return `${m} 分钟`;
    };

    const isFavorites = id === 'favorites';

    // Sort & Filter Songs
    const sortedSongs = useMemo(() => {
        let listToProcess = songs;

        if (isFavorites) {
            // 收藏缓存未就绪时，先信任后端返回的 is_favorite，避免页面被空集合误过滤
            if (favoritesLoaded) {
                listToProcess = listToProcess.filter(s => s.id && favoriteSet.has(s.id));
            } else {
                listToProcess = listToProcess.filter(s => s.is_favorite !== false);
            }

            // 对于喜爱歌曲的"播放列表顺序"，后端已经返回了正确的顺序，不需要前端再排序
            if (sortKey === 'manual') {
                return listToProcess;
            }
        }
        return sortSongs(listToProcess, sortKey, sortOrder);
    }, [songs, sortKey, sortOrder, isFavorites, favoriteSet, favoritesLoaded]);


    const filteredSongs = useMemo(() => {
        if (!searchQuery) return sortedSongs;
        const query = searchQuery.toLowerCase();
        return sortedSongs.filter((s: SongMetadata) =>
            (s.title && s.title.toLowerCase().includes(query)) ||
            (s.artist && s.artist.toLowerCase().includes(query)) ||
            (s.album && s.album.toLowerCase().includes(query))
        );
    }, [sortedSongs, searchQuery]);

    const displayName = isFavorites ? '喜爱歌曲' : (playlistInfo?.name || initialName);
    const displayDesc = isFavorites ? undefined : playlistInfo?.description;
    const artworkBackgroundEnabled = useThemeStore(state => state.artworkBackgroundEnabled);
    const coverPath = isFavorites ? undefined : playlistInfo?.cover_path;
    const isActive = useNavigationStore(state => !state.hasOverlay
        && state.currentPage === 'playlists' && state.activePlaylistDetail?.id === id);
    useContentArtworkTheme(sortedSongs[0]?.cover_path, isActive);

    return (
        <div className="w-full min-h-full relative isolate">
            <DetailScrollHeader />

            <EditPlaylistDialog
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                onConfirm={handleUpdateInfo}
                initialName={displayName}
                initialDescription={displayDesc || ''}
                initialCover={coverPath || undefined}
            />

            {!artworkBackgroundEnabled && (
            <ContentBackground>
                <div className="absolute inset-0 z-0 select-none pointer-events-none overflow-hidden bg-neutral-100 dark:bg-surface-container-low">
                    {coverPath ? (
                        <CoverImage src={coverPath} className="w-full h-full object-cover blur-[100px] opacity-40 dark:opacity-20 scale-110" />
                    ) : (
                        sortedSongs.length > 0 && !isFavorites ? (
                            <PlaylistCoverCollage songs={sortedSongs} className="w-full h-full object-cover blur-[100px] opacity-40 dark:opacity-20 scale-110" />
                        ) : (
                            <div className={clsx(
                                "w-full h-full bg-linear-to-br opacity-30",
                                isFavorites ? "from-red-500 to-pink-600" : "from-primary/20 to-secondary/20"
                            )} />
                        )
                    )}
                    {/* Gradient Scrim for Readability - Optimized gradient for smoother transition */}
                    <div className="absolute inset-0 bg-linear-to-b from-transparent via-surface/50 to-surface dark:via-surface-container/60 dark:to-surface-container" />
                </div>
            </ContentBackground>
            )}

            {/* Header Section */}
            <div className="relative w-full z-20 -mt-10">

                <div className="absolute top-12 right-6 z-50 flex items-center gap-1">
                    <PlaylistSearchControl
                        isSearchOpen={isSearchOpen}
                        setIsSearchOpen={setIsSearchOpen}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        suppressTooltip={suppressTooltip}
                        setSuppressTooltip={setSuppressTooltip}
                    />

                    <PlaylistSortControl
                        isSortMenuOpen={isSortMenuOpen}
                        setIsSortMenuOpen={setIsSortMenuOpen}
                        suppressSortTooltip={suppressSortTooltip}
                        setSuppressSortTooltip={setSuppressSortTooltip}
                        sortKey={sortKey}
                        sortOrder={sortOrder}
                        updateSortKey={updateSortKey}
                        updateSortOrder={updateSortOrder}
                    />
                </div>

                <div className="relative z-10 p-8 pt-28 md:pt-10 flex flex-col md:flex-row gap-8 items-center md:items-end">
                    {/* Cover Art */}
                    <div className="shrink-0 group relative">
                        <SharedCover source={transitionSource} className={clsx(
                            "w-[270px] h-[270px] rounded-xl shadow-2xl flex items-center justify-center overflow-hidden",
                            isFavorites ? "bg-linear-to-br from-red-500 to-pink-600" : "bg-neutral-200 dark:bg-neutral-800"
                        )}>
                            {isFavorites ? (
                                <img src={favoritesCover} alt="" loading="eager" decoding="sync" className="w-full h-full object-cover" />
                            ) : loading ? null : coverPath ? (
                                <CoverImage src={coverPath} className="w-full h-full object-cover" />
                            ) : (
                                <PlaylistCoverCollage
                                    songs={sortedSongs}
                                    className="w-full h-full"
                                />
                            )}
                        </SharedCover>

                        {/* Edit Button Overlay */}
                        {!isFavorites && entered && isPresent && isActive && (
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                                <CustomTooltip text="编辑信息" placement="top">
                                    <button
                                        onClick={() => setIsEditOpen(true)}
                                        className="p-3 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-all transform hover:scale-105"
                                    >
                                        <MdEdit className="text-2xl" />
                                    </button>
                                </CustomTooltip>
                            </div>
                        )}
                    </div>

                    {/* Metadata */}
                    <div className="flex-1 min-w-0 flex flex-col gap-2 text-center md:text-left items-center md:items-start">
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
                <div className="px-2 pb-32 relative z-10">
                    <SortableSongList
                        songs={filteredSongs}
                        onPlay={handlePlaySong}
                        onReorder={handleReorder}
                        disableReorder={id === 'favorites' || !!searchQuery}
                        sortKey={sortKey}
                        sortOrder={sortOrder}
                        playlistId={typeof id === 'number' ? id : undefined}
                        context={id === 'favorites' ? 'library' : 'playlist'}
                    />
                </div>
            )}
        </div>
    );
}
