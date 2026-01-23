import { useState, useEffect } from 'react';
import { IoPlay, IoFolderOpen, IoMusicalNotes, IoEllipsisHorizontal, IoAdd, IoPerson, IoDisc, IoTrash, IoInformationCircle } from 'react-icons/io5';
import { MdQueueMusic } from 'react-icons/md';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import clsx from 'clsx';
import type { RecentItem, SongMetadata } from '../../../types';
import PlaylistCoverCollage from '../../../components/common/PlaylistCoverCollage';
import { libraryService } from '../../../services/libraryService';
import { sortSongs } from '../../../utils/songSort';
import { useLibraryStore } from '../../../store/useLibraryStore';

interface RecentItemCardProps {
    item: RecentItem;
    onClick: () => void;
    onDelete?: (item: RecentItem) => void;
    onShowProperties?: (item: RecentItem) => void;
}

export default function RecentItemCard({ item, onClick, onDelete, onShowProperties }: RecentItemCardProps) {
    const isFile = item.type === 'file';
    const isPlaylist = item.type === 'playlist';

    // 只有当是 Playlist 且没有预设封面时，才需要动态加载歌曲里的封面
    const [playlistSongs, setPlaylistSongs] = useState<SongMetadata[]>([]);
    const { getPlaylistSettings } = useLibraryStore();

    useEffect(() => {
        if (isPlaylist && !item.cover && !item.cover_path) {
            const loadSongs = async () => {
                // Parse ID "playlist:123" -> 123
                const plIdStr = item.id.replace('playlist:', '');
                if (plIdStr === 'favorites') {
                    const songs = await libraryService.getFavorites();
                    setPlaylistSongs(songs);
                } else {
                    const plId = parseInt(plIdStr);
                    if (!isNaN(plId)) {
                        const songs = await libraryService.getPlaylistSongs(plId);
                        const settings = getPlaylistSettings(plId.toString());
                        setPlaylistSongs(sortSongs(songs, settings.sortKey, settings.sortOrder));
                    }
                }
            };
            loadSongs();
        }
    }, [item, isPlaylist, getPlaylistSettings]);

    return (
        <div
            className="group flex flex-col gap-3 rounded-xl p-3 -mx-3 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer relative"
        >
            <div
                onClick={onClick}
                className="aspect-square w-full rounded-lg shadow-sm bg-neutral-200 dark:bg-neutral-800 group-hover:shadow-md group-hover:scale-[1.02] transition-all duration-300 relative overflow-hidden flex items-center justify-center"
            >
                {item.cover ? (
                    <img src={item.cover} alt={item.title} className="w-full h-full object-cover" />
                ) : isPlaylist ? (
                    <PlaylistCoverCollage songs={playlistSongs} className="w-full h-full" />
                ) : (
                    item.type === 'folder'
                        ? <IoFolderOpen className="text-5xl text-blue-400" />
                        : <IoMusicalNotes className="text-5xl text-neutral-400" />
                )}

                {/* 播放遮罩 */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/10">
                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-lg text-white translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                        <IoPlay className="ml-1" />
                    </div>
                </div>

                {/* 右下角三个点菜单 */}
                <div
                    className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                >
                    <Menu as="div" className="relative">
                        <MenuButton className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors">
                            <IoEllipsisHorizontal />
                        </MenuButton>
                        <MenuItems
                            transition
                            anchor="bottom end"
                            className="w-48 origin-top-right rounded-xl border border-neutral-200 bg-white p-1 text-sm text-neutral-900 shadow-xl ring-1 ring-black/5 focus:outline-none dark:bg-[#2c2c2c] dark:border-neutral-700 dark:text-white transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 z-50"
                        >
                            {/* 播放 */}
                            <MenuItem>
                                {({ focus }) => (
                                    <button
                                        onClick={onClick}
                                        className={clsx(
                                            "group flex w-full items-center gap-3 rounded-lg py-2 px-3",
                                            focus ? "bg-neutral-100 dark:bg-white/10" : ""
                                        )}
                                    >
                                        <IoPlay className="text-lg opacity-70" />
                                        播放
                                    </button>
                                )}
                            </MenuItem>

                            {/* 加入播放队列 */}
                            <MenuItem>
                                {({ focus }) => (
                                    <button
                                        className={clsx(
                                            "group flex w-full items-center gap-3 rounded-lg py-2 px-3",
                                            focus ? "bg-neutral-100 dark:bg-white/10" : ""
                                        )}
                                    >
                                        <MdQueueMusic className="text-lg opacity-70" />
                                        加入播放队列
                                    </button>
                                )}
                            </MenuItem>

                            {/* 添加到 */}
                            <MenuItem>
                                {({ focus }) => (
                                    <button
                                        className={clsx(
                                            "group flex w-full items-center gap-3 rounded-lg py-2 px-3",
                                            focus ? "bg-neutral-100 dark:bg-white/10" : ""
                                        )}
                                    >
                                        <IoAdd className="text-lg opacity-70" />
                                        添加到
                                    </button>
                                )}
                            </MenuItem>

                            <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-700/50" />

                            {/* 删除 */}
                            <MenuItem>
                                {({ focus }) => (
                                    <button
                                        onClick={() => onDelete?.(item)}
                                        className={clsx(
                                            "group flex w-full items-center gap-3 rounded-lg py-2 px-3",
                                            focus ? "bg-neutral-100 dark:bg-white/10" : ""
                                        )}
                                    >
                                        <IoTrash className="text-lg opacity-70" />
                                        删除
                                    </button>
                                )}
                            </MenuItem>

                            {/* 属性 - 仅单曲显示 */}
                            {isFile && onShowProperties && (
                                <MenuItem>
                                    {({ focus }) => (
                                        <button
                                            onClick={() => onShowProperties(item)}
                                            className={clsx(
                                                "group flex w-full items-center gap-3 rounded-lg py-2 px-3",
                                                focus ? "bg-neutral-100 dark:bg-white/10" : ""
                                            )}
                                        >
                                            <IoInformationCircle className="text-lg opacity-70" />
                                            属性
                                        </button>
                                    )}
                                </MenuItem>
                            )}

                            <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-700/50" />

                            {/* 显示专辑 */}
                            <MenuItem>
                                {({ focus }) => (
                                    <button
                                        className={clsx(
                                            "group flex w-full items-center gap-3 rounded-lg py-2 px-3",
                                            focus ? "bg-neutral-100 dark:bg-white/10" : ""
                                        )}
                                    >
                                        <IoDisc className="text-lg opacity-70" />
                                        显示专辑
                                    </button>
                                )}
                            </MenuItem>

                            {/* 显示艺术家 */}
                            <MenuItem>
                                {({ focus }) => (
                                    <button
                                        className={clsx(
                                            "group flex w-full items-center gap-3 rounded-lg py-2 px-3",
                                            focus ? "bg-neutral-100 dark:bg-white/10" : ""
                                        )}
                                    >
                                        <IoPerson className="text-lg opacity-70" />
                                        显示艺术家
                                    </button>
                                )}
                            </MenuItem>
                        </MenuItems>
                    </Menu>
                </div>
            </div>

            <div className="flex flex-col gap-0.5" onClick={onClick}>
                <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {item.title}
                </span>
                <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {item.description}
                </span>
            </div>
        </div>
    );
}