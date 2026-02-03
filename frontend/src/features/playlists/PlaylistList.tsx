import { useState, useEffect, useMemo } from 'react';
import { MdFavorite, MdMusicNote, MdAdd, MdSearch, MdSort, MdCheck } from 'react-icons/md';
import clsx from 'clsx';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { useSelectionStore } from '@/store/useSelectionStore';
import { getMusicItemId } from '@/utils/musicItemUtils';

import PageContainer from '@/components/layout/PageContainer';
import { libraryService } from '@/services/libraryService';
import type { Playlist, SongMetadata } from '@/types';
import { useNavigationStore } from '@/store/useNavigationStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlaybackActions } from '@/hooks/usePlaybackActions';
import SmartCursorContextMenu from '@/components/common/SmartCursorContextMenu';
import MusicContextMenu from '@/components/common/MusicContextMenu';
import { useSongOperations } from '@/hooks/useSongOperations';
import EditPlaylistDialog from './components/EditPlaylistDialog';
import CreatePlaylistDialog from './components/CreatePlaylistDialog';
import CardPlayButton from '@/components/common/CardPlayButton';
import PlaylistCoverCollage from '@/components/common/PlaylistCoverCollage';
import { sortSongs } from '@/utils/songSort';

type SortKey = 'name' | 'recently_added' | 'recently_played';

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
        } catch { }
        return 'recently_added';
    });
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editPlaylist, setEditPlaylist] = useState<Playlist | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; playlist: Playlist } | null>(null);
    const [favoritesContextMenu, setFavoritesContextMenu] = useState<{ x: number; y: number } | null>(null);

    const { push } = useNavigationStore();
    const { addMultipleToNext, libraryVersion, getPlaylistSettings } = useLibraryStore();
    const { setShuffleState } = usePlayerStore();
    const { playList, shufflePlay } = usePlaybackActions();
    const { isSelectionMode, selectedIds, toggleSelection, selectAllRequested, setSelectAllRequested, selectAll, toggleSelectionMode, setSelectableIds } = useSelectionStore();

    const loadPlaylists = async () => {
        try {
            const list = await libraryService.getPlaylists();
            setPlaylists(list);
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        // Force refresh when library changes
        setPlaylistSongs({});
        loadPlaylists();
        libraryService.getFavorites().then(songs => setFavoritesCount(songs.length));
    }, [libraryVersion]);

    useEffect(() => {
        try {
            localStorage.setItem('playlist_sort_key', sortKey);
        } catch { }
    }, [sortKey]);

    // Filter & Sort
    const filteredPlaylists = useMemo(() => {
        let list = [...playlists];

        // Construct Favorites Pseudo-Playlist
        const favoritesItem: any = {
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
        if (!(favoritesItem as any).hidden) {
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

    const handleCreate = async (name: string, _description?: string) => {
        await libraryService.createPlaylist(name);
        // If we support description in creation, we'd update it here too 
        // but currently createPlaylist only takes name. 
        // We could call updatePlaylistInfo immediately if description is provided,
        // but createPlaylist doesn't return ID immediately in frontend service (it does return Playlist obj).
        // Let's rely on standard create for now.
        // Actually the service returns Playlist!
        // To be perfect, we should update description if provided.
        // But for now let's just reload.
        loadPlaylists();
    };

    // 加载播放列表歌曲（用于封面展示）
    const loadPlaylistSongs = async (playlistId: number) => {
        if (playlistSongs[playlistId]) return playlistSongs[playlistId];
        try {
            const songs = await libraryService.getPlaylistSongs(playlistId);
            setPlaylistSongs(prev => ({ ...prev, [playlistId]: songs }));
            return songs;
        } catch {
            return [];
        }
    };

    // 加载所有播放列表的歌曲
    useEffect(() => {
        playlists.forEach(pl => loadPlaylistSongs(pl.id));
    }, [playlists]);

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
        }
        setEditPlaylist(null);
        loadPlaylists();
    };

    // 右键菜单处理
    const handleContextMenu = (e: React.MouseEvent, playlist: Playlist) => {
        e.preventDefault();
        setFavoritesContextMenu(null);
        setContextMenu({ x: e.clientX, y: e.clientY, playlist });
    };

    const handleFavoritesContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenu(null);
        setFavoritesContextMenu({ x: e.clientX, y: e.clientY });
    };


    return (
        <PageContainer
            title="播放列表"
            actions={
                <div className="flex items-center gap-2">
                    <div className="relative group">
                        <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="搜索..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-neutral-100 dark:bg-neutral-800 border-none rounded-full py-1.5 pl-9 pr-4 text-sm w-40 focus:w-60 focus:ring-2 focus:ring-primary transition-all duration-300 placeholder:text-neutral-500"
                        />
                    </div>

                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="flex items-center gap-1 bg-primary text-on-primary px-4 py-1.5 rounded-full text-sm font-medium hover:bg-primary/90 transition-all shadow-sm active:scale-95"
                    >
                        <MdAdd className="text-lg" />
                        新建
                    </button>
                </div>
            }
        >
            {/* confirm dialog removed, handled by useSongOperations globally */}

            <CreatePlaylistDialog
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                onConfirm={handleCreate}
            />

            {editPlaylist && (
                <EditPlaylistDialog
                    isOpen={!!editPlaylist}
                    onClose={() => setEditPlaylist(null)}
                    onConfirm={handleUpdatePlaylist}
                    initialName={editPlaylist.name}
                    initialDescription={editPlaylist.description || ''}
                    initialCover={editPlaylist.cover_path || undefined}
                />
            )}

            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">
                    {filteredPlaylists.length} 个播放列表
                </div>

                <Menu as="div" className="relative">
                    <MenuButton className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors">
                        <MdSort className="text-lg" />
                        排序
                    </MenuButton>
                    <MenuItems
                        anchor="bottom end"
                        className="w-40 origin-top-right rounded-xl border border-neutral-200/50 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl p-1 text-sm text-neutral-900 shadow-2xl ring-1 ring-black/5 focus:outline-none dark:border-neutral-700/50 dark:text-white z-50 mt-2"
                    >
                        <MenuItem>
                            <button onClick={() => setSortKey('recently_played')} className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                最近播放
                                {sortKey === 'recently_played' && <MdCheck />}
                            </button>
                        </MenuItem>
                        <MenuItem>
                            <button onClick={() => setSortKey('recently_added')} className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                最近添加
                                {sortKey === 'recently_added' && <MdCheck />}
                            </button>
                        </MenuItem>
                        <MenuItem>
                            <button onClick={() => setSortKey('name')} className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                名称
                                {sortKey === 'name' && <MdCheck />}
                            </button>
                        </MenuItem>
                    </MenuItems>
                </Menu>
            </div>

            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pb-8">
                {filteredPlaylists.map(pl => {
                    // Check if it's the favorites item
                    if (pl.id === 'favorites' as any) {
                        const favoritesSelectionId = getMusicItemId(pl);
                        const isSelected = selectedIds.has(favoritesSelectionId);
                        return (
                            <div
                                key="favorites"
                                onClick={() => {
                                    if (isSelectionMode) {
                                        toggleSelection(favoritesSelectionId, 'playlist', pl);
                                    } else {
                                        push({ type: 'playlist_detail', data: { id: 'favorites', name: '喜爱歌曲' } });
                                    }
                                }}
                                onContextMenu={handleFavoritesContextMenu}
                                className="group relative aspect-square cursor-pointer transition-transform hover:scale-[1.02] rounded-2xl overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-pink-600 rounded-2xl shadow-lg shadow-red-900/20" />

                                <div className="absolute inset-0 p-5 flex flex-col justify-between">
                                    <div className="flex justify-end">
                                        <div className="bg-white/20 p-2.5 rounded-full backdrop-blur-sm">
                                            <MdFavorite className="text-white text-xl" />
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-white font-bold text-2xl tracking-tight">喜爱歌曲</h3>
                                        <p className="text-white/80 text-sm mt-1 font-medium">{favoritesCount} 首歌曲</p>
                                    </div>
                                </div>

                                {/* Selection Checkbox */}
                                {isSelectionMode && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleSelection(favoritesSelectionId, 'playlist', pl);
                                        }}
                                        className={clsx(
                                            "absolute top-2 left-2 z-30 w-6 h-6 rounded-md flex items-center justify-center transition-all shadow-md cursor-pointer",
                                            isSelected
                                                ? "bg-white text-primary opacity-100"
                                                : "bg-black/20 backdrop-blur-md text-white border border-white/30 opacity-100"
                                        )}
                                    >
                                        {isSelected ? <MdCheck className="text-lg" /> : null}
                                    </div>
                                )}

                                {/* Hover Overlay */}
                                <div className={clsx(
                                    "absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent transition-opacity duration-300 rounded-2xl",
                                    !isSelectionMode ? "opacity-0 group-hover:opacity-100" : "opacity-0"
                                )}>
                                    {!isSelectionMode && (
                                        <>
                                            <CardPlayButton
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePlayFavorites();
                                                }}
                                            />
                                            <FavoritesCardMenu
                                                handlePlayFavorites={handlePlayFavorites}
                                                handleAddFavoritesToQueue={handleAddFavoritesToQueue}
                                                setFavoritesContextMenu={setFavoritesContextMenu}
                                                setContextMenu={setContextMenu}
                                                toggleSelectionMode={toggleSelectionMode}
                                                toggleSelection={toggleSelection}
                                                isSelectionMode={isSelectionMode}
                                                isSelected={isSelected}
                                            />
                                        </>
                                    )}
                                </div>
                                {isSelectionMode && (
                                    <div className="absolute inset-0 bg-black/10 transition-opacity pointer-events-none" />
                                )}
                            </div>
                        );
                    }

                    const id = getMusicItemId(pl);
                    const isSelected = selectedIds.has(id);
                    return (
                        <div
                            key={pl.id}
                            onClick={() => {
                                if (isSelectionMode) {
                                    toggleSelection(id, 'playlist', pl);
                                } else {
                                    push({ type: 'playlist_detail', data: pl });
                                }
                            }}
                            onContextMenu={(e) => handleContextMenu(e, pl)}
                            className="group flex flex-col gap-3 cursor-pointer"
                        >
                            {/* Artwork */}
                            <div className="relative aspect-square rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 shadow-sm group-hover:shadow-md transition-all">
                                <PlaylistCoverCollage
                                    songs={(() => {
                                        const rawSongs = playlistSongs[pl.id] || [];
                                        const settings = getPlaylistSettings(pl.id.toString());
                                        return sortSongs(rawSongs, settings.sortKey, settings.sortOrder);
                                    })()}
                                    className="transition-transform duration-500 group-hover:scale-105"
                                />

                                {/* Selection Checkbox */}
                                {isSelectionMode && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleSelection(id, 'playlist', pl);
                                        }}
                                        className={clsx(
                                            "absolute top-2 left-2 z-30 w-6 h-6 rounded-md flex items-center justify-center transition-all shadow-md cursor-pointer",
                                            isSelected
                                                ? "bg-primary text-on-primary opacity-100"
                                                : "bg-black/20 backdrop-blur-md text-white border border-white/30 opacity-100"
                                        )}
                                    >
                                        {isSelected ? <MdCheck className="text-lg" /> : null}
                                    </div>
                                )}

                                {/* Hover Overlay - Identical to AlbumGridView */}
                                {!isSelectionMode && (
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        <CardPlayButton
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePlayPlaylist(pl);
                                            }}
                                        />
                                        <PlaylistCardMenu
                                            pl={pl}
                                            handlePlayPlaylist={handlePlayPlaylist}
                                            handleAddToQueue={handleAddToQueue}
                                            setEditPlaylist={setEditPlaylist}
                                            setContextMenu={setContextMenu}
                                            setFavoritesContextMenu={setFavoritesContextMenu}
                                            toggleSelectionMode={toggleSelectionMode}
                                            toggleSelection={toggleSelection}
                                            isSelectionMode={isSelectionMode}
                                            isSelected={isSelected}
                                        />
                                    </div>
                                )}

                                {isSelectionMode && (
                                    <div className="absolute inset-0 bg-primary/10 transition-opacity" />
                                )}
                            </div>

                            {/* Metadata */}
                            <div>
                                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 truncate text-[15px] group-hover:text-primary transition-colors">
                                    {pl.name}
                                </h3>
                                <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium">
                                    <span>{pl.song_count || 0} 首歌曲</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

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
                    } as any}
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

