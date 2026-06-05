import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { audioService } from '@/services/audioService';
import type { RecentItem, SongMetadata } from '@/types';

export interface PlayOptions {
    restartIfCurrent?: boolean;
    addToRecent?: boolean;
    disableShuffle?: boolean;
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

const TRANSITION_ENDED_GRACE_MS = 1200;
const ENDED_EVENT_DEDUPE_MS = 1200;

let playbackTransitionRunning = false;
let playbackTransitionId = 0;
let ignoreEndedUntil = 0;
let lastEndedHandledAt = 0;

const suppressEndedBriefly = () => {
    ignoreEndedUntil = Date.now() + TRANSITION_ENDED_GRACE_MS;
};

const canHandleEndedEvent = () => {
    const now = Date.now();
    if (playbackTransitionRunning || now < ignoreEndedUntil) return false;
    if (now - lastEndedHandledAt < ENDED_EVENT_DEDUPE_MS) return false;
    lastEndedHandledAt = now;
    return true;
};

async function runPlaybackTransition(task: (transitionId: number) => Promise<void>) {
    if (playbackTransitionRunning) return;

    playbackTransitionRunning = true;
    suppressEndedBriefly();
    const transitionId = ++playbackTransitionId;

    try {
        await task(transitionId);
    } finally {
        if (transitionId === playbackTransitionId) {
            playbackTransitionRunning = false;
            suppressEndedBriefly();
        }
    }
}

const isActiveTransition = (transitionId: number) => transitionId === playbackTransitionId;

const isSameSong = (a: SongMetadata | null, b: SongMetadata) => {
    if (!a) return false;
    return (
        (a.id !== undefined && b.id !== undefined && a.id === b.id) ||
        (a.path && b.path && a.path === b.path)
    );
};

export function usePlaybackActions() {
    const { setPlaylist, setCurrentSongIndex, toggleShuffleList, addToRecent, setQueueContext } = useLibraryStore();
    const {
        setMetadata,
        setIsPlaying,
        setShuffleState,
        setRepeatState,
        togglePlay,
        restartSong,
        toggleShuffle: togglePlayerShuffle,
        setAudioLoaded,
        setPlaybackTime,
        resetPlaybackClock,
        requestLyricsForPath,
    } = usePlayerStore();

    const applyQueueItemPlayback = async (
        song: SongMetadata,
        index: number,
        transitionId: number,
        restartIfCurrent = false,
        autoPlay = true
    ) => {
        const { currentSongIndex } = useLibraryStore.getState();

        if (index === currentSongIndex && !restartIfCurrent) {
            await togglePlay();
            return;
        }

        restartSong();

        if (!song.path) return;

        try {
            if (index === currentSongIndex && restartIfCurrent) {
                const actualTime = await audioService.seek(0);
                if (!isActiveTransition(transitionId)) return;
                setPlaybackTime(actualTime);
                window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { time: actualTime } }));
            }

            await audioService.play(song.path, song);
            if (!isActiveTransition(transitionId)) return;

            if (!autoPlay) {
                await audioService.pause();
                const actualTime = await audioService.seek(0).catch(() => 0);
                if (!isActiveTransition(transitionId)) return;
                setPlaybackTime(actualTime);
            }

