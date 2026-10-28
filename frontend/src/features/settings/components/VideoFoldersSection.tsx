import { useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'react-hot-toast';
import { MdAdd, MdDelete, MdExpandLess, MdExpandMore, MdFolder } from 'react-icons/md';

import { libraryService } from '@/services/libraryService';
import CustomTooltip from '@/components/common/CustomTooltip';
import { SettingsGroup } from '@/features/settings/components/SettingsControls';
import RestoreArchivedVideosDialog from '@/features/videos/dialogs/RestoreArchivedVideosDialog';
import { useVideoStore } from '@/store/useVideoStore';
import type { LibraryFolder, VideoMetadata } from '@/types';
import { getSelectedPath } from '@/utils/dialogSelection';

const FOLDER_PREVIEW_COUNT = 3;

export default function VideoFoldersSection() {
    const setVideos = useVideoStore((s) => s.setVideos);
    const fetchVideos = useVideoStore((s) => s.fetchVideos);
    const fetchVideoFolders = useVideoStore((s) => s.fetchVideoFolders);
    const [videoFolders, setVideoFolders] = useState<LibraryFolder[]>([]);
    const [isAddingFolder, setIsAddingFolder] = useState(false);
    const [foldersExpanded, setFoldersExpanded] = useState(false);
    const [restorePrompt, setRestorePrompt] = useState<{
        folderPath: string;
        videos: VideoMetadata[];
    } | null>(null);

    const reloadFolders = useCallback(async () => {
        try {
            const folders = await libraryService.getVideoFolders();
            setVideoFolders(folders);
        } catch (e) {
            console.error('Failed to load video folders', e);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reloadFolders 在异步 IPC 返回后更新状态，非同步调用
        void (reloadFolders()).catch(console.error);
    }, [reloadFolders]);

    const refreshVideoState = async () => {
        await reloadFolders();
        await fetchVideoFolders();
        await fetchVideos();
    };

    const handleAddFolder = async () => {
        if (isAddingFolder) return;
        try {
            const selected = await open({ directory: true, multiple: false });
            const folderPath = getSelectedPath(selected);
            if (!folderPath) return;
            setIsAddingFolder(true);
            const result = await libraryService.addVideoFolder(folderPath);
            setVideos(result.videos);
            await refreshVideoState();
            if (result.existing_folder) {
                if (result.archived_videos.length > 0) {
                    setRestorePrompt({ folderPath, videos: result.archived_videos });
                } else {
                    toast('该文件夹已在视频库中，没有可恢复的视频', { id: 'add-video-folder' });
                }
            } else {
                toast.success('已添加视频文件夹，正在后台扫描...', { id: 'add-video-folder' });
            }
        } catch (e: unknown) {
            const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
            toast.error(msg || '添加失败', { id: 'add-video-folder' });
        } finally {
            setIsAddingFolder(false);
        }
    };

    const handleRemoveFolder = async (folder: LibraryFolder) => {
        if (!confirm(`确定移除视频文件夹？\n${folder.path}\n该目录下的视频会从视频库中移除。`)) {
            return;
        }
        try {
            await libraryService.removeVideoFolder(folder.path);
            await refreshVideoState();
            toast.success('已移除视频文件夹', { id: 'remove-video-folder' });
        } catch (e) {
            console.error(e);
            toast.error('移除失败', { id: 'remove-video-folder' });
        }
    };

    const handleRestoreVideos = async (ids: number[]) => {
        try {
            const result = await libraryService.restoreArchivedVideos(ids);
            setVideos(result.videos);
            await fetchVideos();
            const suffix = result.missing_count > 0
                ? `，${result.missing_count} 个文件已不存在`
                : '';
            toast.success(`已恢复 ${result.restored_count} 个视频${suffix}`, { id: 'restore-videos' });
        } catch (e) {
            const message = typeof e === 'string' ? e : e instanceof Error ? e.message : '恢复视频失败';
            toast.error(message || '恢复视频失败', { id: 'restore-videos' });
            throw e;
        }
    };

    return (
        <>
            <SettingsGroup title="视频文件夹">
                {videoFolders.length === 0 ? (
                    <div className="px-3.5 py-3 text-sm text-on-surface-variant">
                        尚未添加任何视频文件夹
                    </div>
                ) : (
                    (foldersExpanded ? videoFolders : videoFolders.slice(0, FOLDER_PREVIEW_COUNT)).map((folder) => (
                        <div
                            key={folder.id}
                            className="group flex min-h-11 items-center gap-3 px-3.5 py-2"
                        >
                            <MdFolder className="shrink-0 text-lg text-primary" />
                            <CustomTooltip text={folder.path} onlyWhenOverflow className="block min-w-0 flex-1">
                                <p className="truncate text-sm text-on-surface">
                                    {folder.path}
                                </p>
                            </CustomTooltip>
                            <CustomTooltip text="移除此文件夹">
                                <button
                                    onClick={() => { void handleRemoveFolder(folder).catch(console.error); }}
                                    aria-label="移除此文件夹"
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-on-surface-variant opacity-60 transition-all hover:bg-error/10 hover:text-error hover:opacity-100 active:scale-95 group-hover:opacity-100"
                                >
                                    <MdDelete className="text-base" />
                                </button>
                            </CustomTooltip>
                        </div>
                    ))
                )}
                <div className="flex items-center justify-between gap-3 px-3.5 py-2">
                    {videoFolders.length > FOLDER_PREVIEW_COUNT ? (
                        <button
                            onClick={() => setFoldersExpanded((v) => !v)}
                            className="flex items-center gap-0.5 text-[13px] font-medium text-primary hover:underline"
                        >
                            {foldersExpanded ? (
                                <>
                                    <MdExpandLess className="text-base" />
                                    收起
                                </>
                            ) : (
                                <>
                                    <MdExpandMore className="text-base" />
                                    展开剩余 {videoFolders.length - FOLDER_PREVIEW_COUNT} 项
                                </>
                            )}
                        </button>
                    ) : (
                        <span />
                    )}
                    <button
                        onClick={() => { void handleAddFolder().catch(console.error); }}
                        disabled={isAddingFolder}
                        className="settings-control flex items-center gap-1 rounded-md px-3 py-1 text-[13px] font-medium text-on-surface transition-transform active:scale-[0.97] disabled:cursor-wait disabled:text-on-surface-variant"
                    >
                        <MdAdd className="text-base" />
                        {isAddingFolder ? '添加中…' : '添加视频文件夹…'}
                    </button>
                </div>
            </SettingsGroup>
            <RestoreArchivedVideosDialog
                isOpen={restorePrompt !== null}
                folderPath={restorePrompt?.folderPath ?? ''}
                videos={restorePrompt?.videos ?? []}
                onClose={() => setRestorePrompt(null)}
                onRestore={handleRestoreVideos}
            />
        </>
    );
}
