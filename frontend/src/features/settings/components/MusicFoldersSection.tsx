import { useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'react-hot-toast';
import { MdAdd, MdDelete, MdExpandLess, MdExpandMore, MdFolder } from 'react-icons/md';
import clsx from 'clsx';

import { libraryService } from '@/services/libraryService';
import { useLibraryStore } from '@/store/useLibraryStore';
import type { LibraryFolder } from '@/types';
import { getSelectedPath } from '@/utils/dialogSelection';

const FOLDER_PREVIEW_COUNT = 3;

export default function MusicFoldersSection() {
    const triggerLibraryUpdate = useLibraryStore((s) => s.triggerLibraryUpdate);
    const [musicFolders, setMusicFolders] = useState<LibraryFolder[]>([]);
    const [isAddingFolder, setIsAddingFolder] = useState(false);
    const [foldersExpanded, setFoldersExpanded] = useState(false);

    const reloadFolders = useCallback(async () => {
        try {
            const all = await libraryService.getFolders();
            setMusicFolders(all.filter((f) => f.folder_type === 'music'));
        } catch (e) {
            console.error('Failed to load folders', e);
        }
    }, []);

    useEffect(() => {
        reloadFolders();
    }, [reloadFolders]);

    const handleAddFolder = async () => {
        if (isAddingFolder) return;
        try {
            const selected = await open({ directory: true, multiple: false });
            const folderPath = getSelectedPath(selected);
            if (!folderPath) return;
            setIsAddingFolder(true);
            await libraryService.addFolder(folderPath);
            await reloadFolders();
            triggerLibraryUpdate();
            toast.success('已添加文件夹，正在后台扫描...', { id: 'add-folder' });
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

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider px-1">
                <MdFolder className="text-lg" />
                <span>音乐文件夹</span>
            </div>

            <div className="rounded-2xl overflow-hidden border border-outline-variant/30 bg-surface-container-high">
                {musicFolders.length === 0 ? (
                    <div className="p-4 text-sm text-on-surface-variant">
                        尚未添加任何音乐文件夹
                    </div>
                ) : (
                    <>
                        <ul className="divide-y divide-outline-variant/30">
                            {(foldersExpanded ? musicFolders : musicFolders.slice(0, FOLDER_PREVIEW_COUNT)).map((folder) => (
                                <li
                                    key={folder.id}
                                    className="flex items-center justify-between gap-3 p-4 hover:bg-surface-container-highest transition-colors"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-on-surface truncate">
                                            {folder.path}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleRemoveFolder(folder)}
                                        className="flex items-center justify-center w-9 h-9 rounded-full text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors active:scale-95 shrink-0"
                                        title="移除此文件夹"
                                    >
                                        <MdDelete className="text-lg" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {musicFolders.length > FOLDER_PREVIEW_COUNT && (
                            <button
                                onClick={() => setFoldersExpanded((v) => !v)}
                                className="flex items-center justify-center gap-1 w-full py-2.5 text-sm font-medium text-primary hover:bg-surface-container-highest transition-colors border-t border-outline-variant/30"
                            >
                                {foldersExpanded ? (
                                    <>
                                        <MdExpandLess className="text-lg" />
                                        收起
                                    </>
                                ) : (
                                    <>
                                        <MdExpandMore className="text-lg" />
                                        展开剩余 {musicFolders.length - FOLDER_PREVIEW_COUNT} 项
                                    </>
                                )}
                            </button>
                        )}
                    </>
                )}
                <div className="p-3 border-t border-outline-variant/30 bg-surface-container">
                    <button
                        onClick={handleAddFolder}
                        disabled={isAddingFolder}
                        className={clsx(
                            "flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-medium text-sm transition-all active:scale-95",
                            isAddingFolder
                                ? "bg-surface-container-highest text-on-surface-variant cursor-wait"
                                : "bg-primary text-on-primary hover:shadow-md hover:brightness-110"
                        )}
                    >
                        <MdAdd className="text-lg" />
                        {isAddingFolder ? '添加中...' : '添加文件夹'}
                    </button>
                </div>
            </div>
        </section>
    );
}
