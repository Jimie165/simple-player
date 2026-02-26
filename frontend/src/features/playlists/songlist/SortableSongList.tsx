import { useState, useEffect, memo, useMemo, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { MdAccessTime } from 'react-icons/md';
import clsx from 'clsx';
import { Virtuoso, type Components } from 'react-virtuoso';
import type { SongMetadata } from '@/types';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useSelectionStore } from '@/store/useSelectionStore';
import type { MusicMenuContext } from '@/hooks/menu/useSongOperations';
import { useAddToPlaylistStore } from '@/store/useAddToPlaylistStore';
import { SongListItem } from '@/features/playlists/songlist/SongListItem';
import { SortableSongListContextMenu, type ContextMenuState } from '@/features/playlists/songlist/SortableSongListContextMenu';

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
    restrictToVerticalAxis,
} from '@dnd-kit/modifiers';

import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    buildReorderedSongs,
    createRestrictToViewportModifier,
    formatDuration,
    getGridTemplateColumns,
    getSongId,
} from '@/features/playlists/songlist/sortableSongListUtils';

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
    const optimisticallyDeletedSongIds = useLibraryStore((s) => s.optimisticallyDeletedSongIds);
    const displaySongs = useMemo(() => {
        if (optimisticallyDeletedSongIds.size === 0) return songs;
        return songs.filter((song) => !(typeof song.id === 'number' && optimisticallyDeletedSongIds.has(song.id)));
    }, [songs, optimisticallyDeletedSongIds]);

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
    const toggleFavorite = useLibraryStore(state => state.toggleFavorite);
    const favoriteSet = useLibraryStore(state => state.favoriteSet);
    const isFavoriteStoreFn = useLibraryStore(state => state.isFavorite);

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

    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

    const [activeId, setActiveId] = useState<string | null>(null);

    const restrictToScrollViewport = createRestrictToViewportModifier('[data-scroll-viewport]');

    // Prevent body scroll during drag, only allow viewport scroll
    useEffect(() => {
        if (!activeId) return;

        const style = document.createElement('style');
        style.textContent = `
            body, html {
                overflow: hidden !important;
            }
        `;
        document.head.appendChild(style);

        return () => {
            document.head.removeChild(style);
        };
    }, [activeId]);



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

        const reorderedSongs = buildReorderedSongs({
            songs,
            isSelectionMode,
            selectedIds,
            activeIdStr,
            overIdStr,
        });

        if (reorderedSongs) {
            onReorder(reorderedSongs);
        }
    };

    const isSelected = (id: string | undefined) => id ? selectedIds.has(id) : false;

    const handleCheckboxClick = (e: React.MouseEvent | null, song: SongMetadata, index: number) => {
        if (e) e.stopPropagation();
        const id = getSongId(song, index);
        if (!id) return;
        if (!isSelectionMode) {
            toggleSelectionMode({ id, type: 'song', data: song });
        } else {
            toggleSelection(id, 'song', song);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, song: SongMetadata, index: number) => {
        e.preventDefault();
        e.stopPropagation();

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

    const gridStyle = { gridTemplateColumns: getGridTemplateColumns(shouldHideAlbum) };

    // Filter valid items for SortableContext using SORTED songs
    const sortableItems = useMemo(() => displaySongs.map((s, i) => getSongId(s, i)), [displaySongs]);

    // Derived state for dragging to show proper visuals
    const isDraggingSelection = !!(activeId && selectedIds.has(activeId));

    // Custom Virtuoso Context
    const VirtuosoList = useMemo(() => forwardRef<HTMLDivElement, any>(({ children, ...props }, ref) => {
        return (
            <SortableContext
                items={sortableItems}
                strategy={verticalListSortingStrategy}
                disabled={disableReorder || sortKey !== 'manual'}
            >
                <div ref={ref} {...props}>
                    {children}
                </div>
            </SortableContext>
        );
    }), [sortableItems, disableReorder, sortKey]);


    // Find custom scroll parent
    const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
    useEffect(() => {
        const el = document.querySelector('[data-scroll-viewport]');
        if (el instanceof HTMLElement) setScrollParent(el);
    }, []);

    const itemContent = (index: number, song: SongMetadata) => {
        const uniqueId = getSongId(song, index);
        const isFav = (song.id !== undefined && typeof song.id === 'number')
            ? favoriteSet.has(song.id)
            : isFavoriteStoreFn(song as any);

        return (
            <SortableItem
                key={uniqueId}
                song={song}
                index={index}
                style={gridStyle}
                isSelectionMode={isSelectionMode}
                selected={isSelected(uniqueId)}
                onPlay={onPlay}
                handleItemClick={(e: React.MouseEvent, s: SongMetadata) => {
                    e.stopPropagation();
                    if (e.button !== 0) return;
                    if (isSelectionMode) toggleSelection(uniqueId, 'song', s);
                }}
                handleCheckboxClick={(e: React.MouseEvent | null, s: SongMetadata) => handleCheckboxClick(e, s, index)}
                handleContextMenu={handleContextMenu}
                hideAlbum={shouldHideAlbum}
                formatDuration={formatDuration}
                onSelect={(s: SongMetadata) => handleCheckboxClick(null, s, index)}
                onAddToPlaylist={(song: SongMetadata) => useAddToPlaylistStore.getState().open(song)}
                toggleFavorite={toggleFavorite}
                isFav={isFav}
                toggleSelection={toggleSelection}
                onMenuOpen={() => {
                    setContextMenu(null);
                }}
                playlistId={playlistId}
                context={context}
            />
        );
    };

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
                modifiers={[restrictToVerticalAxis, restrictToScrollViewport]}
                autoScroll={{
                    enabled: true,
                    threshold: { x: 0, y: 0.2 },
                    acceleration: 10,
                    canScroll(element) {
                        // Only allow scrolling the viewport element
                        return element.hasAttribute('data-scroll-viewport');
                    },
                }}
            >
                {scrollParent ? (
                    <Virtuoso
                        useWindowScroll={false}
                        customScrollParent={scrollParent}
                        data={displaySongs}
                        components={{ List: VirtuosoList as Components['List'] }}
                        itemContent={itemContent}
                        overscan={{ main: 2000, reverse: 2000 }} // High overscan for both directions
                        className="w-full"
                    />
                ) : (
                    <div className="flex flex-col opacity-0"></div>
                )}

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
                <SortableSongListContextMenu
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
