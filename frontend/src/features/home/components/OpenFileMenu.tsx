import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { MdFileOpen, MdFolderOpen, MdKeyboardArrowDown } from 'react-icons/md';
import clsx from 'clsx';

interface OpenFileMenuProps {
    onOpenFile: () => void;
    onOpenFolder: () => void;
}

export default function OpenFileMenu({ onOpenFile, onOpenFolder }: OpenFileMenuProps) {
    return (
        <Menu>
            <MenuButton className={clsx(
                "relative inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium z-20 transition-all duration-200",
                "bg-white dark:bg-[#202020]",
                "border border-neutral-300 dark:border-neutral-600",
                "text-neutral-700 dark:text-neutral-200",
                "hover:bg-neutral-100 dark:hover:bg-neutral-700",
                "shadow-sm"
            )}>
                <MdFileOpen className="text-lg text-blue-600 dark:text-blue-400" />
                <span>打开</span>
                <div className="w-px h-4 bg-neutral-300 dark:bg-neutral-600 mx-0.5" />
                <MdKeyboardArrowDown className="text-lg opacity-70" />
            </MenuButton>

            <MenuItems
                transition
                className="absolute right-0 mt-2 w-48 origin-top-right divide-y divide-gray-100 rounded-lg bg-white dark:bg-[#2c2c2c] shadow-xl ring-1 ring-black/5 focus:outline-none border border-neutral-200 dark:border-neutral-700 z-50 transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
            >
                <div className="p-1">
                    <MenuItem>
                        <button
                            onClick={onOpenFile}
                            className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors text-neutral-900 dark:text-neutral-200 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                        >
                            <MdFileOpen className="text-lg opacity-70" />
                            打开文件
                        </button>
                    </MenuItem>
                    <MenuItem>
                        <button
                            onClick={onOpenFolder}
                            className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors text-neutral-900 dark:text-neutral-200 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                        >
                            <MdFolderOpen className="text-lg opacity-70" />
                            打开文件夹
                        </button>
                    </MenuItem>
                </div>
            </MenuItems>
        </Menu>
    );
}