import { useState, useEffect, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MdAccessTime, MdFavorite, MdFavoriteBorder } from 'react-icons/md';
import clsx from 'clsx';
import CustomTooltip from '../../../components/common/CustomTooltip';
import type { SongMetadata } from '../../../types';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { useSelectionStore } from '../../../store/useSelectionStore';
import SongCoverOverlay from '../../../components/common/SongCoverOverlay';
import MusicContextMenu from '../../../components/common/MusicContextMenu';
import { useSongOperations } from '../../../hooks/useSongOperations';
import type { MusicMenuContext } from '../../../hooks/useSongOperations';
import SmartCursorContextMenu from '../../../components/common/SmartCursorContextMenu';
import { useAddToPlaylistStore } from '../../../store/useAddToPlaylistStore';
import { usePlayerStore } from '../../../store/usePlayerStore';
import { useNavigationStore } from '../../../store/useNavigationStore';

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
    DragOverlay,
} from '@dnd-kit/core';

import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export type SortKey = 'manual' | 'title' | 'artist' | 'album' | 'duration';
export type SortOrder = 'asc' | 'desc';

const HIDE_ALBUM_BREAKPOINT = 900;

interface SortableSongListProps {
    songs: SongMetadata[];
    onPlay: (song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean }) => void;
    onReorder: (newOrder: SongMetadata[]) => void;
    disableReorder?: boolean;
    sortKey?: SortKey;
    sortOrder?: SortOrder;
}



const getSongId = (song: SongMetadata, index: number) => {
    if (song.id !== undefined && song.id !== null) return song.id.toString();
    return song.path ? song.path : `temp-${index}`;
};

