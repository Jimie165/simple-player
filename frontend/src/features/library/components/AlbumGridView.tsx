import { useState } from 'react';
import { IoCheckbox, IoSquareOutline } from 'react-icons/io5';

import CoverImage from '../../../components/common/CoverImage';
import { useLibraryStore } from '../../../store/useLibraryStore';
import { useSelectionStore } from '../../../store/useSelectionStore';
import type { SongMetadata } from '../../../types';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import CardPlayButton from '../../../components/common/CardPlayButton';
import MusicContextMenu, { getMusicMenuGroups } from '../../../components/common/MusicContextMenu';
import CursorContextMenu from '../../../components/common/CursorContextMenu';

// 定义专辑数据结构
export interface AlbumData {
    name: string;
    artist: string;
    cover: string | null;
    cover_path: string | null;
    songs: SongMetadata[]; // 包含的歌曲
}

interface AlbumGridViewProps {
    albums: AlbumData[];
    onPlayAlbum: (album: AlbumData) => void;
    onOpenAlbum: (album: AlbumData) => void;
    onOpenArtist?: (artistName: string) => void; // Add handler for Artist navigation
    onDeleteAlbum?: (album: AlbumData) => void;
    hideArtist?: boolean; // New prop: hide artist context
}

export default function AlbumGridView({ albums, onPlayAlbum, onOpenAlbum, onOpenArtist, onDeleteAlbum, hideArtist = false }: AlbumGridViewProps) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [albumToDelete, setAlbumToDelete] = useState<AlbumData | null>(null);

    // Selection Store
    const { isSelectionMode, selectedIds, toggleSelectionMode, toggleSelection } = useSelectionStore();

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; album: AlbumData } | null>(null);

    const handleContextMenu = (e: React.MouseEvent, album: AlbumData) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, album });
    };

    const handleDeleteClick = (album: AlbumData) => {
        setAlbumToDelete(album);
        setConfirmOpen(true);
    };

    const confirmDelete = () => {
        if (albumToDelete && onDeleteAlbum) {
            onDeleteAlbum(albumToDelete);
        }
        setConfirmOpen(false);
        setAlbumToDelete(null);
    };

    // Helper key for selection (Album Name + Artist as specific ID)
    const getAlbumId = (album: AlbumData) => `${album.name}-${album.artist}`;

    const handleItemClick = (album: AlbumData, e: React.MouseEvent) => {
        if (isSelectionMode) {
            e.stopPropagation();
            toggleSelection(getAlbumId(album), 'album', album);
            return;
        }
        onOpenAlbum(album);
    };

    return (
        <>
            <ConfirmDialog
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={confirmDelete}
                title="删除专辑"
                description={`确定要删除专辑 "${albumToDelete?.name}" 及其所有歌曲吗？此操作将从音乐库中移除，不会删除本地文件。`}
                confirmText="删除"
                type="danger"
            />

            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pt-2 pb-8">
                {albums.map((album) => {
                    const id = getAlbumId(album);
                    const isSelected = selectedIds.has(id);

                    return (
                        <div
                            key={id}
                            className="group flex flex-col gap-3 rounded-2xl p-4 -mx-4 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer relative"
                            onClick={(e) => handleItemClick(album, e)}
                            onContextMenu={(e) => handleContextMenu(e, album)}
                        >
                            {/* 封面区域 (M3 风格：更大的圆角，阴影) */}
                            <div className="aspect-square w-full rounded-2xl shadow-sm bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative border border-black/5 dark:border-white/5">
                                <CoverImage
                                    song={album.songs[0]}
                                    src={album.cover} // Fallback to base64 if present, or let CoverImage prefer song path
                                    className="w-full h-full group-hover:scale-[1.02] transition-transform duration-500 ease-out"
                                    iconClassName="text-6xl opacity-50"
                                />

                                {/* Selection Checkbox Overlay */}
                                {isSelectionMode && (
                                    <div className="absolute top-2 left-2 z-20">
                                        <div
                                            onClick={(e) => { e.stopPropagation(); toggleSelection(id, 'album', album); }}
                                            className="w-6 h-6 rounded bg-white/40 backdrop-blur-sm flex items-center justify-center hover:bg-white/60 transition-colors"
                                        >
                                            {isSelected
                                                ? <IoCheckbox className="text-primary text-xl" />
                                                : <IoSquareOutline className="text-neutral-700 text-xl" />
                                            }
                                        </div>
                                    </div>
                                )}

                                {/* 交互遮罩：仅在hover时出现，渐变背景提供更好的文字对比度 */}
                                {!isSelectionMode && (
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">

                                        {/* 左下角：播放按钮 (M3 FAB 风格) */}
                                        <CardPlayButton onClick={() => onPlayAlbum(album)} title="播放专辑" />

                                        {/* 右下角：更多菜单 (M3 风格) */}
                                        <MusicContextMenu
                                            type="album"
                                            className="absolute bottom-3 right-3"
                                            buttonClassName="w-10 h-10"
                                            onPlay={() => onPlayAlbum(album)}
                                            onAddToQueue={() => [...album.songs].reverse().forEach(song => useLibraryStore.getState().addToNext(song))}
                                            onAddToPlaylist={() => console.log('Add album to playlist', album)}
                                            onShowAlbum={() => onOpenAlbum(album)}
                                            onShowArtist={(!hideArtist && onOpenArtist && album.artist) ? () => onOpenArtist(album.artist) : undefined}
                                            onDelete={onDeleteAlbum ? () => handleDeleteClick(album) : undefined}
                                            deleteText="从音乐库删除"
                                            onSelect={() => toggleSelectionMode({ id, type: 'album', data: album })}
                                            onOpen={() => setContextMenu(null)}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col gap-0.5 px-1">
                                <span className="truncate text-base font-semibold text-neutral-900 dark:text-neutral-50" title={album.name}>
                                    {album.name}
                                </span>
                                <span className="truncate text-sm text-neutral-500 dark:text-neutral-400" title={album.artist}>
                                    {album.artist}
                                </span>
                                <span className="truncate text-xs text-neutral-400 dark:text-neutral-500">
                                    {album.songs[0]?.year || "Unknown Year"}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* Cursor Context Menu */}
            {contextMenu && (
                <CursorContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    menuGroups={getMusicMenuGroups({
                        type: 'album',
                        onPlay: () => onPlayAlbum(contextMenu.album),
                        onAddToQueue: () => [...contextMenu.album.songs].reverse().forEach(song => useLibraryStore.getState().addToNext(song)),
                        onAddToPlaylist: () => console.log('Add album to playlist', contextMenu.album),
                        onShowAlbum: () => onOpenAlbum(contextMenu.album),
                        onShowArtist: (!hideArtist && onOpenArtist && contextMenu.album.artist) ? () => onOpenArtist(contextMenu.album.artist) : undefined,
                        onDelete: onDeleteAlbum ? () => handleDeleteClick(contextMenu.album) : undefined,
                        deleteText: "从音乐库删除",
                        onSelect: () => toggleSelectionMode({ id: getAlbumId(contextMenu.album), type: 'album', data: contextMenu.album })
                    })}
                />
            )}
        </>
    );
}
