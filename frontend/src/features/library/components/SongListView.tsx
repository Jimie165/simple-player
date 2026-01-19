import { useState, useMemo } from 'react';
import { MdAccessTime, MdPlayArrow, MdArrowDropUp, MdArrowDropDown, MdMoreHoriz, MdDeleteOutline, MdInfoOutline, MdPlaylistPlay } from 'react-icons/md';
import { IoMusicalNotes, IoCheckboxOutline } from 'react-icons/io5';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import clsx from 'clsx';
import type { SongMetadata } from '../../../types';
import InfoDialog from '../../../components/common/InfoDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { IoAdd, IoPerson, IoDisc } from 'react-icons/io5';

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
    const [sortKey, setSortKey] = useState<SortKey>(null);
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    // 属性模态框状态
    const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
    const [propertySong, setPropertySong] = useState<SongMetadata | null>(null);

    // 删除确认状态
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [songToDelete, setSongToDelete] = useState<SongMetadata | null>(null);

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
                return sortOrder === 'asc'
                    ? valA.localeCompare(valB, undefined, { numeric: true })
                    : valB.localeCompare(valA, undefined, { numeric: true });
            }
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [songs, sortKey, sortOrder]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            if (sortOrder === 'asc') setSortOrder('desc');
            else { setSortKey(null); setSortOrder('asc'); }
        } else {
            setSortKey(key);
            setSortOrder('asc');
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
                (allowSort && !disableSort) ? "cursor-pointer hover:text-neutral-800 dark:hover:text-neutral-200" : "",
                className
            )}
        >
            {label}
            {(allowSort && !disableSort) && <SortIcon colKey={colKey} />}
        </div>
    );

    // Grid 定义: [序号+封面(组合)] [标题] [艺人] [专辑] [时长] [菜单]
    // 动态调整 Grid：如果 hideCover 为 true，则 Title 列不需要留那么多空间给封面
    // 动态 Grid 定义
    // 隐藏列时，使用 0fr 或者 hidden class，但 grid-cols 定义最好动态生成
    // 默认: [3rem_minmax(0,4fr)_minmax(0,3fr)_minmax(0,3fr)_100px_40px] (Index, Title, Artist, Album, Time, Menu)

    // 如果 hideArtist 为 true，Artist 列宽设为 0 或者不渲染？这里使用 grid-cols 动态调整
    // Title 始终存在。Time 始终存在。

    // 简化逻辑：构建 grid-template-columns 字符串
    const getGridCols = () => {
        let cols = "3rem minmax(0,4fr)"; // Index, Title
        if (!hideArtist) cols += " minmax(0,3fr)"; // Artist
        if (!hideAlbum) cols += " minmax(0,3fr)"; // Album
        cols += " 100px 40px"; // Time, Menu
        return cols;
    };

    const gridStyle = { gridTemplateColumns: getGridCols() };
    // 其实如果不改 Grid 定义，只是内容变了也可以，但 Title 列里有封面会导致 flex 布局不同。
    // 这里暂时保持 Grid 比例一致，只是内容不同。
    // 如果后续需要调整比例，可以在这里改。

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
                    "sticky top-0 z-10 grid gap-4 py-3 px-4 border-b border-neutral-200/60 dark:border-neutral-800/60",
                    "text-[13px] text-neutral-500 font-medium bg-white/95 dark:bg-[#1e1e1e]/95 backdrop-blur-md transition-colors"
                )}>
                <div className="text-center">#</div>
                {/* 标题栏对齐修正：使用 pl-0，让文字直接靠左（对齐封面左侧） */}
                <HeaderCell label="标题" colKey="title" className="pl-0" allowSort={!disableSort} />
                {!hideArtist && <HeaderCell label="艺人" colKey="artist" allowSort={!disableSort} />}
                {!hideAlbum && <HeaderCell label="专辑" colKey="album" allowSort={!disableSort} />}
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
                {sortedSongs.map((song, index) => (
                    <div
                        key={song.path || index}
                        onDoubleClick={() => onPlay(song, index)}
                        style={gridStyle}
                        className={clsx(
                            "group grid gap-4 px-4 py-2 items-center rounded-md transition-colors",
                            "hover:bg-neutral-100/80 dark:hover:bg-white/5",
                            "cursor-default text-[14px]" // 调整基础字号
                        )}
                    >
                        {/* 序号 / 播放按钮 */}
                        <div className="flex justify-center w-full text-neutral-400 font-medium text-[13px] relative group-hover:text-transparent">
                            <span className="group-hover:hidden">{index + 1}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); onPlay(song, index); }}
                                onDoubleClick={(e) => e.stopPropagation()}
                                className="absolute inset-0 hidden group-hover:flex items-center justify-center text-neutral-800 dark:text-neutral-200"
                            >
                                <MdPlayArrow className="text-xl" />
                            </button>
                        </div>

                        {/* 标题 + 封面 */}
                        <div className="flex items-center gap-3 overflow-hidden">
                            {!hideCover && (
                                <div className="w-10 h-10 rounded-[4px] shrink-0 bg-neutral-200 dark:bg-neutral-800 overflow-hidden shadow-sm border border-neutral-200/10">
                                    {song.cover ? (
                                        <img src={song.cover} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-neutral-400">
                                            <IoMusicalNotes />
                                        </div>
                                    )}
                                </div>
                            )}
                            <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate pr-4">
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
                        {!hideAlbum && (
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
                            className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity"
                            onDoubleClick={(e) => e.stopPropagation()}
                        >
                            <Menu as="div" className="relative">
                                <MenuButton
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                    className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 transition-colors focus:outline-none"
                                >
                                    <MdMoreHoriz className="text-xl" />
                                </MenuButton>
                                <MenuItems
                                    transition
                                    anchor="bottom end"
                                    className="w-48 origin-top-right rounded-lg bg-white dark:bg-[#2c2c2c] shadow-xl border border-neutral-200/50 dark:border-neutral-700/50 p-1 text-sm text-neutral-700 dark:text-neutral-200 focus:outline-none z-50 transition duration-100 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
                                >
                                    <MenuItem>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPlay(song, index);
                                            }}
                                            className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                                        >
                                            <MdPlayArrow className="text-lg opacity-70" />
                                            播放
                                        </button>
                                    </MenuItem>

                                    <MenuItem>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                useLibraryStore.getState().addToNext(song);
                                            }}
                                            className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                                        >
                                            <MdPlaylistPlay className="text-lg opacity-70" />
                                            下一首播放
                                        </button>
                                    </MenuItem>

                                    <MenuItem>
                                        <button
                                            className="group flex w-full items-center justify-between rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex items-center gap-3">
                                                <IoAdd className="text-lg opacity-70" />
                                                添加到
                                            </div>
                                            <span className="text-xs opacity-50">&gt;</span>
                                        </button>
                                    </MenuItem>

                                    <MenuItem>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenProperties(song);
                                            }}
                                            className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                                        >
                                            <MdInfoOutline className="text-lg opacity-70" />
                                            属性
                                        </button>
                                    </MenuItem>

                                    {onOpenAlbum && (
                                        <MenuItem>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (onOpenAlbum && song.album) onOpenAlbum(song.album);
                                                }}
                                                className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                                            >
                                                <IoDisc className="text-lg opacity-70" />
                                                显示专辑
                                            </button>
                                        </MenuItem>
                                    )}

                                    {onOpenArtist && (
                                        <MenuItem>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (onOpenArtist && song.artist) onOpenArtist(song.artist);
                                                }}
                                                className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                                            >
                                                <IoPerson className="text-lg opacity-70" />
                                                显示艺人
                                            </button>
                                        </MenuItem>
                                    )}

                                    {enableDelete && (
                                        <MenuItem>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteClick(song);
                                                }}
                                                className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 text-red-600 dark:text-red-400 data-[focus]:bg-red-50 dark:data-[focus]:bg-red-900/20"
                                            >
                                                <MdDeleteOutline className="text-lg opacity-70" />
                                                从音乐库删除
                                            </button>
                                        </MenuItem>
                                    )}

                                    <div className="my-1 h-px bg-neutral-200 dark:bg-white/10" />

                                    <MenuItem>
                                        <button
                                            className="group flex w-full items-center gap-3 rounded-lg py-2 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                                            onClick={(e) => { e.stopPropagation(); }}
                                        >
                                            <IoCheckboxOutline className="text-lg opacity-70" />
                                            选择
                                        </button>
                                    </MenuItem>
                                </MenuItems>
                            </Menu>
                        </div>
                    </div>
                ))}
            </div>
        </div >
    );
}