// Pure UI Component
const SongListItem = memo(({
    song,
    index,
    style: gridStyle,
    isSelectionMode,
    selected,
    onPlay,
    handleItemClick,
    handleContextMenu,
    hideAlbum,
    formatDuration,
    toggleFavorite,
    isDragging,
    isOverlay,
    dragCount,
    onSelect,
    onMenuOpen,
    toggleSelection,
    playlistId,
    context // Added
}: any) => {
    const { push } = useNavigationStore();
    return (
        <div
            style={gridStyle}
            className={clsx(
                "group grid gap-4 px-4 py-2 items-center rounded-lg transition-colors relative touch-none",
                isOverlay
                    ? "bg-surface-container-high elevation-3 border border-outline-variant/10 cursor-grabbing shadow-2xl scale-[1.02]"
                    : selected
                        ? "bg-primary/10 hover:bg-primary/15"
                        : isDragging
                            ? "bg-surface-container-high elevation-2 opacity-50"
                            : "hover:bg-surface-container-highest active:bg-surface-container-high hover:elevation-1",
                "cursor-default text-[14px]",
                isDragging && !isOverlay ? "opacity-30" : ""
            )}
            onClick={(e) => handleItemClick && handleItemClick(e, song)}
            onDoubleClick={() => {
                if (!isSelectionMode && onPlay) {
                    const { metadata, togglePlay } = usePlayerStore.getState();
                    const isCurrent = metadata && (
                        (song.id !== undefined && song.id === metadata.id) ||
                        (song.path === metadata.path)
                    );
                    if (isCurrent) {
                        togglePlay();
                    } else {
                        onPlay(song, index);
                    }
                }
            }}
            onContextMenu={(e) => handleContextMenu && handleContextMenu(e, song, index)}
        >
            {isOverlay && dragCount && dragCount > 1 && (
                <div className="absolute -top-2 -right-2 bg-primary text-on-primary w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-md z-50">
                    {dragCount}
                </div>
            )}

            {selected && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-lg" />
            )}

            {/* Removed Index/Checkbox Column */}

            {/* Heart Icon Column */}
            {(
                <div className="flex justify-center items-center">
                    <CustomTooltip text={song.is_favorite ? "取消喜爱" : "喜爱"} placement="top">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite && toggleFavorite(song);
                            }}
                            className={clsx(
                                "flex items-center justify-center w-6 h-6 rounded-full transition-all active:scale-95",
                                song.is_favorite
                                    ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 opacity-100"
                                    : "text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-white/5 opacity-0 group-hover:opacity-100"
                            )}
                        >
                            {song.is_favorite ? <MdFavorite className="text-base" /> : <MdFavoriteBorder className="text-base" />}
                        </button>
                    </CustomTooltip>
                </div>
            )}

            <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 rounded-[4px] shrink-0 bg-neutral-200 dark:bg-neutral-800 overflow-hidden shadow-sm border border-neutral-200/10 relative group/cover cursor-pointer">
                    <SongCoverOverlay
                        song={song}
                        className="w-full h-full"
                        onPlay={() => !isDragging && onPlay && onPlay(song, index, { restartIfCurrent: true })}
                        restartOnPlay
                    />
                </div>
                <span className={clsx(
                    "font-medium truncate pr-4",
                    selected ? "text-primary dark:text-primary-light" : "text-neutral-900 dark:text-neutral-100"
                )}>
                    {song.title}
                </span>
            </div>

            <div className="text-neutral-500 dark:text-neutral-400 truncate font-medium">
                <span
                    className={clsx(
                        "transition-colors cursor-pointer",
                        !isSelectionMode && "hover:text-primary"
                    )}
                    onClick={(e) => {
                        if (isSelectionMode) return; // Allow selection to happen via row click
                        e.stopPropagation();
                        // Navigation logic here if needed?
                        // Wait, I need the navigation store instance
                        // It is a hook, so I must call it at the top of the component
                    }}
                >
                    {/* Actually, I need to call the hook inside the component. I will add the hook call at the top of SongListItem first. */}
                    {/* Since I can't split the replacement easily for the hook call, I'll do it in a separate chunk or careful ordering */}
                    {/* Let's redo this part. I'll add the hook call in a separate chunk at the top of SongListItem, and then use 'push' here. */}
                    {/* But wait, I can just use useNavigationStore.getState().push if I don't want to re-render? No, use the hook for consistency. */}
                    {/* I will assume I add `const { push } = useNavigationStore()` at the top of SongListItem. */}
                    <span
                        className={clsx(
                            "transition-colors",
                            !isSelectionMode ? "cursor-pointer hover:text-primary" : "cursor-default"
                        )}
                        onClick={(e) => {
                            if (isSelectionMode) return;
                            e.stopPropagation();
                            push({ type: 'artist_detail', data: { name: song.artist } });
                        }}
                    >
                        {song.artist}
                    </span>
                </span>
            </div>

            {!hideAlbum && (
                <div className="text-neutral-500 dark:text-neutral-400 truncate">
                    <span
                        className={clsx(
                            "transition-colors",
                            !isSelectionMode ? "cursor-pointer hover:text-primary" : "cursor-default"
                        )}
                        onClick={(e) => {
                            if (isSelectionMode) return;
                            e.stopPropagation();
                            push({ type: 'album_detail', data: { name: song.album, artist: song.artist } });
                        }}
                    >
                        {song.album}
                    </span>
                </div>
            )}

            <div className="text-neutral-500 dark:text-neutral-400 text-right pr-2 text-[13px] font-variant-numeric">
                {formatDuration(song.duration)}
            </div>

            <div
                className={clsx(
                    "flex justify-end transition-opacity",
                    isSelectionMode || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
            >
                <SongListItemMenu
                    song={song}
                    index={index}
                    onPlay={onPlay}
                    // onRemove/onDelete handled automatically by hook if playlistId is correct or context is generic
                    onMenuOpen={onMenuOpen}
                    isSelectionMode={isSelectionMode}
                    toggleSelection={toggleSelection}
                    onSelect={onSelect}
                    selected={selected}
                    playlistId={playlistId} // Pass down
                    context={context} // Pass down
                />
            </div>
        </div>
    );
});

const SortableItem = memo((props: any) => {
    const { song, index, isDraggingGroup } = props;
    const uniqueId = getSongId(song, index);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: uniqueId });

    const style = {
        transform: isDragging ? undefined : CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        ...props.style,
        zIndex: isDragging ? 0 : 'auto',
    };

    // If I am being dragged OR I am part of the dragged group
    const effectivelyDragging = isDragging || isDraggingGroup;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={isDragging ? "opacity-0" : undefined}
            {...attributes}
            {...listeners}
        >
            <SongListItem {...props} isDragging={effectivelyDragging} />
        </div>
    );
});

