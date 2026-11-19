import { useState } from 'react';
import { MdRefresh } from 'react-icons/md';
import clsx from 'clsx';
import { toast } from 'react-hot-toast';

import { SettingsGroup, SettingsRow } from '@/features/settings/components/SettingsControls';
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
        <SettingsGroup title="资料库">
            <SettingsRow label="刷新音乐库" description="重新扫描音乐文件夹并更新元数据">
                <button
                    onClick={() => { void handleRefreshMusicLibrary().catch(console.error); }}
                    disabled={isRefreshingMusic}
                    className="settings-control flex items-center gap-1.5 rounded-md px-3 py-1 text-[13px] font-medium text-on-surface transition-transform active:scale-[0.97] disabled:cursor-wait disabled:text-on-surface-variant"
                >
                    <MdRefresh className={clsx('text-base', isRefreshingMusic && 'animate-spin')} />
                    {isRefreshingMusic ? '刷新中…' : '刷新'}
                </button>
            </SettingsRow>
            <SettingsRow label="刷新视频库" description="重新扫描视频文件夹并更新缩略图">
                <button
                    onClick={() => { void handleRefreshVideoLibrary().catch(console.error); }}
                    disabled={isRefreshingVideo}
                    className="settings-control flex items-center gap-1.5 rounded-md px-3 py-1 text-[13px] font-medium text-on-surface transition-transform active:scale-[0.97] disabled:cursor-wait disabled:text-on-surface-variant"
                >
                    <MdRefresh className={clsx('text-base', isRefreshingVideo && 'animate-spin')} />
                    {isRefreshingVideo ? '刷新中…' : '刷新'}
                </button>
            </SettingsRow>
        </SettingsGroup>
    );
}
