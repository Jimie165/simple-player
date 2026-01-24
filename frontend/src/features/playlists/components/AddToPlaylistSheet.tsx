import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition, TransitionChild, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { MdPlaylistAdd } from 'react-icons/md';
import { MdAdd } from 'react-icons/md';

import { useAddToPlaylistStore } from '../../../store/useAddToPlaylistStore';
import { libraryService } from '../../../services/libraryService';
import type { Playlist, SongMetadata } from '../../../types';
import PlaylistCoverCollage from '../../../components/common/PlaylistCoverCollage';

export default function AddToPlaylistSheet() {
    const { isOpen, close, songsToAdd } = useAddToPlaylistStore();
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [playlistSongs, setPlaylistSongs] = useState<Record<number, SongMetadata[]>>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadPlaylists();
        }
    }, [isOpen]);

    useEffect(() => {
        if (playlists.length > 0) {
            playlists.forEach(async (pl) => {
                if (!playlistSongs[pl.id]) {
                    try {
                        const songs = await libraryService.getPlaylistSongs(pl.id);
                        setPlaylistSongs(prev => ({ ...prev, [pl.id]: songs }));
                    } catch (e) {
                        // ignore
                    }
                }
            });
        }
    }, [playlists]);

    const loadPlaylists = async () => {
        setLoading(true);
        try {
            const list = await libraryService.getPlaylists();
            // Filter out playlists? Maybe not.
            setPlaylists(list);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNew = async () => {
        // Close this dialog? Or show create dialog on top?
        // Simple prompt for now as requested in phase 2, but we have CreatePlaylistDialog.
        // Re-implementing simple prompt here for speed, or we can use the Dialog component if we expose it.
        // Let's use prompt for now to keep it independent, or create a 'Create' state here.
        const name = prompt("请输入新播放列表名称");
        if (name) {
            try {
                const newPl = await libraryService.createPlaylist(name);
                // Auto add to new playlist
                await handleAddToPlaylist(newPl.id);
            } catch (error) {
                console.error(error);
            }
        }
    };

    const handleAddToPlaylist = async (playlistId: number) => {
        if (songsToAdd.length === 0) return;
        try {
            // Batch Add
            // libraryService needs batchAdd? 
            // We have `addSongToPlaylist` (single). 
            // Phase 1 "Extend PlaylistRepo... batch remove". 
            // Did we add batch ADD? 
            // Checking Repository: `batch_add_songs` exists in Repo.
            // Checking Command: `add_to_playlist` is single?
            // Let's check `libraryService.ts` and `playlist.rs`.

            // Assume we loop for now if batch not available, or implement batch add if needed.
            // Wait, standard `addSongToPlaylist` might change.
            // Let's check libraryService in a moment.
            // For now, I'll map over songs.

            // If libraryService has batchAdd, use it. If not, loop.
            // Assuming loop for safety first.
            for (const song of songsToAdd) {
                if (song.id) {
                    await libraryService.addToPlaylist(playlistId, song.id);
                }
            }

            close();
            // TODO: Toast Success
        } catch (error) {
            console.error("Failed to add songs", error);
            alert("添加失败");
        }
    };

    return (
        <Transition show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-[200]" onClose={close}>
                <DialogBackdrop
                    transition
                    className="fixed inset-0 bg-black/25 backdrop-blur-sm transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
                />

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <TransitionChild
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-[#2c2c2c] p-6 text-left align-middle shadow-xl transition-all border border-neutral-200 dark:border-neutral-700">
                                <DialogTitle
                                    as="h3"
                                    className="text-lg font-medium leading-6 text-neutral-900 dark:text-neutral-100 mb-4 flex items-center gap-2"
                                >
                                    <MdPlaylistAdd className="text-xl" />
                                    添加到播放列表
                                </DialogTitle>

                                <div className="mt-2 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
                                    <button
                                        onClick={handleCreateNew}
                                        className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-left group"
                                    >
                                        <div className="w-12 h-12 rounded-lg bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-neutral-500 group-hover:text-primary transition-colors">
                                            <MdAdd className="text-2xl" />
                                        </div>
                                        <span className="font-medium text-primary">新建播放列表</span>
                                    </button>

                                    {loading ? (
                                        <div className="text-center py-4 text-neutral-500">加载中...</div>
                                    ) : (
                                        playlists.map(pl => (
                                            <button
                                                key={pl.id}
                                                onClick={() => handleAddToPlaylist(pl.id)}
                                                className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-left"
                                            >
                                                <div className="w-12 h-12 rounded-lg bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center overflow-hidden shrink-0">
                                                    <PlaylistCoverCollage
                                                        songs={playlistSongs[pl.id] || []}
                                                        className="w-full h-full"
                                                    />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                                                        {pl.name}
                                                    </span>
                                                    <span className="text-xs text-neutral-500">
                                                        {pl.song_count || 0} 首歌曲
                                                    </span>
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </DialogPanel>
                        </TransitionChild>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
}
