import { useState, useEffect } from 'react';
import { MdCheckBox, MdCheckBoxOutlineBlank, MdPlayArrow } from 'react-icons/md';

import CoverImage from '@/components/common/CoverImage';
import { useSelectionStore } from '@/store/useSelectionStore';
import type { SongMetadata } from '@/types';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import SmartCursorContextMenu from '@/components/common/SmartCursorContextMenu';
import SmartMusicContextMenu from '@/components/common/SmartMusicContextMenu';
import VirtualizedGrid from '@/components/common/VirtualizedGrid';
import { useMainContentWidth } from '@/hooks/useMainContentWidth';
import { getSparseGridStyle } from '@/utils/gridLayout';
import { getMusicItemId } from '@/utils/musicItemUtils';
import CustomTooltip from '@/components/common/CustomTooltip';

// 定义艺人数据结构
export interface ArtistData {
    name: string;
    cover: string | null;
    count: number;
    albumCount: number;
    songs: SongMetadata[];
}

interface ArtistGridViewProps {
    artists: ArtistData[];
    onPlayArtist: (artist: ArtistData) => void;
    onShuffleArtist?: (artist: ArtistData) => void;
    onOpenArtist: (artist: ArtistData) => void;
    onDeleteArtist?: (artist: ArtistData) => void;
}

export default function ArtistGridView({ artists, onPlayArtist, onShuffleArtist, onOpenArtist, onDeleteArtist }: ArtistGridViewProps) {
    const mainContentWidth = useMainContentWidth();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [artistToDelete, setArtistToDelete] = useState<ArtistData | null>(null);

    // Selection Store
    const { isSelectionMode, selectedIds, toggleSelectionMode, toggleSelection, selectAllRequested, setSelectAllRequested, selectAll, selectionType, setSelectableIds } = useSelectionStore();



    // Handle Select All Request
    useEffect(() => {
        if (selectAllRequested && isSelectionMode && selectionType === 'artist') {
            const items = artists.map(artist => ({
                id: getMusicItemId(artist),
                data: artist
            }));
            selectAll(items, 'artist');
            setSelectAllRequested(false);
        }
    }, [selectAllRequested, isSelectionMode, selectionType, artists, selectAll, setSelectAllRequested]);

    useEffect(() => {
        if (!isSelectionMode) return;
        setSelectableIds(artists.map(artist => getMusicItemId(artist)).filter(id => id !== ''));
    }, [isSelectionMode, artists, setSelectableIds]);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; artist: ArtistData } | null>(null);

    const handleContextMenu = (e: React.MouseEvent, artist: ArtistData) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, artist });
    };

    const handleDeleteClick = (artist: ArtistData) => {
        setArtistToDelete(artist);
        setConfirmOpen(true);
    };

    const confirmDelete = () => {
        if (artistToDelete && onDeleteArtist) {
            onDeleteArtist(artistToDelete);
        }
        setConfirmOpen(false);
        setArtistToDelete(null);
    };

    const handleItemClick = (artist: ArtistData, e: React.MouseEvent) => {
        if (isSelectionMode) {
            e.stopPropagation();
            toggleSelection(getMusicItemId(artist), 'artist', artist);
            return;
        }
        onOpenArtist(artist);
    };

    return (
        <>
            <ConfirmDialog
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={confirmDelete}
                title="删除艺人"
                description={`确定要删除艺人 "${artistToDelete?.name}" 及其所有歌曲吗？此操作将从音乐库中移除，不会删除本地文件。`}
                confirmText="删除"
                type="danger"
            />

            <VirtualizedGrid
                data={artists}
                itemKey={(_index, artist) => getMusicItemId(artist)}
                listClassName="grid content-grid-cover gap-4 pt-4 pb-20"
                listStyle={getSparseGridStyle(mainContentWidth, artists.length, 16, 'cover')}
                itemContent={(_index, artist) => {
                    const id = getMusicItemId(artist);
                    const isSelected = selectedIds.has(id);

                    return (
                        <div
                            className="group relative flex flex-col items-center gap-3 p-3 rounded-2xl hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                            onClick={(e) => handleItemClick(artist, e)}
                            onContextMenu={(e) => handleContextMenu(e, artist)}
                        >
                            <div className="relative w-full aspect-square max-w-[160px] shrink-0">
                                <div className="w-full h-full rounded-full shadow-lg bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative z-10 border border-black/5 dark:border-white/5">
                                    <CoverImage
                                        song={artist.songs[0]}
                                        src={artist.cover}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        iconClassName="text-6xl"
                                    />

                                    {isSelected && (
                                        <div className="absolute inset-0 bg-black/10 dark:bg-white/5 pointer-events-none" />
                                    )}
                                </div>

                                {(isSelectionMode || isSelected) && (
                                    <div className="absolute top-0 left-0 z-20 transition-opacity duration-300">
                                        <div
                                            onClick={(e) => { e.stopPropagation(); toggleSelection(id, 'artist', artist); }}
                                            className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/30 transition-colors shadow-sm"
                                        >
                                            {isSelected
                                                ? <MdCheckBox className="text-primary text-xl" />
                                                : <MdCheckBoxOutlineBlank className="text-white text-xl" />
                                            }
                                        </div>
                                    </div>
                                )}

                                {!isSelectionMode && (
                                    <div className="absolute inset-0 z-20 pointer-events-none">
                                        <div className="absolute bottom-1 left-1 z-30 opacity-0 group-hover:opacity-100 pointer-events-auto transition-opacity">
                                            <CustomTooltip text="播放艺人">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onPlayArtist(artist);
                                                    }}
                                                    aria-label="播放艺人"
                                                    className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg text-white hover:bg-white/30 hover:scale-105 transition-all"
                                                >
                                                    <MdPlayArrow className="translate-x-0.5 text-xl" />
                                                </button>
                                            </CustomTooltip>
                                        </div>

                                        <SmartMusicContextMenu
                                            className="absolute bottom-1 right-1 z-30 opacity-0 group-hover:opacity-100 pointer-events-auto transition-opacity"
                                            buttonClassName="w-10 h-10"
                                            items={artist}
                                            context="library"
                                            onPlay={() => onPlayArtist(artist)}
                                            onShuffle={onShuffleArtist ? () => onShuffleArtist(artist) : undefined}
                                            onDelete={onDeleteArtist ? () => handleDeleteClick(artist) : undefined}
                                            onOpen={() => setContextMenu(null)}
                                            isSelected={isSelected}
                                            onSelect={() => isSelectionMode
                                                ? toggleSelection(id, 'artist', artist)
                                                : toggleSelectionMode({ id, type: 'artist', data: artist })
                                            }
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="text-center w-full">
                                <CustomTooltip text={artist.name} className="block min-w-0">
                                    <h3 className="font-bold text-neutral-900 dark:text-neutral-50 truncate w-full">
                                        {artist.name}
                                    </h3>
                                </CustomTooltip>
                                <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate">
                                    {artist.count} 首歌曲
                                </p>
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
                    item={contextMenu.artist}
                    context="library"
                    onClose={() => setContextMenu(null)}
                    onPlay={() => onPlayArtist(contextMenu.artist)}
                    onShuffle={onShuffleArtist ? () => onShuffleArtist(contextMenu.artist) : undefined}
                    onDelete={onDeleteArtist ? () => handleDeleteClick(contextMenu.artist) : undefined}
                />
            )}
        </>
    );
}
