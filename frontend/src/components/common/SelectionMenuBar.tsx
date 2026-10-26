import MusicContextMenu from '@/components/common/MusicContextMenu';
import MoreIcon from '@/components/common/MoreIcon';
import { useRef, useLayoutEffect, useState, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useSelectionStore } from '@/store/useSelectionStore';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useSongOperations } from '@/hooks/menu/useSongOperations';
import type { MusicMenuContext } from '@/hooks/menu/useSongOperations';
import type { MusicItem } from '@/utils/musicItemUtils';
import { MdClose, MdCheckBoxOutlineBlank, MdCheckBox } from 'react-icons/md';

const fadeVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };

export default function SelectionMenuBar({ leftOffset }: { leftOffset: number }) {
    // Integration
    const { isSelectionMode, selectedIds, selectableIds, clearSelection, selectedItemsMap, setSelectAllRequested, selectionType } = useSelectionStore();
    const { activeOverlay, activePlaylistDetail, currentPage } = useNavigationStore();

    const [visibleCount, setVisibleCount] = useState(4);
    const containerRef = useRef<HTMLDivElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const actionsRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const reduceMotion = useReducedMotion();
    const fadeTransition = { duration: reduceMotion ? 0 : 0.16, ease: 'easeOut' as const };

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
        if (activeOverlay?.type === 'album_detail') return 'album_detail';
        if (activeOverlay?.type === 'artist_detail') return 'artist_detail';
        if (activePlaylistDetail) return 'playlist';
        if (currentPage === 'library') return 'library';
        if (currentPage === 'videos') return 'video';
        return 'other'; // generic
    }, [activeOverlay, activePlaylistDetail, currentPage, selectionType, selectedIds]);

    const playlistId = activePlaylistDetail?.id;

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
    useLayoutEffect(() => {
        if (!isSelectionMode) return;
        const container = containerRef.current;
        const toolbar = toolbarRef.current;
        const actions = actionsRef.current;
        const measures = measureRef.current;
        if (!container || !toolbar || !actions || !measures) return;
        const calculateVisibleCount = () => {
            const parentWidth = container.parentElement?.clientWidth ?? window.innerWidth;
            const maxWidth = Math.min(parentWidth - 16, window.innerWidth - 16, 800);
            const style = getComputedStyle(toolbar);
            const leftWidth = actions.getBoundingClientRect().left - toolbar.getBoundingClientRect().left;
            const availableWidth = maxWidth - leftWidth - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
            const gap = parseFloat(getComputedStyle(actions).columnGap);
            const widths = Array.from(measures.children, element => element.getBoundingClientRect().width);
            const moreWidth = widths.pop() ?? 36;
            let nextCount = Math.min(4, flattenedActions.length);
            while (nextCount > 1) {
                const hasOverflow = nextCount < flattenedActions.length;
                const width = widths.slice(0, nextCount).reduce((sum, value) => sum + value, 0)
                    + gap * (nextCount - 1) + (hasOverflow ? gap + moreWidth : 0);
                if (width <= availableWidth) break;
                nextCount -= 1;
            }
            setVisibleCount(nextCount);
        };
        calculateVisibleCount();
        const observer = new ResizeObserver(calculateVisibleCount);
        if (container.parentElement) observer.observe(container.parentElement);
        observer.observe(toolbar);
        observer.observe(measures);
        window.addEventListener('resize', calculateVisibleCount);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', calculateVisibleCount);
        };
    }, [isSelectionMode, flattenedActions]);

    const count = selectedIds.size;
    const visibleActions = flattenedActions.slice(0, visibleCount);
    const overflowActions = flattenedActions.slice(visibleCount);

    return (
        <div className="fixed top-12 right-0 z-95 flex justify-center pointer-events-none" style={{ left: leftOffset }}>
        <AnimatePresence>
        {isSelectionMode && <motion.div
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="relative w-max min-w-0 max-w-[min(800px,calc(100%-16px))] pointer-events-auto"
            ref={containerRef}
        >
            {/* Fade both siblings together without an opacity ancestor isolating the backdrop. */}
            <motion.div
                aria-hidden
                variants={fadeVariants}
                transition={fadeTransition}
                className="absolute inset-0 rounded-2xl bg-surface/60 backdrop-blur-3xl backdrop-saturate-150 shadow-2xl border border-on-surface/10 pointer-events-none"
            />
            <div ref={measureRef} aria-hidden inert className="absolute invisible flex w-max h-0 overflow-hidden pointer-events-none">
                {flattenedActions.slice(0, 4).map(action => <span key={action.id} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap">
                    <action.icon className="text-lg" />{action.label}
                </span>)}
                <span className="inline-flex p-2"><MoreIcon /></span>
            </div>
            <motion.div
                ref={toolbarRef}
                variants={fadeVariants}
                transition={fadeTransition}
                className="selection-accent relative flex items-center gap-3 text-on-surface p-2 pl-3 pr-3 rounded-2xl border border-transparent"
            >
                {/* Select All Toggle */}
                <button
                    onClick={() => {
                        if (allSelected) {
                            clearSelection();
                        } else {
                            setSelectAllRequested(true);
                        }
                    }}
                    className={`p-1.5 rounded-xl transition-all active:scale-90 flex items-center justify-center shrink-0 ${allSelected
                        ? 'text-primary'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/8'
                        }`}
                >
                    {allSelected ? <MdCheckBox className="text-[22px]" /> : <MdCheckBoxOutlineBlank className="text-[22px]" />}
                </button>

                <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-on-surface whitespace-nowrap text-sm">
                        已选择 {count} 项
                    </span>
                    <button
                        onClick={() => clearSelection()}
                        className="p-1 px-1.5 rounded-lg hover:bg-on-surface/8 transition-colors shrink-0 text-on-surface-variant hover:text-on-surface"
                    >
                        <MdClose className="text-lg" />
                    </button>
                </div>

                <div className="h-6 w-px bg-on-surface/10 mx-1 shrink-0" />

                {/* Actions */}
                <div ref={actionsRef} className="flex items-center gap-0.5 shrink-0">
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
                                    : 'hover:bg-on-surface/8 text-on-surface-variant'
                                }
                                ${action.variant === 'danger' ? 'text-red-600 dark:text-red-400 hover:bg-red-500/10' : ''}
                            `}
                        >
                            <action.icon className="text-lg" />
                            {action.label}
                        </button>
                    ))}

                    {overflowActions.length > 0 && (
                        <MusicContextMenu
                            variant="clean"
                            tooltipText="更多操作"
                            buttonClassName="p-2 rounded-xl hover:bg-on-surface/8 shrink-0 text-on-surface-variant"
                            groups={[overflowActions.map(action => ({
                                ...action,
                                onClick: () => {
                                    action.onClick();
                                    clearSelection();
                                },
                            }))]}
                        />
                    )}
                </div>
            </motion.div>
        </motion.div>}
        </AnimatePresence>
        </div>
    );
}
