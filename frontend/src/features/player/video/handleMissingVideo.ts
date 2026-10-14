import toast from 'react-hot-toast';
import { libraryService } from '@/services/libraryService';
import { useDialogStore } from '@/store/useDialogStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useVideoStore } from '@/store/useVideoStore';

export function handleMissingVideo(video: { id?: number; path: string; title?: string }) {
    // Recent files use a placeholder ID, so resolve the actual library identity by path.
    const libraryVideo = useVideoStore.getState().videos.find(item => item.path === video.path);
    const videoId = libraryVideo?.id ?? (typeof video.id === 'number' && video.id >= 0 ? video.id : undefined);
    const title = video.title || '此视频';
    useDialogStore.getState().openDeleteConfirm(
        [video],
        async () => {
            if (videoId === undefined) return;
            try {
                await libraryService.batchDeleteVideos([videoId]);
                const videos = useVideoStore.getState();
                videos.setVideos(videos.videos.filter(item => item.id !== videoId));
                const library = useLibraryStore.getState();
                library.removeFromRecent(video.path);
                library.triggerLibraryUpdate();
                const player = usePlayerStore.getState();
                const queue = player.videoQueue.filter(item => item.path !== video.path);
                const removedBeforeCurrent = player.videoQueue.slice(0, player.currentVideoIndex)
                    .filter(item => item.path === video.path).length;
                const removingCurrent = player.videoMetadata?.path === video.path;
                player.setVideoQueue(queue, removingCurrent ? -1 : player.currentVideoIndex - removedBeforeCurrent);
                if (removingCurrent) {
                    if (player.isVideoMode) player.setVideoMode(false);
                    player.setVideoMetadata(null);
                }
            } catch (error) {
                console.error('Failed to remove missing video', error);
                toast.error('移除失败，请重试');
            }
        },
        videoId !== undefined
            ? `无法找到“${title}”的原始文件，文件可能已被删除或移动。是否将此视频从视频库中移除？`
            : `无法找到“${title}”的原始文件，文件可能已被删除或移动。请检查文件位置后重试。`,
        '找不到视频文件',
        videoId !== undefined ? '从视频库移除' : '知道了'
    );
}
