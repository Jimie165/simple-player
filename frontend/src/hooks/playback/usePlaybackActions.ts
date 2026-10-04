import { useCallback } from 'react';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { audioService } from '@/services/audioService';
import { handleMissingSong } from '@/hooks/playback/handleMissingSong';
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

let playbackTransitionRunning = false;
let playbackTransitionId = 0;

async function runPlaybackTransition(task: (transitionId: number) => Promise<void>) {
    if (playbackTransitionRunning) return;

    playbackTransitionRunning = true;
    const transitionId = ++playbackTransitionId;

    try {
        await task(transitionId);
    } finally {
        if (transitionId === playbackTransitionId) {
            playbackTransitionRunning = false;
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
    const setPlaylist = useLibraryStore(state => state.setPlaylist);
    const setCurrentSongIndex = useLibraryStore(state => state.setCurrentSongIndex);
    const toggleShuffleList = useLibraryStore(state => state.toggleShuffleList);
    const addToRecent = useLibraryStore(state => state.addToRecent);
    const setQueueContext = useLibraryStore(state => state.setQueueContext);
    const setMetadata = usePlayerStore(state => state.setMetadata);
    const setShuffleState = usePlayerStore(state => state.setShuffleState);
    const setRepeatState = usePlayerStore(state => state.setRepeatState);
    const restartSong = usePlayerStore(state => state.restartSong);
    const togglePlayerShuffle = usePlayerStore(state => state.toggleShuffle);
    const setPlaybackTime = usePlayerStore(state => state.setPlaybackTime);
    const setPlaybackSnapshot = usePlayerStore(state => state.setPlaybackSnapshot);
    const setMediaKind = usePlayerStore(state => state.setMediaKind);
    const setSeeking = usePlayerStore(state => state.setSeeking);
    const resetPlaybackClock = usePlayerStore(state => state.resetPlaybackClock);
    const requestLyricsForPath = usePlayerStore(state => state.requestLyricsForPath);

    const togglePlayback = useCallback(async () => {
        const state = usePlayerStore.getState();
        const metadata = state.metadata;
        if (!metadata?.path || state.mediaKind === 'video') return;

        try {
            const snapshot = state.isPlaying
                ? await audioService.pause()
                : state.isAudioLoaded
                    ? await audioService.resume()
                    : await audioService.play(metadata.path, metadata);
            setMediaKind('audio');
            setPlaybackSnapshot(snapshot);
            if (!state.isAudioLoaded && metadata.path) {
                await requestLyricsForPath(metadata.path);
            }
        } catch (error) {
            if (handleMissingSong(error, metadata)) return;
            console.error('Toggle play failed', error);
            setPlaybackSnapshot({
                session_id: state.playbackSessionId,
                status: 'paused',
                path: metadata.path ?? null,
                position: state.currentTime,
                duration: metadata.duration,
                volume: state.volume / 100,
            });
        }
    }, [requestLyricsForPath, setMediaKind, setPlaybackSnapshot]);

    const pausePlayback = useCallback(async () => {
        const snapshot = await audioService.pause();
        setPlaybackSnapshot(snapshot);
    }, [setPlaybackSnapshot]);

    const resumePlayback = useCallback(async () => {
        const state = usePlayerStore.getState();
        if (!state.metadata?.path || state.mediaKind === 'video') return;

        try {
            const snapshot = state.isAudioLoaded
                ? await audioService.resume()
                : await audioService.play(state.metadata.path, state.metadata);
            setMediaKind('audio');
            setPlaybackSnapshot(snapshot);
            if (!state.isAudioLoaded) await requestLyricsForPath(state.metadata.path);
        } catch (error) {
            if (!handleMissingSong(error, state.metadata)) throw error;
        }
    }, [requestLyricsForPath, setMediaKind, setPlaybackSnapshot]);

    const restartCurrent = useCallback(async (song: SongMetadata) => {
        if (!song.path) return;
        try {
            const snapshot = await audioService.play(song.path, song);
            setMetadata(song);
            resetPlaybackClock(song.path);
            setMediaKind('audio');
            setPlaybackSnapshot(snapshot);
            requestLyricsForPath(song.path);
        } catch (error) {
            if (!handleMissingSong(error, song)) throw error;
        }
    }, [requestLyricsForPath, resetPlaybackClock, setMediaKind, setMetadata, setPlaybackSnapshot]);

    const applyQueueItemPlayback = useCallback(async (
        song: SongMetadata,
        index: number,
        transitionId: number,
        restartIfCurrent = false,
        autoPlay = true
    ) => {
        const { currentSongIndex } = useLibraryStore.getState();

        if (index === currentSongIndex && !restartIfCurrent) {
            await togglePlayback();
            return;
        }

        restartSong();

        if (!song.path) return;

        try {
            if (index === currentSongIndex && restartIfCurrent) {
                const actualTime = await audioService.seek(0);
                if (!isActiveTransition(transitionId)) return;
                setPlaybackTime(actualTime);
            }

            const snapshot = await audioService.play(song.path, song);
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
            setMediaKind('audio');
            setPlaybackSnapshot({ ...snapshot, status: autoPlay ? 'playing' : 'paused' });
            requestLyricsForPath(song.path);
        } catch (error) {
            if (handleMissingSong(error, song)) return;
            console.error('Queue play failed', error);
        }
    }, [
        requestLyricsForPath,
        resetPlaybackClock,
        restartSong,
        setCurrentSongIndex,
        setMediaKind,
        setMetadata,
        setPlaybackSnapshot,
        setPlaybackTime,
        togglePlayback,
    ]);

    const toggleShuffle = useCallback(() => {
        const { isShuffling } = usePlayerStore.getState();
        const newShuffleState = !isShuffling;

        // 1. Update Player Store (UI Icon)
        togglePlayerShuffle();

        // 2. Update Library Store (Queue Order)
        toggleShuffleList(newShuffleState);
    }, [togglePlayerShuffle, toggleShuffleList]);

    const playSongInternal = useCallback(async ({ song, index, playlist, options, context }: PlaySongParams, transitionId: number) => {
        if (!song.path) return;

        const { metadata, isShuffling } = usePlayerStore.getState();
        const isCurrent = isSameSong(metadata, song);

        if (isCurrent && !options?.restartIfCurrent) {
            await togglePlayback();
            return;
        }

        try {
            if (isCurrent && options?.restartIfCurrent) {
                const actualTime = await audioService.seek(0);
                if (!isActiveTransition(transitionId)) return;
                setPlaybackTime(actualTime);
            }

            const snapshot = await audioService.play(song.path, song);
            if (!isActiveTransition(transitionId)) return;

            resetPlaybackClock(song.path);
            setMetadata(song);
            setMediaKind('audio');
            setPlaybackSnapshot(snapshot);
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
            if (handleMissingSong(error, song)) return;
            console.error('Play failed', error);
            setPlaybackSnapshot({
                session_id: usePlayerStore.getState().playbackSessionId,
                status: 'paused',
                path: song.path,
                position: usePlayerStore.getState().currentTime,
                duration: song.duration,
                volume: usePlayerStore.getState().volume / 100,
            });
        }
    }, [
        addToRecent,
        requestLyricsForPath,
        resetPlaybackClock,
        setCurrentSongIndex,
        setMediaKind,
        setMetadata,
        setPlaybackSnapshot,
        setPlaybackTime,
        setPlaylist,
        setQueueContext,
        setShuffleState,
        togglePlayback,
        toggleShuffleList,
    ]);

    const playSong = useCallback(async (params: PlaySongParams) => {
        await runPlaybackTransition(async (transitionId) => {
            await playSongInternal(params, transitionId);
        });
    }, [playSongInternal]);

    const shufflePlay = useCallback(async ({ songs, options, context }: ShufflePlayParams) => {
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
    }, [
        playSong,
        setCurrentSongIndex,
        setPlaylist,
        setQueueContext,
        setRepeatState,
        setShuffleState,
        toggleShuffleList,
    ]);

    const playList = useCallback(async ({ songs, startIndex = 0, shuffle = false, options, context }: PlayListParams) => {
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
    }, [playSong, setShuffleState, shufflePlay]);

    const playQueueItem = useCallback(async ({ song, index, restartIfCurrent = false }: PlayQueueParams) => {
        await runPlaybackTransition(async (transitionId) => {
            await applyQueueItemPlayback(song, index, transitionId, restartIfCurrent);
        });
    }, [applyQueueItemPlayback]);

    // --- New Actions for Controls ---
    const seek = useCallback(async (time: number) => {
        const { isAudioLoaded, metadata } = usePlayerStore.getState();

        if (!isAudioLoaded && metadata?.path) {
            try {
                const snapshot = await audioService.load(metadata.path, metadata);
                setMediaKind('audio');
                setPlaybackSnapshot(snapshot);
                requestLyricsForPath(metadata.path);
            } catch (error) {
                if (handleMissingSong(error, metadata)) return usePlayerStore.getState().currentTime;
                throw error;
            }
        }

        setSeeking(true);
        try {
            const actualTime = await audioService.seek(time);
            setPlaybackTime(actualTime);
            return actualTime;
        } finally {
            setSeeking(false);
        }
    }, [requestLyricsForPath, setMediaKind, setPlaybackSnapshot, setPlaybackTime, setSeeking]);

    const setVolume = useCallback(async (volume: number) => {
        const clamped = Math.max(0, Math.min(100, volume));
        await audioService.setVolume(clamped / 100);
        usePlayerStore.getState().setVolume(clamped);
    }, []);

    const playNext = useCallback(async () => {
        await runPlaybackTransition(async (transitionId) => {
            const { playlist, currentSongIndex } = useLibraryStore.getState();
            if (playlist.length === 0) return;

            const nextIdx = (currentSongIndex + 1) % playlist.length;
            const song = playlist[nextIdx];
            if (song?.path) {
                await applyQueueItemPlayback(song, nextIdx, transitionId, true);
            }
        });
    }, [applyQueueItemPlayback]);

    const playPrev = useCallback(async (currentTime: number = 0) => {
        await runPlaybackTransition(async (transitionId) => {
            const { playlist, currentSongIndex } = useLibraryStore.getState();
            if (playlist.length === 0) return;

            // Check if we should just restart current song (> 3s)
            if (currentTime > 3) {
                await seek(0); // Use the seek action to ensure UI sync
                return;
            }

            // Previous follows the visible playback order. For example, manually
            // selecting item 5 and pressing Previous plays item 4, not the item
            // that happened to be playing before item 5 was selected.
            const prevIdx = (currentSongIndex - 1 + playlist.length) % playlist.length;
            const song = playlist[prevIdx];
            if (song?.path) {
                await applyQueueItemPlayback(song, prevIdx, transitionId, true);
            }
        });
    }, [applyQueueItemPlayback, seek]);

    const handlePlaybackEnded = useCallback(async () => {
        if (playbackTransitionRunning) return;

        await runPlaybackTransition(async (transitionId) => {
            const { playlist, currentSongIndex, getNextIndex } = useLibraryStore.getState();
            const { repeatMode } = usePlayerStore.getState();
            if (playlist.length === 0 || currentSongIndex < 0 || currentSongIndex >= playlist.length) return;

            if (repeatMode === 'one') {
                const song = playlist[currentSongIndex];
                if (song?.path) {
                    await applyQueueItemPlayback(song, currentSongIndex, transitionId, true);
                }
                return;
            }

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
    }, [applyQueueItemPlayback]);

    return {
        playSong,
        playList,
        shufflePlay,
        playQueueItem,
        playNext,
        playPrev,
        handlePlaybackEnded,
        seek,
        setVolume,
        pausePlayback,
        resumePlayback,
        restartCurrent,
        togglePlayback,
        toggleShuffle
    };
}
