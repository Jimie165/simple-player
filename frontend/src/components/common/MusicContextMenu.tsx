
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { IoPlay, IoEllipsisHorizontal, IoAdd, IoPerson, IoDisc, IoTrash, IoInformationCircle, IoCheckboxOutline } from 'react-icons/io5';
import { MdPlaylistPlay } from 'react-icons/md';


export type MusicItemType = 'song' | 'album' | 'artist' | 'folder' | 'playlist';

interface MusicContextMenuProps {
    type: MusicItemType;
    onPlay?: () => void;
    onAddToQueue?: () => void;
    onAddToPlaylist?: () => void; // Placeholder for "Add to..."
    onShowProperties?: () => void;
    onShowAlbum?: () => void;
    onShowArtist?: () => void;
    onDelete?: () => void;
    deleteText?: string;
    onSelect?: () => void;
    className?: string; // Wrapper class customization
    buttonClassName?: string; // Button class customization
    variant?: 'glass' | 'clean'; // Visual variant
}

export default function MusicContextMenu({
    type,
    onPlay,
    onAddToQueue,
    onAddToPlaylist,
    onShowProperties,
    onShowAlbum,
    onShowArtist,
    onDelete,
    deleteText = "删除",
    onSelect,
    className,
    buttonClassName,
    variant = 'glass'
}: MusicContextMenuProps) {
    const getButtonClass = () => {
        const baseClass = `flex items-center justify-center transition-colors z-20 ${buttonClassName || 'w-8 h-8'}`;

        if (variant === 'clean') {
            return `${baseClass} text-[#1867c0] dark:text-[#64b5f6] hover:bg-neutral-100 dark:hover:bg-white/10 rounded-full`;
        }

        // Default 'glass'
        return `${baseClass} rounded-full bg-white/20 backdrop-blur-md border border-white/20 text-white hover:bg-white/30`;
    };

    return (
        <div className={className} onClick={(e) => e.stopPropagation()}>
            <Menu as="div" className="relative">
                <MenuButton className={getButtonClass()}>
                    <IoEllipsisHorizontal />
                </MenuButton>
                <MenuItems
                    transition
                    anchor="bottom end"
                    className="w-56 origin-top-right rounded-xl border border-neutral-200 bg-white p-1 text-sm text-neutral-900 shadow-xl ring-1 ring-black/5 focus:outline-none dark:bg-[#2c2c2c] dark:border-neutral-700 dark:text-white transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 z-50"
                >
                    {/* Play */}
                    {onPlay && (
                        <MenuItem>
                            <button onClick={(e) => { e.stopPropagation(); onPlay(); }} className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                                <IoPlay className="text-lg opacity-70" />
                                播放
                            </button>
                        </MenuItem>
                    )}

                    {/* Add to Queue */}
                    {onAddToQueue && (
                        <MenuItem>
                            <button
                                onClick={(e) => { e.stopPropagation(); onAddToQueue(); }}
                                className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                            >
                                <MdPlaylistPlay className="text-lg opacity-70" />
                                加入播放队列
                            </button>
                        </MenuItem>
                    )}

                    {/* Add to Playlist (Placeholder) */}
                    <MenuItem>
                        <button className="group flex w-full items-center justify-between rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10" onClick={(e) => { e.stopPropagation(); onAddToPlaylist?.(); }}>
                            <div className="flex items-center gap-3">
                                <IoAdd className="text-lg opacity-70" />
                                添加到
                            </div>
                            <span className="text-xs opacity-50">&gt;</span>
                        </button>
                    </MenuItem>

                    <div className="my-1 h-px bg-neutral-200 dark:bg-white/10" />

                    {/* Properties (File/Song only usually) */}
                    {type === 'song' && onShowProperties && (
                        <MenuItem>
                            <button
                                onClick={(e) => { e.stopPropagation(); onShowProperties(); }}
                                className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                            >
                                <IoInformationCircle className="text-lg opacity-70" />
                                属性
                            </button>
                        </MenuItem>
                    )}

                    {/* Show Album */}
                    {onShowAlbum && (
                        <MenuItem>
                            <button
                                onClick={(e) => { e.stopPropagation(); onShowAlbum(); }}
                                className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                            >
                                <IoDisc className="text-lg opacity-70" />
                                显示专辑
                            </button>
                        </MenuItem>
                    )}

                    {/* Show Artist */}
                    {onShowArtist && (
                        <MenuItem>
                            <button
                                onClick={(e) => { e.stopPropagation(); onShowArtist(); }}
                                className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                            >
                                <IoPerson className="text-lg opacity-70" />
                                显示艺人
                            </button>
                        </MenuItem>
                    )}

                    <div className="my-1 h-px bg-neutral-200 dark:bg-white/10" />

                    {/* Delete */}
                    {onDelete && (
                        <MenuItem>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 text-red-600 dark:text-red-400 data-[focus]:bg-red-50 dark:data-[focus]:bg-red-900/20"
                            >
                                <IoTrash className="text-lg opacity-70" />
                                {deleteText}
                            </button>
                        </MenuItem>
                    )}

                    <div className="my-1 h-px bg-neutral-200 dark:bg-white/10" />

                    {/* Select */}
                    <MenuItem>
                        <button
                            className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                            onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
                        >
                            <IoCheckboxOutline className="text-lg opacity-70" />
                            选择
                        </button>
                    </MenuItem>
                </MenuItems>
            </Menu>
        </div >
    );
}
