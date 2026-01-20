
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { IoPlay, IoEllipsisHorizontal, IoAdd, IoPerson, IoDisc, IoTrash, IoInformationCircle, IoCheckboxOutline } from 'react-icons/io5';
import { MdPlaylistPlay } from 'react-icons/md';
import React from 'react';

export type MusicItemType = 'song' | 'album' | 'artist' | 'folder' | 'file';

// Data Structure for Menu Items
export interface MusicMenuItemData {
    id: string;
    label: string;
    icon: React.ElementType;
    onClick: () => void;
    variant?: 'default' | 'danger';
    suffix?: React.ReactNode;
}

export const getMusicMenuGroups = (props: MusicContextMenuProps): MusicMenuItemData[][] => {
    const { type } = props;
    const groups: MusicMenuItemData[][] = [];

    // --- Logic Gates based on Type ---
    const showAddTo = ['song', 'album', 'artist'].includes(type);
    const showProperties = ['song', 'file'].includes(type);
    const showAlbum = ['song', 'album', 'file'].includes(type); // Also show for file type if handler provided
    const showArtist = ['song', 'album', 'artist', 'file'].includes(type); // Also show for file type if handler provided
    // Wait, user said for Artist: "reduce Properties, Show Album". So Artist maintains "Show Artist" (nav to detail?) 
    // Actually typically context menu on Artist might have "Go to Artist" if on a card.
    // Let's follow strict strict rules:
    // "If Artist, reduce Properties, Show Album". So it keeps Show Artist.

    // Folder is strict: Play, Queue, Delete, Select ONLY.
    const isFolder = type === 'folder';

    // Group 1: Playback & Add To
    const group1: MusicMenuItemData[] = [];
    if (props.onPlay) {
        group1.push({ id: 'play', label: '播放', icon: IoPlay, onClick: props.onPlay });
    }
    if (props.onAddToQueue) {
        group1.push({ id: 'queue', label: '加入播放队列', icon: MdPlaylistPlay, onClick: props.onAddToQueue });
    }
    // Add to Playlist (Restricted by type)
    if (!isFolder && showAddTo && props.onAddToPlaylist) {
        group1.push({
            id: 'add-to',
            label: '添加到',
            icon: IoAdd,
            onClick: props.onAddToPlaylist,
            suffix: <span className="text-xs opacity-50">&gt;</span>
        });
    }
    if (group1.length > 0) groups.push(group1);

    // Group 2: Info / Navigation
    // Access: Song(All), Album(Album/Artist), Artist(Artist), File(Props), Folder(None)
    const group2: MusicMenuItemData[] = [];
    if (!isFolder) {
        if (showProperties && props.onShowProperties) {
            group2.push({ id: 'properties', label: '属性', icon: IoInformationCircle, onClick: props.onShowProperties });
        }
        if (showAlbum && props.onShowAlbum) {
            group2.push({ id: 'album', label: '显示专辑', icon: IoDisc, onClick: props.onShowAlbum });
        }
        if (showArtist && props.onShowArtist) {
            group2.push({ id: 'artist', label: '显示艺人', icon: IoPerson, onClick: props.onShowArtist });
        }
    }
    if (group2.length > 0) groups.push(group2);

    // Group 3: Danger
    const group3: MusicMenuItemData[] = [];
    if (props.onDelete) {
        group3.push({
            id: 'delete',
            label: props.deleteText || "删除",
            icon: IoTrash,
            onClick: props.onDelete,
            variant: 'danger'
        });
    }
    if (group3.length > 0) groups.push(group3);

    // Group 4: Select
    // Always show Select if handler provided (User request: "Folder... Play, Queue, Delete, Select")
    groups.push([{
        id: 'select',
        label: '选择',
        icon: IoCheckboxOutline,
        onClick: props.onSelect || (() => { })
    }]);

    return groups;
};

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
    onOpen?: () => void; // New prop for notifying when menu is opened
    className?: string; // Wrapper class customization
    buttonClassName?: string; // Button class customization
    variant?: 'glass' | 'clean'; // Visual variant
}
export default function MusicContextMenu(props: MusicContextMenuProps) {
    const { className, buttonClassName, variant = 'glass', onOpen } = props;
    const menuGroups = getMusicMenuGroups(props);

    const getButtonClass = () => {
        const baseClass = `flex items-center justify-center transition-colors z-20 ${buttonClassName || 'w-8 h-8'}`;
        if (variant === 'clean') {
            return `${baseClass} text-[#1867c0] dark:text-[#64b5f6] hover:bg-neutral-100 dark:hover:bg-white/10 rounded-full`;
        }
        return `${baseClass} rounded-full bg-white/20 backdrop-blur-md border border-white/20 text-white hover:bg-white/30`;
    };

    return (
        <div className={className} onClick={(e) => { e.stopPropagation(); onOpen?.(); }}>
            <Menu as="div" className="relative">
                <MenuButton className={getButtonClass()}>
                    <IoEllipsisHorizontal />
                </MenuButton>
                <MenuItems
                    transition
                    portal
                    anchor="bottom end"
                    className="w-56 origin-top-right rounded-xl border border-neutral-200 bg-white p-1 text-sm text-neutral-900 shadow-xl ring-1 ring-black/5 focus:outline-none dark:bg-[#2c2c2c] dark:border-neutral-700 dark:text-white transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 z-[100] pointer-events-auto"
                >
                    {menuGroups.map((group, groupIndex) => (
                        <React.Fragment key={groupIndex}>
                            {groupIndex > 0 && <div className="my-1 h-px bg-neutral-200 dark:bg-white/10" />}
                            {group.map((item) => (
                                <MenuItem key={item.id}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); item.onClick(); }}
                                        className={`group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10 ${item.variant === 'danger' ? 'text-red-600 dark:text-red-400 data-[focus]:bg-red-50 dark:data-[focus]:bg-red-900/20' : ''
                                            }`}
                                    >
                                        {/* Flex 布局处理：图标+文字 在左，suffix 在右 */}
                                        <div className="flex flex-1 items-center gap-3">
                                            <item.icon className="text-lg opacity-70" />
                                            {item.label}
                                        </div>
                                        {item.suffix}
                                    </button>
                                </MenuItem>
                            ))}
                        </React.Fragment>
                    ))}
                </MenuItems>
            </Menu>
        </div >
    );
}
