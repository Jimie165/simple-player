import { useState } from 'react';
import { IoPlay, IoPerson, IoEllipsisHorizontal, IoTrash, IoCheckboxOutline } from 'react-icons/io5';
import { MdPlaylistPlay } from 'react-icons/md';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { useLibraryStore } from '../../../store/useLibraryStore';
import type { SongMetadata } from '../../../types';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

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
    onOpenArtist: (artist: ArtistData) => void;
    onDeleteArtist?: (artist: ArtistData) => void;
}

export default function ArtistGridView({ artists, onPlayArtist, onOpenArtist, onDeleteArtist }: ArtistGridViewProps) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [artistToDelete, setArtistToDelete] = useState<ArtistData | null>(null);

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

            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pt-2">
                {artists.map((artist) => (
                    <div
                        key={artist.name}
                        className="group relative flex flex-col items-center gap-4 p-4 rounded-xl bg-neutral-50 hover:bg-neutral-100 dark:bg-white/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                        onClick={() => onOpenArtist(artist)}
                    >
                        {/* Wrapper for Image + Overlays */}
                        <div className="relative w-32 h-32 md:w-40 md:h-40 shrink-0">
                            {/* The Circle Image (Clipped) */}
                            <div className="w-full h-full rounded-full shadow-lg bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative z-10">
                                {artist.cover ? (
                                    <img src={artist.cover} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={artist.name} />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-neutral-400">
                                        <IoPerson className="text-6xl" />
                                    </div>
                                )}
                            </div>

                            {/* Checkbox (Top Left) - Outside clipped area */}
                            <div className="absolute top-0 left-0 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <button
                                    onClick={(e) => { e.stopPropagation(); /* Default Select */ }}
                                    className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors shadow-sm"
                                >
                                    <IoCheckboxOutline className="text-lg" />
                                </button>
                            </div>

                            {/* Play & Menu Buttons - Bottom Edges (Outside Clipped Area) */}
                            <div className="absolute inset-0 z-20 pointer-events-none">
                                {/* Play Button - Bottom Left */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onPlayArtist(artist);
                                    }}
                                    className="absolute -bottom-2 -left-2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-lg text-white hover:bg-white/20 hover:scale-105 transition-all z-30 opacity-0 group-hover:opacity-100 pointer-events-auto"
                                    title="播放艺人"
                                >
                                    <IoPlay className="ml-1 text-xl" />
                                </button>

                                {/* Menu Button - Bottom Right */}
                                <div className="absolute -bottom-2 -right-2 z-30 opacity-0 group-hover:opacity-100 pointer-events-auto">
                                    <Menu as="div" className="relative">
                                        <MenuButton
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-center text-white hover:bg-white/20 transition-all"
                                        >
                                            <IoEllipsisHorizontal className="text-lg" />
                                        </MenuButton>
                                        <MenuItems
                                            transition
                                            anchor="bottom end"
                                            className="w-48 origin-top-right rounded-xl border border-neutral-200 bg-white p-1 text-sm text-neutral-900 shadow-xl ring-1 ring-black/5 focus:outline-none dark:bg-[#2c2c2c] dark:border-neutral-700 dark:text-white transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 z-50"
                                        >
                                            <MenuItem>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onPlayArtist(artist);
                                                    }}
                                                    className="group flex w-full items-center gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                                                >
                                                    <IoPlay className="text-lg opacity-70" />
                                                    播放
                                                </button>
                                            </MenuItem>

                                            <MenuItem>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        artist.songs.forEach(song => {
                                                            useLibraryStore.getState().addToNext(song);
                                                        });
                                                    }}
                                                    className="group flex w-full items-center gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                                                >
                                                    <MdPlaylistPlay className="text-lg opacity-70" />
                                                    下一首播放
                                                </button>
                                            </MenuItem>

                                            <div className="my-1 h-px bg-neutral-200 dark:bg-white/10" />

                                            {/* Show Artist (Might be redundant in Artist View, but good for consistency or context) */}
                                            {/* <MenuItem>
                                                <button
                                                    className="group flex w-full items-center gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onOpenArtist(artist);
                                                    }}
                                                >
                                                    <IoPerson className="text-lg opacity-70" />
                                                    显示艺人
                                                </button>
                                            </MenuItem> */}

                                            <div className="my-1 h-px bg-neutral-200 dark:bg-white/10" />

                                            {onDeleteArtist && (
                                                <MenuItem>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteClick(artist);
                                                        }}
                                                        className="group flex w-full items-center gap-2 rounded-lg py-1.5 px-3 text-red-600 dark:text-red-400 data-[focus]:bg-red-50 dark:data-[focus]:bg-red-900/20"
                                                    >
                                                        <IoTrash className="text-lg opacity-70" />
                                                        从音乐库删除
                                                    </button>
                                                </MenuItem>
                                            )}

                                            <div className="my-1 h-px bg-neutral-200 dark:bg-white/10" />

                                            <MenuItem>
                                                <button
                                                    className="group flex w-full items-center gap-2 rounded-lg py-1.5 px-3 data-[focus]:bg-neutral-100 dark:data-[focus]:bg-white/10"
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
                        </div>

                        <div className="text-center w-full">
                            <h3 className="font-bold text-neutral-900 dark:text-neutral-50 truncate w-full" title={artist.name}>
                                {artist.name}
                            </h3>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400 truncate">
                                {artist.count} 首歌曲
                            </p>
                        </div>
                    </div>
                ))}
            </div >
        </>
    );
}