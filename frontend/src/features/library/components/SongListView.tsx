import { useState, useMemo, useEffect } from 'react';
import { MdAccessTime, MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
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

import { libraryService } from '../../../services/libraryService';
import { usePlayerStore } from '../../../store/usePlayerStore';
import { useAddToPlaylistStore } from '../../../store/useAddToPlaylistStore';
import { usePlaybackActions } from '../../../hooks/usePlaybackActions';

// ... (in MusicContextMenu props)
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
    onOpenAlbum
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
    const { isSelectionMode, selectedIds, toggleSelectionMode, toggleSelection, selectionType, selectAllRequested, setSelectAllRequested, selectAll, deselectItem } = useSelectionStore();
    const { toggleFavorite } = useLibraryStore();

    // Handle Select All Request


    // 属性模态框状态
    const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
    const [propertySong, setPropertySong] = useState<SongMetadata | null>(null);

    // 删除确认状态
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [songToDelete, setSongToDelete] = useState<SongMetadata | null>(null);

    // 右键菜单状态
    type ContextMenuState = {
        x: number;
        y: number;
        type: 'single' | 'batch';
        song?: SongMetadata; // For single
        index?: number; // For single
        songs?: SongMetadata[]; // For batch
    };
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

    const handleContextMenu = (e: React.MouseEvent, song: SongMetadata, index: number) => {
        e.preventDefault();

        const id = song.id ? song.id.toString() : song.path;
        const isSelected = id ? selectedIds.has(id) : false;

        // Multi-select context menu only if we clicked on one of the ALREADY selected items
        const isMultiSelecting = isSelectionMode && isSelected && selectedIds.size > 1;

        if (isMultiSelecting) {
            // Get all selected songs
            // We iterate over sortedSongs to maintain order
            const selectedSongs = sortedSongs.filter(s => {
                const sId = s.id ? s.id.toString() : s.path;
                return sId && selectedIds.has(sId);
            });

            setContextMenu({ x: e.clientX, y: e.clientY, type: 'batch', songs: selectedSongs });
        } else {
            setContextMenu({ x: e.clientX, y: e.clientY, type: 'single', song, index });
        }
    };

    // Batch Actions
    const { addToNext } = useLibraryStore();
    const { setShuffleState } = usePlayerStore();
    const { playList } = usePlaybackActions();

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
                try {
                    await libraryService.toggleFavorite(s.id);
                } catch (e) { console.error(e); }
            }
        }
        // Ideally we should trigger a UI update here, but toggleFavorite usually updates store via events or refetch
        // Since we are in SongListView which takes props, parent might need update. 
        // But libraryService events might handle it if subscribed.
        // For now, simpler:
        // Force update local state if possible or rely on parent re-render.
    };

    const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);

    const handleBatchDelete = async () => {
        if (!contextMenu || contextMenu.type !== 'batch' || !contextMenu.songs) return;
        const songsToDelete = contextMenu.songs;
        const ids = songsToDelete.map(s => s.id).filter(id => typeof id === 'number') as number[];

        if (ids.length > 0) {
            await libraryService.batchDeleteSongs(ids);
            // Parent should handle refresh, or we trigger it via libraryService event but here we just close menu.
        }
        setBatchConfirmOpen(false);
        setContextMenu(null);
    };

    // 打开删除确认框
    const handleDeleteClick = (song: SongMetadata) => {
        setSongToDelete(song);
        setIsDeleteConfirmOpen(true);
    };

    // 确认删除
    const confirmDelete = () => {
        if (songToDelete && onDelete) {
            onDelete(songToDelete);
        }
    };

    const handleOpenProperties = (song: SongMetadata) => {
        setPropertySong(song);
        setIsPropertiesOpen(true);
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
                id: song.id ? song.id.toString() : song.path || '',
                data: song
            })).filter(item => item.id !== '');

            selectAll(items, 'song');
            setSelectAllRequested(false);
        }
    }, [selectAllRequested, isSelectionMode, sortedSongs, selectAll, setSelectAllRequested]);

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

        // Use ID if available, else path
        const id = song.id ? song.id.toString() : song.path;
        if (!id) return;

        if (isSelectionMode) {
            if (canSelect) {
                toggleSelection(id, 'song', song);
            } else {
                // Switch type? Or notify?
                // For now, if user clicks song while in Album mode, we switch to song mode often in OS, 
                // but let's just allow it and clear old selection primarily via store logic
                toggleSelection(id, 'song', song);
            }
        } else {
            // Normal visual click does NOTHING usually unless it's double click for playback in desktop
            // But here we rely on doubleClick for play.
            // Single click could highlight?
        }
    };

    const handleCheckboxClick = (e: React.MouseEvent, song: SongMetadata) => {
        e.stopPropagation();
        const id = song.id ? song.id.toString() : song.path;
        if (!id) return;

        if (!isSelectionMode) {
            // Enter selection mode
            toggleSelectionMode({ id, type: 'song', data: song });
        } else {
            toggleSelection(id, 'song', song);
        }
    };

    // Grid 定义
    const getGridCols = () => {
        // Selection: Checkbox (40px)
        // Normal: Heart (24px)
        let cols = isSelectionMode
            ? "40px 24px minmax(0,4fr)"
            : "24px minmax(0,4fr)";

        if (!hideArtist) cols += " minmax(0,3fr)"; // Artist
        if (!effectiveHideAlbum) cols += " minmax(0,3fr)"; // Album
        cols += " 100px 40px"; // Time, Menu
        return cols;
    };

    const gridStyle = { gridTemplateColumns: getGridCols() };

    return (
        <div className="w-full relative select-none">
            <InfoDialog
                isOpen={isPropertiesOpen}
                onClose={() => setIsPropertiesOpen(false)}
                song={propertySong}
            />

            <ConfirmDialog
                isOpen={isDeleteConfirmOpen}
                onClose={() => setIsDeleteConfirmOpen(false)}
                onConfirm={confirmDelete}
                title="从音乐库删除"
                description={`确定要从音乐库中删除 "${songToDelete?.title || '此歌曲'}" 吗？此操作不会删除本地文件。`}
                confirmText="删除"
                type="danger"
            />

            {/* 表头 (Sticky) */}
            <div
                style={gridStyle}
                className={clsx(
                    "sticky top-0 z-45 grid gap-4 pt-10 pb-3 px-4 border-b border-outline-variant/10",
                    "text-[13px] text-on-surface-variant font-medium bg-surface/70 dark:bg-surface-container-low/70 backdrop-blur-xl transition-colors"
                )}>
                {isSelectionMode && (
                    <div className="text-center">
                        <span className="opacity-0">#</span>
                    </div>
                )}
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
                    const id = song.id ? song.id.toString() : song.path;
                    const selected = isSelected(id);

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

                            {/* Column 1: Checkbox (Selection Mode Only) */}
                            {isSelectionMode && (
                                <div className="flex justify-center w-full min-w-[24px]">
                                    <div
                                        onClick={(e) => handleCheckboxClick(e, song)}
                                        className="text-xl cursor-pointer text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                                    >
                                        {selected
                                            ? <IoCheckbox className="text-primary" />
                                            : <IoSquareOutline />
                                        }
                                    </div>
                                </div>
                            )}

                            {/* Column 2 (Now Col 1 in Normal): Heart Icon */}

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
                                <div className="text-neutral-500 dark:text-neutral-400 truncate font-medium">
                                    {song.artist}
                                </div>
                            )}

                            {/* Column 5: Album */}
                            {!effectiveHideAlbum && (
                                <div className="text-neutral-500 dark:text-neutral-400 truncate">
                                    {song.album}
                                </div>
                            )}

                            {/* Column 6: Duration */}
                            <div className="text-neutral-500 dark:text-neutral-400 text-right pr-2 text-[13px] font-variant-numeric">
                                {formatDuration(song.duration)}
                            </div>

                            {/* Column 7: Menu - Three Dots */}
                            <div
                                className={clsx(
                                    "flex justify-end transition-opacity",
                                    isSelectionMode || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                )}
                                onDoubleClick={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <MusicContextMenu
                                    onOpen={() => setContextMenu(null)}
                                    type="song"
                                    variant="clean"
                                    onPlay={() => onPlay(song, index, { restartIfCurrent: true })}
                                    // Use addToNext for "Play Next" behavior
                                    onAddToQueue={() => useLibraryStore.getState().addToNext(song)}
                                    onAddToPlaylist={() => useAddToPlaylistStore.getState().open(song)}
                                    onShowProperties={() => handleOpenProperties(song)}
                                    onShowAlbum={onOpenAlbum && song.album ? () => onOpenAlbum(song.album!) : undefined}
                                    onShowArtist={onOpenArtist && song.artist ? () => onOpenArtist(song.artist!) : undefined}
                                    onDelete={enableDelete && onDelete ? () => handleDeleteClick(song) : undefined}
                                    deleteText="从音乐库删除"
                                    onSelect={() => {
                                        const songId = song.id ? song.id.toString() : song.path || '';
                                        if (isSelectionMode) {
                                            toggleSelection(songId, 'song', song);
                                        } else {
                                            toggleSelectionMode({ id: songId, type: 'song', data: song });
                                        }
                                    }}
                                    selectText={selectedIds.has(id || '') ? "取消选择" : "选择"}
                                    // Favorites Support
                                    onFavorite={() => toggleFavorite(song)}
                                    isFavorite={song.is_favorite}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Batch Delete Confirm */}
            <ConfirmDialog
                isOpen={batchConfirmOpen}
                onClose={() => setBatchConfirmOpen(false)}
                onConfirm={handleBatchDelete}
                title="从音乐库删除"
                description={`确定要删除选中的 ${contextMenu?.type === 'batch' ? contextMenu.songs?.length : 0} 项吗？此操作将从音乐库中移除，不会删除本地文件。`}
                type="danger"
            />

            {/* Custom Context Menu */}
            {
                contextMenu && (
                    <CursorContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        onClose={() => setContextMenu(null)}
                        menuGroups={contextMenu.type === 'batch' && contextMenu.songs ?
                            // BATCH MODE
                            getMusicMenuGroups({
                                type: 'song',
                                onPlay: () => handleBatchPlay(contextMenu.songs!),
                                onAddToQueue: () => handleBatchAddToQueue(contextMenu.songs!),
                                onAddToPlaylist: () => useAddToPlaylistStore.getState().open(contextMenu.songs!),
                                onDelete: enableDelete ? () => setBatchConfirmOpen(true) : undefined,
                                deleteText: `从音乐库删除 (${contextMenu.songs.length})`,
                                onFavorite: () => handleBatchFavorite(contextMenu.songs!),
                                onSelect: () => {
                                    contextMenu.songs?.forEach(s => {
                                        const sId = s.id ? s.id.toString() : s.path;
                                        if (sId) deselectItem(sId);
                                    });
                                },
                                selectText: `取消选择 (${contextMenu.songs.length})`
                            })
                            :
                            // SINGLE MODE
                            getMusicMenuGroups({
                                type: 'song', // @ts-ignore
                                onPlay: () => onPlay(contextMenu.song!, contextMenu.index!), // @ts-ignore
                                onAddToQueue: () => useLibraryStore.getState().addToNext(contextMenu.song!), // @ts-ignore
                                onAddToPlaylist: () => useAddToPlaylistStore.getState().open(contextMenu.song!), // @ts-ignore
                                onShowProperties: () => handleOpenProperties(contextMenu.song!), // @ts-ignore
                                onShowAlbum: onOpenAlbum && contextMenu.song!.album ? () => onOpenAlbum(contextMenu.song!.album!) : undefined, // @ts-ignore
                                onShowArtist: onOpenArtist && contextMenu.song!.artist ? () => onOpenArtist(contextMenu.song!.artist!) : undefined, // @ts-ignore
                                onDelete: enableDelete && onDelete ? () => handleDeleteClick(contextMenu.song!) : undefined,
                                deleteText: "从音乐库删除",
                                onSelect: () => {
                                    const id = contextMenu.song!.id ? contextMenu.song!.id.toString() : contextMenu.song!.path || '';
                                    if (isSelectionMode) {
                                        toggleSelection(id, 'song', contextMenu.song!); // @ts-ignore
                                    } else {
                                        toggleSelectionMode({ id, type: 'song', data: contextMenu.song! }); // @ts-ignore
                                    }
                                }, // @ts-ignore
                                selectText: selectedIds.has(contextMenu.song!.id ? contextMenu.song!.id.toString() : contextMenu.song!.path || '') ? "取消选择" : "选择",
                                onFavorite: () => toggleFavorite(contextMenu.song!), // @ts-ignore
                                isFavorite: contextMenu.song!.is_favorite
                            })}
                    />
                )
            }
        </div >
    );
}

