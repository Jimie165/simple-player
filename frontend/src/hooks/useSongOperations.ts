import { useMemo, useCallback } from 'react';
import type { ElementType, ReactNode } from 'react';
import { useLibraryStore } from '../store/useLibraryStore';
import { usePlaybackActions } from '../hooks/usePlaybackActions';
import { useAddToPlaylistStore } from '../store/useAddToPlaylistStore';
import { useDialogStore } from '../store/useDialogStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useNavigationStore } from '../store/useNavigationStore';
import { libraryService } from '../services/libraryService';
import { fileService } from '../services/fileService';
import { resolveSongsFromItems, getMusicItemId, getMusicItemType } from '../utils/musicItemUtils';
import type { MusicItem } from '../utils/musicItemUtils';
import type { SongMetadata } from '../types';
import {
    MdPlayArrow, MdShuffle, MdAdd, MdFavorite, MdFavoriteBorder, MdDelete,
    MdInfo, MdEdit, MdCheckBoxOutlineBlank, MdCheckBox, MdAlbum, MdPerson, MdPlaylistPlay, MdPlaylistRemove
} from 'react-icons/md';

// 菜单上下文类型
export type MusicMenuContext = 'library' | 'playlist' | 'folder' | 'recent' | 'album_detail' | 'artist_detail' | 'playlist_list' | 'other';

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

    // UI 配置
    hideSelect?: boolean;
    selectText?: string;
    isSelected?: boolean; // 新增：指示当前（单个）项目是否已被选中
}

