import { useState, useMemo, useEffect } from 'react';
import { MdAccessTime, MdArrowDropUp, MdArrowDropDown, MdFavorite, MdFavoriteBorder } from 'react-icons/md';
import clsx from 'clsx';
import type { SongMetadata } from '../../../types';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { useSelectionStore } from '../../../store/useSelectionStore';
import { usePlayerStore } from '../../../store/usePlayerStore';
import SmartMusicContextMenu from '../../../components/common/SmartMusicContextMenu';
import SmartCursorContextMenu from '../../../components/common/SmartCursorContextMenu';
import SongCoverOverlay from '../../../components/common/SongCoverOverlay';
import type { MusicMenuContext } from '../../../hooks/useSongOperations';

import { getMusicItemId } from '../../../utils/musicItemUtils';

const HIDE_ALBUM_BREAKPOINT = 900;

interface SongListViewProps {
    songs: SongMetadata[];
    onPlay: (song: SongMetadata, index: number, options?: { restartIfCurrent?: boolean }) => void;
    onDelete?: (song: SongMetadata) => void;
    hideCover?: boolean; // 新增：是否隐藏封面
    enableDelete?: boolean; // 新增：是否启用删除功能 (默认 true)
    hideArtist?: boolean; // 新增：是否隐藏艺人列
    hideAlbum?: boolean; // 新增：是否隐藏专辑列
    disableSort?: boolean; // 新增：禁用排序点击
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
    onOpenArtist,
    onOpenAlbum,
    context = 'library'
}: SongListViewProps) {
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

    // Combine prop and responsive state
    const effectiveHideAlbum = hideAlbum || shouldHideAlbum;

    // Persist sort state to localStorage
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

    // 右键菜单状态
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

    // 格式化时长
    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // 排序逻辑
    const sortedSongs = useMemo(() => {
        if (!sortKey || sortKey === 'manual') return songs;
        return [...songs].sort((a, b) => {
            let valA = a[sortKey];
            let valB = b[sortKey];
            if (valA === undefined || valA === null) valA = '';
            if (valB === undefined || valB === null) valB = '';

            if (typeof valA === 'string' && typeof valB === 'string') {
                // Check if starts with English/Number (Ascii 0-127)
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

    // Handle Select All Request
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

    // Selection Logic Helpers
    const isSelected = (id: string | undefined) => id ? selectedIds.has(id.toString()) : false;

    // Check if current selection type allows adding songs (or is empty)
    const canSelect = !selectionType || selectionType === 'song' || selectionType === 'file';

    const handleItemClick = (e: React.MouseEvent, song: SongMetadata) => {
        e.stopPropagation();
        if (e.button !== 0) return; // Only allow left click

        // Use standardized ID
        const id = getMusicItemId(song);
        if (!id) return;

        if (isSelectionMode) {
            if (canSelect) {
                toggleSelection(id, 'song', song);
            } else {
                // Switch type? Or notify?
                toggleSelection(id, 'song', song);
            }
        } else {
            // Normal visual click does NOTHING usually unless it's double click for playback in desktop
        }
    };

    const handleCheckboxClick = (e: React.MouseEvent | null, song: SongMetadata) => {
        if (e) e.stopPropagation();
        const id = getMusicItemId(song);
        if (!id) return;
        if (!isSelectionMode) {
            toggleSelectionMode({ id, type: 'song', data: song });
        } else {
            toggleSelection(id, 'song', song);
        }
    };


    // Grid 定义
    const getGridCols = () => {
        // Normal: Heart (24px)
        let cols = "24px minmax(0,4fr)";

        if (!hideArtist) cols += " minmax(0,3fr)"; // Artist
        if (!effectiveHideAlbum) cols += " minmax(0,3fr)"; // Album
        cols += " 100px 40px"; // Time, Menu
        return cols;
    };

    const gridStyle = { gridTemplateColumns: getGridCols() };

    return (
        <div className="w-full relative select-none">
            {/* 表头 (Sticky) */}
            <div
                style={gridStyle}
                className={clsx(
                    "sticky top-0 z-45 grid gap-4 pt-10 pb-3 px-4 border-b border-outline-variant/10",
                    "text-[13px] text-on-surface-variant font-medium bg-surface/70 dark:bg-surface-container-low/70 backdrop-blur-xl transition-colors"
                )}>
                {/* Selection header removed */}
                <div></div> {/* Heart header spacer */}
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

            {/* 列表内容 */}
            <div className="flex flex-col">
                {sortedSongs.map((song, index) => {
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
                                "group grid gap-4 px-4 py-2 items-center rounded-lg transition-colors relative",
                                selected
                                    ? "bg-primary/10 hover:bg-primary/15"
                                    : "hover:bg-surface-container-highest active:bg-surface-container-high hover:elevation-1",
                                "cursor-default text-[14px]"
                            )}
                        >
                            {/* Blue Selection Bar */}
                            {selected && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-lg" />
                            )}

                            {/* Column 1: Checkbox Removed */}

                            {/* Column 2: Heart Icon (Always shown) */}
                            {(
                                <div className="flex justify-center items-center">
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
                                        title={isFav ? "取消喜爱" : "喜爱"}
                                    >
                                        {isFav ? <MdFavorite className="text-base" /> : <MdFavoriteBorder className="text-base" />}
                                    </button>
                                </div>
                            )}

                            {/* Column 3: Title + Cover */}
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

                            {/* Column 4: Artist */}
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

                            {/* Column 5: Album */}
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

                            {/* Column 6: Duration */}
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
                })}
            </div >

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
