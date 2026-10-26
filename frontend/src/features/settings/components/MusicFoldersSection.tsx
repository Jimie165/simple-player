import { useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'react-hot-toast';
import { MdAdd, MdDelete, MdExpandLess, MdExpandMore, MdFolder } from 'react-icons/md';

import { libraryService } from '@/services/libraryService';
import CustomTooltip from '@/components/common/CustomTooltip';
import { SettingsGroup } from '@/features/settings/components/SettingsControls';
import RestoreExcludedSongsDialog from '@/features/library/dialogs/RestoreExcludedSongsDialog';
import { useLibraryStore } from '@/store/useLibraryStore';
import type { LibraryFolder, SongMetadata } from '@/types';
import { getSelectedPath } from '@/utils/dialogSelection';

const FOLDER_PREVIEW_COUNT = 3;

export default function MusicFoldersSection() {
    const libraryVersion = useLibraryStore(s => s.libraryVersion);
    const triggerLibraryUpdate = useLibraryStore((s) => s.triggerLibraryUpdate);
    const [musicFolders, setMusicFolders] = useState<LibraryFolder[]>([]);
    const [isAddingFolder, setIsAddingFolder] = useState(false);
    const [foldersExpanded, setFoldersExpanded] = useState(false);
    const [restorePrompt, setRestorePrompt] = useState<{
        folderPath: string;
        songs: SongMetadata[];
    } | null>(null);

    const reloadFolders = useCallback(async () => {
        try {
            const all = await libraryService.getFolders();
            setMusicFolders(all.filter((f) => f.folder_type === 'music' || f.folder_type === 'mixed'));
        } catch (e) {
            console.error('Failed to load folders', e);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reloadFolders 在异步 IPC 返回后更新状态，非同步调用
        reloadFolders();
    }, [reloadFolders, libraryVersion]);

    const handleAddFolder = async () => {
        if (isAddingFolder) return;
        try {
            const selected = await open({ directory: true, multiple: false });
            const folderPath = getSelectedPath(selected);
            if (!folderPath) return;
            setIsAddingFolder(true);
            const result = await libraryService.addFolder(folderPath);
            await reloadFolders();
            if (result.existing_folder) {
                if (result.excluded_songs.length > 0) {
                    setRestorePrompt({ folderPath, songs: result.excluded_songs });
                } else {
                    toast('该文件夹已在音乐库中，没有可恢复的歌曲', { id: 'add-folder' });
                }
            } else {
                triggerLibraryUpdate();
                toast.success('已添加文件夹，正在后台扫描...', { id: 'add-folder' });
            }
        } catch (e: unknown) {
            const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : String(e);
            toast.error(msg || '添加失败', { id: 'add-folder' });
        } finally {
            setIsAddingFolder(false);
        }
    };

    const handleRemoveFolder = async (folder: LibraryFolder) => {
        if (!confirm(`确定移除文件夹？\n${folder.path}\n该目录下的歌曲会从音乐库删除（收藏与播放列表中的引用一并清理）。`)) {
            return;
        }
        try {
            await libraryService.removeFolder(folder.path);
            await reloadFolders();
            triggerLibraryUpdate();
            toast.success('已移除文件夹', { id: 'remove-folder' });
        } catch (e) {
            console.error(e);
            toast.error('移除失败', { id: 'remove-folder' });
        }
    };

    const handleRestoreSongs = async (ids: number[]) => {
        try {
            const result = await libraryService.restoreExcludedSongs(ids);
            triggerLibraryUpdate();
            const suffix = result.missing_count > 0
                ? `，${result.missing_count} 首文件已不存在`
                : '';
            toast.success(`已恢复 ${result.restored_count} 首歌曲${suffix}`, { id: 'restore-songs' });
        } catch (e) {
            const message = typeof e === 'string' ? e : e instanceof Error ? e.message : '恢复歌曲失败';
            toast.error(message || '恢复歌曲失败', { id: 'restore-songs' });
            throw e;
        }
    };

    return (
        <>
            <SettingsGroup title="音乐文件夹">
                {musicFolders.length === 0 ? (
                    <div className="px-3.5 py-3 text-sm text-on-surface-variant">
                        尚未添加任何音乐文件夹
                    </div>
                ) : (
                    (foldersExpanded ? musicFolders : musicFolders.slice(0, FOLDER_PREVIEW_COUNT)).map((folder) => (
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
                                    onClick={() => handleRemoveFolder(folder)}
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
                    {musicFolders.length > FOLDER_PREVIEW_COUNT ? (
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
                                    展开剩余 {musicFolders.length - FOLDER_PREVIEW_COUNT} 项
                                </>
                            )}
                        </button>
                    ) : (
                        <span />
                    )}
                    <button
                        onClick={handleAddFolder}
                        disabled={isAddingFolder}
                        className="settings-control flex items-center gap-1 rounded-md px-3 py-1 text-[13px] font-medium text-on-surface transition-transform active:scale-[0.97] disabled:cursor-wait disabled:text-on-surface-variant"
                    >
                        <MdAdd className="text-base" />
                        {isAddingFolder ? '添加中…' : '添加文件夹…'}
                    </button>
                </div>
            </SettingsGroup>
            <RestoreExcludedSongsDialog
                isOpen={restorePrompt !== null}
                folderPath={restorePrompt?.folderPath ?? ''}
                songs={restorePrompt?.songs ?? []}
                onClose={() => setRestorePrompt(null)}
                onRestore={handleRestoreSongs}
            />
        </>
    );
}
