import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Menu, MenuButton, MenuItems, MenuItem, Portal } from '@headlessui/react';
import { MdMoreHoriz } from 'react-icons/md';
import CustomTooltip from '@/components/common/CustomTooltip';
import type { MenuItemData } from '@/hooks/menu/useSongOperations';
import {
    MdPlayArrow,
    MdShuffle,
    MdFavorite,
    MdFavoriteBorder,
    MdDelete,
    MdInfo,
    MdCheckBoxOutlineBlank,
    MdPerson,
    MdAlbum,
    MdEdit,
    MdPlaylistPlay,
    MdPlaylistAdd
} from 'react-icons/md';

export type MusicMenuType = 'song' | 'playlist' | 'album' | 'artist' | 'folder' | 'file' | 'recent' | 'other';

export interface MusicMenuOptions {
    type: MusicMenuType;
    onPlay?: () => void;
    onShuffle?: () => void;
    onAddToQueue?: () => void;
    onAddToPlaylist?: () => void;
    onShowProperties?: () => void;
    onShowAlbum?: () => void;
    onShowArtist?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    deleteText?: string;
    deleteIcon?: React.ElementType;
    deleteVariant?: 'default' | 'danger';
    onFavorite?: () => void;
    isFavorite?: boolean;
    onSelect?: () => void;
    hideSelect?: boolean;
    selectText?: string;
}

export interface MusicContextMenuProps extends Partial<MusicMenuOptions> {
    groups?: MenuItemData[][];
    className?: string; // Wrapper class configuration
    buttonClassName?: string; // Button class configuration
    variant?: 'glass' | 'clean'; // Visual variant
    onOpen?: () => void; // Callback when menu is opened
    suppressCloseEvent?: boolean; // Prevent dispatching global close event on open
    tooltipText?: string; // Optional trigger tooltip
    children?: React.ReactNode; // Custom trigger content
}

function getMusicMenuGroups(options: MusicMenuOptions): MenuItemData[][] {
    const {
        onPlay,
        onShuffle,
        onAddToQueue,
        onAddToPlaylist,
        onShowProperties,
        onShowAlbum,
        onShowArtist,
        onEdit,
        onDelete,
        deleteText,
        deleteIcon,
        deleteVariant,
        onFavorite,
        isFavorite,
        onSelect,
        hideSelect,
        selectText
    } = options;

    const groups: MenuItemData[][] = [];

    const group1: MenuItemData[] = [];
    if (onPlay) group1.push({ id: 'play', label: '播放', icon: MdPlayArrow, onClick: onPlay });
    if (onShuffle) group1.push({ id: 'shuffle', label: '随机播放', icon: MdShuffle, onClick: onShuffle });
    if (onAddToQueue) group1.push({ id: 'queue', label: '加入播放队列', icon: MdPlaylistPlay, onClick: onAddToQueue });
    if (onAddToPlaylist) group1.push({ id: 'add-to', label: '添加到', icon: MdPlaylistAdd, onClick: onAddToPlaylist });
    if (onFavorite) {
        group1.push({
            id: 'favorite',
            label: isFavorite ? '取消喜爱' : '喜爱',
            icon: isFavorite ? MdFavorite : MdFavoriteBorder,
            onClick: onFavorite
        });
    }
    if (group1.length > 0) groups.push(group1);

    const group2: MenuItemData[] = [];
    if (onShowProperties) group2.push({ id: 'properties', label: '属性', icon: MdInfo, onClick: onShowProperties });
    if (onShowAlbum) group2.push({ id: 'album', label: '显示专辑', icon: MdAlbum, onClick: onShowAlbum });
    if (onShowArtist) group2.push({ id: 'artist', label: '显示艺人', icon: MdPerson, onClick: onShowArtist });
    if (onEdit) group2.push({ id: 'edit', label: '编辑', icon: MdEdit, onClick: onEdit });
    if (group2.length > 0) groups.push(group2);

    if (onDelete) {
        groups.push([
            {
                id: 'delete',
                label: deleteText || '删除',
                icon: deleteIcon || MdDelete,
                onClick: onDelete,
                variant: deleteVariant || 'danger'
            }
        ]);
    }

    if (!hideSelect && onSelect) {
        groups.push([
            {
                id: 'select',
                label: selectText || '选择',
                icon: MdCheckBoxOutlineBlank,
                onClick: onSelect
            }
        ]);
    }

    return groups;
}

