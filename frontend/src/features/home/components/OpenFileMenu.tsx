import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { MdFileOpen, MdFolderOpen, MdKeyboardArrowDown } from 'react-icons/md';
import clsx from 'clsx';

interface OpenFileMenuProps {
    onOpenFile: () => void;
    onOpenFolder: () => void;
}

export default function OpenFileMenu({ onOpenFile, onOpenFolder }: OpenFileMenuProps) {
    return (
        <Menu as="div" className="relative z-20 inline-flex">
            {({ open }) => (
                <>
                    <div
                        className={clsx(
                            "inline-flex h-10 items-stretch overflow-hidden rounded-full border border-transparent bg-secondary-container text-on-secondary-container shadow-sm transition-[border-color,box-shadow,background-color,filter] duration-200",
                            open
                                ? "brightness-105 shadow-md dark:brightness-125"
                                : "hover:brightness-105 hover:shadow-md dark:hover:brightness-125"
                        )}
                    >
                        <button
                            type="button"
                            onClick={onOpenFile}
                            className="inline-flex items-center gap-2 px-4 text-sm font-medium transition-colors hover:bg-white/15 focus:outline-none focus-visible:bg-white/20 active:bg-black/10"
                        >
                            <MdFileOpen className="text-[19px]" aria-hidden="true" />
                            <span>打开</span>
                        </button>

                        <span className="my-2 w-px bg-outline/20" aria-hidden="true" />

                        <MenuButton
                            aria-label="选择打开方式"
                            className="group grid w-10 place-items-center text-on-secondary-container/85 transition-colors hover:bg-white/15 hover:text-on-secondary-container focus:outline-none focus-visible:bg-white/20 focus-visible:text-on-secondary-container active:bg-black/10"
                        >
                            <MdKeyboardArrowDown
                                className={clsx(
                                    "text-xl transition-transform duration-200 ease-out",
                                    open && "rotate-180"
                                )}
                                aria-hidden="true"
                            />
                        </MenuButton>
                    </div>

                    <MenuItems
                        transition
                        anchor={{ to: 'bottom end', gap: 8 }}
                        className="z-50 w-52 origin-top-right overflow-hidden rounded-xl bg-surface-container-high p-1.5 text-on-surface shadow-xl ring-1 ring-outline-variant/30 focus:outline-none transition duration-150 ease-out data-closed:-translate-y-1 data-closed:scale-[0.98] data-closed:opacity-0"
                    >
                        <MenuItem>
                            <button
                                type="button"
                                onClick={onOpenFile}
                                className="group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors data-focus:bg-secondary-container data-focus:text-on-secondary-container"
                            >
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-on-surface/80 transition-colors group-data-focus:text-on-secondary-container">
                                    <MdFileOpen className="text-lg" aria-hidden="true" />
                                </span>
                                <span className="font-medium">打开文件</span>
                            </button>
                        </MenuItem>

                        <MenuItem>
                            <button
                                type="button"
                                onClick={onOpenFolder}
                                className="group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors data-focus:bg-secondary-container data-focus:text-on-secondary-container"
                            >
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-on-surface/80 transition-colors group-data-focus:text-on-secondary-container">
                                    <MdFolderOpen className="text-lg" aria-hidden="true" />
                                </span>
                                <span className="font-medium">打开文件夹</span>
                            </button>
                        </MenuItem>
                    </MenuItems>
                </>
            )}
        </Menu>
    );
}