export function useSongOperations(options: UseSongOperationsOptions) {
    const {
        items, context, playlistId, onSelect,
        hideSelect = false, selectText = '选择', isSelected = false,
        onPlay, onShuffle, onAddToQueue, onDelete, onEdit
    } = options;

    // Stores
    const { addToNext, isFavorite, triggerLibraryUpdate, removeFromRecent, toggleFavorite, libraryVersion, favoriteSet } = useLibraryStore();
    const { playList, shufflePlay } = usePlaybackActions();
    const { setShuffleState, isShuffling } = usePlayerStore();
    const { open: openAddToPlaylist } = useAddToPlaylistStore();
    const { openDeleteConfirm, openProperties } = useDialogStore();
    const { push } = useNavigationStore();

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

        await playList({
            songs,
            startIndex: 0,
            options: { restartIfCurrent: true }
        });
    }, [items, onPlay, playList, isShuffling, setShuffleState]);

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
        // 倒序加入，保持原本顺序在下一首逻辑中正确
        [...songs].reverse().forEach(s => addToNext(s));
    }, [items, onAddToQueue, addToNext]);

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
        const allAreFav = songs.every(s => {
            if (s.id && typeof s.id === 'number') {
                return isFavorite(s);
            }
            return !!(s as any).is_favorite;
        });

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
                    const songIds = items.map(i => (i as any).id).filter(id => typeof id === 'number') as number[];
                    if (songIds.length > 0) {
                        try {
                            await libraryService.batchRemoveFromPlaylist(playlistId, songIds);
                            triggerLibraryUpdate();
                        } catch (e) {
                            console.error('Failed to remove from playlist', e);
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
                    items.forEach(item => {
                        const id = getMusicItemId(item);
                        if (id) removeFromRecent(id);
                    });
                },
                `确定要删除选中的 ${count} 条播放记录吗？`,
                '删除记录',
                '删除'
            );
        } else {
            // 默认：从库中删除 (仅对 Song / Album / Artist 有效，对 File/Folder 暂时视为 Recent? 不，File 可以删库)
            // 我们约定：在 Library Context 下，都是删库引用。
            openDeleteConfirm(
                items,
                async () => {
                    // 解析出所有需要删除的 Song IDs
                    // 如果选中了 Album/Artist，需要找出其下的 Songs
                    const songsToDelete = await resolveSongsFromItems(items);
                    const ids = songsToDelete.map(s => s.id).filter(id => typeof id === 'number') as number[];

                    if (ids.length > 0) {
                        await libraryService.batchDeleteSongs(ids);
                        triggerLibraryUpdate();
                    }

                    // 如果也是 Recent Items (比如在主页删除)，也要清理 Recent
                    items.forEach(item => {
                        // 简单的清理 Recent
                        if ((item as any).lastPlayed) {
                            removeFromRecent(getMusicItemId(item));
                        }
                    });
                },
                `确定要从音乐库中删除选中的 ${count} 项吗？此操作不会删除本地文件。`,
                '从音乐库删除',
                '删除'
            );
        }
    }, [context, playlistId, items, count, onDelete, openDeleteConfirm, triggerLibraryUpdate, removeFromRecent]);

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
        }
    }, [isSingle, firstItem, push]);

    const handleShowArtist = useCallback(() => {
        if (!isSingle) return;
        const item = firstItem as any;
        const type = getMusicItemType(firstItem);
        const artist = item?.artist || (type === 'artist' ? item?.name : undefined);
        if (artist) {
            push({ type: 'artist_detail', data: { name: artist, count: 0, albumCount: 0, songs: [], cover: null } });
        }
    }, [isSingle, firstItem, push]);



    const handleProperties = useCallback(async () => {
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
    }, [isSingle, firstItem, openProperties]);


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
        if (context !== 'folder') {
            group1.push({ id: 'add-to', label: '添加到', icon: MdAdd, onClick: handleAddToPlaylist });
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

            const isFav = isAllFavorited;

            group1.push({
                id: 'favorite',
                label: isFav ? '取消喜爱' : '喜爱',
                icon: isFav ? MdFavorite : MdFavoriteBorder,
                onClick: handleFavorite
            });
        }
        groups.push(group1);

        // Group 2: Navigation / Info / Edit
        const group2: MenuItemData[] = [];
        if (isSingle) {
            const type = firstType;
            const item: any = firstItem;

            let showProperties = true;
            if (context === 'playlist' || context === 'playlist_list') showProperties = false;
            else if (context === 'folder' && type === 'folder') showProperties = false;

            if (showProperties && ['song', 'file'].includes(type) && type !== 'playlist') {
                group2.push({ id: 'properties', label: '属性', icon: MdInfo, onClick: handleProperties });
            }

            const showAlbum = context !== 'playlist_list' && context !== 'album_detail';
            const showArtist = context !== 'playlist_list' && context !== 'artist_detail';

            const albumValue = item?.album || (type === 'album' ? (item?.name || item?.title) : undefined);
            const artistValue = item?.artist || (type === 'artist' ? item?.name : undefined) || (type === 'album' ? item?.artist : undefined);

            if (showAlbum && albumValue) {
                group2.push({ id: 'album', label: '显示专辑', icon: MdAlbum, onClick: handleShowAlbum });
            }
            if (showArtist && artistValue) {
                group2.push({ id: 'artist', label: '显示艺人', icon: MdPerson, onClick: handleShowArtist });
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
        } else {
            // Delete
            let label = count > 1 ? `从音乐库删除 ${count} 项` : '从音乐库删除';
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

        // 最终过滤：如果是“喜爱歌曲”且在播放列表根视图，隐藏整个删除组
        if (context === 'playlist_list' && items.some(i => (i as any).id === 'favorites' || (i as any).id === 'playlist:favorites')) {
            return groups.filter(g => !g.some(m => m.id === 'delete'));
        }

        return groups;
    }, [
        handlePlay, handleShufflePlay, handleAddToQueue, handleAddToPlaylist, handleFavorite,
        handleProperties, handleShowAlbum, handleShowArtist, handleDeleteOrRemove, onSelect, onEdit,
        isSingle, singleIsFavorite, isAllFavorited, firstItem, context, hideSelect, selectText
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