/**
 * 纯 UI 组件：渲染菜单。
 * 不包含任何业务逻辑，仅根据传入的 groups 渲染项目。
 */
function MenuContent({
    open,
    close,
    resolvedGroups,
    menuRef,
    menuPosition,
    updateMenuPosition
}: {
    open: boolean;
    close: () => void;
    resolvedGroups: MenuItemData[][];
    menuRef: React.RefObject<HTMLDivElement | null>;
    menuPosition: { top: number; left: number; origin: string } | null;
    updateMenuPosition: () => void;
}) {
    useEffect(() => {
        if (!open) return;
        let raf = requestAnimationFrame(() => updateMenuPosition());
        const handleViewportChange = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => updateMenuPosition());
        };

        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('scroll', handleViewportChange, true);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', handleViewportChange);
            window.removeEventListener('scroll', handleViewportChange, true);
        };
    }, [open, resolvedGroups.length, updateMenuPosition]);

    const positionedStyle = menuPosition
        ? { top: menuPosition.top, left: menuPosition.left, transformOrigin: menuPosition.origin }
        : { top: 0, left: 0, opacity: 0, pointerEvents: 'none' as const };

    return (
        <Portal>
            <>
                {open && (
                    <div
                        className="fixed inset-0 z-9998"
                        style={{ touchAction: 'none' }}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            close();
                        }}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            close();
                        }}
                        onWheel={(e) => {
                            e.preventDefault();
                        }}
                    />
                )}
                <MenuItems
                    ref={menuRef}
                    data-menu-portal="true"
                    transition
                    className="fixed w-56 rounded-xl border border-neutral-200/30 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-3xl backdrop-saturate-150 p-1 text-sm text-neutral-900 shadow-2xl ring-1 ring-black/5 focus:outline-none dark:border-white/10 dark:text-white transition duration-200 ease-out data-closed:scale-95 data-closed:opacity-0 z-9999 pointer-events-auto"
                    style={positionedStyle}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {resolvedGroups.map((group, groupIndex) => (
                        <React.Fragment key={groupIndex}>
                            {groupIndex > 0 && <div className="my-1 h-0.5 bg-neutral-200/50 dark:bg-white/20" />}
                            {group.map((item) => (
                                <MenuItem key={item.id}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); item.onClick(); }}
                                        className={`group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-focus:bg-neutral-100 dark:data-focus:bg-white/10 ${item.variant === 'danger' ? 'text-red-600 dark:text-red-400 data-focus:bg-red-50 dark:data-focus:bg-red-900/20' : ''
                                            }`}
                                    >
                                        <div className="flex flex-1 items-center gap-3">
                                            {item.icon && <item.icon className="text-lg opacity-70" />}
                                            {item.label}
                                        </div>
                                        {item.suffix}
                                    </button>
                                </MenuItem>
                            ))}
                        </React.Fragment>
                    ))}
                </MenuItems>
            </>
        </Portal>
    );
}

