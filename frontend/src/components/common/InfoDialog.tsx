import { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle, DialogBackdrop } from '@headlessui/react';
import { MdClose } from 'react-icons/md';
import { usePlayerStore } from '@/store/usePlayerStore';
import { fileService } from '@/services/fileService';
import { formatTime } from '@/utils/time';
import type { SongMetadata } from '@/types';
import CoverImage from '@/components/common/CoverImage';

interface InfoDialogProps {
    isOpen: boolean;
    onClose: () => void;
    song?: SongMetadata | null; // 可选：传入特定歌曲，否则显示当前播放
}

export default function InfoDialog({ isOpen, onClose, song }: InfoDialogProps) {
    const storeMetadata = usePlayerStore((state) => state.metadata);
    // 优先显示传入的 song，如果没有则显示正在播放的
    const initialMetadata = song || storeMetadata;

    const [fullMetadata, setFullMetadata] = useState<SongMetadata | null>(null);

    // 当弹窗打开且有路径时，获取详细信息（大小、码率等）
    useEffect(() => {
        if (isOpen && initialMetadata?.path) {
            fileService.getMetadata(initialMetadata.path)
                .then(meta => {
                    // 合并信息：数据库里的 id/added_at 等可能在 get_metadata 里没有，
                    // 但 get_metadata 有 size/bitrate。
                    // 这里我们主要需要 size/bitrate/sample_rate，以及确认 title/artist 等。
                    // 简单起见，用 meta 覆盖，但保留 id (如果 meta 里是 None)
                    setFullMetadata({
                        ...initialMetadata,
                        ...meta,
                        id: initialMetadata.id || meta.id
                    });
                })
                .catch(err => {
                    console.error("Failed to fetch metadata details", err);
                    setFullMetadata(initialMetadata);
                });
        }
    }, [isOpen, initialMetadata]);

    // 显示的数据源：如果有 fullMetadata（加载完成），用它；否则用 initialMetadata
    const displayMeta = fullMetadata?.path === initialMetadata?.path ? fullMetadata : initialMetadata;
    const isVideo = !!(displayMeta?.width && displayMeta?.height);

    const formatSize = (bytes?: number) => {
        if (!bytes) return '未知';
        const mb = bytes / 1024 / 1024;
        return `${mb.toFixed(2)} MB`;
    };

    const formatBitrate = (bps?: number) => {
        if (!bps) return '未知';
        return `${bps} kbps`;
    };

    const formatSampleRate = (hz?: number) => {
        if (!hz) return '未知';
        return `${hz} Hz`;
    };

    const formatChannels = (channels?: number) => {
        if (!channels) return '未知';
        if (channels === 1) return '1 (单声道)';
        if (channels === 2) return '2 (立体声)';
        if (channels === 6) return '5.1 (环绕声)';
        if (channels === 8) return '7.1 (环绕声)';
        return `${channels} (多声道)`;
    };

    return (
        <Dialog open={isOpen} onClose={onClose} className="relative z-[999]">
            <DialogBackdrop
                transition
                className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ease-out data-[closed]:opacity-0"
            />

            <div className="fixed inset-0 flex w-screen items-center justify-center p-3 sm:p-4">
                <DialogPanel
                    transition
                    className="w-[min(42rem,calc(100vw-1.5rem))] max-h-[calc(100vh-1.5rem)] transform overflow-hidden rounded-2xl bg-white dark:bg-[#2c2c2c] p-4 sm:w-full sm:max-w-2xl sm:max-h-[calc(100vh-2rem)] sm:p-6 lg:p-8 text-left align-middle shadow-xl border border-neutral-200 dark:border-neutral-700 transition-all duration-300 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 flex flex-col"
                >
                    <div className="flex justify-between items-start mb-4 sm:mb-6 gap-4 shrink-0">
                        <DialogTitle as="h3" className="text-xl font-bold leading-6 text-neutral-900 dark:text-white whitespace-nowrap">
                            属性
                        </DialogTitle>
                        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700">
                            <MdClose className="text-2xl" />
                        </button>
                    </div>

                    <div className="space-y-5 sm:space-y-6 overflow-y-auto pr-1 sm:pr-2 min-h-0 overscroll-contain">
                        {/* 上半部分：封面 + 核心信息 */}
                        <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-lg bg-neutral-100 dark:bg-neutral-800 overflow-hidden shadow-md shrink-0 border border-neutral-200/30">
                                <CoverImage song={displayMeta} className="w-full h-full" iconClassName="text-5xl" />
                            </div>

                            <div className="flex-1 grid grid-cols-[auto_1fr] gap-x-3 sm:gap-x-4 gap-y-3 text-[13px] w-full items-center">
                                <div className="text-neutral-500 dark:text-neutral-400 text-left sm:text-right font-medium">标题</div>
                                <div className="font-semibold text-neutral-900 dark:text-neutral-100 select-text break-all text-base">{displayMeta?.title || "未知"}</div>

                                {!isVideo && (
                                    <>
                                        <div className="text-neutral-500 dark:text-neutral-400 text-left sm:text-right font-medium">艺人</div>
                                        <div className="text-neutral-900 dark:text-neutral-100 select-text break-all">{displayMeta?.artist || "未知"}</div>

                                        <div className="text-neutral-500 dark:text-neutral-400 text-left sm:text-right font-medium">专辑</div>
                                        <div className="text-neutral-900 dark:text-neutral-100 select-text break-all">{displayMeta?.album || "未知"}</div>
                                    </>
                                )}

                                <div className="text-neutral-500 dark:text-neutral-400 text-left sm:text-right font-medium">时长</div>
                                <div className="text-neutral-900 dark:text-neutral-100 font-mono">{formatTime(displayMeta?.duration || 0)}</div>
                            </div>
                        </div>

                        <div className="h-px bg-neutral-200 dark:bg-neutral-700/50 w-full" />

                        {/* 下半部分：详细技术信息 */}
                        <div className="grid grid-cols-[auto_1fr] gap-x-4 sm:gap-x-6 gap-y-2 text-xs w-full">
                            {/* 仅视频显示分辨率 */}
                            {(displayMeta?.width && displayMeta?.height) && (
                                <>
                                    <div className="text-neutral-500 dark:text-neutral-400 text-left sm:text-right whitespace-nowrap">分辨率</div>
                                    <div className="text-neutral-900 dark:text-neutral-200 font-mono select-text">
                                        {displayMeta.width} x {displayMeta.height}
                                    </div>
                                </>
                            )}

                            {/* 仅视频显示帧率 */}
                            {displayMeta?.frame_rate && (
                                <>
                                    <div className="text-neutral-500 dark:text-neutral-400 text-left sm:text-right whitespace-nowrap">帧速率</div>
                                    <div className="text-neutral-900 dark:text-neutral-200 font-mono select-text">
                                        {displayMeta.frame_rate.toFixed(2)} fps
                                    </div>
                                </>
                            )}

                            <div className="text-neutral-500 dark:text-neutral-400 text-left sm:text-right whitespace-nowrap">声道</div>
                            <div className="text-neutral-900 dark:text-neutral-200 font-mono select-text">
                                {formatChannels(displayMeta?.channels)}
                            </div>

                            <div className="text-neutral-500 dark:text-neutral-400 text-left sm:text-right whitespace-nowrap">文件大小</div>
                            <div className="text-neutral-900 dark:text-neutral-200 font-mono select-text">{formatSize(displayMeta?.size)}</div>

                            {!isVideo && (
                                <>
                                    <div className="text-neutral-500 dark:text-neutral-400 text-left sm:text-right whitespace-nowrap">采样率</div>
                                    <div className="text-neutral-900 dark:text-neutral-200 font-mono select-text">{formatSampleRate(displayMeta?.sample_rate)}</div>

                                    <div className="text-neutral-500 dark:text-neutral-400 text-left sm:text-right whitespace-nowrap">比特率</div>
                                    <div className="text-neutral-900 dark:text-neutral-200 font-mono select-text">{formatBitrate(displayMeta?.bitrate)}</div>
                                </>
                            )}

                            <div className="text-neutral-500 dark:text-neutral-400 text-left sm:text-right whitespace-nowrap">路径</div>
                            <div className="text-neutral-900 dark:text-neutral-200 font-mono select-text break-all">
                                {displayMeta?.path || '未知'}
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 sm:mt-8 flex justify-end shrink-0">
                        <button
                            type="button"
                            className="w-full inline-flex justify-center rounded-xl px-4 py-2 text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:text-primary dark:hover:bg-primary/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                            onClick={onClose}
                        >
                            关闭
                        </button>
                    </div>
                </DialogPanel>
            </div>
        </Dialog>
    );
}
