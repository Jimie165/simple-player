import { useState, useMemo, useEffect, useCallback } from 'react';
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

import { getMusicItemId } from '@/utils/musicItemUtils';

const HIDE_ALBUM_BREAKPOINT = 900;

interface SongListVirtuosoContext {
    footerSpacerClassName: string;
}

function SongListFooter({ context }: { context?: SongListVirtuosoContext }) {
    return <div className={clsx(context?.footerSpacerClassName ?? 'h-12', 'w-full')} />;
}

interface SongListViewProps {
    songs: SongMetadata[];
    onPlay: (song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean }) => void;
    onDelete?: (song: SongMetadata) => void;
    hideCover?: boolean;
    enableDelete?: boolean;
    hideArtist?: boolean;
    hideAlbum?: boolean;
    disableSort?: boolean;
    virtualize?: boolean;
    onOpenArtist?: (artist: string) => void;
    onOpenAlbum?: (album: string) => void;
    context?: MusicMenuContext;
    footerSpacerClassName?: string;
}

type SortKey = 'manual' | 'title' | 'artist' | 'album' | 'duration' | null;
type SortOrder = 'asc' | 'desc';

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
    onOpenArtist,
    onOpenAlbum,
    context = 'library',
    footerSpacerClassName = "h-12"
}: SongListViewProps) {
    const isLibraryContext = context === 'library';
    const gridGapClass = isLibraryContext ? "gap-3" : "gap-4";
    const headerPaddingClass = isLibraryContext ? "px-2" : "px-4";
    const rowPaddingClass = isLibraryContext ? "px-2" : "px-4";
    const headerTopClass = "top-10";

    // Header Blur / Context specific class - kept from original if any logic existed, seemingly generic sticky

    // Responsive: auto-hide album column based on the main content area width.
    const mainContentWidth = useMainContentWidth();
    const shouldHideAlbum = mainContentWidth < HIDE_ALBUM_BREAKPOINT;

    const effectiveHideAlbum = hideAlbum || shouldHideAlbum;

    // Persist sort state
    const [sortKey, setSortKey] = useState<SortKey>(() => {
        try {
            const saved = localStorage.getItem('songlist_sort_key');
            if (saved === 'title' || saved === 'artist' || saved === 'album' || saved === 'duration') {
                return saved;
            }
        } catch (error) {
            console.warn('Failed to read song list sort key', error);
        }
        return null;
    });

    const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
        try {
            const saved = localStorage.getItem('songlist_sort_order');
            if (saved === 'asc' || saved === 'desc') {
                return saved;
            }
        } catch (error) {
            console.warn('Failed to read song list sort order', error);
        }
        return 'asc';
    });

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

    const handleContextMenu = (e: React.MouseEvent, song: SongMetadata, index: number) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, song, index });
    };

    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const visibleSongs = useMemo(() => {
        if (optimisticallyDeletedSongIds.size === 0) return songs;
        return songs.filter((song) => !(typeof song.id === 'number' && optimisticallyDeletedSongIds.has(song.id)));
    }, [songs, optimisticallyDeletedSongIds]);

    const sortedSongs = useMemo(() => {
        if (!sortKey || sortKey === 'manual') return visibleSongs;
        return [...visibleSongs].sort((a, b) => {
            let valA = a[sortKey];
            let valB = b[sortKey];
            if (valA === undefined || valA === null) valA = '';
            if (valB === undefined || valB === null) valB = '';

            if (typeof valA === 'string' && typeof valB === 'string') {
                const isAsciiA = valA.length > 0 && valA.charCodeAt(0) <= 0x7F;
                const isAsciiB = valB.length > 0 && valB.charCodeAt(0) <= 0x7F;

                if (isAsciiA && !isAsciiB) return sortOrder === 'asc' ? -1 : 1;
                if (!isAsciiA && isAsciiB) return sortOrder === 'asc' ? 1 : -1;

                return sortOrder === 'asc'
                    ? valA.localeCompare(valB, 'zh-CN', { numeric: true, sensitivity: 'base' })
                    : valB.localeCompare(valA, 'zh-CN', { numeric: true, sensitivity: 'base' });
            }
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [visibleSongs, sortKey, sortOrder]);

    // Update Selectable IDs
    useEffect(() => {
        if (selectAllRequested && isSelectionMode) {
            const items = sortedSongs.map(song => ({
                id: getMusicItemId(song),
                data: song
            })).filter(item => item.id !== '');

            selectAll(items, 'song');
            setSelectAllRequested(false);
        }
    }, [selectAllRequested, isSelectionMode, sortedSongs, selectAll, setSelectAllRequested]);

    useEffect(() => {
        if (!isSelectionMode) return;
        setSelectableIds(sortedSongs.map(song => getMusicItemId(song)).filter(id => id !== ''));
    }, [isSelectionMode, sortedSongs, setSelectableIds]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            if (sortOrder === 'asc') {
                setSortOrder('desc');
                try { localStorage.setItem('songlist_sort_order', 'desc'); } catch (error) {
                    console.warn('Failed to persist song list sort order', error);
                }
            } else {
                setSortKey(null);
                setSortOrder('asc');
                try {
                    localStorage.removeItem('songlist_sort_key');
                    localStorage.setItem('songlist_sort_order', 'asc');
                } catch (error) {
                    console.warn('Failed to clear song list sort key', error);
                }
            }
        } else {
            setSortKey(key);
            setSortOrder('asc');
            try {
                if (key) localStorage.setItem('songlist_sort_key', key);
                localStorage.setItem('songlist_sort_order', 'asc');
            } catch (error) {
                console.warn('Failed to persist song list sort settings', error);
            }
        }
    };

    const renderSortIcon = (colKey: SortKey) => {
        if (sortKey !== colKey) return null;
        return sortOrder === 'asc' ? <MdArrowDropUp className="inline text-lg -ml-1" /> : <MdArrowDropDown className="inline text-lg -ml-1" />;
    };

    const renderHeaderCell = (label: React.ReactNode, colKey: SortKey, className?: string, allowSort = true) => (
        <div
            onClick={() => allowSort && !disableSort && handleSort(colKey)}
            className={clsx(
                "flex items-center gap-1 select-none transition-colors",
                (allowSort && !disableSort) ? "cursor-pointer hover:text-on-surface" : "",
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
        if (!hideArtist) cols += " minmax(0,3fr)";
        if (!effectiveHideAlbum) cols += " minmax(0,3fr)";
        cols += " 100px 40px";
        return cols;
    };
    const gridStyle = { gridTemplateColumns: getGridCols() };

    // Find custom scroll parent
    const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
    useEffect(() => {
        if (!virtualize) return;
        const el = document.querySelector('[data-scroll-viewport]');
        if (!(el instanceof HTMLElement)) return;

        const frame = requestAnimationFrame(() => setScrollParent(el));
        return () => cancelAnimationFrame(frame);
    }, [virtualize]);

    // Render Row Function
    const itemContent = (index: number, song: SongMetadata) => {
        const id = getMusicItemId(song);
        const selected = isSelected(id);
        const isFav = (song.id !== undefined && typeof song.id === 'number')
            ? (favoritesLoaded ? favoriteSet.has(song.id) : song.is_favorite)
            : isFavorite(song);

        return (
            <SongListRow
                index={index}
                song={song}
                gridStyle={gridStyle}
                gridGapClass={gridGapClass}
                rowPaddingClass={rowPaddingClass}
                isSelectionMode={isSelectionMode}
                selected={selected}
                isFav={isFav}
                hideCover={hideCover}
                hideArtist={hideArtist}
                effectiveHideAlbum={effectiveHideAlbum}
                context={context}
                enableDelete={enableDelete}
                onDelete={onDelete}
                onPlay={onPlay}
                formatDuration={formatDuration}
                toggleFavorite={toggleFavorite}
                onOpenArtist={onOpenArtist}
                onOpenAlbum={onOpenAlbum}
                onContextMenu={handleContextMenu}
                onRowClick={handleItemClick}
                onSelect={() => handleCheckboxClick(null, song)}
            />
        );
    };

    return (
        <div className="w-full relative select-none">
            {/* Header (Sticky) via CSS outside Virtuoso */}
            <div
                style={gridStyle}
                className={clsx(
                    "sticky z-45 grid pt-2 pb-3 border-b border-white/10 backdrop-blur-xl",
                    headerTopClass,
                    gridGapClass,
                    headerPaddingClass,
                    "text-[13px] text-on-surface-variant font-medium"
                )}>
                <div></div>
                {renderHeaderCell('标题', 'title', 'pl-0', !disableSort)}
                {!hideArtist && renderHeaderCell('艺人', 'artist', undefined, !disableSort)}
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
                        overscan={{ main: 2000, reverse: 2000 }}
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
