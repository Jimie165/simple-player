import { useMemo, useCallback } from 'react';
import type { ElementType, ReactNode } from 'react';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { useAddToPlaylistStore } from '@/store/useAddToPlaylistStore';
import { useDialogStore } from '@/store/useDialogStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useSelectionStore } from '@/store/useSelectionStore';
import { audioService } from '@/services/audioService';
import { resolveSongsFromItems, getMusicItemType } from '@/utils/musicItemUtils';
import type { MusicItem } from '@/utils/musicItemUtils';
import type { SongMetadata } from '@/types';
import { handleDeleteFromLibraryAction, handleDeleteOrRemoveAction } from '@/hooks/menu/menuActions';
import { filterMenuGroupsByContext } from '@/hooks/menu/useMultiSelectMenuItems';
import { buildSongMenuGroups } from '@/hooks/menu/songMenuFactory';
import { handlePropertiesAction, handleShowAlbumAction, handleShowArtistAction } from '@/hooks/menu/songInfoActions';

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

function hasLibraryIdentity(item: MusicItem) {
    const record = item as unknown as Record<string, unknown>;
    return typeof record.id === 'number' || record.isLibraryItem === true;
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
    const { isFavorite, triggerLibraryUpdate, triggerPlaylistUpdate, removeFromRecent, toggleFavorite } = useLibraryStore();
    const { playList, shufflePlay } = usePlaybackActions();
    const {
        setShuffleState, isShuffling, isPlaying, setIsPlaying,
        setVideoMode, setVideoMetadata, setVideoQueue
    } = usePlayerStore();
    const { open: openAddToPlaylist } = useAddToPlaylistStore();
    const { openDeleteConfirm, openProperties, openEditSong } = useDialogStore();
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
        return isFavorite(firstItem as SongMetadata);
    }, [isSingle, firstItem, isFavorite]); // 监听 favoriteSet 确保状态同步

    const isAllFavorited = useMemo(() => {
        if (!items.length) return false;
        if (isSingle) return singleIsFavorite;
        return items.every(i => isFavorite(i as SongMetadata));
    }, [items, isSingle, singleIsFavorite, isFavorite]);

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
        const allAreFav = songs.every(s => isFavorite(s));

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
    }, [items, isFavorite, toggleFavorite, triggerLibraryUpdate]);

    // 5. 删除或从音乐库删除
    const handleDeleteFromLibrary = useCallback(async () => {
        handleDeleteFromLibraryAction({
            items,
            count,
            context,
            clearSelection,
            openDeleteConfirm,
            removeFromRecent,
            triggerLibraryUpdate,
            triggerPlaylistUpdate,
        });
    }, [items, count, context, clearSelection, openDeleteConfirm, removeFromRecent, triggerLibraryUpdate, triggerPlaylistUpdate]);

    // 5. 删除或从播放列表移除
    const handleDeleteOrRemove = useCallback(async () => {
        handleDeleteOrRemoveAction({
            items,
            count,
            context,
            playlistId,
            onDelete,
            clearSelection,
            openDeleteConfirm,
            triggerLibraryUpdate,
            triggerPlaylistUpdate,
            removeFromRecent,
            handleDeleteFromLibrary,
        });
    }, [items, count, context, playlistId, onDelete, clearSelection, openDeleteConfirm, triggerLibraryUpdate, triggerPlaylistUpdate, removeFromRecent, handleDeleteFromLibrary]);

    const handleShowAlbum = useCallback(async () => {
        await handleShowAlbumAction({
            isSingle,
            firstItem,
            clearSelection,
            push,
            onNavigate,
        });
    }, [isSingle, firstItem, push, clearSelection, onNavigate]);

    const handleShowArtist = useCallback(() => {
        handleShowArtistAction({
            isSingle,
            firstItem,
            clearSelection,
            push,
            onNavigate,
        });
    }, [isSingle, firstItem, push, clearSelection, onNavigate]);



    const handleProperties = useCallback(async () => {
        await handlePropertiesAction({
            onShowProperties,
            isSingle,
            firstItem,
            openProperties,
        });
    }, [isSingle, firstItem, openProperties, onShowProperties]);

    const handleEdit = useCallback(async () => {
        if (onEdit) {
            onEdit();
            return;
        }
        if (!isSingle || !firstItem) return;

        const type = getMusicItemType(firstItem);
        if (type !== 'song' && type !== 'file') return;

        const songs = await resolveSongsFromItems([firstItem]);
        const song = songs.find(s => typeof s.id === 'number');
        if (song) openEditSong(song);
    }, [firstItem, isSingle, onEdit, openEditSong]);


    // --- Menu Generation ---
    const menuItems = useMemo(() => {
        const editType = firstItem ? getMusicItemType(firstItem) : '';
        const canDefaultEdit = isSingle && (editType === 'song' || editType === 'file') && context !== 'video';
        const canAddToPlaylist = items.every(i => {
            const t = getMusicItemType(i);
            return (
                hasLibraryIdentity(i) ||
                t === 'album' ||
                t === 'artist' ||
                t === 'playlist'
            );
        });

        const groups = buildSongMenuGroups({
            items,
            context,
            count,
            isSingle,
            firstItem,
            hideSelect,
            selectText,
            isSelected,
            onSelect,
            onEdit: onEdit ?? (canDefaultEdit ? handleEdit : undefined),
            onShowProperties,
            canAddToPlaylist,
            isAllFavorited,
            handlePlay,
            handleShufflePlay,
            handleAddToQueue,
            handleAddToPlaylist,
            handleFavorite,
            handleProperties,
            handleShowAlbum,
            handleShowArtist,
            handleDeleteOrRemove,
            handleDeleteFromLibrary,
        });

        return filterMenuGroupsByContext(groups as MenuItemData[][], context, items);
    }, [
        handlePlay, handleShufflePlay, handleAddToQueue, handleAddToPlaylist, handleFavorite,
        handleProperties, handleShowAlbum, handleShowArtist, handleDeleteOrRemove, handleEdit, onSelect, onEdit,
        isSingle, isAllFavorited, firstItem, context, hideSelect, selectText, isSelected, items,
        onShowProperties, count, handleDeleteFromLibrary
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
