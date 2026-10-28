import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { MdAccessTime, MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import clsx from 'clsx';
import { Virtuoso } from 'react-virtuoso';
import type { SongMetadata } from '@/types';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useSelectionStore } from '@/store/useSelectionStore';
import SmartCursorContextMenu from '@/components/common/SmartCursorContextMenu';
import type { MusicMenuContext } from '@/hooks/menu/useSongOperations';
import { SongListRow } from '@/features/library/components/SongListRow';
import { useMainContentWidth } from '@/hooks/useMainContentWidth';
import { useScrollViewport } from '@/hooks/useScrollViewport';
import { useViewportOverscan } from '@/hooks/useViewportOverscan';

import { getMusicItemId } from '@/utils/musicItemUtils';
import { sortSongs } from '@/utils/songSort';
import type { SortKey } from '@/utils/songSort';
import { changeSongListSorting, persistSongListSorting, readSongListSorting } from '@/features/library/utils/songListSorting';
import type { SongListSorting } from '@/features/library/utils/songListSorting';

const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const HIDE_ALBUM_BREAKPOINT = 900;
const HIDE_ARTIST_BREAKPOINT = 650;
const SONG_LIST_BREAKPOINTS = [HIDE_ARTIST_BREAKPOINT, HIDE_ALBUM_BREAKPOINT];
const NO_COLUMN_BREAKPOINTS: readonly number[] = [];
const ARTIST_COLUMN_BREAKPOINTS = [HIDE_ARTIST_BREAKPOINT];
const ALBUM_COLUMN_BREAKPOINTS = [HIDE_ALBUM_BREAKPOINT];

interface SongListVirtuosoContext {
    footerSpacerClassName: string;
}

function SongListFooter({ context }: { context?: SongListVirtuosoContext }) {
    return <div className={clsx(context?.footerSpacerClassName ?? 'h-12', 'w-full')} />;
}

interface SongListViewProps {
    songs: SongMetadata[];
    onPlay: (song: SongMetadata, index: number, options: { restartIfCurrent?: boolean } | undefined, songs: SongMetadata[]) => void;
    onDelete?: (song: SongMetadata) => void;
    hideCover?: boolean;
    enableDelete?: boolean;
    hideArtist?: boolean;
    hideAlbum?: boolean;
    disableSort?: boolean;
    virtualize?: boolean;
    manageSelection?: boolean;
    onOpenArtist?: (artist: string) => void;
    onOpenAlbum?: (album: string) => void;
    context?: MusicMenuContext;
    footerSpacerClassName?: string;
    sortControl?: { value: SongListSorting; onChange: (value: SongListSorting) => void };
}

