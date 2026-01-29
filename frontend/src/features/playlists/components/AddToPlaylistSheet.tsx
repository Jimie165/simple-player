import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition, TransitionChild, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { MdPlaylistAdd } from 'react-icons/md';
import { MdAdd } from 'react-icons/md';

import { useLibraryStore } from '../../../store/useLibraryStore';
import { useAddToPlaylistStore } from '../../../store/useAddToPlaylistStore';
import { useSelectionStore } from '../../../store/useSelectionStore';
import { libraryService } from '../../../services/libraryService';
import type { Playlist, SongMetadata } from '../../../types';
import PlaylistCoverCollage from '../../../components/common/PlaylistCoverCollage';
import DuplicateSongConfirmDialog from './DuplicateSongConfirmDialog';

export default function AddToPlaylistSheet() {
    const { isOpen, close, songsToAdd } = useAddToPlaylistStore();
    const { clearSelection } = useSelectionStore();
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [playlistSongs, setPlaylistSongs] = useState<Record<number, SongMetadata[]>>({});
    const [loading, setLoading] = useState(false);

    // Duplicate handling state
    const [duplicateDialogState, setDuplicateDialogState] = useState<{
        isOpen: boolean;
        playlistId: number | null;
        duplicates: SongMetadata[];
        newSongs: SongMetadata[];
    }>({
        isOpen: false,
        playlistId: null,
        duplicates: [],
        newSongs: []
    });

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
            let resolvedSongs = songsToAdd;

            // Ensure songs have IDs (required by backend) by resolving from library using path
            if (songsToAdd.some(s => !s.id && s.path)) {
                const librarySongs = await libraryService.getLibrarySongs();
                const normalizePath = (p: string) => p.replace(/\\/g, '/');
                const byPath = new Map(
                    librarySongs
                        .filter(s => s.path)
                        .map(s => [normalizePath(s.path as string), s])
                );

                resolvedSongs = songsToAdd.map(song => {
                    if (song.id || !song.path) return song;
                    const match = byPath.get(normalizePath(song.path));
                    return match?.id ? { ...song, id: match.id } : song;
                });
            }

            // Check for duplicates
            // We need to know what's already in the playlist.
            // We might have it in `playlistSongs` state (if loaded for cover), but to be safe/fresh, let's fetch or check cache.
            // Since we load `playlistSongs` for UI covers, we might rely on it, but it might be incomplete if we don't load ALL songs for collage? 
            // `getPlaylistSongs` in `useEffect` fetches all songs currently? Yes, `libraryService.getPlaylistSongs(pl.id)` returns `Vec<SongMetadata>`.
            // So we can use `playlistSongs[playlistId]`.

            let existingSongs = playlistSongs[playlistId];
            if (!existingSongs) {
                // If not in cache (fresh load?), fetch it.
                existingSongs = await libraryService.getPlaylistSongs(playlistId);
                // Update cache while we are at it
                setPlaylistSongs(prev => ({ ...prev, [playlistId]: existingSongs }));
            }

            const existingIds = new Set(existingSongs.map(s => s.id));
            const duplicates: SongMetadata[] = [];
            const newSongs: SongMetadata[] = [];

            for (const song of resolvedSongs) {
                if (!song.id) continue;
                if (existingIds.has(song.id)) {
                    duplicates.push(song);
                } else {
                    newSongs.push(song);
                }
            }

            if (duplicates.length > 0) {
                // Show dialog
                setDuplicateDialogState({
                    isOpen: true,
                    playlistId,
                    duplicates,
                    newSongs
                });
            } else {
                // No duplicates, just add all
                const allIds = resolvedSongs.map(s => s.id).filter((id): id is number => id !== undefined);
                if (allIds.length > 0) {
                    await libraryService.batchAddToPlaylist(playlistId, allIds);
                    finishAdd();
                } else {
                    alert("无法添加：未找到歌曲的库ID，请先导入到音乐库");
                }
            }

        } catch (error) {
            console.error("Failed to check/add songs", error);
            alert("操作失败");
        }
    };

    const confirmAddDuplicates = async (includeDuplicates: boolean) => {
        const { playlistId, duplicates, newSongs } = duplicateDialogState;
        if (playlistId === null) return;

        try {
            let idsToAdd: number[] = [];

            if (includeDuplicates) {
                // Add ALL (new + duplicates)
                // Note: We reconstruct the list from original selection or combine.
                // Using `songsToAdd` logic: duplicates + newSongs should cover it, but order might change?
                // Does user care about order here? Usually "Add to playlist" appends.
                // Let's combine duplicates + newSongs.
                const all = [...duplicates, ...newSongs];
                idsToAdd = all.map(s => s.id).filter((id): id is number => id !== undefined);
            } else {
                // Add ONLY new
                idsToAdd = newSongs.map(s => s.id).filter((id): id is number => id !== undefined);
            }

            if (idsToAdd.length > 0) {
                await libraryService.batchAddToPlaylist(playlistId, idsToAdd);
            }

            finishAdd();
        } catch (error) {
            console.error("Failed to add songs after confirm", error);
            alert("添加失败");
        } finally {
            closeDuplicateDialog();
        }
    };

    const finishAdd = () => {
        clearSelection();
        close();
        useLibraryStore.getState().triggerLibraryUpdate();
        // TODO: Toast Success
    };

    const closeDuplicateDialog = () => {
        setDuplicateDialogState(prev => ({ ...prev, isOpen: false }));
    };

    return (
        <Fragment>
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
            <DuplicateSongConfirmDialog
                isOpen={duplicateDialogState.isOpen}
                onClose={closeDuplicateDialog}
                onAdd={() => confirmAddDuplicates(true)}
                onSkip={() => confirmAddDuplicates(false)}
                duplicateCount={duplicateDialogState.duplicates.length}
            />
        </Fragment>
    );
}
