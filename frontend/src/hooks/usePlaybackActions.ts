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
}

interface PlayListParams {
    songs: SongMetadata[];
    startIndex?: number;
    shuffle?: boolean;
    options?: PlayOptions;
}

interface ShufflePlayParams {
    songs: SongMetadata[];
    options?: PlayOptions;
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
    const { setPlaylist, setCurrentSongIndex, toggleShuffleList, addToRecent } = useLibraryStore();
    const { setMetadata, setIsPlaying, setShuffleState, setRepeatState, togglePlay, restartSong } = usePlayerStore();

    const playSong = async ({ song, index, playlist, options }: PlaySongParams) => {
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
                if (isShuffling) {
                    setCurrentSongIndex(index);
                    toggleShuffleList(true);
                } else {
                    setCurrentSongIndex(index);
                }
            }

            if (options?.addToRecent !== false) {
                const recentItem = options?.recentItem ?? options?.buildRecentItem?.(song);
                if (recentItem) addToRecent(recentItem);
            }
        } catch (error) {
            console.error('Play failed', error);
            setIsPlaying(false);
        }
    };

    const playList = async ({ songs, startIndex = 0, shuffle = false, options }: PlayListParams) => {
        if (songs.length === 0) return;

        if (shuffle) {
            await shufflePlay({ songs, options });
            return;
        }

        const song = songs[startIndex];
        if (!song?.path) return;

        setShuffleState(false);

        await playSong({
            song,
            index: startIndex,
            playlist: songs,
            options
        });
    };

    const shufflePlay = async ({ songs, options }: ShufflePlayParams) => {
        if (songs.length === 0) return;

        const randomIndex = Math.floor(Math.random() * songs.length);
        const song = songs[randomIndex];
        if (!song?.path) return;

        const { repeatMode } = usePlayerStore.getState();
        if (repeatMode === 'one') {
            setRepeatState('off');
        }

        setPlaylist(songs);
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
            }
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

    return {
        playSong,
        playList,
        shufflePlay,
        playQueueItem
    };
}
