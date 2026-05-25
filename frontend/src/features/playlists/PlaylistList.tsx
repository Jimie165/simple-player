import { useState, useEffect, useMemo, useCallback } from 'react';
import { MdMusicNote } from 'react-icons/md';
import { useSelectionStore } from '@/store/useSelectionStore';
import { getMusicItemId } from '@/utils/musicItemUtils';

import PageContainer from '@/components/layout/PageContainer';
import { libraryService } from '@/services/libraryService';
import type { Playlist, SongMetadata } from '@/types';
import { useNavigationStore } from '@/store/useNavigationStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import SmartCursorContextMenu from '@/components/common/SmartCursorContextMenu';
import EditPlaylistDialog from '@/features/playlists/dialogs/EditPlaylistDialog';
import CreatePlaylistDialog from '@/features/playlists/dialogs/CreatePlaylistDialog';
import PlaylistListActions from '@/features/playlists/list/PlaylistListActions';
import PlaylistSortMenu, { type PlaylistSortKey } from '@/features/playlists/list/PlaylistSortMenu';
import PlaylistCardsGrid from '@/features/playlists/list/PlaylistCardsGrid';

type SortKey = PlaylistSortKey;
type FavoritesPlaylist = Omit<Playlist, 'id'> & { id: 'favorites'; hidden?: boolean };
type PlaylistListItem = Playlist | FavoritesPlaylist;

