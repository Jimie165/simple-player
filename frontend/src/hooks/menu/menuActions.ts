import { libraryService } from '@/services/libraryService';
import { resolveSongsFromItems, getMusicItemId } from '@/utils/musicItemUtils';
import type { MusicItem } from '@/utils/musicItemUtils';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useVideoStore } from '@/store/useVideoStore';

interface DeleteFromLibraryParams {
    items: MusicItem[];
    count: number;
    context: 'video' | string;
    clearSelection: () => void;
    openDeleteConfirm: (
        items: MusicItem[],
        onConfirm: () => Promise<void> | void,
        message: string,
        title: string,
        confirmText: string
    ) => void;
    removeFromRecent: (id: string) => void;
    triggerLibraryUpdate: () => void;
    triggerPlaylistUpdate: () => void;
}

export function handleDeleteFromLibraryAction({
    items,
    count,
    context,
    clearSelection,
    openDeleteConfirm,
    removeFromRecent,
    triggerLibraryUpdate,
    triggerPlaylistUpdate,
}: DeleteFromLibraryParams) {
    if (items.length === 0) return;

    openDeleteConfirm(
        items,
        async () => {
            clearSelection();

            if (context === 'video') {
                const videos = useVideoStore.getState().videos;
                const pathToId = new Map(videos.map(video => [video.path, video.id] as const));
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
                const ids = songsToDelete.map(song => song.id).filter(id => typeof id === 'number') as number[];
                const store = useLibraryStore.getState();
                if (ids.length > 0) {
                    store.markSongsAsOptimisticallyDeleted(ids);
                }
                if (ids.length > 0) {
                    try {
                        await libraryService.batchDeleteSongs(ids);
                        songsToDelete.forEach((song) => {
                            if (song.path) {
                                store.removeSongFromPlaylist(song.path);
                            }
                        });
                        window.setTimeout(() => {
                            useLibraryStore.getState().clearOptimisticallyDeletedSongs(ids);
                        }, 1500);
                    } catch (error) {
                        store.clearOptimisticallyDeletedSongs(ids);
                        throw error;
                    }
                }
            }

            items.forEach(item => {
                const id = getMusicItemId(item);
                if (id) removeFromRecent(id);
            });

            triggerLibraryUpdate();
            triggerPlaylistUpdate();
        },
        context === 'video'
            ? `确定要从视频库中删除选中的 ${count} 项吗？此操作不会删除本地文件。`
            : `确定要从音乐库中删除选中的 ${count} 项吗？此操作不会删除本地文件。`,
        context === 'video' ? '从视频库删除' : '从音乐库删除',
        '删除'
    );
}

interface DeleteOrRemoveParams {
    items: MusicItem[];
    count: number;
    context: string;
    playlistId?: number;
    onDelete?: () => void;
    clearSelection: () => void;
    openDeleteConfirm: (
        items: MusicItem[],
        onConfirm: () => Promise<void> | void,
        message: string,
        title: string,
        confirmText: string
    ) => void;
    triggerLibraryUpdate: () => void;
    triggerPlaylistUpdate: () => void;
    removeFromRecent: (id: string) => void;
    handleDeleteFromLibrary: () => void;
}

export function handleDeleteOrRemoveAction({
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
}: DeleteOrRemoveParams) {
    if (items.length === 0) return;

    const hasFavorites = items.some(item => (item as any).id === 'favorites' || (item as any).id === 'playlist:favorites');
    if (hasFavorites && context === 'playlist_list') return;

    if (onDelete) {
        onDelete();
        return;
    }

    if (context === 'playlist_list') {
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
                triggerPlaylistUpdate();
            },
            `确定要删除选中的 ${count} 个播放列表吗？`,
            '删除播放列表',
            '删除'
        );
    } else if (context === 'playlist' && playlistId) {
        openDeleteConfirm(
            items,
            async () => {
                clearSelection();
                const uniqueIds = items.map(item => (item as any).unique_id).filter(id => typeof id === 'number') as number[];

                if (uniqueIds.length > 0) {
                    try {
                        await libraryService.batchRemovePlaylistItems(playlistId, uniqueIds);
                        triggerLibraryUpdate();
                        triggerPlaylistUpdate();
                    } catch (e) {
                        console.error('Failed to remove playlist items', e);
                    }
                } else {
                    const songIds = items.map(item => (item as any).id).filter(id => typeof id === 'number') as number[];
                    if (songIds.length > 0) {
                        try {
                            await libraryService.batchRemoveFromPlaylist(playlistId, songIds);
                            triggerLibraryUpdate();
                            triggerPlaylistUpdate();
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
        handleDeleteFromLibrary();
    }
}
