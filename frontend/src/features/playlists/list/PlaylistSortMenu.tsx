import { MdSort, MdCheck } from 'react-icons/md';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';

export type PlaylistSortKey = 'name' | 'recently_added' | 'recently_played';

interface PlaylistSortMenuProps {
    sortKey: PlaylistSortKey;
    setSortKey: (key: PlaylistSortKey) => void;
}

export default function PlaylistSortMenu({ sortKey, setSortKey }: PlaylistSortMenuProps) {
    return (
        <Menu as="div" className="relative">
            <MenuButton className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors">
                <MdSort className="text-lg" />
                排序
            </MenuButton>
            <MenuItems
                anchor="bottom end"
                className="w-40 origin-top-right rounded-xl border border-on-surface/10 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-xl p-1 text-sm text-on-surface shadow-2xl ring-1 ring-black/5 focus:outline-none z-50 mt-2"
            >
                <MenuItem>
                    <button onClick={() => setSortKey('recently_played')} className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 transition-colors data-focus:bg-on-surface/8">
                        最近播放
                        {sortKey === 'recently_played' && <MdCheck />}
                    </button>
                </MenuItem>
                <MenuItem>
                    <button onClick={() => setSortKey('recently_added')} className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 transition-colors data-focus:bg-on-surface/8">
                        最近添加
                        {sortKey === 'recently_added' && <MdCheck />}
                    </button>
                </MenuItem>
                <MenuItem>
                    <button onClick={() => setSortKey('name')} className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 transition-colors data-focus:bg-on-surface/8">
                        名称
                        {sortKey === 'name' && <MdCheck />}
                    </button>
                </MenuItem>
            </MenuItems>
        </Menu>
    );
}
