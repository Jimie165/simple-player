import { useState, useMemo, useEffect, useCallback } from 'react';
import { MdAccessTime, MdArrowDropUp, MdArrowDropDown, MdFavorite, MdFavoriteBorder } from 'react-icons/md';
import clsx from 'clsx';
import { Virtuoso } from 'react-virtuoso';
import type { SongMetadata } from '@/types';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useSelectionStore } from '@/store/useSelectionStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import SmartMusicContextMenu from '@/components/common/SmartMusicContextMenu';
import SmartCursorContextMenu from '@/components/common/SmartCursorContextMenu';
import SongCoverOverlay from '@/components/common/SongCoverOverlay';
import type { MusicMenuContext } from '@/hooks/useSongOperations';
import CustomTooltip from '@/components/common/CustomTooltip';

import { getMusicItemId } from '@/utils/musicItemUtils';

const HIDE_ALBUM_BREAKPOINT = 900;

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
    context = 'library'
}: SongListViewProps) {
    const isLibraryContext = context === 'library';
    const gridGapClass = isLibraryContext ? "gap-3" : "gap-4";
    const headerPaddingClass = isLibraryContext ? "px-2" : "px-4";
    const rowPaddingClass = isLibraryContext ? "px-2" : "px-4";
    const headerTopClass = "top-10";

    // Header Blur / Context specific class - kept from original if any logic existed, seemingly generic sticky

    // Responsive: auto-hide album column on narrow windows
    const [shouldHideAlbum, setShouldHideAlbum] = useState(false);
    useEffect(() => {
        const checkWidth = () => {
            setShouldHideAlbum(window.innerWidth < HIDE_ALBUM_BREAKPOINT);
        };
        checkWidth();
        window.addEventListener('resize', checkWidth);
        return () => window.removeEventListener('resize', checkWidth);
    }, []);

    const effectiveHideAlbum = hideAlbum || shouldHideAlbum;

    // Persist sort state
    const [sortKey, setSortKey] = useState<SortKey>(() => {
        try {
            const saved = localStorage.getItem('songlist_sort_key');
            if (saved === 'title' || saved === 'artist' || saved === 'album' || saved === 'duration') {
                return saved;
            }
        } catch { }
        return null;
    });

    const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
        try {
            const saved = localStorage.getItem('songlist_sort_order');
            if (saved === 'asc' || saved === 'desc') {
                return saved;
            }
        } catch { }
        return 'asc';
    });

    // Selection Store
    const { isSelectionMode, selectedIds, toggleSelectionMode, toggleSelection, clearSelection, selectionType, selectAllRequested, setSelectAllRequested, selectAll, setSelectableIds } = useSelectionStore();
    const { toggleFavorite, isFavorite, favoriteSet } = useLibraryStore();

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

    const sortedSongs = useMemo(() => {
        if (!sortKey || sortKey === 'manual') return songs;
        return [...songs].sort((a, b) => {
            let valA = a[sortKey];
            let valB = b[sortKey];
            if (valA === undefined || valA === null) valA = '';
            if (valB === undefined || valB === null) valB = '';

            if (typeof valA === 'string' && typeof valB === 'string') {
                const isAsciiA = /^[\x00-\x7F]/.test(valA);
                const isAsciiB = /^[\x00-\x7F]/.test(valB);

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
    }, [songs, sortKey, sortOrder]);

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
                try { localStorage.setItem('songlist_sort_order', 'desc'); } catch { }
            } else {
                setSortKey(null);
                setSortOrder('asc');
                try {
                    localStorage.removeItem('songlist_sort_key');
                    localStorage.setItem('songlist_sort_order', 'asc');
                } catch { }
            }
        } else {
            setSortKey(key);
            setSortOrder('asc');
            try {
                if (key) localStorage.setItem('songlist_sort_key', key);
                localStorage.setItem('songlist_sort_order', 'asc');
            } catch { }
        }
    };

    const SortIcon = ({ colKey }: { colKey: SortKey }) => {
        if (sortKey !== colKey) return null;
        return sortOrder === 'asc' ? <MdArrowDropUp className="inline text-lg -ml-1" /> : <MdArrowDropDown className="inline text-lg -ml-1" />;
    };

    const HeaderCell = ({ label, colKey, className, allowSort = true }: { label: React.ReactNode, colKey: SortKey, className?: string, allowSort?: boolean }) => (
        <div
            onClick={() => allowSort && !disableSort && handleSort(colKey)}
            className={clsx(
                "flex items-center gap-1 select-none transition-colors",
                (allowSort && !disableSort) ? "cursor-pointer hover:text-on-surface" : "",
                className
            )}
        >
            {label}
            {(allowSort && !disableSort) && <SortIcon colKey={colKey} />}
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
        if (el instanceof HTMLElement) setScrollParent(el);
    }, [virtualize]);

    // Render Row Function
    const itemContent = (index: number, song: SongMetadata) => {
        const id = getMusicItemId(song);
        const selected = isSelected(id);
        const isFav = (song.id !== undefined && typeof song.id === 'number')
            ? favoriteSet.has(song.id)
            : isFavorite(song as any);

        return (
            <div
                key={id || index}
                onDoubleClick={() => {
                    if (!isSelectionMode) {
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
                onClick={(e) => handleItemClick(e, song)}
                onContextMenu={(e) => handleContextMenu(e, song, index)}
                style={gridStyle}
                className={clsx(
                    "group grid py-2 items-center rounded-lg transition-colors relative",
                    gridGapClass,
                    rowPaddingClass,
                    selected
                        ? "bg-primary/10 hover:bg-primary/15"
                        : "hover:bg-surface-container-highest active:bg-surface-container-high hover:elevation-1",
                    "cursor-default text-[14px]"
                )}
            >
                {selected && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-lg" />
                )}

                {/* Heart Icon */}
                <div className="flex justify-center items-center">
                    <CustomTooltip text={isFav ? "取消喜爱" : "喜爱"} placement="top">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(song);
                            }}
                            className={clsx(
                                "flex items-center justify-center w-6 h-6 rounded-full transition-all active:scale-95",
                                isFav
                                    ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 opacity-100"
                                    : "text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-white/5 opacity-0 group-hover:opacity-100"
                            )}
                        >
                            {isFav ? <MdFavorite className="text-base" /> : <MdFavoriteBorder className="text-base" />}
                        </button>
                    </CustomTooltip>
                </div>

                {/* Title + Cover */}
                <div className="flex items-center gap-3 overflow-hidden">
                    {!hideCover && (
                        <div className="w-10 h-10 rounded-[4px] shrink-0 bg-neutral-200 dark:bg-neutral-800 overflow-hidden shadow-sm border border-neutral-200/10 relative group/cover cursor-pointer">
                            <SongCoverOverlay
                                song={song}
                                className="w-full h-full"
                                onPlay={() => onPlay(song, index, { restartIfCurrent: true })}
                                restartOnPlay
                            />
                        </div>
                    )}
                    <span className={clsx(
                        "font-medium truncate pr-4",
                        selected ? "text-primary dark:text-primary-light" : "text-neutral-900 dark:text-neutral-100"
                    )}>
                        {song.title}
                    </span>
                </div>

                {/* Artist */}
                {!hideArtist && (
                    <div
                        className={clsx(
                            "text-neutral-500 dark:text-neutral-400 truncate font-medium transition-colors",
                            !isSelectionMode && onOpenArtist && song.artist && "hover:text-primary cursor-pointer"
                        )}
                        onClick={(e) => {
                            if (isSelectionMode) return;
                            if (onOpenArtist && song.artist) {
                                e.stopPropagation();
                                onOpenArtist(song.artist);
                            }
                        }}
                    >
                        {song.artist}
                    </div>
                )}

                {/* Album */}
                {!effectiveHideAlbum && (
                    <div
                        className={clsx(
                            "text-neutral-500 dark:text-neutral-400 truncate transition-colors",
                            !isSelectionMode && onOpenAlbum && song.album && "hover:text-primary cursor-pointer"
                        )}
                        onClick={(e) => {
                            if (isSelectionMode) return;
                            if (onOpenAlbum && song.album) {
                                e.stopPropagation();
                                onOpenAlbum(song.album);
                            }
                        }}
                    >
                        {song.album}
                    </div>
                )}

                {/* Duration */}
                <div className="text-neutral-500 dark:text-neutral-400 text-right pr-2 text-[13px] font-variant-numeric">
                    {formatDuration(song.duration)}
                </div>

                {/* Context Menu Trigger */}
                <div
                    className={clsx(
                        "flex justify-end transition-opacity",
                        isSelectionMode || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    <SmartMusicContextMenu
                        onOpen={() => setContextMenu(null)}
                        items={song}
                        context={context}
                        variant="clean"
                        onPlay={() => onPlay(song, index, { restartIfCurrent: true })}
                        onDelete={enableDelete && onDelete ? () => onDelete(song) : undefined}
                        isSelected={selected}
                        onSelect={() => handleCheckboxClick(null, song)}
                    />
                </div>
            </div>
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
                <HeaderCell label="标题" colKey="title" className="pl-0" allowSort={!disableSort} />
                {!hideArtist && <HeaderCell label="艺人" colKey="artist" allowSort={!disableSort} />}
                {!effectiveHideAlbum && <HeaderCell label="专辑" colKey="album" allowSort={!disableSort} />}
                <HeaderCell
                    label={<MdAccessTime className="text-base" />}
                    colKey="duration"
                    className="justify-end pr-2"
                    allowSort={!disableSort}
                />
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
