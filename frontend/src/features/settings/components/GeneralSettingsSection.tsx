import { useState } from 'react';
import { MdRefresh, MdTune } from 'react-icons/md';
import clsx from 'clsx';
import { toast } from 'react-hot-toast';

import { libraryService } from '@/services/libraryService';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useVideoStore } from '@/store/useVideoStore';

export default function GeneralSettingsSection() {
    const triggerLibraryUpdate = useLibraryStore((s) => s.triggerLibraryUpdate);
    const refreshFavorites = useLibraryStore((s) => s.refreshFavorites);
    const refreshRecentHistory = useLibraryStore((s) => s.refreshRecentHistory);
    const fetchVideos = useVideoStore((s) => s.fetchVideos);
    const fetchVideoFolders = useVideoStore((s) => s.fetchVideoFolders);
    const [isRefreshingMusic, setIsRefreshingMusic] = useState(false);
    const [isRefreshingVideo, setIsRefreshingVideo] = useState(false);

    const handleRefreshMusicLibrary = async () => {
        if (isRefreshingMusic) return;
        setIsRefreshingMusic(true);
        try {
            await libraryService.refreshLibrary();
            triggerLibraryUpdate();
            await refreshFavorites();
            await refreshRecentHistory();
            toast.success('音乐库已刷新', { id: 'refresh-music-library' });
        } catch (error) {
            console.error('Failed to refresh music library', error);
            const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '刷新音乐库失败';
            toast.error(message || '刷新音乐库失败', { id: 'refresh-music-library' });
        } finally {
            setTimeout(() => setIsRefreshingMusic(false), 800);
        }
    };

    const handleRefreshVideoLibrary = async () => {
        if (isRefreshingVideo) return;
        setIsRefreshingVideo(true);
        try {
            await libraryService.refreshVideoLibrary();
            await fetchVideos();
            await fetchVideoFolders();
            toast.success('视频库已刷新', { id: 'refresh-video-library' });
        } catch (error) {
            console.error('Failed to refresh video library', error);
            const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '刷新视频库失败';
            toast.error(message || '刷新视频库失败', { id: 'refresh-video-library' });
        } finally {
            setTimeout(() => setIsRefreshingVideo(false), 800);
        }
    };

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider px-1">
                <MdTune className="text-lg" />
                <span>常规设置</span>
            </div>

            {/* M3 Expressive Style: Grouped container with hairline gap */}
            <div className="settings-list flex flex-col gap-px rounded-2xl overflow-hidden">
                {/* Refresh Music */}
                <div className="settings-static-row flex items-center justify-between p-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-base font-medium text-on-surface">刷新音乐库</span>
                        <span className="text-sm text-on-surface-variant">重新扫描音乐文件夹并更新元数据</span>
                    </div>
                    <button
                        onClick={handleRefreshMusicLibrary}
                        disabled={isRefreshingMusic}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all active:scale-95",
                            isRefreshingMusic
                                ? "settings-subtle text-on-surface-variant cursor-wait"
                                : "bg-primary text-on-primary hover:shadow-md hover:brightness-110"
                        )}
                    >
                        <MdRefresh className={clsx("text-lg", isRefreshingMusic && "animate-spin")} />
                        {isRefreshingMusic ? '刷新中...' : '刷新'}
                    </button>
                </div>

                {/* Refresh Video */}
                <div className="settings-static-row flex items-center justify-between p-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-base font-medium text-on-surface">刷新视频库</span>
                        <span className="text-sm text-on-surface-variant">重新扫描视频文件夹并更新缩略图</span>
                    </div>
                    <button
                        onClick={handleRefreshVideoLibrary}
                        disabled={isRefreshingVideo}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all active:scale-95",
                            isRefreshingVideo
                                ? "settings-subtle text-on-surface-variant cursor-wait"
                                : "bg-primary text-on-primary hover:shadow-md hover:brightness-110"
                        )}
                    >
                        <MdRefresh className={clsx("text-lg", isRefreshingVideo && "animate-spin")} />
                        {isRefreshingVideo ? '刷新中...' : '刷新'}
                    </button>
                </div>
            </div>
        </section>
    );
}
