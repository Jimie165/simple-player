import { useState, useEffect } from 'react';
import { MdCheckBox, MdCheckBoxOutlineBlank } from 'react-icons/md';
import clsx from 'clsx';

import CoverImage from '@/components/common/CoverImage';
import { useSelectionStore } from '@/store/useSelectionStore';
import type { SongMetadata } from '@/types';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import CardPlayButton from '@/components/common/CardPlayButton';
import CustomTooltip from '@/components/common/CustomTooltip';
import SmartMusicContextMenu from '@/components/common/SmartMusicContextMenu';
import SmartCursorContextMenu from '@/components/common/SmartCursorContextMenu';
import VirtualizedGrid from '@/components/common/VirtualizedGrid';
import { useMainContentWidth } from '@/hooks/useMainContentWidth';
import { getSparseGridStyle } from '@/utils/gridLayout';
import { getMusicItemId } from '@/utils/musicItemUtils';

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
    onShuffleAlbum?: (album: AlbumData) => void;
    onOpenAlbum: (album: AlbumData) => void;
    onOpenArtist?: (artistName: string) => void; // Add handler for Artist navigation
    onDeleteAlbum?: (album: AlbumData) => void;
    hideArtist?: boolean; // New prop: hide artist context
    hideYear?: boolean;
}

export default function AlbumGridView({ albums, onPlayAlbum, onShuffleAlbum, onOpenAlbum, onOpenArtist, onDeleteAlbum, hideArtist = false, hideYear = false }: AlbumGridViewProps) {
    const mainContentWidth = useMainContentWidth();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [albumToDelete, setAlbumToDelete] = useState<AlbumData | null>(null);

    // Selection Store
    const { isSelectionMode, selectedIds, toggleSelectionMode, toggleSelection, selectAllRequested, setSelectAllRequested, selectAll, selectionType, setSelectableIds } = useSelectionStore();

    // Handle Select All Request
    useEffect(() => {
        if (selectAllRequested && isSelectionMode && (selectionType === 'album' || !selectionType)) {
            const items = albums.map(album => ({
                id: getMusicItemId(album),
                data: album
            }));
            selectAll(items, 'album');
            setSelectAllRequested(false);
        }
    }, [selectAllRequested, isSelectionMode, selectionType, albums, selectAll, setSelectAllRequested]);

    useEffect(() => {
        if (!isSelectionMode) return;
        setSelectableIds(albums.map(album => getMusicItemId(album)).filter(id => id !== ''));
    }, [isSelectionMode, albums, setSelectableIds]);

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
    const getAlbumId = (album: AlbumData) => getMusicItemId(album);

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

            <VirtualizedGrid
                data={albums}
                itemKey={(_index, album) => getAlbumId(album)}
                listClassName="grid content-grid-cover gap-6 pt-2 pb-20"
                listStyle={getSparseGridStyle(mainContentWidth, albums.length, 24, 'cover')}
                itemContent={(_index, album) => {
                    const id = getAlbumId(album);
                    const isSelected = selectedIds.has(id);
                    const canOpenArtist = !!onOpenArtist && album.songs.some(song => song.artist === album.artist);

                    return (
                        <div
                            className="group flex flex-col gap-3 rounded-2xl p-4 -mx-4 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer relative"
                            onClick={(e) => handleItemClick(album, e)}
                            onContextMenu={(e) => handleContextMenu(e, album)}
                        >
                            <div className="aspect-square w-full rounded-2xl shadow-sm bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative border border-black/5 dark:border-white/5">
                                <CoverImage
                                    song={album.songs[0]}
                                    src={album.cover}
                                    className="w-full h-full group-hover:scale-[1.02] transition-transform duration-500 ease-out"
                                    iconClassName="text-6xl opacity-50"
                                />

                                {isSelectionMode && (
                                    <div className="absolute top-2 left-2 z-20">
                                        <div
                                            onClick={(e) => { e.stopPropagation(); toggleSelection(id, 'album', album); }}
                                            className="w-6 h-6 rounded bg-white/40 backdrop-blur-sm flex items-center justify-center hover:bg-white/60 transition-colors"
                                        >
                                            {isSelected
                                                ? <MdCheckBox className="text-primary text-xl" />
                                                : <MdCheckBoxOutlineBlank className="text-neutral-700 text-xl" />
                                            }
                                        </div>
                                    </div>
                                )}

                                {!isSelectionMode && (
                                    <div className="absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        <CardPlayButton onClick={() => onPlayAlbum(album)} title="播放专辑" />

                                        <SmartMusicContextMenu
                                            className="absolute bottom-3 right-3"
                                            buttonClassName="w-10 h-10"
                                            items={album}
                                            context={hideArtist ? 'artist_detail' : 'library'}
                                            onPlay={() => onPlayAlbum(album)}
                                            onShuffle={onShuffleAlbum ? () => onShuffleAlbum(album) : undefined}
                                            onDelete={onDeleteAlbum ? () => handleDeleteClick(album) : undefined}
                                            onOpen={() => setContextMenu(null)}
                                            isSelected={isSelected}
                                            onSelect={() => isSelectionMode
                                                ? toggleSelection(id, 'album', album)
                                                : toggleSelectionMode({ id, type: 'album', data: album })
                                            }
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col gap-0.5 px-1">
                                <CustomTooltip text={album.name} className="inline-block w-fit max-w-full min-w-0 align-top">
                                    <span className="block truncate text-base font-semibold text-neutral-900 dark:text-neutral-50">
                                        {album.name}
                                    </span>
                                </CustomTooltip>
                                {!hideArtist && (
                                    <CustomTooltip text={album.artist} className="inline-block w-fit max-w-full min-w-0 align-top">
                                        <span
                                            className={clsx(
                                                "block truncate text-sm text-neutral-500 dark:text-neutral-400",
                                                canOpenArtist && "hover:text-primary transition-colors"
                                            )}
                                            onClick={(e) => {
                                                if (canOpenArtist) {
                                                    e.stopPropagation();
                                                    onOpenArtist?.(album.artist);
                                                }
                                            }}
                                        >
                                            {album.artist}
                                        </span>
                                    </CustomTooltip>
                                )}
                                {!hideYear && (
                                    <span className="truncate text-xs text-neutral-400 dark:text-neutral-500">
                                        {album.songs[0]?.year || "Unknown Year"}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                }}
            />
            {/* Cursor Context Menu */}
            {contextMenu && (
                <SmartCursorContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    item={contextMenu.album}
                    context={hideArtist ? 'artist_detail' : 'library'}
                    onClose={() => setContextMenu(null)}
                    onPlay={() => onPlayAlbum(contextMenu.album)}
                    onShuffle={onShuffleAlbum ? () => onShuffleAlbum(contextMenu.album) : undefined}
                    onDelete={onDeleteAlbum ? () => handleDeleteClick(contextMenu.album) : undefined}
                />
            )}
        </>
    );
}
