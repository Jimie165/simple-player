import { useRef, useEffect, useState, useMemo } from 'react';
import { useSelectionStore } from '../../store/useSelectionStore';
import { useNavigationStore } from '../../store/useNavigationStore';
import { useSongOperations } from '../../hooks/useSongOperations';
import type { MusicMenuContext } from '../../hooks/useSongOperations';
import { MdClose, MdCheckBoxOutlineBlank, MdCheckBox, MdMoreHoriz } from 'react-icons/md';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';


export default function SelectionMenuBar() {
    // Integration
    const { isSelectionMode, selectedIds, clearSelection, selectedItemsMap, setSelectAllRequested, selectionType } = useSelectionStore();
    const { activeOverlay, currentPage } = useNavigationStore();

    const [visibleCount, setVisibleCount] = useState(4);
    const containerRef = useRef<HTMLDivElement>(null);
    const [justClickedAll, setJustClickedAll] = useState(false);

    // Auto-clean
    useEffect(() => {
        if (!isSelectionMode) return;
        // Logic to cleanup if navigating? 
        // Existing SelectionActionBar did this.
        // We will keep it to avoid stuck selection.
        // clearSelection(); // Wait, this clears it immediately if we mount? 
        // No, typically we might want to persist selection across some navigations?
        // But for safety let's follow existing pattern: depends on where this component is mounted.
        // If it is Global, we should listen to page changes.
    }, [activeOverlay, currentPage]); // Need careful dependency here.

    useEffect(() => {
        if (selectedIds.size === 0) setJustClickedAll(false);
    }, [selectedIds.size]);


    // Determine Context
    const context = useMemo<MusicMenuContext>(() => {
        // Preference 1: Explicit selection type from store
        if (selectionType === 'playlist') {
            // Check if it's the special favorites playlist
            if (Array.from(selectedIds).includes('favorites')) return 'playlist_list';
            return 'playlist_list';
        }

        // Preference 2: Navigation context
        if (activeOverlay?.type === 'playlist_detail') return 'playlist';
        if (activeOverlay?.type === 'album_detail') return 'library';
        if (currentPage === 'home') return 'recent'; // Home page uses recent context for history
        if (currentPage === 'library') return 'library';
        return 'other'; // generic
    }, [activeOverlay, currentPage, selectionType, selectedIds]);

    const playlistId = activeOverlay?.type === 'playlist_detail' && activeOverlay.data?.id
        ? activeOverlay.data.id
        : undefined;

    // Get Items
    const selectedItems = useMemo(() => {
        if (!selectedItemsMap) return [];
        return Array.from(selectedIds).map(id => {
            const item = selectedItemsMap.get(id);
            if (item && selectionType) {
                // Ensure item carries its type for useSongOperations metadata logic
                return { ...item, type: selectionType };
            }
            return item;
        }).filter(Boolean);
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
            const maxContainerWidth = Math.min(window.innerWidth * 0.9, 800);
            const leftContentWidth = 200;
            const availableForActions = maxContainerWidth - leftContentWidth;
            if (availableForActions < 50) { setVisibleCount(0); return; }
            const buttonAverageWidth = 110;
            let count = Math.floor(availableForActions / buttonAverageWidth);
            count = Math.max(0, Math.min(count, 5));
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
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 max-w-[90vw]" ref={containerRef}>
            <div className="flex items-center gap-3 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl p-2 pl-3 pr-3 rounded-2xl shadow-2xl border border-neutral-200/50 dark:border-neutral-700/50">
                {/* Select All Toggle */}
                <button
                    onClick={() => {
                        if (justClickedAll) {
                            clearSelection();
                            setJustClickedAll(false);
                        } else {
                            setSelectAllRequested(true);
                            setJustClickedAll(true);
                        }
                    }}
                    className={`p-1.5 rounded-xl transition-all active:scale-90 flex items-center justify-center ${justClickedAll
                        ? 'text-primary'
                        : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                        }`}
                >
                    {justClickedAll ? <MdCheckBox className="text-[22px]" /> : <MdCheckBoxOutlineBlank className="text-[22px]" />}
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
                            onClick={action.onClick}
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
                            <MenuButton className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors">
                                <MdMoreHoriz className="text-xl text-neutral-600 dark:text-neutral-300" />
                            </MenuButton>
                            <MenuItems
                                anchor={{ to: 'top end', gap: 9 }}
                                className="w-48 origin-bottom-right rounded-xl border border-neutral-200/50 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl p-1 text-sm shadow-2xl dark:border-neutral-700/50 z-[100]"
                            >
                                {overflowActions.map(action => (
                                    <MenuItem key={action.id}>
                                        <button
                                            onClick={action.onClick}
                                            className={`group flex w-full items-center gap-2 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10 ${action.variant === 'danger' ? 'text-red-600' : 'text-neutral-700 dark:text-neutral-200'
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
