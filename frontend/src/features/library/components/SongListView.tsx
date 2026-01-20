import { useState, useMemo, useEffect } from 'react';
import { MdAccessTime, MdPlayArrow, MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import { IoCheckbox, IoSquareOutline } from 'react-icons/io5';
import clsx from 'clsx';
import type { SongMetadata } from '../../../types';
import InfoDialog from '../../../components/common/InfoDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { useSelectionStore } from '../../../store/useSelectionStore';
import CoverImage from '../../../components/common/CoverImage';
import MusicContextMenu, { getMusicMenuGroups } from '../../../components/common/MusicContextMenu';
import CursorContextMenu from '../../../components/common/CursorContextMenu';

// Breakpoint for hiding album column (in pixels)
const HIDE_ALBUM_BREAKPOINT = 900;

interface SongListViewProps {
    songs: SongMetadata[];
    onPlay: (song: SongMetadata, index: number) => void;
    onDelete?: (song: SongMetadata) => void;
    hideCover?: boolean; // 新增：是否隐藏封面
    enableDelete?: boolean; // 新增：是否启用删除功能 (默认 true)
    hideArtist?: boolean; // 新增：是否隐藏艺人列
    hideAlbum?: boolean; // 新增：是否隐藏专辑列
    disableSort?: boolean; // 新增：禁用排序点击
    onOpenArtist?: (artist: string) => void;
    onOpenAlbum?: (album: string) => void;
}

type SortKey = 'title' | 'artist' | 'album' | 'duration' | null;
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
    const { isSelectionMode, selectedIds, toggleSelectionMode, toggleSelection, selectionType } = useSelectionStore();

    // 属性模态框状态
    const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
    const [propertySong, setPropertySong] = useState<SongMetadata | null>(null);

    // 删除确认状态
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [songToDelete, setSongToDelete] = useState<SongMetadata | null>(null);

    // 右键菜单状态
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: SongMetadata; index: number } | null>(null);

    const handleContextMenu = (e: React.MouseEvent, song: SongMetadata, index: number) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, song, index });
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
        if (!sortKey) return songs;
        return [...songs].sort((a, b) => {
            let valA = a[sortKey];
            let valB = b[sortKey];
            if (valA === undefined || valA === null) valA = '';
            if (valB === undefined || valB === null) valB = '';

            if (typeof valA === 'string' && typeof valB === 'string') {
                // Use zh-CN locale for proper Chinese character sorting
                return sortOrder === 'asc'
                    ? valA.localeCompare(valB, 'zh-CN', { numeric: true, sensitivity: 'base' })
                    : valB.localeCompare(valA, 'zh-CN', { numeric: true, sensitivity: 'base' });
            }
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [songs, sortKey, sortOrder]);

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
        // Add Checkbox column
        let cols = isSelectionMode ? "40px minmax(0,4fr)" : "3rem minmax(0,4fr)"; // Index/Check, Title
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
                    "sticky top-0 z-10 grid gap-4 py-3 px-4 border-b border-outline-variant/10",
                    "text-[13px] text-on-surface-variant font-medium bg-surface/95 dark:bg-surface-container-low/95 backdrop-blur-md transition-colors"
                )}>
                <div className="text-center">
                    {isSelectionMode ? (
                        // Optional: Select All Checkbox
                        // For now keep empty or #
                        <span className="opacity-0">#</span>
                    ) : '#'}
                </div>
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
                                if (!isSelectionMode) onPlay(song, index);
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

                            {/* Checkbox / Index / Play */}
                            <div className="flex justify-center w-full min-w-[24px]">
                                {isSelectionMode ? (
                                    <div
                                        onClick={(e) => handleCheckboxClick(e, song)}
                                        className="text-xl cursor-pointer text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                                    >
                                        {selected
                                            ? <IoCheckbox className="text-primary" />
                                            : <IoSquareOutline />
                                        }
                                    </div>
                                ) : (
                                    <div className="text-neutral-400 font-medium text-[13px] relative w-full text-center group-hover:text-transparent">
                                        <span className="group-hover:hidden">{index + 1}</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onPlay(song, index); }}
                                            onDoubleClick={(e) => e.stopPropagation()}
                                            className="absolute inset-0 hidden group-hover:flex items-center justify-center text-neutral-800 dark:text-neutral-200"
                                        >
                                            <MdPlayArrow className="text-xl" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* 标题 + 封面 */}
                            <div className="flex items-center gap-3 overflow-hidden">
                                {!hideCover && (
                                    <div className="w-10 h-10 rounded-[4px] shrink-0 bg-neutral-200 dark:bg-neutral-800 overflow-hidden shadow-sm border border-neutral-200/10">
                                        <CoverImage song={song} className="w-full h-full" />
                                    </div>
                                )}
                                <span className={clsx(
                                    "font-medium truncate pr-4",
                                    selected ? "text-primary dark:text-primary-light" : "text-neutral-900 dark:text-neutral-100"
                                )}>
                                    {song.title}
                                </span>
                            </div>


                            {/* 艺人 */}
                            {!hideArtist && (
                                <div className="text-neutral-500 dark:text-neutral-400 truncate font-medium">
                                    {song.artist}
                                </div>
                            )}

                            {/* 专辑 */}
                            {!effectiveHideAlbum && (
                                <div className="text-neutral-500 dark:text-neutral-400 truncate">
                                    {song.album}
                                </div>
                            )}

                            {/* 时长 */}
                            <div className="text-neutral-500 dark:text-neutral-400 text-right pr-2 text-[13px] font-variant-numeric">
                                {formatDuration(song.duration)}
                            </div>

                            {/* 菜单 - 三个点 */}
                            <div
                                className={clsx(
                                    "flex justify-end transition-opacity",
                                    isSelectionMode || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                )}
                                onDoubleClick={(e) => e.stopPropagation()}
                            >
                                <MusicContextMenu
                                    type="song"
                                    variant="clean"
                                    onPlay={() => onPlay(song, index)}
                                    // Use addToNext for "Play Next" behavior
                                    onAddToQueue={() => useLibraryStore.getState().addToNext(song)}
                                    onAddToPlaylist={() => console.log('Add to playlist', song)}
                                    onShowProperties={() => handleOpenProperties(song)}
                                    onShowAlbum={onOpenAlbum && song.album ? () => onOpenAlbum(song.album!) : undefined}
                                    onShowArtist={onOpenArtist && song.artist ? () => onOpenArtist(song.artist!) : undefined}
                                    onDelete={enableDelete && onDelete ? () => handleDeleteClick(song) : undefined}
                                    deleteText="从音乐库删除"
                                    onSelect={() => toggleSelectionMode({ id: id || '', type: 'song', data: song })}
                                    onOpen={() => setContextMenu(null)}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Custom Context Menu */}
            {contextMenu && (
                <CursorContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    menuGroups={getMusicMenuGroups({
                        type: 'song',
                        onPlay: () => onPlay(contextMenu.song, contextMenu.index),
                        onAddToQueue: () => useLibraryStore.getState().addToNext(contextMenu.song),
                        onAddToPlaylist: () => console.log('Add to playlist', contextMenu.song),
                        onShowProperties: () => handleOpenProperties(contextMenu.song),
                        onShowAlbum: onOpenAlbum && contextMenu.song.album ? () => onOpenAlbum(contextMenu.song.album!) : undefined,
                        onShowArtist: onOpenArtist && contextMenu.song.artist ? () => onOpenArtist(contextMenu.song.artist!) : undefined,
                        onDelete: enableDelete && onDelete ? () => handleDeleteClick(contextMenu.song) : undefined,
                        deleteText: "从音乐库删除",
                        onSelect: () => toggleSelectionMode({
                            id: contextMenu.song.id ? contextMenu.song.id.toString() : contextMenu.song.path || '',
                            type: 'song',
                            data: contextMenu.song
                        })
                    })}
                />
            )}
        </div >
    );
}
