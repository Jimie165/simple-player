import { useLibraryStore } from '../store/useLibraryStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { audioService } from '../services/audioService';
import type { RecentItem, SongMetadata } from '../types';

export interface PlayOptions {
    restartIfCurrent?: boolean;
    addToRecent?: boolean;
    recentItem?: RecentItem;
    buildRecentItem?: (song: SongMetadata) => RecentItem;
}

interface PlaySongParams {
    song: SongMetadata;
    index: number;
    playlist?: SongMetadata[];
    options?: PlayOptions;
    context?: { type: string, name: string, id?: string };
}

interface PlayListParams {
    songs: SongMetadata[];
    startIndex?: number;
    shuffle?: boolean;
    options?: PlayOptions;
    context?: { type: string, name: string, id?: string };
}

interface ShufflePlayParams {
    songs: SongMetadata[];
    options?: PlayOptions;
    context?: { type: string, name: string, id?: string };
}

interface PlayQueueParams {
    song: SongMetadata;
    index: number;
    restartIfCurrent?: boolean;
}

const isSameSong = (a: SongMetadata | null, b: SongMetadata) => {
    if (!a) return false;
    return (
        (a.id !== undefined && b.id !== undefined && a.id === b.id) ||
        (a.path && b.path && a.path === b.path)
    );
};

export function usePlaybackActions() {
    const { setPlaylist, setCurrentSongIndex, toggleShuffleList, addToRecent, setQueueContext } = useLibraryStore();
    const { setMetadata, setIsPlaying, setShuffleState, setRepeatState, togglePlay, restartSong, toggleShuffle: togglePlayerShuffle } = usePlayerStore();

    const toggleShuffle = () => {
        const { isShuffling } = usePlayerStore.getState();
        const newShuffleState = !isShuffling;

        // 1. Update Player Store (UI Icon)
        togglePlayerShuffle();

        // 2. Update Library Store (Queue Order)
        toggleShuffleList(newShuffleState);
    };

    const playSong = async ({ song, index, playlist, options, context }: PlaySongParams) => {
        if (!song.path) return;

        const { metadata, isShuffling } = usePlayerStore.getState();
        const isCurrent = isSameSong(metadata, song);

        if (isCurrent && !options?.restartIfCurrent) {
            await togglePlay();
            return;
        }

        try {
            if (isCurrent && options?.restartIfCurrent) {
                await audioService.seek(0);
            }

            await audioService.play(song.path, song);
            setMetadata(song);
            setIsPlaying(true);

            if (playlist && playlist.length > 0) {
                setPlaylist(playlist);
                if (context) {
                    setQueueContext(context);
                }
                if (isShuffling) {
                    setCurrentSongIndex(index);
                    toggleShuffleList(true);
                } else {
                    setCurrentSongIndex(index);
                }
            }

            // If just playing a song without playlist change, maybe we don't update context?
            // Usually we do update playlist if context changes.

            if (options?.addToRecent !== false) {
                const recentItem = options?.recentItem ?? options?.buildRecentItem?.(song);
                if (recentItem) addToRecent(recentItem);
            }
        } catch (error) {
            console.error('Play failed', error);
            setIsPlaying(false);
        }
    };

    const playList = async ({ songs, startIndex = 0, shuffle = false, options, context }: PlayListParams) => {
        if (songs.length === 0) return;

        if (shuffle) {
            await shufflePlay({ songs, options, context });
            return;
        }

        const song = songs[startIndex];
        if (!song?.path) return;

        setShuffleState(false);

        await playSong({
            song,
            index: startIndex,
            playlist: songs,
            options,
            context
        });
    };

    const shufflePlay = async ({ songs, options, context }: ShufflePlayParams) => {
        if (songs.length === 0) return;

        const randomIndex = Math.floor(Math.random() * songs.length);
        const song = songs[randomIndex];
        if (!song?.path) return;

        const { repeatMode } = usePlayerStore.getState();
        if (repeatMode === 'one') {
            setRepeatState('off');
        }

        setPlaylist(songs);
        if (context) {
            setQueueContext(context);
        }
        setCurrentSongIndex(randomIndex);
        toggleShuffleList(true);
        setShuffleState(true);

        const recentItem = options?.recentItem ?? options?.buildRecentItem?.(song);

        await playSong({
            song,
            index: 0,
            options: {
                ...options,
                restartIfCurrent: true,
                recentItem
            },
            context
        });
    };

    const playQueueItem = async ({ song, index, restartIfCurrent = false }: PlayQueueParams) => {
        const { currentSongIndex } = useLibraryStore.getState();

        if (index === currentSongIndex && !restartIfCurrent) {
            await togglePlay();
            return;
        }

        restartSong();

        if (!song.path) return;

        try {
            if (index === currentSongIndex && restartIfCurrent) {
                await audioService.seek(0);
            }
            await audioService.play(song.path, song);
            setCurrentSongIndex(index);
            setMetadata(song);
            setIsPlaying(true);
        } catch (error) {
            console.error('Queue play failed', error);
        }
    };

    // --- New Actions for Controls ---
    const seek = async (time: number) => {
        await audioService.seek(time);
        window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { time } }));
    };

    const playNext = async () => {
        const { playlist, currentSongIndex, pushHistory } = useLibraryStore.getState();
        if (playlist.length === 0) return;

        pushHistory(currentSongIndex);
        const nextIdx = (currentSongIndex + 1) % playlist.length;

        const song = playlist[nextIdx];
        if (song?.path) {
            await playQueueItem({ song, index: nextIdx, restartIfCurrent: true });
        }
    };

    const playPrev = async (currentTime: number = 0) => {
        const { playlist, currentSongIndex, popHistory } = useLibraryStore.getState();
        if (playlist.length === 0) return;

        // Check if we should just restart current song (> 3s)
        if (currentTime > 3) {
            await seek(0); // Use the seek action to ensure UI sync
            return;
        }

        // Try history first
        const historyIndex = popHistory();
        if (historyIndex !== undefined && historyIndex >= 0 && historyIndex < playlist.length) {
            const song = playlist[historyIndex];
            if (song?.path) {
                await playQueueItem({ song, index: historyIndex, restartIfCurrent: true });
                return;
            }
        }

        // Fallback to previous index
        const prevIdx = (currentSongIndex - 1 + playlist.length) % playlist.length;
        const song = playlist[prevIdx];
        if (song?.path) {
            await playQueueItem({ song, index: prevIdx, restartIfCurrent: true });
        }
    };

    return {
        playSong,
        playList,
        shufflePlay,
        playQueueItem,
        playNext,
        playPrev,
        seek,
        toggleShuffle
    };
}
