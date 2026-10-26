import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { MdFileOpen, MdFolderOpen, MdKeyboardArrowDown } from 'react-icons/md';
import clsx from 'clsx';
import { useRef } from 'react';
import MenuDismiss from '@/components/common/MenuDismiss';
import { useSelectionStore } from '@/store/useSelectionStore';

interface OpenFileMenuProps {
    onOpenFile: () => void;
    onOpenFolder: () => void;
}

export default function OpenFileMenu({ onOpenFile, onOpenFolder }: OpenFileMenuProps) {
    const disabled = useSelectionStore(state => state.isSelectionMode);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    return (
        <Menu key={disabled ? 'disabled' : 'enabled'} as="div" className={clsx('relative z-20 inline-flex dark:[--menu-hover:rgba(255,255,255,0.08)] dark:[--menu-highlight:rgba(255,255,255,0.16)]', disabled && 'opacity-40 pointer-events-none')}>
            {({ open, close }) => (
                <>
                    <MenuDismiss open={open} menuRef={menuRef} triggerRef={triggerRef} onClose={close} />
                    <div
                        className={clsx(
                            "inline-flex h-10 items-stretch overflow-hidden rounded-full border border-transparent text-on-surface shadow-sm transition-[border-color,box-shadow,background-color] duration-200",
                            open
                                ? "bg-menu-highlight shadow-md"
                                : "bg-on-surface/5 hover:bg-menu-hover hover:shadow-md"
                        )}
                    >
                        <button
                            disabled={disabled}
                            type="button"
                            onClick={onOpenFile}
                            className="inline-flex items-center gap-2 px-4 text-sm font-medium transition-colors hover:bg-menu-hover focus:outline-none focus-visible:bg-menu-hover active:bg-menu-highlight"
                        >
                            <MdFileOpen className="text-[19px]" aria-hidden="true" />
                            <span>打开</span>
                        </button>

                        <span className="my-2 w-px bg-outline/20" aria-hidden="true" />

                        <MenuButton
                            disabled={disabled}
                            ref={triggerRef}
                            aria-label="选择打开方式"
                            className="group grid w-10 place-items-center text-on-surface-variant transition-colors hover:bg-menu-hover hover:text-on-surface focus:outline-none focus-visible:bg-menu-hover focus-visible:text-on-surface active:bg-menu-highlight"
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
                        ref={menuRef}
                        modal={false}
                        transition
                        anchor={{ to: 'bottom end', gap: 8 }}
                        className="z-9999 w-52 origin-top-right overflow-hidden rounded-xl border border-(--content-glass-edge) bg-(--content-glass-background) p-1.5 text-on-surface shadow-xl ring-1 ring-on-surface/5 backdrop-blur-lg backdrop-saturate-220 focus:outline-none transition duration-150 ease-out data-closed:-translate-y-1 data-closed:scale-[0.98] data-closed:opacity-0 dark:[--menu-hover:rgba(255,255,255,0.08)] dark:[--menu-highlight:rgba(255,255,255,0.16)]"
                    >
                        <MenuItem>
                            <button
                                type="button"
                                onClick={onOpenFile}
                                className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-menu-hover data-focus:bg-menu-hover"
                            >
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full opacity-70">
                                    <MdFileOpen className="text-lg" aria-hidden="true" />
                                </span>
                                <span className="font-medium">打开文件</span>
                            </button>
                        </MenuItem>

                        <MenuItem>
                            <button
                                type="button"
                                onClick={onOpenFolder}
                                className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-menu-hover data-focus:bg-menu-hover"
                            >
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full opacity-70">
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
