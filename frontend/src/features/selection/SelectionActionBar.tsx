import { useState, useRef, useEffect, useMemo } from 'react';
import { useSelectionStore } from '../../store/useSelectionStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useNavigationStore } from '../../store/useNavigationStore';
import { audioService } from '../../services/audioService';
import { libraryService } from '../../services/libraryService';
import { fileService } from '../../services/fileService';
import { useAddToPlaylistStore } from '../../store/useAddToPlaylistStore';
import { MdPlayArrow, MdPlaylistAdd, MdAdd, MdDelete, MdMoreHoriz, MdPlaylistRemove } from 'react-icons/md';
import { IoClose, IoSquareOutline, IoCheckbox, IoHeart, IoHeartOutline } from 'react-icons/io5';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import type { SongMetadata } from '../../types';

interface ActionItem {
    id: string;
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'danger' | 'default';
    hideLabel?: boolean;
}

export default function SelectionActionBar() {
    const { isSelectionMode, selectedIds, selectionType, clearSelection, selectedItemsMap } = useSelectionStore();
    const { setPlaylist, setCurrentSongIndex, addToNext, removeFromRecent, triggerLibraryUpdate, isFavorite, refreshFavorites, libraryVersion, pathMap, toggleShuffleList } = useLibraryStore();
    const { setIsPlaying, setMetadata, setShuffleState } = usePlayerStore();
    const { activeOverlay, currentPage } = useNavigationStore();

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [visibleCount, setVisibleCount] = useState(4);
    const containerRef = useRef<HTMLDivElement>(null);
    const actionsRef = useRef<HTMLDivElement>(null);

    // Dynamicly check if "All" is selected. 
    // Since we don't know the exact "total count" here, we'll use a signal or assume 
    // if we just clicked it, it's all selected.
    const [justClickedAll, setJustClickedAll] = useState(false);

    useEffect(() => {
        if (selectedIds.size === 0) setJustClickedAll(false);
    }, [selectedIds.size]);

    // Sync Favorites
    useEffect(() => {
        if (isSelectionMode) {
            refreshFavorites();
        }
    }, [isSelectionMode, libraryVersion, refreshFavorites]);

    // Cleanup selection on navigation
    useEffect(() => {
        if (isSelectionMode) {
            clearSelection();
        }
    }, [activeOverlay, currentPage]);

    const handleToggleAll = () => {
        if (justClickedAll) {
            clearSelection();
            setJustClickedAll(false);
        } else {
            useSelectionStore.getState().setSelectAllRequested(true);
            setJustClickedAll(true);
        }
    };

    useEffect(() => {
        const calculateVisibleCount = () => {
            // Estimate available width based on viewport
            // Max width is 90vw.
            // Left fixed content (Checkbox + Text + Close + Divider + Padding) is approx 200px.
            // Each button is approx 100-110px.

            const maxContainerWidth = Math.min(window.innerWidth * 0.9, 800); // Allow reasonable max width cap
            const leftContentWidth = 200;
            const availableForActions = maxContainerWidth - leftContentWidth;

            // If very small screen, force at least 1 action if possible, else 0
            if (availableForActions < 50) {
                setVisibleCount(0);
                return;
            }

            const buttonAverageWidth = 110;
            let count = Math.floor(availableForActions / buttonAverageWidth);

            // Clamp between 0 and total actions
            count = Math.max(0, Math.min(count, 5));

            setVisibleCount(count);
        };

        calculateVisibleCount();
        window.addEventListener('resize', calculateVisibleCount);
        return () => window.removeEventListener('resize', calculateVisibleCount);
    }, [isSelectionMode]);



    const count = selectedIds.size;

    const selectedItems = useMemo(() => {
        if (!selectedItemsMap) return [];
        return Array.from(selectedIds).map(id => selectedItemsMap.get(id)).filter(Boolean);
    }, [selectedIds, selectedItemsMap]);

    // Determine actual types of all selected items
    const selectedItemTypes = useMemo(() => {
        const types = new Set<string>();
        selectedItems.forEach(item => {
            if (item.type) {
                types.add(item.type);
            } else if (!item.type && (item.path || item.id)) {
                // Default to 'song' if no type and has path/id
                types.add('song');
            }
        });
        return types;
    }, [selectedItems]);

    // Check if all selected items have songs


    const { syncSongs, hasAsyncItems } = useMemo(() => {
        const songs: SongMetadata[] = [];
        let hasAsync = false;

        selectedItems.forEach(item => {
            if (item.type === 'file' || item.type === 'song' || (!item.type && (item.path || item.id))) {
                songs.push(item as SongMetadata);
            } else if (item.songs && Array.isArray(item.songs)) {
                songs.push(...item.songs);
            } else if (item.type === 'playlist') {
                hasAsync = true;
            }
        });
        return { syncSongs: songs, hasAsyncItems: hasAsync };
    }, [selectedItems]);

    const isAllFavorited = useMemo(() => {
        return !hasAsyncItems && syncSongs.length > 0 && syncSongs.every(s => isFavorite(s));
    }, [syncSongs, hasAsyncItems, isFavorite, libraryVersion]);

    const getSelectedItems = (): any[] => selectedItems;

    const resolveSongsFromSelection = async (items: any[]): Promise<SongMetadata[]> => {
        const songs: SongMetadata[] = [];

        for (const item of items) {
            if (item.type === 'playlist') { // Covers both Library Playlist and Recent Playlist
                try {
                    // Handle "playlist:123" format from Recent Items or just "123" from Library
                    const idStr = String(item.id);
                    const cleanId = idStr.replace('playlist:', '');

                    if (cleanId === 'favorites') {
                        const favs = await libraryService.getFavorites();
                        songs.push(...favs);
                    } else {
                        const plId = parseInt(cleanId);
                        if (!isNaN(plId)) {
                            const plSongs = await libraryService.getPlaylistSongs(plId);
                            // Apply sort settings if needed, but for playback raw order or default sort is usually fine
                            // unless we want to match user's view. Getting raw is safer for now.
                            songs.push(...plSongs);
                        }
                    }
                } catch (e) {
                    console.error("Failed to resolve playlist:", e);
                }
            } else if (item.type === 'album') {
                // Recent Album or Library Album
                if (item.songs && Array.isArray(item.songs) && item.songs.length > 0) {
                    songs.push(...item.songs);
                } else {
                    // If no songs attached (e.g. from Recent Grid), scan library
                    try {
                        const all = await libraryService.scanLibrary();
                        // Filter by Album Name and Artist (if available)
                        const albumSongs = all.filter(s =>
                            s.album === item.title &&
                            (item.artist ? s.artist === item.artist : true)
                        );
                        songs.push(...albumSongs);
                    } catch (e) { console.error(e); }
                }
            } else if (item.type === 'artist') {
                if (item.songs && Array.isArray(item.songs) && item.songs.length > 0) {
                    songs.push(...item.songs);
                } else {
                    try {
                        const all = await libraryService.scanLibrary();
                        const artistSongs = all.filter(s => s.artist === item.title); // item.title is artist name in Recent? Or item.artist?
                        // In RecentItem for Artist: title is usually the Artist Name.
                        songs.push(...artistSongs);
                    } catch (e) { console.error(e); }
                }
            } else if (item.type === 'folder') {
                if (item.path) {
                    try {
                        const folderSongs = await fileService.readFolder(item.path);
                        songs.push(...folderSongs);
                    } catch (e) { console.error(e); }
                }
            } else if (!item.type && item.songs && Array.isArray(item.songs)) {
                // Library album/artist selections may not have a type but do have songs
                songs.push(...item.songs);
            } else if (item.type === 'file' || item.type === 'song' || item.type === 'recent' || !item.type) {
                // Handle file, song, recent items, or items without type
                if (item.path) {
                    // For recent items (type='file'), we need to fetch full metadata
                    // because RecentItem structure lacks complete SongMetadata fields
                    if (item.type === 'file' && typeof item.id === 'string') {
                        try {
                            const meta = await fileService.getMetadata(item.path);
                            if (meta) {
                                songs.push(meta);
                                continue;
                            }
                        } catch {
                            // Fall through to use item data as fallback
                        }
                    }

                    // For songs with numeric ID or as fallback
                    const sanitizedId = typeof item.id === 'number' ? item.id : undefined;
                    const meta: SongMetadata = {
                        id: sanitizedId,
                        path: item.path,
                        title: item.title || item.path.split(/[\\/]/).pop() || 'Unknown',
                        artist: item.artist || item.description || 'Unknown Artist',
                        album: item.album || 'Unknown Album',
                        duration: item.duration || 0,
                        cover: item.cover || null,
                        cover_path: item.cover_path || null,
                    };
                    songs.push(meta);
                }
            } else if (item.songs && Array.isArray(item.songs)) {
                // Fallback for any other items with songs
                songs.push(...item.songs);
            }
        }

        return songs;
    };

    if (!isSelectionMode) return null;

    const handlePlay = async () => {
        try {
            const items = getSelectedItems();
            if (items.length === 0) return;

            const songsToPlay = await resolveSongsFromSelection(items);
            if (songsToPlay.length === 0) return;

            const first = songsToPlay[0];
            if (!first.path) return;

            // 参考 PlaylistDetail 的正确播放逻辑：
            // 1. 设置播放列表（这会更新 store 中的 playlist）
            setPlaylist(songsToPlay);

            // 2. 设置当前索引到第一首歌
            setCurrentSongIndex(0);

            // 3. 处理洗牌模式（选择播放通常关闭洗牌）
            if (usePlayerStore.getState().isShuffling) {
                // 如果当前是洗牌模式，保持洗牌并将第一首歌放到队列顶部
                toggleShuffleList(true);
            }
            setShuffleState(false);

            // 4. 调用音频服务播放（这会加载音频）
            await audioService.play(first.path, first);

            // 5. 设置元数据和播放状态
            setMetadata(first);
            setIsPlaying(true);

        } catch (error) {
            console.error("Failed to play selection:", error);
            setIsPlaying(false);
        } finally {
            clearSelection();
        }
    };

    const handleAddToQueue = async () => {
        const items = getSelectedItems();
        const songsToQueue = await resolveSongsFromSelection(items);
        [...songsToQueue].reverse().forEach((s: SongMetadata) => addToNext(s));
        clearSelection();
    };

    const handleAddToPlaylist = async () => {
        const items = getSelectedItems();
        const songsToAdd = await resolveSongsFromSelection(items);

        if (songsToAdd.length > 0) {
            useAddToPlaylistStore.getState().open(songsToAdd);
            clearSelection();
        }
    };

    const handleBatchRemoveFromPlaylist = async () => {
        if (activeOverlay?.type !== 'playlist_detail' || !activeOverlay.data?.id) return;

        const items = getSelectedItems();
        const songIds = items.map(i => i.id).filter(id => typeof id === 'number') as number[];

        if (songIds.length > 0) {
            try {
                await libraryService.batchRemoveFromPlaylist(activeOverlay.data.id, songIds);
                triggerLibraryUpdate();
            } catch (e) {
                console.error('Failed to remove songs from playlist', e);
            }
        }

        clearSelection();
    };

    const handleDelete = async () => {
        const items = getSelectedItems();

        // Handle mixed types - delete based on actual item type
        const songIds: number[] = [];
        const playlistIds: (string | number)[] = [];
        const recentIds: string[] = [];

        items.forEach(item => {
            if (item.type === 'song' || item.type === 'file' || (!item.type && item.path && typeof item.id === 'number')) {
                // Song
                if (typeof item.id === 'number') songIds.push(item.id);
            } else if (item.type === 'album' || item.type === 'artist') {
                // Album or Artist - delete all songs
                if (item.songs && Array.isArray(item.songs)) {
                    item.songs.forEach((s: SongMetadata) => {
                        if (typeof s.id === 'number') songIds.push(s.id);
                    });
                }
            } else if (item.type === 'playlist') {
                // Playlist
                if (item.id !== 'favorites') {
                    playlistIds.push(item.id);
                }
            } else if (item.type === 'file' || item.type === 'folder' || item.type === 'recent') {
                // Recent items
                if (item.id) recentIds.push(item.id);
            }
        });

        // Delete songs
        if (songIds.length > 0) {
            await libraryService.batchDeleteSongs(songIds);
            triggerLibraryUpdate();
        }

        // Delete playlists
        for (const id of playlistIds) {
            try {
                await libraryService.deletePlaylist(Number(id));
            } catch (e) { console.error(e); }
        }
        if (playlistIds.length > 0) {
            triggerLibraryUpdate();
        }

        // Remove recent items
        recentIds.forEach(id => removeFromRecent(id));

        clearSelection();
        setShowDeleteConfirm(false);
    };

    // Batch Favorite Handler
    const handleBatchFavorite = async () => {
        const items = getSelectedItems();
        const songsToProcess = await resolveSongsFromSelection(items);
        if (songsToProcess.length === 0) return;

        const targetIsFavorite = !isAllFavorited;

        for (const song of songsToProcess) {
            // Resolve effective numeric ID
            let id = song.id;
            if (typeof id !== 'number' && song.path) {
                // Try to resolve from pathMap if ID is missing or string (RecentItem)
                const normPath = song.path.replace(/[\\/]/g, '/').toLowerCase();
                // Ensure pathMap exists and look it up
                if (pathMap) {
                    const found = pathMap.get(normPath);
                    if (found) id = found;
                }
            }

            // Must have a numeric ID to toggle favorite in Library
            if (typeof id === 'number') {
                // Check REAL-TIME status, not the stale status from the item object
                // We construct a temporary object for isFavorite check if needed, or just leverage id
                const currentStatus = isFavorite({ ...song, id });

                if (currentStatus !== targetIsFavorite) {
                    try { await libraryService.toggleFavorite(id); } catch (e) { }
                }
            }
        }

        // Wait for favorites to refresh before updating UI
        await refreshFavorites();
        triggerLibraryUpdate();
        clearSelection();
    };

    // Capabilities Intersection
    // Determine which operations are common to all selected item types

    // Allow play/queue for containers (playlist, album, artist, folder) even if songs aren't loaded locally yet
    // because resolveSongsFromSelection will fetch them.
    const hasPlayableTypes = selectedItems.length > 0 && selectedItems.every(item =>
        item.type === 'file' || item.type === 'song' || item.type === 'playlist' ||
        item.type === 'album' || item.type === 'artist' || item.type === 'folder' ||
        item.type === 'recent' ||
        (item.songs && Array.isArray(item.songs)) || item.path
    );

    const isPlaylistSelection = selectionType === 'playlist';

    const canPlay = hasPlayableTypes;

    // Only 'song' and 'file' types (or items with songs) can be favorited
    // Explicitly exclude playlists/albums/artists as favorites logic for them is different or not implemented in batch
    const canFavorite = selectedItems.length > 0 &&
        !isPlaylistSelection &&
        !selectedItemTypes.has('playlist') &&
        !selectedItemTypes.has('folder') &&
        !selectedItemTypes.has('album') &&
        !selectedItemTypes.has('artist') &&
        selectedItems.every(item => {
            if ('isLibraryItem' in item) return !!item.isLibraryItem;
            if ('id' in item && typeof item.id === 'number') return true;
            if (item.type === 'song' || item.type === 'file') return true;
            return false;
        });

    // All types can be added to queue
    const canAddToQueue = hasPlayableTypes;

    // All types can be added to playlist (except playlists themselves might not make sense, but actually we can flatten them)
    // Let's allow adding playlist contents to another playlist
    const canAddToPlaylist = hasPlayableTypes;

    // All types can be deleted
    const canDelete = true;

    // Only remove from playlist when inside a playlist detail
    const canRemoveFromPlaylist = activeOverlay?.type === 'playlist_detail' &&
        !selectedItemTypes.has('playlist') && // Don't remove nested playlist objects? (not possible in UI yet)
        selectedItems.every(i => i.type === 'song' || i.type === 'file'); // Only songs can be removed 


    const isMusicLibraryContext = currentPage === 'library' || activeOverlay?.type === 'artist_detail' || activeOverlay?.type === 'album_detail' || activeOverlay?.type === 'playlist_detail';
    const deleteLabel = isMusicLibraryContext ? '从音乐库删除' : '删除';

    const allActions: ActionItem[] = [];

    if (canPlay) {
        allActions.push({
            id: 'play',
            icon: MdPlayArrow,
            label: '播放',
            onClick: handlePlay,
            variant: 'primary'
        });
    }

    if (canFavorite) {
        allActions.push({
            id: 'favorite',
            icon: isAllFavorited ? IoHeart : IoHeartOutline,
            label: isAllFavorited ? '取消喜爱' : '喜爱',
            onClick: handleBatchFavorite,
            hideLabel: true
        });
    }

    if (canAddToQueue) {
        allActions.push({
            id: 'queue',
            icon: MdPlaylistAdd,
            label: '加入播放队列',
            onClick: handleAddToQueue
        });
    }

    if (canAddToPlaylist) {
        allActions.push({
            id: 'add',
            icon: MdAdd,
            label: '添加到',
            onClick: handleAddToPlaylist
        });
    }

    if (canRemoveFromPlaylist) {
        allActions.push({
            id: 'remove-from-playlist',
            icon: MdPlaylistRemove,
            label: '从播放列表移除',
            onClick: handleBatchRemoveFromPlaylist
        });
    }

    if (canDelete) {
        allActions.push({
            id: 'delete',
            icon: MdDelete,
            label: deleteLabel,
            onClick: () => setShowDeleteConfirm(true),
            variant: 'danger'
        });
    }

    const visibleActions = allActions.slice(0, visibleCount);
    const overflowActions = allActions.slice(visibleCount);

    return (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 max-w-[90vw]" ref={containerRef}>
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title={deleteLabel}
                description={isMusicLibraryContext
                    ? `确定要从音乐库中删除选中的 ${count} 项吗？此操作不可恢复。`
                    : `确定要删除选中的 ${count} 项吗？`
                }
                confirmText="删除"
                type="danger"
            />

            <div className="flex items-center gap-3 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl p-2 pl-3 pr-3 rounded-2xl shadow-2xl border border-neutral-200/50 dark:border-neutral-700/50">
                <button
                    onClick={handleToggleAll}
                    className={`p-1.5 rounded-xl transition-all active:scale-90 flex items-center justify-center ${justClickedAll
                        ? 'text-primary'
                        : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                        }`}
                >
                    {justClickedAll ? <IoCheckbox className="text-[22px]" /> : <IoSquareOutline className="text-[22px]" />}
                </button>

                <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900 dark:text-white whitespace-nowrap text-sm">
                        已选择 {count} 项
                    </span>
                    <button
                        onClick={() => clearSelection()}
                        className="p-1 px-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors shrink-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                    >
                        <IoClose className="text-lg" />
                    </button>
                </div>

                <div className="h-6 w-px bg-neutral-200 dark:bg-white/10 mx-1 shrink-0" />

                <div className="flex items-center gap-0.5" ref={actionsRef}>
                    {visibleActions.map(action => (
                        <ActionButton
                            key={action.id}
                            icon={action.icon}
                            label={action.label}
                            onClick={action.onClick}
                            variant={action.variant}
                            hideLabel={action.hideLabel}
                        />
                    ))}

                    {overflowActions.length > 0 && (
                        <Menu as="div" className="relative">
                            <MenuButton className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors">
                                <MdMoreHoriz className="text-xl text-neutral-600 dark:text-neutral-300" />
                            </MenuButton>
                            <MenuItems
                                anchor={{ to: 'top end', gap: 9 }}
                                className="w-48 origin-bottom-right rounded-xl border border-neutral-200/50 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl p-1 text-sm shadow-2xl dark:border-neutral-700/50 z-[100]"
                            >
                                {overflowActions.map(action => (
                                    <MenuItem key={action.id}>
                                        <button
                                            onClick={action.onClick}
                                            className={`group flex w-full items-center gap-2 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10 ${action.variant === 'danger' ? 'text-red-600' : 'text-neutral-700 dark:text-neutral-200'
                                                }`}
                                        >
                                            <action.icon className="text-lg" />
                                            {action.label}
                                        </button>
                                    </MenuItem>
                                ))}
                            </MenuItems>
                        </Menu>
                    )}
                </div>
            </div>
        </div>
    );
}

function ActionButton({ icon: Icon, label, onClick, variant = 'default', hideLabel = false }: {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'danger' | 'default';
    hideLabel?: boolean;
}) {
    const isPrimary = variant === 'primary';
    const isDanger = variant === 'danger';
    return (
        <button
            onClick={onClick}
            className={`
                flex items-center rounded-xl text-sm font-medium transition-all active:scale-95 whitespace-nowrap
                ${hideLabel ? 'p-2' : 'gap-1.5 px-3 py-2'}
                ${isPrimary
                    ? 'bg-primary text-on-primary shadow-sm hover:brightness-110'
                    : 'hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-200'}
                ${isDanger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : ''}
            `}
        >
            <Icon className="text-lg" title={hideLabel ? label : undefined} />
            {!hideLabel && label}
        </button>
    );
}
