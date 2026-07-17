import { Fragment, useEffect, useState } from 'react';
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { MdRestore } from 'react-icons/md';

import CoverImage from '@/components/common/CoverImage';
import type { VideoMetadata } from '@/types';
import { formatTime } from '@/utils/time';

interface RestoreArchivedVideosDialogProps {
    isOpen: boolean;
    folderPath: string;
    videos: VideoMetadata[];
    onClose: () => void;
    onRestore: (ids: number[]) => Promise<void>;
}

export default function RestoreArchivedVideosDialog({
    isOpen,
    folderPath,
    videos,
    onClose,
    onRestore,
}: RestoreArchivedVideosDialogProps) {
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [restoring, setRestoring] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedIds(new Set(videos.map((video) => video.id)));
    }, [isOpen, videos]);

    const allIds = videos.map((video) => video.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

    const toggleVideo = (id: number) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleRestore = async () => {
        const ids = allIds.filter((id) => selectedIds.has(id));
        if (ids.length === 0 || restoring) return;
        setRestoring(true);
        try {
            await onRestore(ids);
            onClose();
        } catch {
            // 调用方显示具体错误；失败时保留选择以便重试。
        } finally {
            setRestoring(false);
        }
    };

    return (
        <Transition show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-300" onClose={restoring ? () => undefined : onClose}>
                <DialogBackdrop
                    transition
                    className="fixed inset-0 bg-black/25 backdrop-blur-sm transition-opacity data-closed:opacity-0 data-enter:duration-300 data-leave:duration-200"
                />

                <div className="fixed inset-0 overflow-y-auto p-3 sm:p-4">
                    <div className="flex min-h-full items-center justify-center text-center">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="flex w-[min(28rem,calc(100vw-1.5rem))] max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface text-left shadow-xl transition-all">
                                <div className="p-5 pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                            <MdRestore className="text-xl" />
                                        </div>
                                        <div className="min-w-0">
                                            <DialogTitle className="text-lg font-medium text-on-surface">
                                                重新导入已删除视频
                                            </DialogTitle>
                                            <p className="mt-0.5 truncate text-xs text-on-surface-variant" title={folderPath}>
                                                {folderPath}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="mt-3 text-sm text-on-surface-variant">
                                        这些视频仍在文件夹中。选择要重新加入视频库的项目。
                                    </p>
                                </div>

                                <div className="flex items-center justify-between border-y border-outline-variant/40 bg-surface-container/40 px-5 py-2.5">
                                    <span className="text-xs text-on-surface-variant">
                                        已选择 {selectedIds.size} / {allIds.length}
                                    </span>
                                    <button
                                        type="button"
                                        className="text-xs font-medium text-primary hover:underline"
                                        onClick={() => setSelectedIds(allSelected ? new Set() : new Set(allIds))}
                                    >
                                        {allSelected ? '取消全选' : '全选'}
                                    </button>
                                </div>

                                <ul className="max-h-72 overflow-y-auto p-2">
                                    {videos.map((video) => {
                                        const checked = selectedIds.has(video.id);
                                        const resolution = video.width && video.height
                                            ? `${video.width}×${video.height}`
                                            : null;
                                        return (
                                            <li key={video.id}>
                                                <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-surface-container transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleVideo(video.id)}
                                                        className="h-4 w-4 shrink-0 accent-primary"
                                                    />
                                                    <div className="relative h-10 w-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-surface-container-highest">
                                                        <CoverImage
                                                            src={video.thumbnail_path}
                                                            className="absolute inset-0 h-full w-full object-cover"
                                                            thumbnail={false}
                                                        />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium text-on-surface">
                                                            {video.title || '未知视频'}
                                                        </p>
                                                        <p className="truncate text-xs text-on-surface-variant">
                                                            {[formatTime(video.duration), resolution].filter(Boolean).join(' · ')}
                                                        </p>
                                                    </div>
                                                </label>
                                            </li>
                                        );
                                    })}
                                </ul>

                                <div className="flex justify-end gap-3 border-t border-outline-variant/40 p-4">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        disabled={restoring}
                                        className="rounded-full px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
                                    >
                                        取消
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleRestore}
                                        disabled={selectedIds.size === 0 || restoring}
                                        className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {restoring ? '正在恢复...' : `恢复选中 (${selectedIds.size})`}
                                    </button>
                                </div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
