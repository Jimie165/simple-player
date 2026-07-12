import type { SongMetadata } from '@/types';

export interface QueueStateSlice {
    playlist: SongMetadata[];
    originalPlaylist: SongMetadata[];
    currentSongIndex: number;
}

export function toggleShuffleListFn(state: QueueStateSlice, enable: boolean): Partial<QueueStateSlice> | null {
    const { originalPlaylist, playlist, currentSongIndex } = state;
    const currentSong = playlist[currentSongIndex];

    if (enable) {
        if (!originalPlaylist || originalPlaylist.length === 0) return null;

        const shuffled = [...originalPlaylist];
        for (let index = shuffled.length - 1; index > 0; index--) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
        }

        if (currentSong) {
            const currentIdx = shuffled.findIndex(song => song.path === currentSong.path);
            if (currentIdx > 0) {
                shuffled.splice(currentIdx, 1);
                shuffled.unshift(currentSong);
            }
        }

        return { playlist: shuffled, currentSongIndex: 0 };
    }

    if (originalPlaylist.length === 0) return null;
    let newIndex = 0;
    if (currentSong) {
        newIndex = originalPlaylist.findIndex(song => song.path === currentSong.path);
        if (newIndex === -1) newIndex = 0;
    }

    return { playlist: originalPlaylist, currentSongIndex: newIndex };
}

export function getNextIndexFn(state: Pick<QueueStateSlice, 'playlist' | 'currentSongIndex'>, repeatMode: 'off' | 'all' | 'one'): number {
    const { playlist, currentSongIndex } = state;
    const length = playlist.length;
    if (length === 0) return -1;

    if (repeatMode === 'one') return currentSongIndex;

    const nextIndex = currentSongIndex + 1;
    if (nextIndex >= length) {
        return repeatMode === 'all' ? 0 : -1;
    }

    return nextIndex;
}

export function removeSongFromPlaylistFn(state: QueueStateSlice, path: string): Partial<QueueStateSlice> | null {
    const { playlist, currentSongIndex, originalPlaylist } = state;

    const newPlaylist = playlist.filter(song => song.path !== path);
    const newOriginalPlaylist = originalPlaylist.filter(song => song.path !== path);

    if (newPlaylist.length === playlist.length) return null;

    let newIndex = currentSongIndex;
    const removingCurrent = playlist[currentSongIndex]?.path === path;

    if (removingCurrent) {
        if (newPlaylist.length === 0) {
            newIndex = -1;
        } else if (newIndex >= newPlaylist.length) {
            newIndex = newPlaylist.length - 1;
        }
    } else {
        const removedIndex = playlist.findIndex(song => song.path === path);
        if (removedIndex !== -1 && removedIndex < currentSongIndex) {
            newIndex = currentSongIndex - 1;
        }
    }

    return {
        playlist: newPlaylist,
        originalPlaylist: newOriginalPlaylist,
        currentSongIndex: newIndex
    };
}

export function removeSongFromPlaylistByIndexFn(state: QueueStateSlice, index: number): Partial<QueueStateSlice> | null {
    const { playlist, currentSongIndex, originalPlaylist } = state;
    if (index < 0 || index >= playlist.length) return null;

    const removedSong = playlist[index];
    const newPlaylist = [...playlist];
    newPlaylist.splice(index, 1);

    const newOriginalPlaylist = [...originalPlaylist];
    const originalIndex = newOriginalPlaylist.findIndex(song => song.path === removedSong.path);
    if (originalIndex !== -1) {
        newOriginalPlaylist.splice(originalIndex, 1);
    }

    let newIndex = currentSongIndex;
    if (index === currentSongIndex) {
        if (newPlaylist.length === 0) {
            newIndex = -1;
        } else if (newIndex >= newPlaylist.length) {
            newIndex = newPlaylist.length - 1;
        }
    } else if (index < currentSongIndex) {
        newIndex = currentSongIndex - 1;
    }

    return {
        playlist: newPlaylist,
        originalPlaylist: newOriginalPlaylist,
        currentSongIndex: newIndex
    };
}

