import { useRef, useEffect, useState, useMemo } from 'react';
import { useSelectionStore } from '@/store/useSelectionStore';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useSongOperations } from '@/hooks/menu/useSongOperations';
import type { MusicMenuContext } from '@/hooks/menu/useSongOperations';
import type { MusicItem } from '@/utils/musicItemUtils';
import { MdClose, MdCheckBoxOutlineBlank, MdCheckBox, MdMoreHoriz } from 'react-icons/md';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';


export default function SelectionMenuBar() {
    // Integration
    const { isSelectionMode, selectedIds, selectableIds, clearSelection, selectedItemsMap, setSelectAllRequested, selectionType } = useSelectionStore();
    const { activeOverlay, currentPage } = useNavigationStore();

    const [visibleCount, setVisibleCount] = useState(4);
    const containerRef = useRef<HTMLDivElement>(null);

    const allSelected = useMemo(() => {
        if (!isSelectionMode) return false;
        if (selectableIds.size === 0) return false;
        for (const id of selectableIds) {
            if (!selectedIds.has(id)) return false;
        }
        return true;
    }, [isSelectionMode, selectableIds, selectedIds]);


    // Determine Context
    const context = useMemo<MusicMenuContext>(() => {
        // Home page selection should always be treated as recent history,
        // even when selected items are videos.
        if (currentPage === 'home') return 'recent';

        // Preference 1: Explicit selection type from store
        if (selectionType === 'video') return 'video';
        if (selectionType === 'playlist') {
            // Check if it's the special favorites playlist
            if (Array.from(selectedIds).includes('playlist:favorites')) return 'playlist_list';
            return 'playlist_list';
        }

        // Preference 2: Navigation context
        if (activeOverlay?.type === 'playlist_detail') return 'playlist';
        if (activeOverlay?.type === 'album_detail') return 'album_detail';
        if (activeOverlay?.type === 'artist_detail') return 'artist_detail';
        if (currentPage === 'library') return 'library';
        if (currentPage === 'videos') return 'video';
        return 'other'; // generic
    }, [activeOverlay, currentPage, selectionType, selectedIds]);

    const activePlaylistData = activeOverlay?.data as { id?: unknown } | undefined;
    const playlistId = activeOverlay?.type === 'playlist_detail' && activePlaylistData?.id
        ? activePlaylistData.id
        : undefined;

    // Get Items
    const selectedItems = useMemo<MusicItem[]>(() => {
        if (!selectedItemsMap) return [];
        return Array.from(selectedIds).map(id => {
            const item = selectedItemsMap.get(id);
            if (item && typeof item === 'object' && selectionType) {
                // Ensure item carries its type for useSongOperations metadata logic
                // ONLY override if item doesn't have a type (e.g. SongMetadata from SongList)
                // RecentItems already have a type ('file', 'album') which we should preserve.
                const record = item as Record<string, unknown>;
                return { ...record, type: record.type || selectionType };
            }
            return item;
        }).filter((item): item is MusicItem => Boolean(item));
    }, [selectedIds, selectedItemsMap, selectionType]);

    // Use Hook
    const { menuItems } = useSongOperations({
        items: selectedItems,
        context,
        playlistId: typeof playlistId === 'number' ? playlistId : undefined,
        hideSelect: true // No select option in the bar itself
    });

    // Flatten Groups for Bar Display
    // The hook returns [[Play, Next, Add], [Prop], [Delete]]
    // We want to flatten this into a single list of actions
    const flattenedActions = useMemo(() => {
        return menuItems.flat();
    }, [menuItems]);

    // UI Responsiveness
    useEffect(() => {
        const calculateVisibleCount = () => {
            // 使用父容器宽度作为参考
            const parentWidth = containerRef.current?.parentElement?.clientWidth || window.innerWidth;
            const maxContainerWidth = Math.min(parentWidth * 0.9, 800);
            const leftContentWidth = 180;
            const availableForActions = maxContainerWidth - leftContentWidth;
            if (availableForActions < 50) { setVisibleCount(0); return; }
            const buttonAverageWidth = 100;
            let count = Math.floor(availableForActions / buttonAverageWidth);
            // 按照用户要求，最多显示 4 个动作（通常是：播放、下一首、添加到、喜爱）
            count = Math.max(0, Math.min(count, 4));
            setVisibleCount(count);
        };
        calculateVisibleCount();
        window.addEventListener('resize', calculateVisibleCount);
        return () => window.removeEventListener('resize', calculateVisibleCount);
    }, [isSelectionMode]);

    if (!isSelectionMode) return null;

    const count = selectedIds.size;
    const visibleActions = flattenedActions.slice(0, visibleCount);
    const overflowActions = flattenedActions.slice(visibleCount);

    return (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-95 w-max max-w-[calc(100%-48px)] transition-all duration-300 pointer-events-auto" ref={containerRef}>
            <div className="flex items-center gap-3 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-3xl backdrop-saturate-150 p-2 pl-3 pr-3 rounded-2xl shadow-2xl border border-neutral-200/30 dark:border-white/10">
                {/* Select All Toggle */}
                <button
                    onClick={() => {
                        if (allSelected) {
                            clearSelection();
                        } else {
                            setSelectAllRequested(true);
                        }
                    }}
                    className={`p-1.5 rounded-xl transition-all active:scale-90 flex items-center justify-center ${allSelected
                        ? 'text-primary'
                        : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                        }`}
                >
                    {allSelected ? <MdCheckBox className="text-[22px]" /> : <MdCheckBoxOutlineBlank className="text-[22px]" />}
                </button>

                <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900 dark:text-white whitespace-nowrap text-sm">
                        已选择 {count} 项
                    </span>
                    <button
                        onClick={() => clearSelection()}
                        className="p-1 px-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors shrink-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                    >
                        <MdClose className="text-lg" />
                    </button>
                </div>

                <div className="h-6 w-px bg-neutral-200 dark:bg-white/10 mx-1 shrink-0" />

                {/* Actions */}
                <div className="flex items-center gap-0.5">
                    {visibleActions.map(action => (
                        <button
                            key={action.id}
                            onClick={() => {
                                action.onClick();
                                clearSelection();
                            }}
                            className={`
                                flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 whitespace-nowrap
                                ${action.id === 'play' // Highlight Play primary
                                    ? 'bg-primary text-on-primary shadow-sm hover:brightness-110'
                                    : 'hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-200'
                                }
                                ${action.variant === 'danger' ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20' : ''}
                            `}
                        >
                            <action.icon className="text-lg" />
                            {action.label}
                        </button>
                    ))}

                    {overflowActions.length > 0 && (
                        <Menu as="div" className="relative">
                            <MenuButton className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors shrink-0">
                                <MdMoreHoriz className="text-xl text-neutral-600 dark:text-neutral-300" />
                            </MenuButton>
                            <MenuItems
                                anchor={{ to: 'top end', gap: 9 }}
                                className="w-48 origin-bottom-right rounded-xl border border-neutral-200/30 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-3xl backdrop-saturate-150 p-1 text-sm shadow-2xl dark:border-white/10 z-100"
                            >
                                {overflowActions.map(action => (
                                    <MenuItem key={action.id}>
                                        <button
                                            onClick={() => {
                                                action.onClick();
                                                clearSelection();
                                            }}
                                            className={`group flex w-full items-center gap-2 rounded-lg py-2 px-3 data-focus:bg-neutral-100 dark:data-focus:bg-white/10 ${action.variant === 'danger' ? 'text-red-600' : 'text-neutral-700 dark:text-neutral-200'
                                                }`}
                                        >
                                            <action.icon className="text-lg" />
                                            {action.label}
                                        </button>
                                    </MenuItem>
                                ))}
                            </MenuItems>
                        </Menu>
                    )}
                </div>
            </div>
        </div>
    );
}