/**
 * 喜爱歌曲磁贴的统一菜单
 */
function FavoritesCardMenu({
    handlePlayFavorites,
    handleAddFavoritesToQueue,
    setFavoritesContextMenu,
    setContextMenu,
    toggleSelectionMode,
    toggleSelection,
    isSelectionMode,
    isSelected
}: any) {
    const { menuItems } = useSongOperations({
        items: [{
            id: 'playlist:favorites',
            type: 'playlist',
            name: '喜爱歌曲',
            title: '喜爱歌曲'
        } as any],
        context: 'playlist_list',
        onPlay: () => handlePlayFavorites(),
        onShuffle: () => handlePlayFavorites(true),
        onAddToQueue: () => handleAddFavoritesToQueue(),
        onDelete: () => { }, // Disable delete for Favorites tile
        onSelect: () => {
            if (!isSelectionMode) {
                toggleSelectionMode({ id: 'playlist:favorites', type: 'playlist', data: { id: 'playlist:favorites', type: 'playlist', name: '喜爱歌曲', title: '喜爱歌曲' } });
            } else {
                toggleSelection('playlist:favorites', 'playlist', { id: 'playlist:favorites', type: 'playlist', name: '喜爱歌曲', title: '喜爱歌曲' });
            }
        },
        isSelected
    });

    return (
        <MusicContextMenu
            className="absolute bottom-3 right-3"
            buttonClassName="w-10 h-10"
            groups={menuItems}
            onOpen={() => {
                setFavoritesContextMenu(null);
                setContextMenu(null);
            }}
        />
    );
}

/**
 * 用户播放列表磁贴的统一菜单
 */
function PlaylistCardMenu({
    pl,
    handlePlayPlaylist,
    handleAddToQueue,
    setEditPlaylist,
    setContextMenu,
    setFavoritesContextMenu,
    toggleSelectionMode,
    toggleSelection,
    isSelectionMode,
    isSelected
}: any) {
    const selectionId = getMusicItemId(pl);
    const { menuItems } = useSongOperations({
        items: [pl],
        context: 'playlist_list',
        onPlay: () => handlePlayPlaylist(pl),
        onShuffle: () => handlePlayPlaylist(pl, true),
        onAddToQueue: () => handleAddToQueue(pl),
        onEdit: () => setEditPlaylist(pl),
        onSelect: () => {
            if (!isSelectionMode) {
                toggleSelectionMode({ id: selectionId, type: 'playlist', data: pl });
            } else {
                toggleSelection(selectionId, 'playlist', pl);
            }
        },
        isSelected
    });

    return (
        <MusicContextMenu
            className="absolute bottom-3 right-3"
            buttonClassName="w-10 h-10"
            groups={menuItems}
            onOpen={() => {
                setContextMenu(null);
                setFavoritesContextMenu(null);
            }}
        />
    );
}