const SongListItemMenu = memo(({
    song,
    index,
    onPlay,
    onMenuOpen,
    isSelectionMode,
    toggleSelection,
    onSelect,
    selected,
    playlistId,
    context = 'playlist' // Accept Context
}: any) => {
    const { menuItems } = useSongOperations({
        items: [song],
        context, // Use correct context
        playlistId,
        onPlay: onPlay ? () => onPlay(song, index, { restartIfCurrent: true }) : undefined,
        // ...
        onSelect: onSelect ? () => {
            if (isSelectionMode && toggleSelection) {
                toggleSelection(getSongId(song, index), 'song', song);
            } else if (onSelect) {
                onSelect(song);
            }
        } : undefined,
        isSelected: selected,
    });

    return (
        <MusicContextMenu
            groups={menuItems}
            onOpen={onMenuOpen}
            variant="clean"
        />
    );
});

const ContextMenuResolver = memo(({
    contextMenu,
    onClose,
    toggleSelection,
    toggleSelectionMode,
    isSelectionMode,
    selectedIds,
    playlistId,
    context = 'playlist' // Accept Context
}: any) => {
    const items = useMemo(() => {
        if (!contextMenu) return [];
        if (contextMenu.type === 'batch') return contextMenu.songs || [];
        return contextMenu.song ? [contextMenu.song] : [];
    }, [contextMenu]);

    const getSelectionId = (song: SongMetadata) => {
        return song.id ? song.id.toString() : (song.path || '');
    };

    const { menuItems } = useSongOperations({
        items,
        context,
        playlistId,
        isSelected: contextMenu?.type === 'batch'
            ? true
            : (contextMenu?.song ? selectedIds.has(getSelectionId(contextMenu.song)) : false),
        onSelect: () => {
            if (contextMenu?.type === 'batch') {
                items.forEach((s: SongMetadata) => {
                    const id = getSelectionId(s);
                    if (id) toggleSelection(id, 'song', s);
                });
            } else if (contextMenu?.song) {
                const id = getSelectionId(contextMenu.song);
                if (!isSelectionMode) {
                    toggleSelectionMode({ id, type: 'song', data: contextMenu.song });
                } else {
                    toggleSelection(id, 'song', contextMenu.song);
                }
            }
        },
    });

    return (
        <SmartCursorContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={onClose}
            menuGroups={menuItems}
        />
    );
});

