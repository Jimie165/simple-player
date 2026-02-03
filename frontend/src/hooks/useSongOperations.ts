import { useMemo, useCallback } from 'react';
import type { ElementType, ReactNode } from 'react';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlaybackActions } from '@/hooks/usePlaybackActions';
import { useAddToPlaylistStore } from '@/store/useAddToPlaylistStore';
import { useDialogStore } from '@/store/useDialogStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useVideoStore } from '@/store/useVideoStore';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useSelectionStore } from '@/store/useSelectionStore';
import { libraryService } from '@/services/libraryService';
import { fileService } from '@/services/fileService';
import { audioService } from '@/services/audioService';
import { resolveSongsFromItems, getMusicItemId, getMusicItemType } from '@/utils/musicItemUtils';
import type { MusicItem } from '@/utils/musicItemUtils';
import type { SongMetadata } from '@/types';
import {
    MdPlayArrow, MdShuffle, MdFavorite, MdFavoriteBorder, MdDelete,
    MdInfo, MdEdit, MdCheckBoxOutlineBlank, MdCheckBox, MdAlbum, MdPerson, MdPlaylistPlay, MdPlaylistRemove, MdPlaylistAdd, MdRemoveCircleOutline
} from 'react-icons/md';

// 菜单上下文类型
export type MusicMenuContext = 'library' | 'playlist' | 'folder' | 'recent' | 'album_detail' | 'artist_detail' | 'playlist_list' | 'queue' | 'video' | 'other';

// 菜单项数据结构 (兼容 MusicContextMenu)
export interface MenuItemData {
    id: string;
    label: string;
    icon: ElementType;
    onClick: () => void;
    variant?: 'default' | 'danger';
    suffix?: ReactNode;
}

interface UseSongOperationsOptions {
    items: MusicItem[];
    context: MusicMenuContext;
    playlistId?: number; // 如果在 playlists 上下文中，需要提供 playlistId 以便移除

    // 覆盖/额外回调
    onPlay?: () => void;
    onShuffle?: () => void;
    onAddToQueue?: () => void;
    onDelete?: () => void; // 仅当您想覆盖默认删除逻辑时使用
    onEdit?: () => void;
    onSelect?: () => void; // 用于触发选择模式或切换选中状态
    onShowProperties?: () => void; // New: Callback for custom properties dialog
    onNavigate?: () => void; // New: Callback after navigation (e.g., closing player)

    // UI 配置
    hideSelect?: boolean;
    selectText?: string;
    isSelected?: boolean; // 新增：指示当前（单个）项目是否已被选中
}

