import { useState } from 'react';
import { MdLibraryMusic, MdRefresh } from 'react-icons/md';
import clsx from 'clsx';

import { libraryService } from '@/services/libraryService';

export default function GeneralSettingsSection() {
    const [isRefreshingMusic, setIsRefreshingMusic] = useState(false);
    const [isRefreshingVideo, setIsRefreshingVideo] = useState(false);

    const handleRefreshMusicLibrary = async () => {
        if (isRefreshingMusic) return;
        setIsRefreshingMusic(true);
        try {
            await libraryService.refreshLibrary();
        } catch (error) {
            console.error('Failed to refresh music library', error);
        } finally {
            setTimeout(() => setIsRefreshingMusic(false), 800);
        }
    };

    const handleRefreshVideoLibrary = async () => {
        if (isRefreshingVideo) return;
        setIsRefreshingVideo(true);
        try {
            await libraryService.refreshVideoLibrary();
        } catch (error) {
            console.error('Failed to refresh video library', error);
        } finally {
            setTimeout(() => setIsRefreshingVideo(false), 800);
        }
    };

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider px-1">
                <MdLibraryMusic className="text-lg" />
                <span>常规设置</span>
            </div>

            {/* M3 Expressive Style: Grouped container with hairline gap */}
            <div className="flex flex-col gap-[2px] rounded-2xl overflow-hidden border border-outline-variant/30 bg-outline-variant/20">
                {/* Refresh Music */}
                <div className="flex items-center justify-between p-4 bg-surface-container-high hover:bg-surface-container-highest transition-colors">
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
                                ? "bg-surface-container-highest text-on-surface-variant cursor-wait"
                                : "bg-primary text-on-primary hover:shadow-md hover:brightness-110"
                        )}
                    >
                        <MdRefresh className={clsx("text-lg", isRefreshingMusic && "animate-spin")} />
                        {isRefreshingMusic ? '刷新中...' : '刷新'}
                    </button>
                </div>

                {/* Refresh Video */}
                <div className="flex items-center justify-between p-4 bg-surface-container-high hover:bg-surface-container-highest transition-colors">
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
                                ? "bg-surface-container-highest text-on-surface-variant cursor-wait"
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
