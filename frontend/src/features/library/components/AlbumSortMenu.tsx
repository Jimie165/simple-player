import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { MdSort, MdCheck } from 'react-icons/md';

interface AlbumSortMenuProps {
    albumSortKey: 'name' | 'artist';
    setAlbumSortKey: (key: 'name' | 'artist') => void;
}

export default function AlbumSortMenu({ albumSortKey, setAlbumSortKey }: AlbumSortMenuProps) {
    return (
        <div className="flex justify-end mb-4">
            <Menu as="div" className="relative">
                <MenuButton className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors">
                    <MdSort className="text-lg" />
                    排序: {albumSortKey === 'name' ? '名称' : '艺人'}
                </MenuButton>
                <MenuItems
                    anchor="bottom end"
                    className="w-40 origin-top-right rounded-xl border border-neutral-200/50 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl p-1 text-sm text-neutral-900 shadow-2xl ring-1 ring-black/5 focus:outline-none dark:border-neutral-700/50 dark:text-white z-50 mt-2"
                >
                    <MenuItem>
                        <button onClick={() => setAlbumSortKey('name')} className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                            按名称
                            {albumSortKey === 'name' && <MdCheck />}
                        </button>
                    </MenuItem>
                    <MenuItem>
                        <button onClick={() => setAlbumSortKey('artist')} className="group flex w-full items-center justify-between gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10">
                            按艺人
                            {albumSortKey === 'artist' && <MdCheck />}
                        </button>
                    </MenuItem>
                </MenuItems>
            </Menu>
        </div>
    );
}
