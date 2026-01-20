import { useState } from 'react';

import CoverImage from '../../../components/common/CoverImage';
import { useLibraryStore } from '../../../store/useLibraryStore';
import type { SongMetadata } from '../../../types';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import CardPlayButton from '../../../components/common/CardPlayButton';
import MusicContextMenu from '../../../components/common/MusicContextMenu';

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
                {albums.map((album) => (
                    <div
                        key={album.name + album.artist}
                        className="group flex flex-col gap-3 rounded-2xl p-4 -mx-4 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                        onClick={() => onOpenAlbum(album)}
                    >
                        {/* 封面区域 (M3 风格：更大的圆角，阴影) */}
                        <div className="aspect-square w-full rounded-2xl shadow-sm bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative border border-black/5 dark:border-white/5">
                            <CoverImage
                                song={album.songs[0]}
                                src={album.cover} // Fallback to base64 if present, or let CoverImage prefer song path
                                className="w-full h-full group-hover:scale-[1.02] transition-transform duration-500 ease-out"
                                iconClassName="text-6xl opacity-50"
                            />

                            {/* 交互遮罩：仅在hover时出现，渐变背景提供更好的文字对比度 */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">

                                {/* 左下角：播放按钮 (M3 FAB 风格) */}
                                <CardPlayButton onClick={() => onPlayAlbum(album)} title="播放专辑" />

                                {/* 右下角：更多菜单 (M3 风格) */}
                                <MusicContextMenu
                                    type="album"
                                    className="absolute bottom-3 right-3"
                                    buttonClassName="w-10 h-10"
                                    onPlay={() => onPlayAlbum(album)}
                                    onAddToQueue={() => album.songs.forEach(song => useLibraryStore.getState().addToPlaylist(song))}
                                    onShowAlbum={() => onOpenAlbum(album)}
                                    onShowArtist={(!hideArtist && onOpenArtist && album.artist) ? () => onOpenArtist(album.artist) : undefined}
                                    onDelete={onDeleteAlbum ? () => handleDeleteClick(album) : undefined}
                                    deleteText="从音乐库删除"
                                />
                            </div>
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
                ))}
            </div>
        </>
    );
}