export default function PlaylistList() {
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [playlistSongs, setPlaylistSongs] = useState<Record<number, SongMetadata[]>>({});
    const [favoritesCount, setFavoritesCount] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>(() => {
        try {
            const saved = localStorage.getItem('playlist_sort_key');
            if (saved === 'name' || saved === 'recently_added' || saved === 'recently_played') {
                return saved;
            }
        } catch (error) {
            console.warn('Failed to read playlist sort key', error);
        }
        return 'recently_added';
    });
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editPlaylist, setEditPlaylist] = useState<Playlist | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; playlist: Playlist } | null>(null);
    const [favoritesContextMenu, setFavoritesContextMenu] = useState<{ x: number; y: number } | null>(null);

    const { push } = useNavigationStore();
    const { addMultipleToNext, libraryVersion, playlistVersion, getPlaylistSettings, triggerLibraryUpdate, updateRecentItemCover } = useLibraryStore();
    const { setShuffleState } = usePlayerStore();
    const { playList, shufflePlay } = usePlaybackActions();
    const { isSelectionMode, selectedIds, toggleSelection, selectAllRequested, setSelectAllRequested, selectAll, toggleSelectionMode, setSelectableIds } = useSelectionStore();

    const loadPlaylists = useCallback(async () => {
        try {
            const list = await libraryService.getPlaylists();
            setPlaylists(list);
        } catch (error) {
            console.error(error);
        }
    }, []);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            setPlaylistSongs({});
            loadPlaylists();
            libraryService.getFavorites().then(songs => setFavoritesCount(songs.length));
        });
        return () => cancelAnimationFrame(frame);
    }, [libraryVersion, playlistVersion, loadPlaylists]);

    useEffect(() => {
        try {
            localStorage.setItem('playlist_sort_key', sortKey);
        } catch (error) {
            console.warn('Failed to persist playlist sort key', error);
        }
    }, [sortKey]);

    // Filter & Sort
    const filteredPlaylists = useMemo(() => {
        let list: PlaylistListItem[] = [...playlists];

        // Construct Favorites Pseudo-Playlist
        const favoritesItem: FavoritesPlaylist = {
            id: 'favorites',
            name: '喜爱歌曲',
            description: null,
            cover_path: null,
            created_at: '',
            updated_at: new Date().toISOString(),
            last_played_at: null,
            song_count: favoritesCount
        };

        if (searchQuery) {
            const lowerJson = searchQuery.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(lowerJson));

            // Check if favorites matches
            if (favoritesItem.name.includes(searchQuery) || 'favorites'.includes(lowerJson)) {
                // We will unshift it later
            } else {
                // Mark as null to exclude? No, just don't add
                favoritesItem.hidden = true;
            }
        }

        list.sort((a, b) => {
            if (sortKey === 'name') return a.name.localeCompare(b.name);
            if (sortKey === 'recently_played') {
                // Sort by last_played_at descending, null values at the end
                const aTime = a.last_played_at ? new Date(a.last_played_at).getTime() : 0;
                const bTime = b.last_played_at ? new Date(b.last_played_at).getTime() : 0;
                return bTime - aTime;
            }
            // recently_added (基于内容更新时间 desc)
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });

        // Always prepend Favorites if not hidden
        if (!favoritesItem.hidden) {
            list.unshift(favoritesItem);
        }

        return list;
    }, [playlists, searchQuery, sortKey, favoritesCount]);

    // Handle Select All Request
    useEffect(() => {
        if (selectAllRequested && isSelectionMode) {
            const items = filteredPlaylists.map(pl => ({
                id: getMusicItemId(pl),
                data: pl
            })).filter(i => i.id !== '');
            selectAll(items, 'playlist');
            setSelectAllRequested(false);
        }
    }, [selectAllRequested, isSelectionMode, filteredPlaylists, selectAll, setSelectAllRequested]);

    useEffect(() => {
        if (!isSelectionMode) return;
        setSelectableIds(filteredPlaylists.map(pl => getMusicItemId(pl)).filter(id => id !== ''));
    }, [isSelectionMode, filteredPlaylists, setSelectableIds]);

    // Removal of handleDelete since we use hook's global confirm now

    const handleCreate = async (name: string, _description?: string, coverPath?: string) => {
        const newPl = await libraryService.createPlaylist(name);
        if (_description) {
            await libraryService.updatePlaylistInfo(newPl.id, name, _description);
        }
        if (coverPath) {
            await libraryService.updatePlaylistCover(newPl.id, coverPath);
        }
        triggerLibraryUpdate();
        loadPlaylists();
    };

    // 加载播放列表歌曲（用于封面展示）
    const loadPlaylistSongs = useCallback(async (playlistId: number) => {
        if (playlistSongs[playlistId]) return playlistSongs[playlistId];
        try {
            const songs = await libraryService.getPlaylistSongs(playlistId);
            setPlaylistSongs(prev => ({ ...prev, [playlistId]: songs }));
            return songs;
        } catch (error) {
            console.warn(`Failed to load playlist songs for ${playlistId}`, error);
            return [];
        }
    }, [playlistSongs]);

    // 加载所有播放列表的歌曲
    useEffect(() => {
        playlists.forEach(pl => loadPlaylistSongs(pl.id));
    }, [playlists, loadPlaylistSongs]);

    // 播放播放列表
    const handlePlayPlaylist = async (pl: Playlist, shuffle = false) => {
        const songs = await loadPlaylistSongs(pl.id);
        if (songs.length === 0) return;
        const recentItem = {
            id: `playlist:${pl.id}`,
            type: 'playlist' as const,
            title: pl.name,
            description: `${songs.length} 首歌曲`,
            cover: null,
            cover_path: pl.cover_path || null,
            path: songs[0]?.path || "",
            lastPlayed: Date.now(),
            isLibraryItem: true
        };

        if (shuffle) {
            await shufflePlay({
                songs,
                options: { recentItem },
                context: {
                    type: 'playlist_detail',
                    name: pl.name,
                    id: pl.id.toString()
                }
            });
        } else {
            setShuffleState(false);
            await playList({
                songs,
                startIndex: 0,
                options: { restartIfCurrent: true, recentItem },
                context: {
                    type: 'playlist_detail',
                    name: pl.name,
                    id: pl.id.toString()
                }
            });
        }

        // 更新最近播放时间
        libraryService.markPlaylistAsPlayed(pl.id).catch(console.error);
    };

    // 添加到播放队列
    const handleAddToQueue = async (pl: Playlist) => {
        const songs = await loadPlaylistSongs(pl.id);
        addMultipleToNext(songs, true);
    };

    // 播放喜爱歌曲
    const handlePlayFavorites = async (shuffle = false) => {
        try {
            const songs = await libraryService.getFavorites();
            if (songs.length === 0) return;
            const recentItem = {
                id: `playlist:favorites`,
                type: 'playlist' as const,
                title: '喜爱歌曲',
                description: `${songs.length} 首歌曲`,
                cover: null,
                cover_path: null,
                path: songs[0]?.path || "",
                lastPlayed: Date.now(),
                isLibraryItem: true
            };

            if (shuffle) {
                await shufflePlay({
                    songs,
                    options: { recentItem },
                    context: {
                        type: 'playlist_detail',
                        name: '喜爱歌曲',
                        id: 'favorites'
                    }
                });
            } else {
                setShuffleState(false);
                await playList({
                    songs,
                    startIndex: 0,
                    options: { restartIfCurrent: true, recentItem },
                    context: {
                        type: 'playlist_detail',
                        name: '喜爱歌曲',
                        id: 'favorites'
                    }
                });
            }

        } catch (error) {
            console.error('Failed to play favorites:', error);
        }
    };

    // 添加喜爱歌曲到播放队列
    const handleAddFavoritesToQueue = async () => {
        try {
            const songs = await libraryService.getFavorites();
            addMultipleToNext(songs, true);
        } catch (error) {
            console.error('Failed to add favorites to queue:', error);
        }
    };

    const handleUpdatePlaylist = async (name: string, description: string | undefined, coverPath: string | undefined) => {
        if (!editPlaylist) return;
        await libraryService.updatePlaylistInfo(editPlaylist.id, name, description);
        if (coverPath !== editPlaylist.cover_path) {
            await libraryService.updatePlaylistCover(editPlaylist.id, coverPath || "");
            updateRecentItemCover(`playlist:${editPlaylist.id}`, coverPath || null);
        }
        triggerLibraryUpdate();
        setEditPlaylist(null);
        loadPlaylists();
    };

    return (
        <PageContainer
            title="播放列表"
            actions={<PlaylistListActions searchQuery={searchQuery} setSearchQuery={setSearchQuery} setIsCreateOpen={setIsCreateOpen} />}
        >
            {/* confirm dialog removed, handled by useSongOperations globally */}

            <CreatePlaylistDialog
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                onConfirm={handleCreate}
            />

            <EditPlaylistDialog
                isOpen={!!editPlaylist}
                onClose={() => setEditPlaylist(null)}
                onConfirm={handleUpdatePlaylist}
                initialName={editPlaylist?.name || ''}
                initialDescription={editPlaylist?.description || ''}
                initialCover={editPlaylist?.cover_path || undefined}
            />

            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">
                    {filteredPlaylists.length} 个播放列表
                </div>
                <PlaylistSortMenu sortKey={sortKey} setSortKey={setSortKey} />
            </div>

            <PlaylistCardsGrid
                filteredPlaylists={filteredPlaylists}
                favoritesCount={favoritesCount}
                isSelectionMode={isSelectionMode}
                selectedIds={selectedIds}
                toggleSelection={toggleSelection}
                toggleSelectionMode={toggleSelectionMode}
                push={push}
                handlePlayFavorites={handlePlayFavorites}
                handleAddFavoritesToQueue={handleAddFavoritesToQueue}
                handlePlayPlaylist={handlePlayPlaylist}
                handleAddToQueue={handleAddToQueue}
                setEditPlaylist={(pl) => setEditPlaylist(pl)}
                setContextMenu={setContextMenu}
                setFavoritesContextMenu={setFavoritesContextMenu}
                getPlaylistSettings={getPlaylistSettings}
                playlistSongs={playlistSongs}
            />

            {/* Context Menu */}
            {contextMenu && (
                <SmartCursorContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    item={contextMenu.playlist}
                    context="playlist_list"
                    onClose={() => setContextMenu(null)}
                    onEdit={() => setEditPlaylist(contextMenu.playlist)}
                    onShuffle={() => handlePlayPlaylist(contextMenu.playlist, true)}
                />
            )}

            {/* Favorites Context Menu */}
            {favoritesContextMenu && (
                <SmartCursorContextMenu
                    x={favoritesContextMenu.x}
                    y={favoritesContextMenu.y}
                    item={{
                        id: 'playlist:favorites',
                        type: 'playlist',
                        name: '喜爱歌曲',
                        title: '喜爱歌曲'
                    } as unknown as Playlist}
                    context="playlist_list"
                    onClose={() => setFavoritesContextMenu(null)}
                    onShuffle={() => handlePlayFavorites(true)}
                />
            )}

            {filteredPlaylists.length === 0 && !searchQuery && (
                <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                    <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
                        <MdMusicNote className="text-3xl" />
                    </div>
                    <p className="text-base font-medium">暂无播放列表</p>
                </div>
            )}
        </PageContainer>
    );
}