export function useSongOperations(options: UseSongOperationsOptions) {
    const {
        items, context, playlistId, onSelect,
        hideSelect = false, selectText = '选择', isSelected = false,
        onPlay, onShuffle, onAddToQueue, onDelete, onEdit, onShowProperties, onNavigate
    } = options;

    // Stores
    const { isFavorite, triggerLibraryUpdate, removeFromRecent, toggleFavorite, libraryVersion, favoriteSet } = useLibraryStore();
    const { playList, shufflePlay } = usePlaybackActions();
    const {
        setShuffleState, isShuffling, isPlaying, setIsPlaying,
        setVideoMode, setVideoMetadata, setVideoQueue
    } = usePlayerStore();
    const { open: openAddToPlaylist } = useAddToPlaylistStore();
    const { openDeleteConfirm, openProperties } = useDialogStore();
    const { push } = useNavigationStore();
    const { clearSelection } = useSelectionStore();

    // 派生状态
    const count = items.length;
    const isSingle = count === 1;
    const firstItem = items[0];

    // 检查是否可以收藏 (仅歌曲/文件，主要用于 UI 显示初始状态，批量收藏逻辑在 handleFavorite 中处理)
    // 注意：如果是批量操作，我们通常不显示"已收藏"状态，除非全部都已收藏。
    // 但是为了 UI 简单，我们只在单选时检查 isFavorite。
    // 检查是否可以收藏 (仅歌曲/文件)
    const singleIsFavorite = useMemo(() => {
        if (!isSingle || !firstItem) return false;
        // 专门针对 SongMetadata 或带有完整 ID/Path 的项目进行检查
        return isFavorite(firstItem as any);
    }, [isSingle, firstItem, isFavorite, libraryVersion, favoriteSet]); // 监听 favoriteSet 确保状态同步

    const isAllFavorited = useMemo(() => {
        if (!items.length) return false;
        if (isSingle) return singleIsFavorite;
        return items.every(i => isFavorite(i as any));
    }, [items, isSingle, singleIsFavorite, isFavorite, libraryVersion, favoriteSet]);

    // --- Actions ---

    // 1. 播放
    const handlePlay = useCallback(async () => {
        if (onPlay) {
            onPlay();
            return;
        }

        const songs = await resolveSongsFromItems(items);
        if (songs.length === 0) return;

        if (isShuffling) setShuffleState(false);

        // 如果上下文是视频，使用视频播放器
        if (context === 'video') {
            setVideoQueue(songs, 0);
            setVideoMetadata(songs[0]);
            setVideoMode(true);

            // 如果音频正在播放，暂停它
            if (isPlaying) {
                await audioService.pause();
                setIsPlaying(false);
            }
        } else {
            await playList({
                songs,
                startIndex: 0,
                options: { restartIfCurrent: true }
            });
        }
    }, [items, onPlay, playList, isShuffling, setShuffleState, context, isPlaying, setIsPlaying, setVideoQueue, setVideoMetadata, setVideoMode]);

    // 2. 随机播放
    const handleShufflePlay = useCallback(async () => {
        if (onShuffle) {
            onShuffle();
            return;
        }
        const songs = await resolveSongsFromItems(items);
        if (songs.length === 0) return;

        await shufflePlay({
            songs,
            options: { restartIfCurrent: true }
        });
    }, [items, onShuffle, shufflePlay]);

    // 3. 加入队列 (播放下一首)
    const handleAddToQueue = useCallback(async () => {
        if (onAddToQueue) {
            onAddToQueue();
            return;
        }
        const songs = await resolveSongsFromItems(items);
        if (songs.length === 0) return;

        // Use addMultipleToNext with asQueueItem=true
        // This will append them to the user queue block.
        useLibraryStore.getState().addMultipleToNext(songs, true);
        clearSelection();
    }, [items, onAddToQueue, clearSelection]);

    // 4. 添加到播放列表
    const handleAddToPlaylist = useCallback(async () => {
        const songs = await resolveSongsFromItems(items);
        if (songs.length > 0) {
            openAddToPlaylist(songs);
        }
    }, [items, openAddToPlaylist]);

    // 5. 收藏 (Smart Batch)
    const handleFavorite = useCallback(async () => {
        const songs = await resolveSongsFromItems(items);
        if (songs.length === 0) return;

        // Check if ALL are currently favorites
        // We check realtime status via store helper if possible
        const allAreFav = songs.every(s => isFavorite(s as any));

        // If all are favorite, we want to UN-favorite them.
        // If not all are favorite (mixed or none), we want to FAVORITE them.
        const targetIsFavorite = !allAreFav;

        for (const s of songs) {
            const currentFav = isFavorite(s);
            if (currentFav !== targetIsFavorite) {
                await toggleFavorite(s as SongMetadata);
            }
        }
        triggerLibraryUpdate();
    }, [items, isFavorite, triggerLibraryUpdate]);

    // 5. 删除或从音乐库删除
    const handleDeleteFromLibrary = useCallback(async () => {
        if (items.length === 0) return;
        openDeleteConfirm(
            items,
            async () => {
                clearSelection();

                // Video: prefer direct id/path mapping to avoid missing thumbnails
                if (context === 'video') {
                    const videos = useVideoStore.getState().videos;
                    const pathToId = new Map(videos.map(v => [v.path, v.id] as const));
                    const ids = items.map((item: any) => {
                        if (typeof item?.id === 'number') return item.id;
                        const path = item?.path;
                        if (path && pathToId.has(path)) return pathToId.get(path);
                        return undefined;
                    }).filter((id): id is number => typeof id === 'number');

                    if (ids.length > 0) {
                        await libraryService.batchDeleteVideos(ids);
                        useVideoStore.getState().fetchVideos();
                    }
                } else {
                    const songsToDelete = await resolveSongsFromItems(items);
                    const ids = songsToDelete.map(s => s.id).filter(id => typeof id === 'number') as number[];
                    if (ids.length > 0) {
                        await libraryService.batchDeleteSongs(ids);
                    }
                }

                // Remove from Recent History
                items.forEach(item => {
                    const id = getMusicItemId(item);
                    if (id) removeFromRecent(id);
                });

                triggerLibraryUpdate();
            },
            context === 'video'
                ? `确定要从视频库中删除选中的 ${count} 项吗？此操作不会删除本地文件。`
                : `确定要从音乐库中删除选中的 ${count} 项吗？此操作不会删除本地文件。`,
            context === 'video' ? '从视频库删除' : '从音乐库删除',
            '删除'
        );
    }, [items, count, openDeleteConfirm, triggerLibraryUpdate, clearSelection, removeFromRecent, context]);

    // 5. 删除或从播放列表移除
    const handleDeleteOrRemove = useCallback(async () => {
        if (items.length === 0) return;

        // 保护：禁止删除“喜爱歌曲”播放列表项
        const hasFavorites = items.some(i => (i as any).id === 'favorites' || (i as any).id === 'playlist:favorites');
        if (hasFavorites && context === 'playlist_list') return;

        if (onDelete) {
            onDelete();
            return;
        }

        // 区分 Context
        if (context === 'playlist_list') {
            // 删除整个播放列表
            openDeleteConfirm(
                items,
                async () => {
                    clearSelection();
                    for (const item of items) {
                        const id = (item as any).id;
                        if (typeof id === 'number') {
                            await libraryService.deletePlaylist(id);
                        }
                    }
                    triggerLibraryUpdate();
                },
                `确定要删除选中的 ${count} 个播放列表吗？`,
                '删除播放列表',
                '删除'
            );
        } else if (context === 'playlist' && playlistId) {
            // 移除出播放列表
            openDeleteConfirm(
                items,
                async () => {
                    clearSelection();
                    // 优先使用 unique_id (playlist_entry_id) 进行精确移除
                    const uniqueIds = items.map(i => (i as any).unique_id).filter(id => typeof id === 'number') as number[];

                    if (uniqueIds.length > 0) {
                        try {
                            await libraryService.batchRemovePlaylistItems(playlistId, uniqueIds);
                            triggerLibraryUpdate();
                        } catch (e) {
                            console.error('Failed to remove playlist items', e);
                        }
                    } else {
                        // Fallback: 使用 song_id 移除 (会移除所有重复项)
                        const songIds = items.map(i => (i as any).id).filter(id => typeof id === 'number') as number[];
                        if (songIds.length > 0) {
                            try {
                                await libraryService.batchRemoveFromPlaylist(playlistId, songIds);
                                triggerLibraryUpdate();
                            } catch (e) {
                                console.error('Failed to remove from playlist', e);
                            }
                        }
                    }
                },
                `确定要从播放列表移除选中的 ${count} 项吗？`,
                '移除',
                '移除'
            );
        } else if (context === 'recent') {
            // 移除最近记录
            openDeleteConfirm(
                items,
                () => {
                    clearSelection();
                    items.forEach(item => {
                        const id = getMusicItemId(item);
                        if (id) removeFromRecent(id);
                    });
                },
                `确定要删除选中的 ${count} 条播放记录吗？`,
                '删除记录',
                '删除'
            );
        } else if (context !== 'queue') {
            // 默认：从库中删除 (仅对 Song / Album / Artist 有效，对 File/Folder 暂时视为 Recent? 不，File 可以删库)
            // 我们约定：在 Library Context 下，都是删库引用。
            // Context 'queue' should ideally NOT auto-delete-from-library unless onDelete is passed.
            handleDeleteFromLibrary();
        }
    }, [context, playlistId, items, count, onDelete, openDeleteConfirm, triggerLibraryUpdate, removeFromRecent, handleDeleteFromLibrary, clearSelection]);

    const handleShowAlbum = useCallback(async () => {
        if (!isSingle) return;
        const item = firstItem as any;
        const type = getMusicItemType(firstItem);

        let albumName: string | undefined;
        if (item?.album) {
            albumName = item.album;
        } else if (type === 'album') {
            albumName = item?.name || item?.title;
        }

        if (!albumName && item?.path) {
            const songs = await resolveSongsFromItems([firstItem]);
            if (songs.length > 0) albumName = songs[0].album;
        }

        if (albumName) {
            clearSelection();
            push({
                type: 'album_detail', // Force full data structure to prevent crash in Overlay
                data: {
                    name: albumName,
                    artist: item?.artist,
                    songs: [],
                    cover: item?.cover || null,
                    count: 0
                }
            });
            onNavigate?.(); // Close player or navigate
        }
    }, [isSingle, firstItem, push, clearSelection, onNavigate]);

    const handleShowArtist = useCallback(() => {
        if (!isSingle) return;
        const item = firstItem as any;
        const type = getMusicItemType(firstItem);
        const artist = item?.artist || (type === 'artist' ? item?.name : undefined);
        if (artist) {
            clearSelection();
            push({ type: 'artist_detail', data: { name: artist, count: 0, albumCount: 0, songs: [], cover: null } });
            onNavigate?.(); // Close player or navigate
        }
    }, [isSingle, firstItem, push, clearSelection, onNavigate]);



    const handleProperties = useCallback(async () => {
        if (onShowProperties) {
            onShowProperties();
            return;
        }

        if (!isSingle || !firstItem) return;
        // 如果是文件，获取该文件的元数据
        let songToCheck = firstItem as SongMetadata;
        const item = firstItem as any;
        // 如果是 RecentItem (file类型)
        if (getMusicItemType(firstItem) === 'file' && item.path) {
            try {
                const meta = await fileService.getMetadata(item.path);
                if (meta) songToCheck = meta;
            } catch { }
        }
        openProperties(songToCheck);
    }, [isSingle, firstItem, openProperties, onShowProperties]);


    // --- Menu Generation ---
    const menuItems = useMemo(() => {
        const groups: MenuItemData[][] = [];

        // Group 1: Playback
        const group1: MenuItemData[] = [];
        group1.push({ id: 'play', label: '播放', icon: MdPlayArrow, onClick: handlePlay });
        const firstType = firstItem ? getMusicItemType(firstItem) : 'song';
        const allowShuffle = !isSingle || ['playlist', 'album', 'artist', 'folder'].includes(firstType);
        if (allowShuffle) {
            group1.push({ id: 'shuffle', label: '随机播放', icon: MdShuffle, onClick: handleShufflePlay });
        }
        group1.push({ id: 'queue', label: '加入播放队列', icon: MdPlaylistPlay, onClick: handleAddToQueue });

        // Add to Playlist Rule:
        // - "If it is an opened folder, then it should be one less 'Add to' than Playlist"
        // - Interpreted as: Hide "Add to Playlist" in Folder context.
        // - Also hide if items are not in library (no numeric ID) AND not marked as library items (RecentItem.isLibraryItem)
        // - UPDATE: Allow Album/Artist/Playlist objects (from grid views) as they resolve to library songs.
        const canAddToPlaylist = items.every(i => {
            const t = getMusicItemType(i);
            return (
                typeof (i as any).id === 'number' ||
                (i as any).isLibraryItem === true ||
                t === 'album' ||
                t === 'artist' ||
                t === 'playlist'
            );
        });

        if (context !== 'folder' && canAddToPlaylist) {
            group1.push({ id: 'add-to', label: '添加到播放列表...', icon: MdPlaylistAdd, onClick: handleAddToPlaylist });
        }

        // Favorite (Allow mixed song/file selection)
        // Check if all items are valid types for favoriting (song or file)
        const canFavorite = items.length > 0 && items.every(i => {
            const t = getMusicItemType(i);
            return t === 'song' || t === 'file';
        });

        if (canFavorite) {
            // Logic for label/icon:
            // If Single: use singleIsFavorite status
            // If Multi: default to "Favorite" (Heart Outline) unless we want complex mixed state?
            // User requested: "Don't remove favorite option for multi-select songs".
            // Let's use singleIsFavorite for single, and for multi, maybe check if ALL are favorite?
            // For now, let's keep it simple: simpler logic in hook, UI decides icon?
            // No, Hook provides icon.
            // Let's use "Favorite" (Outline) for multi, action is Toggle (which executes per item).
            // Actually, `handleFavorite` does toggle. 
            // If we want "Add to Favorites" behavior for batch, strict toggle might be weird if mixed.
            // But let's stick to current handleFavorite logic (toggle each).

            // Icon logic: if single, show actual status. If multi, show "Favorite" (generic) or maybe checks all?
            // "only remove if mixed types" -> implied "show if all songs".

            // Only show Favorite if items have IDs (are in library) or marked as library item
            if (canAddToPlaylist) {
                const isFav = isAllFavorited;

                group1.push({
                    id: 'favorite',
                    label: isFav ? '取消喜爱' : '喜爱',
                    icon: isFav ? MdFavorite : MdFavoriteBorder,
                    onClick: handleFavorite
                });
            }
        }
        groups.push(group1);

        // Group 2: Navigation / Info / Edit
        const group2: MenuItemData[] = [];
        if (isSingle) {
            const type = firstType;
            const item: any = firstItem;

            let showProperties = true;
            if (context === 'folder' && type === 'folder') showProperties = false;

            // Allow properties if standard types OR if onShowProperties is provided (e.g. for Video)
            const allowPropertiesType = ['song', 'file', 'video'].includes(type) || !!onShowProperties;

            if (showProperties && allowPropertiesType && type !== 'playlist') {
                group2.push({ id: 'properties', label: '属性', icon: MdInfo, onClick: handleProperties });
            }

            const showAlbum = context !== 'album_detail';
            const showArtist = context !== 'artist_detail';

            const albumValue = item?.album || (type === 'album' ? (item?.name || item?.title) : undefined);
            const artistValue = item?.artist || (type === 'artist' ? item?.name : undefined) || (type === 'album' ? item?.artist : undefined);

            const isSongFile = type === 'song' || type === 'file';

            if (showAlbum && (albumValue || isSongFile)) {
                // Only show Go to Album if item has ID (is in library) OR if it is an Album/Artist object from the library grid
                if (typeof (item as any).id === 'number' || item.isLibraryItem === true || type === 'album' || type === 'artist') {
                    group2.push({ id: 'album', label: '前往专辑', icon: MdAlbum, onClick: handleShowAlbum });
                }
            }
            if (showArtist && (artistValue || isSongFile)) {
                // Only show Go to Artist if item has ID (is in library) OR if it is an Album/Artist object from the library grid
                if (typeof (item as any).id === 'number' || item.isLibraryItem === true || type === 'album' || type === 'artist') {
                    group2.push({ id: 'artist', label: '前往艺人', icon: MdPerson, onClick: handleShowArtist });
                }
            }
        }

        if (onEdit) {
            group2.push({ id: 'edit', label: '编辑信息', icon: MdEdit, onClick: onEdit });
        }

        if (group2.length > 0) groups.push(group2);

        // Group 3: Delete / Remove
        const group3: MenuItemData[] = [];
        if (context === 'playlist') {
            const label = count > 1 ? `从播放列表移除 ${count} 项` : '从播放列表移除';
            group3.push({ id: 'remove', label, icon: MdPlaylistRemove, onClick: handleDeleteOrRemove, variant: 'default' });

            // 增加从音乐库中删除
            const deleteLabel = count > 1 ? `从音乐库删除 ${count} 项` : '从音乐库删除';
            group3.push({ id: 'delete', label: deleteLabel, icon: MdDelete, onClick: handleDeleteFromLibrary, variant: 'danger' });
        } else if (context === 'queue') {
            // Queue: Show Remove from Queue
            const label = count > 1 ? `从播放队列移除 ${count} 项` : '从播放队列移除';
            // Context 'queue' typically implies we are editing the temporary queue. 
            // We use handleDeleteOrRemove which will call onDelete() if provided (AppleMusicQueue should provide it).
            group3.push({ id: 'remove_queue', label, icon: MdRemoveCircleOutline, onClick: handleDeleteOrRemove, variant: 'default' });
        } else {
            // Delete
            const suffix = context === 'video' ? '视频库' : '音乐库';
            let label = count > 1 ? `从${suffix}删除 ${count} 项` : `从${suffix}删除`;
            if (context === 'recent') {
                label = count > 1 ? `删除 ${count} 条记录` : '删除记录';
            } else if (context === 'playlist_list') {
                label = count > 1 ? `删除 ${count} 个播放列表` : '删除播放列表';
            }

            group3.push({ id: 'delete', label, icon: MdDelete, onClick: handleDeleteOrRemove, variant: 'danger' });
        }
        if (group3.length > 0) groups.push(group3);

        // Group 4: Select
        if (!hideSelect && onSelect) {
            const label = isSelected ? '取消选择' : selectText;
            const icon = isSelected ? MdCheckBox : MdCheckBoxOutlineBlank;
            groups.push([{ id: 'select', label, icon, onClick: onSelect }]);
        }

        // Final filter for video context (Video Library)
        if (context === 'video') {
            const allowedIds = ['play', 'properties', 'delete', 'select'];
            return groups.map(group =>
                group.filter(item => allowedIds.includes(item.id))
            ).filter(group => group.length > 0);
        }

        // Logic for Home Page (Recent) - Video Support
        if (context === 'recent') {
            // Helper to check if item is video
            const isVideoItem = (item: MusicItem) => {
                const t = getMusicItemType(item);
                if (t === 'video') return true;
                if (t === 'file' && (item as any).path) {
                    const ext = (item as any).path.split('.').pop()?.toLowerCase() || '';
                    return ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'm4v', '3gp', 'ts', 'rmvb', 'wmv', 'asf', 'ogv'].includes(ext);
                }
                return false;
            };

            const hasVideo = items.some(isVideoItem);

            if (hasVideo) {
                const allVideos = items.every(isVideoItem);

                if (allVideos) {
                    // All videos: same as Video Library
                    const allowedIds = ['play', 'properties', 'delete', 'select'];
                    return groups.map(group =>
                        group.filter(item => allowedIds.includes(item.id))
                    ).filter(group => group.length > 0);
                } else {
                    // Mixed (contains video + others): Only allow Delete and Select
                    const allowedIds = ['delete', 'select'];
                    return groups.map(group =>
                        group.filter(item => allowedIds.includes(item.id))
                    ).filter(group => group.length > 0);
                }
            }
        }

        // 最终过滤：如果是“喜爱歌曲”且在播放列表根视图，隐藏整个删除组
        if (context === 'playlist_list' && items.some(i => (i as any).id === 'favorites' || (i as any).id === 'playlist:favorites')) {
            return groups.filter(g => !g.some(m => m.id === 'delete'));
        }
        return groups;
    }, [
        handlePlay, handleShufflePlay, handleAddToQueue, handleAddToPlaylist, handleFavorite,
        handleProperties, handleShowAlbum, handleShowArtist, handleDeleteOrRemove, onSelect, onEdit,
        isSingle, singleIsFavorite, isAllFavorited, firstItem, context, hideSelect, selectText, isSelected, items
    ]);

    return {
        menuItems,
        handlePlay,
        handleShufflePlay,
        handleAddToQueue,
        handleAddToPlaylist,
        handleFavorite,
        handleDeleteOrRemove,
        handleProperties
    };
}
