import toast from 'react-hot-toast';
import { libraryService } from '@/services/libraryService';
import { useDialogStore } from '@/store/useDialogStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import type { SongMetadata } from '@/types';

// Only a confirmed missing file should offer removal, not other playback errors.
export function handleMissingSong(error: unknown, song: SongMetadata): boolean {
    if (error !== 'AUDIO_FILE_NOT_FOUND') return false;

    const canRemove = typeof song.id === 'number';
    useDialogStore.getState().openDeleteConfirm(
        [song],
        async () => {
            if (typeof song.id !== 'number') return;
            const songId = song.id;
            const store = useLibraryStore.getState();
            store.markSongsAsOptimisticallyDeleted([songId]);
            try {
                await libraryService.batchDeleteSongs([songId]);
                if (song.path) {
                    store.removeSongFromPlaylist(song.path);
                    store.removeFromRecent(song.path);
                }
                store.triggerLibraryUpdate();
                store.triggerPlaylistUpdate();
                window.setTimeout(() => {
                    useLibraryStore.getState().clearOptimisticallyDeletedSongs([songId]);
                }, 1500);
            } catch (removeError) {
                store.clearOptimisticallyDeletedSongs([songId]);
                console.error('Failed to remove missing song', removeError);
                toast.error('移除失败，请重试');
            }
        },
        canRemove
            ? `无法找到“${song.title}”的原始文件，文件可能已被删除或移动。是否将此歌曲从音乐库中移除？`
            : `无法找到“${song.title}”的原始文件，文件可能已被删除或移动。请检查文件位置后重试。`,
        '找不到歌曲文件',
        canRemove ? '从音乐库移除' : '知道了'
    );
    return true;
}
