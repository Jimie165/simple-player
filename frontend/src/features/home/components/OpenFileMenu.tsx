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
                "relative inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium z-20 transition-all duration-200",
                "bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80 hover:shadow-md",
                "active:scale-95 border border-transparent"
            )}>
                <MdFileOpen className="text-lg" />
                <span>打开</span>
                <div className="w-px h-4 bg-outline/20 mx-0.5" />
                <MdKeyboardArrowDown className="text-xl" />
            </MenuButton>

            <MenuItems
                transition
                className="absolute right-2 md:right-4 mt-2 w-48 origin-top-right rounded-xl bg-surface-container-high shadow-lg ring-1 ring-outline-variant/30 focus:outline-none z-50 transition duration-100 ease-out data-closed:scale-95 data-closed:opacity-0 overflow-hidden"
            >
                <div className="p-1 flex flex-col gap-0.5">
                    <MenuItem>
                        <button
                            onClick={onOpenFile}
                            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors text-on-surface data-focus:bg-secondary-container data-focus:text-on-secondary-container"
                        >
                            <MdFileOpen className="text-lg opacity-80" />
                            打开文件
                        </button>
                    </MenuItem>
                    <MenuItem>
                        <button
                            onClick={onOpenFolder}
                            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors text-on-surface data-focus:bg-secondary-container data-focus:text-on-secondary-container"
                        >
                            <MdFolderOpen className="text-lg opacity-80" />
                            打开文件夹
                        </button>
                    </MenuItem>
                </div>
            </MenuItems>
        </Menu>
    );
}
