import { useState, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { MdAccessTime } from 'react-icons/md';
import { IoCheckbox, IoSquareOutline, IoHeart, IoHeartOutline } from 'react-icons/io5';
import clsx from 'clsx';
import type { SongMetadata } from '../../../types';
import InfoDialog from '../../../components/common/InfoDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { useSelectionStore } from '../../../store/useSelectionStore';
import SongCoverOverlay from '../../../components/common/SongCoverOverlay';
import MusicContextMenu, { getMusicMenuGroups } from '../../../components/common/MusicContextMenu';
import CursorContextMenu from '../../../components/common/CursorContextMenu';
import { useAddToPlaylistStore } from '../../../store/useAddToPlaylistStore';
import { useNavigationStore } from '../../../store/useNavigationStore';
import { libraryService } from '../../../services/libraryService';
import { usePlayerStore } from '../../../store/usePlayerStore';
import { usePlaybackActions } from '../../../hooks/usePlaybackActions';

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
    onRemoveFromPlaylist: (song: SongMetadata) => void;
    onReorder: (newOrder: SongMetadata[]) => void;
    onToggleFavorite?: (song: SongMetadata) => void;
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
    handleCheckboxClick,
    handleContextMenu,
    hideAlbum,
    formatDuration,
    onRemove, // Remapped to onRemove (Remove from Playlist)
    onDelete, // New prop (Delete from Library)
    toggleFavorite,
    isDragging,
    isOverlay,
    dragCount,
    // Context Menu
    onShowProperties,
    onShowAlbum, // New
    onShowArtist, // New
    onSelect,
    onAddQueue,
    onAddToPlaylist,
    onMenuOpen,
    toggleSelection  // Added
}: any) => {
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

            {!isSelectionMode ? (
                <div className="flex justify-center w-full min-w-[24px]">
                    <div className="w-6 h-6 flex items-center justify-center">
                        <span className="text-neutral-500 text-xs font-medium group-hover:hidden">{index + 1}</span>
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                if (handleCheckboxClick) handleCheckboxClick(e, song);
                            }}
                            className="hidden group-hover:flex text-xl cursor-pointer text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                        >
                            <IoSquareOutline />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex justify-center w-full min-w-[24px]">
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            if (handleCheckboxClick) handleCheckboxClick(e, song);
                        }}
                        className="text-xl cursor-pointer text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                    >
                        {selected
                            ? <IoCheckbox className="text-primary" />
                            : <IoSquareOutline />
                        }
                    </div>
                </div>
            )}

            {/* Heart Icon Column */}
            {(
                <div className="flex justify-center items-center">
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
                        title={song.is_favorite ? "取消喜爱" : "喜爱"}
                    >
                        {song.is_favorite ? <IoHeart className="text-base" /> : <IoHeartOutline className="text-base" />}
                    </button>
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
                {song.artist}
            </div>

            {!hideAlbum && (
                <div className="text-neutral-500 dark:text-neutral-400 truncate">
                    {song.album}
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
                {!isDragging && (
                    <MusicContextMenu
                        onOpen={onMenuOpen} // Pass handler
                        type="playlist"
                        variant="clean"
                        onPlay={() => onPlay && onPlay(song, index, { restartIfCurrent: true })}
                        onAddToQueue={onAddQueue ? () => onAddQueue(song) : undefined}
                        onAddToPlaylist={onAddToPlaylist ? () => onAddToPlaylist(song) : undefined}
                        onShowProperties={onShowProperties ? () => onShowProperties(song) : undefined}
                        onShowAlbum={onShowAlbum ? () => onShowAlbum(song) : undefined}
                        onShowArtist={onShowArtist ? () => onShowArtist(song) : undefined}

                        // onRemove: Remove from Playlist (Default style)
                        onRemove={() => onRemove && onRemove(song)}
                        removeText="从播放列表移除"

                        // onDelete: Delete from Library (Danger style)
                        onDelete={() => onDelete && onDelete(song)}
                        deleteText="从音乐库删除"

                        // Select logic
                        onSelect={onSelect ? () => {
                            if (isSelectionMode) {
                                toggleSelection(getSongId(song, index), 'song', song);
                            } else {
                                onSelect(song);
                            }
                        } : undefined}
                        selectText={selected ? "取消选择" : "选择"}
                        // Favorites Support
                        onFavorite={() => toggleFavorite && toggleFavorite(song)}
                        isFavorite={song.is_favorite}
                    />
                )}
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

export default function SortableSongList({
    songs,
    onPlay,
    onRemoveFromPlaylist,
    onReorder,
    onToggleFavorite,
    disableReorder = false,
    sortKey = 'manual',
    sortOrder: _sortOrder = 'asc'
}: SortableSongListProps) {
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
        deselectItem
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

    type ContextMenuState = {
        x: number;
        y: number;
        type: 'single' | 'batch';
        song?: SongMetadata;
        index?: number;
        songs?: SongMetadata[];
    };
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

    const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
    const [propertySong, setPropertySong] = useState<SongMetadata | null>(null);

    const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; song: SongMetadata | null }>({ open: false, song: null });
    const [confirmLibraryDelete, setConfirmLibraryDelete] = useState<{ open: boolean; song: SongMetadata | null }>({ open: false, song: null });

    const [batchRemoveConfirmOpen, setBatchRemoveConfirmOpen] = useState(false);
    const [batchLibraryDeleteConfirmOpen, setBatchLibraryDeleteConfirmOpen] = useState(false);

    const [activeId, setActiveId] = useState<string | null>(null);

    const handleOpenProperties = (song: SongMetadata) => {
        setPropertySong(song);
        setIsPropertiesOpen(true);
    };

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
                    // We need to find the specific item by ID, index 'i' here is just for local array
                    // But getSongId might rely on original index if path missing? 
                    // To be safe, we match by ID comparison since unselected items are subsets
                    const originalIndex = songs.indexOf(s);
                    return getSongId(s, originalIndex) === overIdStr;
                });

                if (insertAtIndex !== -1) {
                    // Determine if we insert before or after based on drag direction relative to original list
                    if (activeIndex < overIndex) {
                        // Dragging Down -> Insert After
                        insertAtIndex += 1;
                    }
                    // Dragging Up -> Insert Before (keep index)

                    // 3. Construct new array
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

    const handleCheckboxClick = (e: React.MouseEvent, song: SongMetadata) => {
        e.stopPropagation();
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

    // Batch Actions Helpers
    const { addToNext, toggleFavorite: storeToggleFavorite } = useLibraryStore();
    const { setShuffleState } = usePlayerStore();
    const { playList } = usePlaybackActions();

    // Prefer props callback (optimistic), fallback to store (global async)
    const handleFavorite = onToggleFavorite || storeToggleFavorite;

    const handleBatchPlay = async (songsToPlay: SongMetadata[]) => {
        if (songsToPlay.length === 0) return;
        const first = songsToPlay[0];
        if (first.path) {
            setShuffleState(false);
            await playList({
                songs: songsToPlay,
                startIndex: 0,
                options: { restartIfCurrent: true }
            });
        }
    };

    const handleBatchAddToQueue = (songsToAdd: SongMetadata[]) => {
        [...songsToAdd].reverse().forEach(s => addToNext(s));
    };

    const handleBatchFavorite = async (songsToFav: SongMetadata[]) => {
        for (const s of songsToFav) {
            if (s.id && !s.is_favorite) {
                try { await libraryService.toggleFavorite(s.id); } catch (e) { }
            }
        }
    };

    const handleBatchRemoveFromPlaylist = async () => {
        if (contextMenu?.type === 'batch' && contextMenu.songs) {
            contextMenu.songs.forEach(s => onRemoveFromPlaylist(s));
        }
        setBatchRemoveConfirmOpen(false);
        setContextMenu(null);
    };

    const handleBatchDeleteFromLibrary = async () => {
        if (contextMenu?.type === 'batch' && contextMenu.songs) {
            const ids = contextMenu.songs.map(s => s.id).filter(id => typeof id === 'number') as number[];
            if (ids.length > 0) await libraryService.batchDeleteSongs(ids);
        }
        setBatchLibraryDeleteConfirmOpen(false);
        setContextMenu(null);
    };

    const getGridCols = () => {
        let cols = "40px 24px minmax(0,4fr)"; // Selection (#/Checkbox) (40px) + Heart (24px) + Title
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

    // Navigation for Context Menu
    const { push } = useNavigationStore();

    const handleShowAlbum = async (song: SongMetadata) => {
        if (!song.album || !song.artist) return;

        // Fetch full library to find the album and its songs
        const allSongs = await libraryService.getLibrarySongs();
        const albumSongs = allSongs.filter(s => s.album === song.album && s.artist === song.artist);

        if (albumSongs.length > 0) {
            push({
                type: 'album_detail',
                data: {
                    name: song.album,
                    artist: song.artist,
                    cover: albumSongs[0].cover || null,
                    cover_path: albumSongs[0].cover_path || null,
                    songs: albumSongs
                }
            });
        }
    };

    const handleShowArtist = async (song: SongMetadata) => {
        if (!song.artist) return;

        // Fetch full library to find the artist and their songs/albums
        const allSongs = await libraryService.getLibrarySongs();
        const artistSongs = allSongs.filter(s => s.artist === song.artist);

        if (artistSongs.length > 0) {
            // Reconstruct ArtistData
            const artistAlbumsMap = new Map<string, any>();
            artistSongs.forEach(s => {
                const key = s.album || "Unknown Album";
                if (!artistAlbumsMap.has(key)) {
                    artistAlbumsMap.set(key, {
                        name: key,
                        artist: s.artist,
                        cover: s.cover || null,
                        cover_path: s.cover_path || null,
                        songs: []
                    });
                }
                artistAlbumsMap.get(key).songs.push(s);
            });

            const artistAlbums = Array.from(artistAlbumsMap.values());

            push({
                type: 'artist_detail',
                data: {
                    name: song.artist,
                    cover: artistSongs[0].cover || null,
                    count: artistSongs.length,
                    albumCount: artistAlbums.length,
                    songs: artistSongs,
                    // Note: ArtistDetailView also expects 'albums' and 'allArtistSongs' as separate props 
                    // in some usages, but when pushed via navigation, data is the data object.
                    // Wait, let's check GlobalDetailStack.tsx again.
                }
            });
        }
    };

    // Delete from Library
    const handleDeleteFromLibrary = async (song: SongMetadata) => {
        if (song.id) {
            await libraryService.deleteSong(song.id);
            // Optionally trigger library update or UI refresh? 
            // The list might not auto-update if it relies on playlist data not library data directly on delete event.
            // But usually parent components handle refresh.
        }
    };



    return (
        <div className="w-full relative select-none">
            <InfoDialog isOpen={isPropertiesOpen} onClose={() => setIsPropertiesOpen(false)} song={propertySong} />

            {/* Confirm Remove from Playlist */}
            <ConfirmDialog
                isOpen={confirmDelete.open}
                onClose={() => setConfirmDelete({ open: false, song: null })}
                onConfirm={() => {
                    if (confirmDelete.song) onRemoveFromPlaylist(confirmDelete.song);
                }}
                title="移除歌曲"
                description={`确定要从播放列表中移除 "${confirmDelete.song?.title}" 吗？`}
                type="danger"
            />

            {/* Confirm Delete from Library */}
            <ConfirmDialog
                isOpen={confirmLibraryDelete.open}
                onClose={() => setConfirmLibraryDelete({ open: false, song: null })}
                onConfirm={() => {
                    if (confirmLibraryDelete.song) handleDeleteFromLibrary(confirmLibraryDelete.song);
                }}
                title="从音乐库删除"
                description={`确定要将 "${confirmLibraryDelete.song?.title}" 从音乐库中删除吗？此操作不可恢复。`}
                type="danger"
            />

            <div style={gridStyle} className="sticky top-10 z-45 grid gap-4 pt-2 pb-3 px-4 border-b border-outline-variant/10 text-[13px] text-on-surface-variant font-medium bg-surface/70 dark:bg-surface-container-low/70 backdrop-blur-xl">
                <div className="text-center font-bold">#</div>{/* Index/Checkbox */}
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
                                    // ... check selection by ID
                                    onPlay={onPlay}
                                    handleItemClick={handleItemClick}
                                    handleCheckboxClick={handleCheckboxClick}
                                    handleContextMenu={handleContextMenu}
                                    hideAlbum={shouldHideAlbum}
                                    formatDuration={formatDuration}
                                    isDraggingGroup={isDraggingSelection && isSelected(uniqueId) && activeId !== uniqueId}
                                    // Context Menu Pass-through
                                    onMenuOpen={() => setContextMenu(null)}
                                    onShowProperties={handleOpenProperties}
                                    onSelect={(song: SongMetadata) => toggleSelectionMode({
                                        id: song.id ? song.id.toString() : song.path || '',
                                        type: 'song',
                                        data: song
                                    })}
                                    onAddQueue={(song: SongMetadata) => useLibraryStore.getState().addToNext(song)}
                                    onAddToPlaylist={(song: SongMetadata) => useAddToPlaylistStore.getState().open(song)}
                                    toggleFavorite={toggleFavorite}

                                    // New Menu Items
                                    onShowAlbum={() => handleShowAlbum(song)}
                                    onShowArtist={() => handleShowArtist(song)}
                                    // onRemove is passed as the "Remove from Playlist" action (default style)
                                    onRemove={() => setConfirmDelete({ open: true, song })}
                                    removeText="从播放列表移除"
                                    // onDelete is "Delete from Library" (danger style)
                                    onDelete={() => setConfirmLibraryDelete({ open: true, song })}
                                    deleteText="从音乐库删除"
                                    toggleSelection={toggleSelection}
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

            {/* Batch Remove from Playlist Confirm */}
            <ConfirmDialog
                isOpen={batchRemoveConfirmOpen}
                onClose={() => setBatchRemoveConfirmOpen(false)}
                onConfirm={handleBatchRemoveFromPlaylist}
                title="从播放列表移除"
                description={`确定要从播放列表中移除选中的 ${contextMenu?.type === 'batch' ? contextMenu.songs?.length : 0} 项吗？`}
                type="danger" // Or default? Playlist removal is usually safe.
            />

            {/* Batch Delete from Library Confirm */}
            <ConfirmDialog
                isOpen={batchLibraryDeleteConfirmOpen}
                onClose={() => setBatchLibraryDeleteConfirmOpen(false)}
                onConfirm={handleBatchDeleteFromLibrary}
                title="从音乐库删除"
                description={`确定要删除选中的 ${contextMenu?.type === 'batch' ? contextMenu.songs?.length : 0} 项吗？此操作将从音乐库中移除，不会删除本地文件。`}
                type="danger"
            />

            {contextMenu && (
                <CursorContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    menuGroups={contextMenu.type === 'batch' && contextMenu.songs ?
                        // BATCH
                        getMusicMenuGroups({
                            type: 'song', // or playlist-batch
                            onPlay: () => handleBatchPlay(contextMenu.songs!),
                            onAddToQueue: () => handleBatchAddToQueue(contextMenu.songs!),
                            onAddToPlaylist: () => useAddToPlaylistStore.getState().open(contextMenu.songs!),
                            // Remove from Playlsit
                            onRemove: () => setBatchRemoveConfirmOpen(true),
                            removeText: `从播放列表移除 (${contextMenu.songs.length})`,
                            // Delete from Library
                            onDelete: () => setBatchLibraryDeleteConfirmOpen(true),
                            deleteText: `从音乐库删除 (${contextMenu.songs.length})`,
                            onFavorite: () => handleBatchFavorite(contextMenu.songs!),
                            onSelect: () => {
                                contextMenu.songs?.forEach((s) => {
                                    // We need the index for getSongId but index in batch doesn't map to original index directly easily.
                                    // HOWEVER, in SortableSongList, songs have stable paths or IDs. 
                                    // The getSongId logic in this context:
                                    const sId = s.id ? s.id.toString() : s.path;
                                    if (sId) deselectItem(sId);
                                });
                            },
                            selectText: `取消选择 (${contextMenu.songs.length})`
                        })
                        :
                        // SINGLE
                        getMusicMenuGroups({
                            type: 'playlist', // Use playlist type context logic
                            onPlay: () => onPlay(contextMenu.song!, contextMenu.index!), // @ts-ignore
                            onAddToQueue: () => useLibraryStore.getState().addToNext(contextMenu.song!), // @ts-ignore
                            onAddToPlaylist: () => useAddToPlaylistStore.getState().open(contextMenu.song!), // @ts-ignore

                            // New Items
                            onShowProperties: () => { setPropertySong(contextMenu.song!); setIsPropertiesOpen(true); }, // @ts-ignore
                            onShowAlbum: () => handleShowAlbum(contextMenu.song!), // @ts-ignore
                            onShowArtist: () => handleShowArtist(contextMenu.song!), // @ts-ignore

                            // Remove from playlist (Default style, above delete)
                            onRemove: () => setConfirmDelete({ open: true, song: contextMenu.song! }),
                            removeText: "从播放列表移除",

                            // Delete from library(Danger style)
                            onDelete: () => setConfirmLibraryDelete({ open: true, song: contextMenu.song! }),
                            deleteText: "从音乐库删除",

                            onSelect: () => {
                                const id = contextMenu.song!.id ? contextMenu.song!.id.toString() : (contextMenu.song!.path || '');
                                if (isSelectionMode) {
                                    toggleSelection(id, 'song', contextMenu.song!); // @ts-ignore
                                } else {
                                    toggleSelectionMode({ id, type: 'song', data: contextMenu.song! }); // @ts-ignore
                                }
                            }, // @ts-ignore
                            selectText: selectedIds.has(contextMenu.song!.id ? contextMenu.song!.id.toString() : (contextMenu.song!.path || '')) ? "取消选择" : "选择",
                            onFavorite: () => handleFavorite(contextMenu.song!), // @ts-ignore
                            isFavorite: contextMenu.song!.is_favorite
                        })}
                />
            )}
        </div>
    );
}
