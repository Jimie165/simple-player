import { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle, DialogBackdrop } from '@headlessui/react';
import { MdClose, MdMusicNote } from 'react-icons/md';
import { usePlayerStore } from '../../store/usePlayerStore';
import { fileService } from '../../services/fileService';
import { formatTime } from '../../utils/time';
import type { SongMetadata } from '../../types';

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
            // 先重置，避免显示上一次的数据
            setFullMetadata(null);

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
    const displayMeta = fullMetadata || initialMetadata;

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

    return (
        <Dialog open={isOpen} onClose={onClose} className="relative z-[999]">
            <DialogBackdrop
                transition
                className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ease-out data-[closed]:opacity-0"
            />

            <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
                <DialogPanel
                    transition
                    className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white dark:bg-[#2c2c2c] p-8 text-left align-middle shadow-xl border border-neutral-200 dark:border-neutral-700 transition-all duration-300 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
                >
                    <div className="flex justify-between items-start mb-6 gap-4">
                        <DialogTitle as="h3" className="text-xl font-bold leading-6 text-neutral-900 dark:text-white whitespace-nowrap">
                            属性
                        </DialogTitle>
                        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700">
                            <MdClose className="text-2xl" />
                        </button>
                    </div>

                    <div className="space-y-6">
                        {/* 上半部分：封面 + 核心信息 */}
                        <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                            <div className="w-40 h-40 rounded-lg bg-neutral-100 dark:bg-neutral-800 overflow-hidden shadow-md shrink-0 border border-neutral-200/30">
                                {displayMeta?.cover ? (
                                    <img src={displayMeta.cover} alt="Cover" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-neutral-400">
                                        <MdMusicNote className="text-5xl" />
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-[13px] w-full items-center">
                                <div className="text-neutral-500 dark:text-neutral-400 text-right font-medium">标题</div>
                                <div className="font-semibold text-neutral-900 dark:text-neutral-100 select-text break-all text-base">{displayMeta?.title || "未知"}</div>

                                <div className="text-neutral-500 dark:text-neutral-400 text-right font-medium">艺人</div>
                                <div className="text-neutral-900 dark:text-neutral-100 select-text break-all">{displayMeta?.artist || "未知"}</div>

                                <div className="text-neutral-500 dark:text-neutral-400 text-right font-medium">专辑</div>
                                <div className="text-neutral-900 dark:text-neutral-100 select-text break-all">{displayMeta?.album || "未知"}</div>

                                <div className="text-neutral-500 dark:text-neutral-400 text-right font-medium">时长</div>
                                <div className="text-neutral-900 dark:text-neutral-100 font-mono">{formatTime(displayMeta?.duration || 0)}</div>
                            </div>
                        </div>

                        <div className="h-px bg-neutral-200 dark:bg-neutral-700/50 w-full" />

                        {/* 下半部分：详细技术信息 */}
                        <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-xs w-full">
                            <div className="text-neutral-500 dark:text-neutral-400 text-right whitespace-nowrap">文件大小</div>
                            <div className="text-neutral-900 dark:text-neutral-200 font-mono select-text">{formatSize(displayMeta?.size)}</div>

                            <div className="text-neutral-500 dark:text-neutral-400 text-right whitespace-nowrap">采样率</div>
                            <div className="text-neutral-900 dark:text-neutral-200 font-mono select-text">{formatSampleRate(displayMeta?.sample_rate)}</div>

                            <div className="text-neutral-500 dark:text-neutral-400 text-right whitespace-nowrap">比特率</div>
                            <div className="text-neutral-900 dark:text-neutral-200 font-mono select-text">{formatBitrate(displayMeta?.bitrate)}</div>

                            <div className="text-neutral-500 dark:text-neutral-400 text-right whitespace-nowrap">路径</div>
                            <div className="text-neutral-900 dark:text-neutral-200 font-mono select-text break-all">
                                {displayMeta?.path || '未知'}
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 flex justify-end">
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