export default function SortableSongList({
    songs,
    onPlay,
    onReorder,
    disableReorder = false,
    sortKey = 'manual',
    sortOrder: _3 = 'asc',
    playlistId,
    context = 'playlist' // Default to playlist
}: SortableSongListProps & { playlistId?: number; context?: MusicMenuContext }) {
    const [shouldHideAlbum, setShouldHideAlbum] = useState(false);


    // Use the songs prop directly as sorting is now handled by the parent component
    const displaySongs = songs;

    const HeaderCell = ({ label, className, alignRight = false }: { label: React.ReactNode, className?: string, alignRight?: boolean }) => (
        <div
            className={clsx(
                "flex items-center gap-1 select-none transition-colors",
                alignRight ? "justify-end" : "",
                className
            )}
        >
            {label}
        </div>
    );

    useEffect(() => {
        const checkWidth = () => setShouldHideAlbum(window.innerWidth < HIDE_ALBUM_BREAKPOINT);
        checkWidth();
        window.addEventListener('resize', checkWidth);
        return () => window.removeEventListener('resize', checkWidth);
    }, []);

    // Use LibraryStore for Favorites
    const { toggleFavorite } = useLibraryStore();

    // Destructure all needed SelectionStore values
    const {
        isSelectionMode,
        selectedIds,
        toggleSelectionMode,
        toggleSelection,
        selectAllRequested,
        setSelectAllRequested,
        selectAll,
        setSelectableIds,
    } = useSelectionStore();

    // Handle Select All Request
    useEffect(() => {
        if (selectAllRequested && isSelectionMode) {
            const items = songs.map((song, index) => ({
                id: getSongId(song, index),
                data: song
            })).filter(item => item.id !== '');

            selectAll(items, 'song');
            setSelectAllRequested(false);
        }
    }, [selectAllRequested, isSelectionMode, songs, selectAll, setSelectAllRequested]);

    useEffect(() => {
        if (!isSelectionMode) return;
        const ids = songs.map((song, index) => getSongId(song, index)).filter(id => id !== '');
        setSelectableIds(ids);
    }, [isSelectionMode, songs, setSelectableIds]);

    type ContextMenuState = {
        x: number;
        y: number;
        type: 'single' | 'batch';
        song?: SongMetadata;
        index?: number;
        songs?: SongMetadata[];
    };
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

    const [activeId, setActiveId] = useState<string | null>(null);


    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id.toString());
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        if (!over) return;

        const activeIdStr = active.id.toString();
        const overIdStr = over.id.toString();

        // Check if dragging a selection
        const isDraggingSelection = isSelectionMode && selectedIds.has(activeIdStr);

        if (isDraggingSelection) {
            // Check if we dropped onto another selected item - if so, do nothing (internal reorder not supported/needed)
            if (selectedIds.has(overIdStr)) {
                return;
            }

            const activeIndex = songs.findIndex((s, i) => getSongId(s, i) === activeIdStr);
            const overIndex = songs.findIndex((s, i) => getSongId(s, i) === overIdStr);

            if (activeIndex !== -1 && overIndex !== -1) {
                // 1. Separate selected and unselected items
                const selectedItems: SongMetadata[] = [];
                const unselectedItems: SongMetadata[] = [];

                songs.forEach((s, i) => {
                    if (selectedIds.has(getSongId(s, i))) {
                        selectedItems.push(s);
                    } else {
                        unselectedItems.push(s);
                    }
                });

                // 2. Find insertion point in the unselected array
                // We use the 'over' item (which is unselected) as the reference
                let insertAtIndex = unselectedItems.findIndex((s) => {
                    const originalIndex = songs.indexOf(s);
                    return getSongId(s, originalIndex) === overIdStr;
                });

                if (insertAtIndex !== -1) {
                    if (activeIndex < overIndex) {
                        insertAtIndex += 1;
                    }
                    const newSongs = [...unselectedItems];
                    newSongs.splice(insertAtIndex, 0, ...selectedItems);
                    onReorder(newSongs);
                }
            }

        } else if (activeIdStr !== overIdStr) {
            // Single Item Reorder
            const oldIndex = songs.findIndex((s, i) => getSongId(s, i) === activeIdStr);
            const newIndex = songs.findIndex((s, i) => getSongId(s, i) === overIdStr);

            if (oldIndex !== -1 && newIndex !== -1) {
                onReorder(arrayMove(songs, oldIndex, newIndex));
            }
        }
    };

    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const isSelected = (id: string | undefined) => id ? selectedIds.has(id) : false;

    const handleItemClick = (e: React.MouseEvent, song: SongMetadata) => {
        e.stopPropagation();
        if (e.button !== 0) return; // Only allow left click
        const id = song.id ? song.id.toString() : song.path;
        if (isSelectionMode && id) {
            toggleSelection(id, 'song', song);
        }
    };

    const handleCheckboxClick = (e: React.MouseEvent | null, song: SongMetadata) => {
        if (e) e.stopPropagation();
        const id = song.id ? song.id.toString() : song.path;
        if (!id) return;
        if (!isSelectionMode) {
            toggleSelectionMode({ id, type: 'song', data: song });
        } else {
            toggleSelection(id, 'song', song);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, song: SongMetadata, index: number) => {
        e.preventDefault();
        // Close other menus (HeadlessUI)
        document.body.click();

        const id = getSongId(song, index);
        const isSelected = id ? selectedIds.has(id) : false;
        const isMultiSelecting = isSelectionMode && id && isSelected && selectedIds.size > 1;

        if (isMultiSelecting) {
            const selectedSongs = songs.filter((s, i) => selectedIds.has(getSongId(s, i)));
            setContextMenu({ x: e.clientX, y: e.clientY, type: 'batch', songs: selectedSongs });
        } else {
            setContextMenu({ x: e.clientX, y: e.clientY, type: 'single', song, index });
        }
    };

    const getGridCols = () => {
        let cols = "24px minmax(0,4fr)"; // Heart (24px) + Title
        cols += " minmax(0,3fr)"; // Artist
        if (!shouldHideAlbum) cols += " minmax(0,3fr)"; // Album
        cols += " 100px 40px"; // Duration, Menu
        return cols;
    };


    const gridStyle = { gridTemplateColumns: getGridCols() };

    // Filter valid items for SortableContext using SORTED songs
    const sortableItems = displaySongs.map((s: SongMetadata, i: number) => getSongId(s, i));

    // Derived state for dragging to show proper visuals
    const isDraggingSelection = !!(activeId && selectedIds.has(activeId));

    return (
        <div className="w-full relative select-none">
            <div style={gridStyle} className="sticky top-10 z-45 grid gap-4 pt-2 pb-3 px-4 border-b border-white/10 text-[13px] text-on-surface-variant font-medium backdrop-blur-xl">
                {/* Removed Index Header */}
                <div></div>{/* Heart */}
                <HeaderCell label="标题" />
                <HeaderCell label="艺人" />
                {!shouldHideAlbum && <HeaderCell label="专辑" />}
                <HeaderCell label={<MdAccessTime className="text-base inline" />} alignRight className="pr-2" />
                <div></div>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={sortableItems}
                    strategy={verticalListSortingStrategy}
                    disabled={disableReorder || sortKey !== 'manual'} // Allow reorder in manual mode (asc or desc)
                >
                    <div className="flex flex-col">
                        {displaySongs.map((song: SongMetadata, index: number) => {
                            const uniqueId = getSongId(song, index);
                            return (
                                <SortableItem
                                    key={uniqueId}
                                    song={song}
                                    index={index}
                                    style={gridStyle}
                                    isSelectionMode={isSelectionMode}
                                    selected={isSelected(uniqueId)}
                                    onPlay={onPlay}
                                    handleItemClick={handleItemClick}
                                    handleCheckboxClick={handleCheckboxClick}
                                    handleContextMenu={handleContextMenu}
                                    hideAlbum={shouldHideAlbum}
                                    formatDuration={formatDuration}
                                    onSelect={(s: SongMetadata) => handleCheckboxClick(null, s)}
                                    onAddToPlaylist={(song: SongMetadata) => useAddToPlaylistStore.getState().open(song)}
                                    toggleFavorite={toggleFavorite}
                                    toggleSelection={toggleSelection}
                                    onMenuOpen={() => setContextMenu(null)}
                                    playlistId={playlistId} // Pass down
                                    context={context}
                                />
                            );
                        })}
                    </div>
                </SortableContext>
                {typeof document !== 'undefined' && createPortal(
                    <DragOverlay adjustScale={true}>
                        {activeId ? (() => {
                            const activeSong = songs.find((s, i) => getSongId(s, i) === activeId);
                            if (!activeSong) return null;
                            const showStack = isDraggingSelection && selectedIds.size > 1;
                            return (
                                <div className="relative" style={gridStyle as any}>
                                    {showStack && (
                                        <>
                                            <div className="absolute inset-0 translate-y-2 scale-[0.99] rounded-lg bg-surface-container-high opacity-60 shadow-md pointer-events-none" />
                                            <div className="absolute inset-0 translate-y-4 scale-[0.98] rounded-lg bg-surface-container-high opacity-40 shadow-sm pointer-events-none" />
                                        </>
                                    )}
                                    <SongListItem
                                        song={activeSong}
                                        index={0}
                                        style={gridStyle}
                                        isSelectionMode={isSelectionMode}
                                        selected={true} // Always appear selected in overlay
                                        isOverlay={true}
                                        hideAlbum={shouldHideAlbum}
                                        formatDuration={formatDuration}
                                        dragCount={isDraggingSelection ? selectedIds.size : 1}
                                    />
                                </div>
                            );
                        })() : null}
                    </DragOverlay>,
                    document.body
                )}
            </DndContext>

            {contextMenu && (
                <ContextMenuResolver
                    contextMenu={contextMenu}
                    onClose={() => setContextMenu(null)}
                    toggleSelection={toggleSelection}
                    toggleSelectionMode={toggleSelectionMode}
                    isSelectionMode={isSelectionMode}
                    selectedIds={selectedIds}
                    playlistId={playlistId} // Pass down
                    context={context}
                />
            )}
        </div>
    );
}
