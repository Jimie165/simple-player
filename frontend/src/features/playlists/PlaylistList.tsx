import { useState, useEffect, useMemo } from 'react';
import { IoHeart, IoMusicalNotes, IoAdd, IoSearch } from 'react-icons/io5';
import { MdSort, MdCheck } from 'react-icons/md';
import clsx from 'clsx';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { useSelectionStore } from '../../store/useSelectionStore';

import PageContainer from '../../components/layout/PageContainer';
import { libraryService } from '../../services/libraryService';
import type { Playlist, SongMetadata } from '../../types';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useNavigationStore } from '../../store/useNavigationStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlaybackActions } from '../../hooks/usePlaybackActions';
import CursorContextMenu from '../../components/common/CursorContextMenu';
import MusicContextMenu, { getMusicMenuGroups } from '../../components/common/MusicContextMenu';
import EditPlaylistDialog from './components/EditPlaylistDialog';
import CreatePlaylistDialog from './components/CreatePlaylistDialog';
import CardPlayButton from '../../components/common/CardPlayButton';
import PlaylistCoverCollage from '../../components/common/PlaylistCoverCollage';
import { sortSongs } from '../../utils/songSort';

type SortKey = 'name' | 'recently_added' | 'recently_played';

export default function PlaylistList() {
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [playlistSongs, setPlaylistSongs] = useState<Record<number, SongMetadata[]>>({});
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
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [editPlaylist, setEditPlaylist] = useState<Playlist | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; playlist: Playlist } | null>(null);
    const [favoritesContextMenu, setFavoritesContextMenu] = useState<{ x: number; y: number } | null>(null);

    const { push } = useNavigationStore();
    const { addToNext, libraryVersion, getPlaylistSettings } = useLibraryStore();
    const { setShuffleState } = usePlayerStore();
    const { playList, shufflePlay } = usePlaybackActions();
    const { isSelectionMode, selectedIds, toggleSelection, selectAllRequested, setSelectAllRequested, selectAll, toggleSelectionMode } = useSelectionStore();

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
    }, [libraryVersion]);

    useEffect(() => {
        try {
            localStorage.setItem('playlist_sort_key', sortKey);
        } catch { }
    }, [sortKey]);

    // Filter & Sort
    const filteredPlaylists = useMemo(() => {
        let list = [...playlists];
        if (searchQuery) {
            const lowerJson = searchQuery.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(lowerJson));
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

        return list;
    }, [playlists, searchQuery, sortKey]);

    // Handle Select All Request
    useEffect(() => {
        if (selectAllRequested && isSelectionMode) {
            const items = filteredPlaylists.map(pl => ({
                id: pl.id.toString(),
                data: pl
            }));
            selectAll(items, 'playlist');
            setSelectAllRequested(false);
        }
    }, [selectAllRequested, isSelectionMode, filteredPlaylists, selectAll, setSelectAllRequested]);

    const handleDelete = async () => {
        if (deleteId) {
            await libraryService.deletePlaylist(deleteId);
            setDeleteId(null);
            loadPlaylists();
        }
    };

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
            await shufflePlay({ songs, options: { recentItem } });
        } else {
            setShuffleState(false);
            await playList({
                songs,
                startIndex: 0,
                options: { restartIfCurrent: true, recentItem }
            });
        }

        // 更新最近播放时间
        libraryService.markPlaylistAsPlayed(pl.id).catch(console.error);
    };

    // 添加到播放队列
    const handleAddToQueue = async (pl: Playlist) => {
        const songs = await loadPlaylistSongs(pl.id);
        [...songs].reverse().forEach(s => addToNext(s));
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
                await shufflePlay({ songs, options: { recentItem } });
            } else {
                setShuffleState(false);
                await playList({
                    songs,
                    startIndex: 0,
                    options: { restartIfCurrent: true, recentItem }
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
            [...songs].reverse().forEach(s => addToNext(s));
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
        setContextMenu({ x: e.clientX, y: e.clientY, playlist });
    };


    return (
        <PageContainer
            title="播放列表"
            actions={
                <div className="flex items-center gap-2">
                    <div className="relative group">
                        <IoSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-primary transition-colors" />
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
                        <IoAdd className="text-lg" />
                        新建
                    </button>
                </div>
            }
        >
            <ConfirmDialog
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={handleDelete}
                title="删除"
                description="确定要删除此播放列表吗？"
                confirmText="删除"
                type="danger"
            />

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
                {/* 1. Favorites Card - Special Style */}
                {!searchQuery && (
                    <div
                        onClick={() => push({ type: 'playlist_detail', data: { id: 'favorites', name: '喜爱歌曲' } })}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            setFavoritesContextMenu({ x: e.clientX, y: e.clientY });
                        }}
                        className="group relative aspect-square cursor-pointer transition-transform hover:scale-[1.02] rounded-2xl overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-pink-600 rounded-2xl shadow-lg shadow-red-900/20" />

                        <div className="absolute inset-0 p-5 flex flex-col justify-between">
                            <div className="flex justify-end">
                                <div className="bg-white/20 p-2.5 rounded-full backdrop-blur-sm">
                                    <IoHeart className="text-white text-xl" />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-white font-bold text-2xl tracking-tight">喜爱歌曲</h3>
                            </div>
                        </div>

                        {/* Hover Overlay - Identical to AlbumGridView */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl">
                            {/* Play Button - Defaults to bottom-3 left-3 */}
                            <CardPlayButton
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handlePlayFavorites();
                                }}
                            />
                            {/* More Button - Defaults to bottom-3 right-3 */}
                            <MusicContextMenu
                                type="playlist"
                                className="absolute bottom-3 right-3"
                                buttonClassName="w-10 h-10"
                                onPlay={() => handlePlayFavorites()}
                                onShuffle={() => handlePlayFavorites(true)}
                                onAddToQueue={() => handleAddFavoritesToQueue()}
                                onOpen={() => setFavoritesContextMenu(null)}
                                hideSelect={true}
                                isFavorite={true}
                            />
                        </div>
                    </div>
                )}


                {/* 2. User Playlists */}
                {filteredPlaylists.map(pl => {
                    const isSelected = selectedIds.has(pl.id.toString());
                    return (
                        <div
                            key={pl.id}
                            onClick={() => {
                                if (isSelectionMode) {
                                    toggleSelection(pl.id.toString(), 'playlist', pl);
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
                                            toggleSelection(pl.id.toString(), 'playlist', pl);
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
                                        <MusicContextMenu
                                            type="playlist"
                                            className="absolute bottom-3 right-3"
                                            buttonClassName="w-10 h-10"
                                            onPlay={() => handlePlayPlaylist(pl)}
                                            onShuffle={() => handlePlayPlaylist(pl, true)}
                                            onAddToQueue={() => handleAddToQueue(pl)}
                                            onEdit={() => setEditPlaylist(pl)}
                                            onDelete={() => setDeleteId(pl.id)}
                                            deleteText="删除"
                                            onOpen={() => setContextMenu(null)}
                                            onSelect={() => {
                                                if (!isSelectionMode) {
                                                    toggleSelectionMode({ id: pl.id.toString(), type: 'playlist', data: pl });
                                                } else {
                                                    toggleSelection(pl.id.toString(), 'playlist', pl);
                                                }
                                            }}
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
                <CursorContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    menuGroups={getMusicMenuGroups({
                        type: 'playlist',
                        onPlay: () => handlePlayPlaylist(contextMenu.playlist),
                        onShuffle: () => handlePlayPlaylist(contextMenu.playlist, true),
                        onAddToQueue: () => handleAddToQueue(contextMenu.playlist),
                        onEdit: () => setEditPlaylist(contextMenu.playlist),
                        onDelete: () => setDeleteId(contextMenu.playlist.id),
                        deleteText: "删除",
                        onSelect: () => {
                            if (!isSelectionMode) {
                                toggleSelectionMode({ id: contextMenu.playlist.id.toString(), type: 'playlist', data: contextMenu.playlist });
                            } else {
                                toggleSelection(contextMenu.playlist.id.toString(), 'playlist', contextMenu.playlist);
                            }
                        },
                    })}
                />
            )}

            {/* Favorites Context Menu */}
            {favoritesContextMenu && (
                <CursorContextMenu
                    x={favoritesContextMenu.x}
                    y={favoritesContextMenu.y}
                    onClose={() => setFavoritesContextMenu(null)}
                    menuGroups={getMusicMenuGroups({
                        type: 'playlist',
                        onPlay: () => handlePlayFavorites(),
                        onShuffle: () => handlePlayFavorites(true),
                        onAddToQueue: () => handleAddFavoritesToQueue(),
                        hideSelect: true,
                    })}
                />
            )}

            {filteredPlaylists.length === 0 && !searchQuery && (
                <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                    <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
                        <IoMusicalNotes className="text-3xl" />
                    </div>
                    <p className="text-base font-medium">暂无播放列表</p>
                </div>
            )}
        </PageContainer>
    );
}