function MenuLifecycleEffects({
    open,
    buttonRef,
    menuRef,
}: {
    open: boolean;
    buttonRef: React.RefObject<HTMLButtonElement | null>;
    menuRef: React.RefObject<HTMLDivElement | null>;
}) {
    const wasOpenRef = useRef(false);

    useEffect(() => {
        if (!open) {
            if (wasOpenRef.current) {
                requestAnimationFrame(() => {
                    buttonRef.current?.blur();
                });
            }
            wasOpenRef.current = false;
            return;
        }

        wasOpenRef.current = true;
        return;
    }, [open, buttonRef]);

    useEffect(() => {
        if (!open) return;

        const shouldAllowEvent = (target: EventTarget | null) => {
            const node = target instanceof Node ? target : null;
            return !!node && !!menuRef.current?.contains(node);
        };

        const blockScrollGesture = (event: WheelEvent | TouchEvent) => {
            if (shouldAllowEvent(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
        };

        const blockScrollKeys = (event: KeyboardEvent) => {
            if (shouldAllowEvent(event.target)) return;
            const blockedKeys = new Set([
                'ArrowUp',
                'ArrowDown',
                'PageUp',
                'PageDown',
                'Home',
                'End',
                ' ',
                'Spacebar',
            ]);

            if (!blockedKeys.has(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
        };

        const nonPassiveCapture = { capture: true, passive: false } as const;
        const captureOnly = { capture: true } as const;

        window.addEventListener('wheel', blockScrollGesture, nonPassiveCapture);
        window.addEventListener('touchmove', blockScrollGesture, nonPassiveCapture);
        window.addEventListener('keydown', blockScrollKeys, captureOnly);

        return () => {
            window.removeEventListener('wheel', blockScrollGesture, nonPassiveCapture);
            window.removeEventListener('touchmove', blockScrollGesture, nonPassiveCapture);
            window.removeEventListener('keydown', blockScrollKeys, captureOnly);
        };
    }, [open, menuRef]);

    return null;
}

export default function MusicContextMenu(props: MusicContextMenuProps) {
    const { groups, className, buttonClassName, variant = 'glass', onOpen, suppressCloseEvent, tooltipText } = props;
    const resolvedGroups = groups ?? (props.type ? getMusicMenuGroups(props as MusicMenuOptions) : []);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; origin: string } | null>(null);

    const getButtonClass = () => {
        const baseClass = `flex items-center justify-center transition-colors z-20 ${buttonClassName || 'w-8 h-8'}`;
        if (variant === 'clean') {
            return `${baseClass} text-primary dark:text-primary-light hover:opacity-80`;
        }
        return `${baseClass} rounded-full bg-white/20 backdrop-blur-md border border-white/20 text-white hover:bg-white/30`;
    };

    const updateMenuPosition = useCallback(() => {
        const buttonEl = buttonRef.current;
        const menuEl = menuRef.current;
        if (!buttonEl || !menuEl) return;

        const buttonRect = buttonEl.getBoundingClientRect();
        const menuRect = menuEl.getBoundingClientRect();
        const padding = 8;
        const gap = 6;

        let left = buttonRect.right - menuRect.width;
        let top = buttonRect.bottom + gap;

        if (left + menuRect.width > window.innerWidth - padding) {
            left = window.innerWidth - padding - menuRect.width;
        }
        if (left < padding) left = padding;

        let origin = 'top right';
        if (top + menuRect.height > window.innerHeight - padding) {
            top = buttonRect.top - menuRect.height - gap;
            origin = 'bottom right';
        }
        if (top < padding) top = padding;

        setMenuPosition((prev) =>
            prev && prev.top === top && prev.left === left && prev.origin === origin
                ? prev
                : { top, left, origin }
        );
    }, []);

    // 只有当有内容时才渲染。放在 hooks 之后，避免条件调用 hooks。
    if (!resolvedGroups || resolvedGroups.length === 0 || resolvedGroups.every(g => g.length === 0)) {
        return null;
    }

    return (
        <div
            className={className}
        >
            <Menu as="div" className="relative">
                {({ open, close }) => {
                    const trigger = (
                        <MenuButton
                            ref={buttonRef}
                            aria-label={tooltipText}
                            className={getButtonClass()}
                            onClick={(e) => {
                                // Stop propagation first to prevent event from triggering row click
                                e.stopPropagation();

                                // Close any open right-click (cursor) context menus before opening this menu.
                                // Use a custom event so Headless UI's own outside-click listeners don't
                                // see a synthetic mousedown and immediately close this menu again.
                                if (!suppressCloseEvent) {
                                    window.dispatchEvent(new CustomEvent('app:close-cursor-menus'));
                                }

                                // Notify parent component that menu is opening
                                // This should close the right-click menu via setContextMenu(null)
                                onOpen?.();
                            }}
                            onDoubleClick={(e) => e.stopPropagation()}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                        >
                            {props.children || <MdMoreHoriz />}
                        </MenuButton>
                    );

                    return (
                        <>
                            <MenuLifecycleEffects
                                open={open}
                                buttonRef={buttonRef}
                                menuRef={menuRef}
                            />
                            {tooltipText
                                ? <CustomTooltip text={tooltipText}>{trigger}</CustomTooltip>
                                : trigger}
                            <MenuContent
                                open={open}
                                close={close}
                                resolvedGroups={resolvedGroups}
                                menuRef={menuRef}
                                menuPosition={menuPosition}
                                updateMenuPosition={updateMenuPosition}
                            />
                        </>
                    );
                }}
            </Menu>
        </div >
    );
}