            resetPlaybackClock(song.path);
            setCurrentSongIndex(index);
            setMetadata(song);
            setIsPlaying(autoPlay);
            setAudioLoaded(true);
            requestLyricsForPath(song.path);
            window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { time: 0 } }));
        } catch (error) {
            console.error('Queue play failed', error);
        }
    };

    const toggleShuffle = () => {
        const { isShuffling } = usePlayerStore.getState();
        const newShuffleState = !isShuffling;

        // 1. Update Player Store (UI Icon)
        togglePlayerShuffle();

        // 2. Update Library Store (Queue Order)
        toggleShuffleList(newShuffleState);
    };

    const playSongInternal = async ({ song, index, playlist, options, context }: PlaySongParams, transitionId: number) => {
        if (!song.path) return;

        const { metadata, isShuffling } = usePlayerStore.getState();
        const isCurrent = isSameSong(metadata, song);

        if (isCurrent && !options?.restartIfCurrent) {
            await togglePlay();
            return;
        }

        try {
            if (isCurrent && options?.restartIfCurrent) {
                const actualTime = await audioService.seek(0);
                if (!isActiveTransition(transitionId)) return;
                setPlaybackTime(actualTime);
                window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { time: actualTime } }));
            }

            await audioService.play(song.path, song);
            if (!isActiveTransition(transitionId)) return;

            resetPlaybackClock(song.path);
            setMetadata(song);
            setIsPlaying(true);
            setAudioLoaded(true);
            requestLyricsForPath(song.path);

            if (playlist && playlist.length > 0) {
                if (options?.disableShuffle) {
                    setShuffleState(false);
                    setPlaylist(playlist);
                    if (context) {
                        setQueueContext(context);
                    }
                    setCurrentSongIndex(index);
                    toggleShuffleList(false);
                } else {
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

    const playSong = async (params: PlaySongParams) => {
        await runPlaybackTransition(async (transitionId) => {
            await playSongInternal(params, transitionId);
        });
    };

    const playList = async ({ songs, startIndex = 0, shuffle = false, options, context }: PlayListParams) => {
        if (songs.length === 0) return;
        if (playbackTransitionRunning) return;

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
            options: {
                ...options,
                disableShuffle: !shuffle
            },
            context
        });
    };

    const shufflePlay = async ({ songs, options, context }: ShufflePlayParams) => {
        if (songs.length === 0) return;
        if (playbackTransitionRunning) return;

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
        await runPlaybackTransition(async (transitionId) => {
            await applyQueueItemPlayback(song, index, transitionId, restartIfCurrent);
        });
    };

    // --- New Actions for Controls ---
    const seek = async (time: number) => {
        const { isAudioLoaded, metadata } = usePlayerStore.getState();

        if (!isAudioLoaded && metadata?.path) {
            await audioService.load(metadata.path, metadata);
            setAudioLoaded(true);
            requestLyricsForPath(metadata.path);
        }

        const actualTime = await audioService.seek(time);
        setPlaybackTime(actualTime);
        window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { time: actualTime } }));
        return actualTime;
    };

    const playNext = async () => {
        await runPlaybackTransition(async (transitionId) => {
            const { playlist, currentSongIndex, pushHistory } = useLibraryStore.getState();
            if (playlist.length === 0) return;

            pushHistory(currentSongIndex);
            const nextIdx = (currentSongIndex + 1) % playlist.length;
            const song = playlist[nextIdx];
            if (song?.path) {
                await applyQueueItemPlayback(song, nextIdx, transitionId, true);
            }
        });
    };

    const playPrev = async (currentTime: number = 0) => {
        await runPlaybackTransition(async (transitionId) => {
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
                    await applyQueueItemPlayback(song, historyIndex, transitionId, true);
                    return;
                }
            }

            // Fallback to previous index
            const prevIdx = (currentSongIndex - 1 + playlist.length) % playlist.length;
            const song = playlist[prevIdx];
            if (song?.path) {
                await applyQueueItemPlayback(song, prevIdx, transitionId, true);
            }
        });
    };

    const handlePlaybackEnded = async () => {
        if (!canHandleEndedEvent()) return;

        await runPlaybackTransition(async (transitionId) => {
            const { playlist, currentSongIndex, pushHistory, getNextIndex } = useLibraryStore.getState();
            const { repeatMode } = usePlayerStore.getState();
            if (playlist.length === 0 || currentSongIndex < 0 || currentSongIndex >= playlist.length) return;

            if (repeatMode === 'one') {
                const song = playlist[currentSongIndex];
                if (song?.path) {
                    await applyQueueItemPlayback(song, currentSongIndex, transitionId, true);
                }
                return;
            }

            pushHistory(currentSongIndex);
            const nextIdx = getNextIndex(repeatMode);
            if (nextIdx === -1) {
                const song = playlist[currentSongIndex];
                if (song?.path) {
                    await applyQueueItemPlayback(song, currentSongIndex, transitionId, true, false);
                }
                return;
            }

            const song = playlist[nextIdx];
            if (song?.path) {
                await applyQueueItemPlayback(song, nextIdx, transitionId, true);
            }
        });
    };

    return {
        playSong,
        playList,
        shufflePlay,
        playQueueItem,
        playNext,
        playPrev,
        handlePlaybackEnded,
        seek,
        toggleShuffle
    };
}