export function reorderPlaylistFn(state: QueueStateSlice, fromIndex: number, toIndex: number): Partial<QueueStateSlice> | null {
    const { playlist, currentSongIndex } = state;
    if (fromIndex < 0 || fromIndex >= playlist.length || toIndex < 0 || toIndex >= playlist.length) {
        return null;
    }

    const newPlaylist = [...playlist];
    const [movedSong] = newPlaylist.splice(fromIndex, 1);
    newPlaylist.splice(toIndex, 0, movedSong);

    let newCurrent = currentSongIndex;
    if (currentSongIndex === fromIndex) {
        newCurrent = toIndex;
    } else if (fromIndex < currentSongIndex && toIndex >= currentSongIndex) {
        newCurrent--;
    } else if (fromIndex > currentSongIndex && toIndex <= currentSongIndex) {
        newCurrent++;
    }

    return { playlist: newPlaylist, currentSongIndex: newCurrent };
}

export function addMultipleToNextFn(state: QueueStateSlice, songs: SongMetadata[], asQueueItem = false): Partial<QueueStateSlice> {
    const { playlist, originalPlaylist, currentSongIndex } = state;
    const songsToAdd = songs.map(song => asQueueItem ? { ...song, is_queue_item: true } : song);

    if (playlist.length === 0) {
        return {
            playlist: songsToAdd,
            originalPlaylist: songsToAdd,
            currentSongIndex: 0
        };
    }

    let insertIndex = currentSongIndex + 1;
    if (asQueueItem) {
        let lastQueueIndex = currentSongIndex;
        while (lastQueueIndex + 1 < playlist.length && playlist[lastQueueIndex + 1].is_queue_item) {
            lastQueueIndex++;
        }
        insertIndex = lastQueueIndex + 1;
    }

    const newPlaylist = [...playlist];
    newPlaylist.splice(insertIndex, 0, ...songsToAdd);

    const newOriginal = [...originalPlaylist];
    let originalInsertIndex = -1;
    const currentSong = playlist[currentSongIndex];
    if (currentSong) {
        originalInsertIndex = originalPlaylist.findIndex(song => song.path === currentSong.path) + 1;
    }
    if (originalInsertIndex === -1) originalInsertIndex = originalPlaylist.length;

    newOriginal.splice(originalInsertIndex, 0, ...songsToAdd);

    return {
        playlist: newPlaylist,
        originalPlaylist: newOriginal
    };
}

export function clearUserQueueFn(state: QueueStateSlice): Partial<QueueStateSlice> {
    const { playlist, originalPlaylist, currentSongIndex } = state;
    const currentSong = playlist[currentSongIndex];

    if (currentSong) {
        const finalPlaylist = playlist.filter((song, index) => index === currentSongIndex || !song.is_queue_item);
        const finalOriginal = originalPlaylist.filter(song => (song.path === currentSong.path && song.id === currentSong.id) || !song.is_queue_item);

        const newIndex = finalPlaylist.findIndex(song => song === currentSong);
        return {
            playlist: finalPlaylist,
            originalPlaylist: finalOriginal,
            currentSongIndex: newIndex !== -1 ? newIndex : 0
        };
    }

    return {
        playlist: playlist.filter(song => !song.is_queue_item),
        originalPlaylist: originalPlaylist.filter(song => !song.is_queue_item),
        currentSongIndex: 0
    };
}

export function removeQueueItemFn(state: QueueStateSlice, index: number): Partial<QueueStateSlice> | null {
    const { playlist, originalPlaylist, currentSongIndex } = state;
    if (index < 0 || index >= playlist.length) return null;
    if (index === currentSongIndex) return null;

    const itemToRemove = playlist[index];
    const finalPlaylist = [...playlist];
    finalPlaylist.splice(index, 1);

    const originalIndex = originalPlaylist.findIndex(song => {
        return song === itemToRemove || (song.id === itemToRemove.id && song.path === itemToRemove.path && song.is_queue_item === itemToRemove.is_queue_item);
    });

    let finalOriginal = originalPlaylist;
    if (originalIndex !== -1) {
        finalOriginal = [...originalPlaylist];
        finalOriginal.splice(originalIndex, 1);
    }

    let newCurrentIndex = currentSongIndex;
    if (index < currentSongIndex) {
        newCurrentIndex--;
    }

    return {
        playlist: finalPlaylist,
        originalPlaylist: finalOriginal,
        currentSongIndex: newCurrentIndex
    };
}