export default function SongListView({
    songs,
    onPlay,
    onDelete,
    hideCover = false,
    enableDelete = true,
    hideArtist = false,
    hideAlbum = false,
    disableSort = false,
    virtualize = true,
    manageSelection = true,
    onOpenArtist,
    onOpenAlbum,
    context = 'library',
    footerSpacerClassName = "h-12",
    sortControl,
}: SongListViewProps) {
    const isLibraryContext = context === 'library';
    const gridGapClass = isLibraryContext ? "gap-3" : "gap-4";
    const headerPaddingClass = isLibraryContext ? "px-2" : "px-4";
    const rowPaddingClass = isLibraryContext ? "px-2" : "px-4";
    const headerTopClass = "top-10";

    // Header Blur / Context specific class - kept from original if any logic existed, seemingly generic sticky

    // Responsive: auto-hide album column based on the main content area width.
    const mainContentWidth = useMainContentWidth(hideAlbum
        ? (hideArtist ? NO_COLUMN_BREAKPOINTS : ARTIST_COLUMN_BREAKPOINTS)
        : (hideArtist ? ALBUM_COLUMN_BREAKPOINTS : SONG_LIST_BREAKPOINTS));
    const shouldHideAlbum = mainContentWidth < HIDE_ALBUM_BREAKPOINT;
    const shouldHideArtist = mainContentWidth < HIDE_ARTIST_BREAKPOINT;

    const effectiveHideAlbum = hideAlbum || shouldHideAlbum;
    const effectiveHideArtist = hideArtist || shouldHideArtist;

    const [internalSorting, setInternalSorting] = useState(readSongListSorting);
    const sorting = sortControl?.value ?? internalSorting;
    const { key: sortKey, order: sortOrder } = sorting;

    // Selection Store
    const { isSelectionMode, selectedIds, toggleSelectionMode, toggleSelection, clearSelection, selectionType, selectAllRequested, setSelectAllRequested, selectAll, setSelectableIds } = useSelectionStore();
    const { toggleFavorite, isFavorite, favoriteSet, favoritesLoaded, optimisticallyDeletedSongIds } = useLibraryStore();

    // Context Menu State
    type ContextMenuState = {
        x: number;
        y: number;
        song: SongMetadata;
        index: number;
    };
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

    const handleContextMenu = useCallback((e: React.MouseEvent, song: SongMetadata, index: number) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, song, index });
    }, []);



    const visibleSongs = useMemo(() => {
        if (optimisticallyDeletedSongIds.size === 0) return songs;
        return songs.filter((song) => !(typeof song.id === 'number' && optimisticallyDeletedSongIds.has(song.id)));
    }, [songs, optimisticallyDeletedSongIds]);

    const sortedSongs = useMemo(() => {
        return sortSongs(visibleSongs, sortKey ?? 'manual', sortOrder);
    }, [visibleSongs, sortKey, sortOrder]);

    const handlePlay = useCallback((song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean }) => {
        onPlay(song, index, options, sortedSongs);
    }, [onPlay, sortedSongs]);

    // Update Selectable IDs
    useEffect(() => {
        if (manageSelection && selectAllRequested && isSelectionMode) {
            const items = sortedSongs.map(song => ({
                id: getMusicItemId(song),
                data: song
            })).filter(item => item.id !== '');

            selectAll(items, 'song');
            setSelectAllRequested(false);
        }
    }, [manageSelection, selectAllRequested, isSelectionMode, sortedSongs, selectAll, setSelectAllRequested]);

    useEffect(() => {
        if (!manageSelection || !isSelectionMode) return;
        setSelectableIds(sortedSongs.map(song => getMusicItemId(song)).filter(id => id !== ''));
    }, [manageSelection, isSelectionMode, sortedSongs, setSelectableIds]);

    const handleSort = (key: SortKey) => {
        if (isSelectionMode) return;
        const next = changeSongListSorting(sorting, { key });
        if (sortControl) {
            sortControl.onChange(next);
            return;
        }
        setInternalSorting(next);
        persistSongListSorting(next);
    };

    const renderSortIcon = (colKey: SortKey) => {
        if (sortKey !== colKey) return null;
        return sortOrder === 'asc' ? <MdArrowDropUp className="inline text-lg -ml-1" /> : <MdArrowDropDown className="inline text-lg -ml-1" />;
    };

    const renderHeaderCell = (label: React.ReactNode, colKey: SortKey, className?: string, allowSort = true) => (
        <div
            aria-disabled={allowSort && (disableSort || isSelectionMode)}
            onClick={() => allowSort && !disableSort && handleSort(colKey)}
            className={clsx(
                "flex items-center gap-1 select-none transition-colors",
                (allowSort && !disableSort && !isSelectionMode) ? "cursor-pointer hover:text-on-surface" : "",
                allowSort && isSelectionMode && 'opacity-40 pointer-events-none',
                className
            )}
        >
            {label}
            {(allowSort && !disableSort) && renderSortIcon(colKey)}
        </div>
    );

    const isSelected = useCallback((id: string | undefined) => id ? selectedIds.has(id.toString()) : false, [selectedIds]);
    const canSelect = !selectionType || selectionType === 'song' || selectionType === 'file';

    const handleItemClick = useCallback((e: React.MouseEvent, song: SongMetadata) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        const id = getMusicItemId(song);
        if (!id) return;
        if (isSelectionMode) {
            if (canSelect) {
                toggleSelection(id, 'song', song);
            } else {
                toggleSelection(id, 'song', song);
            }
        }
    }, [isSelectionMode, canSelect, toggleSelection]);

    const handleCheckboxClick = useCallback((e: React.MouseEvent | null, song: SongMetadata) => {
        if (e) e.stopPropagation();
        const id = getMusicItemId(song);
        if (!id) return;
        if (!isSelectionMode) {
            toggleSelectionMode({ id, type: 'song', data: song });
        } else {
            toggleSelection(id, 'song', song);
        }
    }, [isSelectionMode, toggleSelection, toggleSelectionMode]);

    const getGridCols = () => {
        let cols = "24px minmax(0,4fr)";
        if (!effectiveHideArtist) cols += " minmax(0,3fr)";
        if (!effectiveHideAlbum) cols += " minmax(0,3fr)";
        cols += " 100px 40px";
        return cols;
    };
    const gridTemplateColumns = getGridCols();
    const gridStyle = useMemo(() => ({ gridTemplateColumns }), [gridTemplateColumns]);
    const handleSelectSong = useCallback((song: SongMetadata) => handleCheckboxClick(null, song), [handleCheckboxClick]);

    const listRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const headerBackdropRef = useRef<HTMLDivElement>(null);
    const headerSentinelRef = useRef<HTMLDivElement>(null);
    const [isHeaderPinned, setIsHeaderPinned] = useState(false);
    const scrollParent = useScrollViewport(true, listRef);
    const overscan = useViewportOverscan(scrollParent);

    useEffect(() => {
        const header = headerRef.current;
        const backdrop = headerBackdropRef.current;
        const sentinel = headerSentinelRef.current;
        if (!header || !backdrop || !sentinel || !scrollParent) return;
        const updateBackdropBounds = () => {
            const rootRect = scrollParent.getBoundingClientRect();
            const headerRect = header.getBoundingClientRect();
            backdrop.style.left = `${rootRect.left + scrollParent.clientLeft - headerRect.left}px`;
            backdrop.style.width = `${scrollParent.clientWidth}px`;
        };
        updateBackdropBounds();
        const resizeObserver = new ResizeObserver(updateBackdropBounds);
        resizeObserver.observe(scrollParent);
        resizeObserver.observe(header);
        const top = parseFloat(window.getComputedStyle(header).top) || 0;
        const observer = new IntersectionObserver(([entry]) => {
            const rootRect = scrollParent.getBoundingClientRect();
            if (rootRect.width <= 0 || rootRect.height <= 0 || entry.boundingClientRect.height <= 0) return;
            setIsHeaderPinned(!entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? rootRect.top + top));
        }, { root: scrollParent, rootMargin: `${-top}px 0px 0px 0px`, threshold: 0 });
        observer.observe(sentinel);
        return () => {
            observer.disconnect();
            resizeObserver.disconnect();
        };
    }, [scrollParent, headerTopClass]);

    // Render Row Function
    const itemContent = (index: number, song: SongMetadata) => {
        const id = getMusicItemId(song);
        const selected = isSelected(id);
        const isFav = (song.id !== undefined && typeof song.id === 'number')
            ? (favoritesLoaded ? favoriteSet.has(song.id) : (song.is_favorite ?? false))
            : isFavorite(song);

        return (
            <SongListRow
                index={index}
                isLast={index === sortedSongs.length - 1}
                song={song}
                gridStyle={gridStyle}
                gridGapClass={gridGapClass}
                rowPaddingClass={rowPaddingClass}
                isSelectionMode={isSelectionMode}
                selected={selected}
                previousSelected={index > 0 && isSelected(getMusicItemId(sortedSongs[index - 1]))}
                nextSelected={index + 1 < sortedSongs.length && isSelected(getMusicItemId(sortedSongs[index + 1]))}
                isFav={isFav}
                hideCover={hideCover}
                hideArtist={effectiveHideArtist}
                effectiveHideAlbum={effectiveHideAlbum}
                context={context}
                enableDelete={enableDelete}
                onDelete={onDelete}
                onPlay={handlePlay}
                formatDuration={formatDuration}
                toggleFavorite={(song) => { void toggleFavorite(song).catch(console.error); }}
                onOpenArtist={onOpenArtist}
                onOpenAlbum={onOpenAlbum}
                onContextMenu={handleContextMenu}
                onRowClick={handleItemClick}
                onSelect={handleSelectSong}
            />
        );
    };

    return (
        <div ref={listRef} className="w-full relative select-none">
            <div ref={headerSentinelRef} aria-hidden="true" className="pointer-events-none h-px -mb-px w-full" />
            {/* Header (Sticky) via CSS outside Virtuoso */}
            <div
                ref={headerRef}
                style={gridStyle}
                className={clsx(
                    "sticky z-45 grid pt-2 pb-3 after:absolute after:bottom-0 after:right-4 after:border-b after:border-on-surface/10 after:pointer-events-none",
                    isLibraryContext ? "after:left-11" : "after:left-14",
                    headerTopClass,
                    gridGapClass,
                    headerPaddingClass,
                    "text-[13px] text-on-surface-variant font-medium"
                )}>
                <div ref={headerBackdropRef} aria-hidden="true" className={clsx("pointer-events-none absolute inset-y-0 -z-10 backdrop-blur-xl transition-opacity duration-150 motion-reduce:transition-none", isHeaderPinned ? "opacity-100" : "opacity-0")} />
                <div></div>
                {renderHeaderCell('标题', 'title', 'pl-0', !disableSort)}
                {!effectiveHideArtist && renderHeaderCell('艺人', 'artist', undefined, !disableSort)}
                {!effectiveHideAlbum && renderHeaderCell('专辑', 'album', undefined, !disableSort)}
                {renderHeaderCell(<MdAccessTime className="text-base" />, 'duration', 'justify-end pr-2', !disableSort)}
                <div></div>
            </div>

            {/* List Content */}
            {virtualize ? (
                scrollParent ? (
                    <Virtuoso
                        useWindowScroll={false}
                        customScrollParent={scrollParent}
                        data={sortedSongs}
                        itemContent={itemContent}
                        overscan={overscan}
                        className="w-full"
                        context={{ footerSpacerClassName }}
                        components={{
                            Footer: SongListFooter
                        }}
                    />
                ) : (
                    <div className="flex flex-col opacity-0" />
                )
            ) : (
                <div className="w-full">
                    {sortedSongs.map((song, index) => itemContent(index, song))}
                </div>
            )}

            {contextMenu && (
                <SmartCursorContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    item={contextMenu.song}
                    context={context}
                    onClose={() => setContextMenu(null)}
                    isSelected={selectedIds.has(getMusicItemId(contextMenu.song))}
                    onSelect={() => {
                        if (isSelectionMode && selectedIds.size > 1 && selectedIds.has(getMusicItemId(contextMenu.song))) {
                            clearSelection();
                        } else {
                            handleCheckboxClick(null, contextMenu.song);
                        }
                        setContextMenu(null);
                    }}
                />
            )}
        </div >
    );
}
