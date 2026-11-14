import { useCallback } from 'react';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { getManualNextIndexFn, getPreviousIndexFn, withoutQueueMetadata } from '@/store/actions/queueActions';
import { audioService } from '@/services/audioService';
import type { RecentItem, SongMetadata } from '@/types';
import toast from 'react-hot-toast';
import { handleMissingSong } from '@/hooks/playback/handleMissingSong';

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
let audioLoadRequestId = 0;

async function runPlaybackTransition(task: (transitionId: number) => Promise<void>, replacePending = false) {
    if (!replacePending && (playbackTransitionRunning || usePlayerStore.getState().audioLoadingCount > 0)) return;

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

function reportPlaybackFailure(error: unknown, song: SongMetadata) {
    if (error instanceof Error && error.message === '音频加载请求已被替代') return;
    if (usePlayerStore.getState().metadata?.path !== song.path) return;
    usePlayerStore.setState({ isPlaying: false, isAudioLoaded: false });
    const reason = error === 'AUDIO_FILE_NOT_FOUND'
        ? '找不到歌曲文件，请检查文件位置'
        : '歌曲加载失败';
    if (handleMissingSong(error, song)) return;
    toast.error(`${reason}，请点击播放重试`, { id: 'audio-playback-failure' });
}

export function usePlaybackActions() {
    const setPlaylist = useLibraryStore(state => state.setPlaylist);
    const setCurrentSongIndex = useLibraryStore(state => state.setCurrentSongIndex);
    const toggleShuffleList = useLibraryStore(state => state.toggleShuffleList);
    const addToRecent = useLibraryStore(state => state.addToRecent);
    const setShuffleState = usePlayerStore(state => state.setShuffleState);
    const setRepeatState = usePlayerStore(state => state.setRepeatState);
    const togglePlayerShuffle = usePlayerStore(state => state.toggleShuffle);
    const setPlaybackTime = usePlayerStore(state => state.setPlaybackTime);
    const setPlaybackSnapshot = usePlayerStore(state => state.setPlaybackSnapshot);
    const setMediaKind = usePlayerStore(state => state.setMediaKind);
    const requestLyricsForPath = usePlayerStore(state => state.requestLyricsForPath);

    const loadAudio = useCallback(async (path: string, song: SongMetadata, autoPlay = true, startPosition = 0) => {
        const requestId = ++audioLoadRequestId;
        const previous = usePlayerStore.getState();
        usePlayerStore.setState({
            audioLoadingCount: 1,
            metadata: song,
            playbackPath: path,
            currentTime: startPosition,
            audioRetryPosition: startPosition > 0 ? startPosition : null,
            pendingAudioSeek: startPosition > 0 ? startPosition : null,
            audioSeekInFlight: false,
            isPlaying: autoPlay,
            isAudioLoaded: false,
            isSeeking: false,
            mediaKind: 'audio',
        });
        void requestLyricsForPath(path).catch(console.error);
        try {
            if (previous.mediaKind === 'audio' && previous.isPlaying) await audioService.pause();
            if (requestId !== audioLoadRequestId) throw new Error('音频加载请求已被替代');
            let snapshot = await audioService.load(path, song);
            if (requestId !== audioLoadRequestId) return snapshot;
            while (requestId === audioLoadRequestId && usePlayerStore.getState().metadata?.path === path) {
                const target = usePlayerStore.getState().pendingAudioSeek;
                if (target !== null) {
                    usePlayerStore.setState({ pendingAudioSeek: null });
                    const position = await audioService.seek(target);
                    snapshot = { ...snapshot, position };
                    if (requestId !== audioLoadRequestId) return snapshot;
                    if (usePlayerStore.getState().pendingAudioSeek === null) usePlayerStore.setState({ currentTime: position });
                    continue;
                }
                const shouldPlay = usePlayerStore.getState().isPlaying;
                if ((snapshot.status === 'playing') === shouldPlay) break;
                snapshot = shouldPlay ? await audioService.resume() : await audioService.pause();
                const current = usePlayerStore.getState();
                if (requestId === audioLoadRequestId && current.metadata?.path === path && current.isPlaying === shouldPlay
                    && (snapshot.path !== path || (snapshot.status === 'playing') !== shouldPlay)) {
                    throw new Error('音频未能切换到请求的播放状态，请重试');
                }
            }
            return snapshot;
        } catch (error) {
            if (requestId !== audioLoadRequestId) throw new Error('音频加载请求已被替代', { cause: error });
            if (usePlayerStore.getState().metadata?.path === path) {
                usePlayerStore.setState({ isPlaying: false, isAudioLoaded: false });
            }
            throw error;
        } finally {
            if (requestId === audioLoadRequestId) usePlayerStore.setState({ audioLoadingCount: 0, isSeeking: false });
        }
    }, [requestLyricsForPath]);

    const applyQueueItemPlayback = useCallback(async (
        song: SongMetadata,
        index: number,
        transitionId: number,
        autoPlay = true,
        retainOnFailure = false
    ) => {
        if (!song.path) return;

        const previousSessionId = usePlayerStore.getState().playbackSessionId;
        setCurrentSongIndex(index);
        try {
            const snapshot = await loadAudio(song.path, song, autoPlay);
            if (!isActiveTransition(transitionId)) return;

            usePlayerStore.setState({ pendingQueuePlayback: null });
            setPlaybackSnapshot(snapshot, song);
        } catch (error) {
            if (!isActiveTransition(transitionId) || usePlayerStore.getState().playbackSessionId !== previousSessionId) return;
            if (retainOnFailure) {
                usePlayerStore.setState({ pendingQueuePlayback: { song, index, sessionId: previousSessionId } });
            }
            console.error('Queue play failed', error);
            reportPlaybackFailure(error, song);
        }
    }, [
        loadAudio,
        setCurrentSongIndex,
        setPlaybackSnapshot,
    ]);

    const retryPendingPlayback = useCallback(async () => {
        const state = usePlayerStore.getState();
        const pending = state.pendingQueuePlayback;
        if (!pending) return false;
        const song = useLibraryStore.getState().playlist[pending.index];
        if (state.mediaKind !== 'audio' || state.playbackSessionId !== pending.sessionId || song?.path !== pending.song.path) {
            usePlayerStore.setState({ pendingQueuePlayback: null });
            return false;
        }
        await runPlaybackTransition(async (transitionId) => {
            await applyQueueItemPlayback(song, pending.index, transitionId, true, true);
        });
        return true;
    }, [applyQueueItemPlayback]);

    const togglePlayback = useCallback(async () => {
        if (usePlayerStore.getState().audioLoadingCount > 0) {
            usePlayerStore.setState(state => ({ isPlaying: !state.isPlaying }));
            return;
        }
        if (await retryPendingPlayback()) return;
        const state = usePlayerStore.getState();
        const metadata = state.metadata;
        if (!metadata?.path || state.mediaKind === 'video') return;

        try {
            const snapshot = state.isPlaying
                ? await audioService.pause()
                : state.isAudioLoaded
                    ? await audioService.resume()
                    : await loadAudio(metadata.path, metadata, true, state.audioRetryPosition ?? state.currentTime);
            setMediaKind('audio');
            setPlaybackSnapshot(snapshot);
        } catch (error) {
            console.error('Toggle play failed', error);
            reportPlaybackFailure(error, metadata);
        }
    }, [loadAudio, retryPendingPlayback, setMediaKind, setPlaybackSnapshot]);

    const pausePlayback = useCallback(async () => {
        if (usePlayerStore.getState().audioLoadingCount > 0) {
            usePlayerStore.setState({ isPlaying: false });
            return;
        }
        const snapshot = await audioService.pause();
        setPlaybackSnapshot(snapshot);
    }, [setPlaybackSnapshot]);

    const resumePlayback = useCallback(async () => {
        if (usePlayerStore.getState().audioLoadingCount > 0) {
            usePlayerStore.setState({ isPlaying: true });
            return;
        }
        if (await retryPendingPlayback()) return;
        const state = usePlayerStore.getState();
        if (!state.metadata?.path || state.mediaKind === 'video') return;

        try {
            const snapshot = state.isAudioLoaded
                ? await audioService.resume()
                : await loadAudio(state.metadata.path, state.metadata, true, state.audioRetryPosition ?? state.currentTime);
            setMediaKind('audio');
            setPlaybackSnapshot(snapshot);
        } catch (error) {
            reportPlaybackFailure(error, state.metadata);
        }
    }, [loadAudio, retryPendingPlayback, setMediaKind, setPlaybackSnapshot]);

    const restartCurrent = useCallback(async (song: SongMetadata) => {
        const path = song.path;
        if (!path) return;
        await runPlaybackTransition(async (transitionId) => {
            usePlayerStore.setState({ pendingQueuePlayback: null });
            try {
                const snapshot = await loadAudio(path, song);
                if (isActiveTransition(transitionId)) setPlaybackSnapshot(snapshot, song);
            } catch (error) {
                if (isActiveTransition(transitionId)) reportPlaybackFailure(error, song);
            }
        });
    }, [loadAudio, setPlaybackSnapshot]);

    const toggleShuffle = useCallback(() => {
        const { isShuffling } = usePlayerStore.getState();
        const newShuffleState = !isShuffling;

        // 1. Update Player Store (UI Icon)
        togglePlayerShuffle();

        // 2. Update Library Store (Queue Order)
        toggleShuffleList(newShuffleState);
    }, [togglePlayerShuffle, toggleShuffleList]);

    const playSongInternal = useCallback(async ({ song, index, playlist, options, context }: PlaySongParams, transitionId: number) => {
        usePlayerStore.setState({ pendingQueuePlayback: null });
        if (!song.path) return;

        const { metadata, isShuffling } = usePlayerStore.getState();
        const isCurrent = isSameSong(metadata, song);

        if (isCurrent && !options?.restartIfCurrent) {
            await togglePlayback();
            return;
        }

        const previousSessionId = usePlayerStore.getState().playbackSessionId;
        try {
            if (isCurrent && options?.restartIfCurrent) {
                const actualTime = await audioService.seek(0);
                if (!isActiveTransition(transitionId)) return;
                setPlaybackTime(actualTime);
            }

            if (playlist && playlist.length > 0) {
                if (options?.disableShuffle) {
                    setShuffleState(false);
                    setPlaylist(playlist, context ?? null);
                    setCurrentSongIndex(index);
                    toggleShuffleList(false);
                } else {
                    setPlaylist(playlist, context ?? null);
                    if (isShuffling) {
                        setCurrentSongIndex(index);
                        toggleShuffleList(true);
                    } else {
                        setCurrentSongIndex(index);
                    }
                }
            }

            const snapshot = await loadAudio(song.path, song);
            if (!isActiveTransition(transitionId)) return;

            setPlaybackSnapshot(snapshot, song);



            // If just playing a song without playlist change, maybe we don't update context?
            // Usually we do update playlist if context changes.

            if (options?.addToRecent !== false) {
                const recentItem = options?.recentItem ?? options?.buildRecentItem?.(song);
                if (recentItem) addToRecent(recentItem);
            }
        } catch (error) {
            if (!isActiveTransition(transitionId) || usePlayerStore.getState().playbackSessionId !== previousSessionId) return;
            console.error('Play failed', error);
            reportPlaybackFailure(error, song);
        }
    }, [
        loadAudio,
        addToRecent,
        setCurrentSongIndex,
        setPlaybackSnapshot,
        setPlaybackTime,
        setPlaylist,
        setShuffleState,
        togglePlayback,
        toggleShuffleList,
    ]);

    const playSong = useCallback(async (params: PlaySongParams) => {
        await runPlaybackTransition(async (transitionId) => {
            await playSongInternal({ ...params, song: withoutQueueMetadata(params.song) }, transitionId);
        }, !isSameSong(usePlayerStore.getState().metadata, params.song));
    }, [playSongInternal]);

    const shufflePlay = useCallback(async ({ songs, options, context }: ShufflePlayParams) => {
        if (songs.length === 0) return;
        const randomIndex = Math.floor(Math.random() * songs.length);
        const song = songs[randomIndex];
        if (!song?.path) return;

        const { repeatMode } = usePlayerStore.getState();
        if (repeatMode === 'one') {
            setRepeatState('off');
        }

        setPlaylist(songs, context ?? null);
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
        setRepeatState,
        setShuffleState,
        toggleShuffleList,
    ]);

    const playList = useCallback(async ({ songs, startIndex = 0, shuffle = false, options, context }: PlayListParams) => {
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
            options: {
                ...options,
                disableShuffle: !shuffle
            },
            context
        });
    }, [playSong, setShuffleState, shufflePlay]);

    const playQueueItem = useCallback(async ({ song, index, restartIfCurrent = false }: PlayQueueParams) => {
        await runPlaybackTransition(async (transitionId) => {
            usePlayerStore.setState({ pendingQueuePlayback: null });
            if (index === useLibraryStore.getState().currentSongIndex && !restartIfCurrent) {
                await togglePlayback();
                return;
            }
            await applyQueueItemPlayback(song, index, transitionId);
        }, !isSameSong(usePlayerStore.getState().metadata, song));
    }, [applyQueueItemPlayback, togglePlayback]);

    // --- New Actions for Controls ---
    const seek = useCallback(async (time: number) => {
        const state = usePlayerStore.getState();
        const metadata = state.metadata;
        if (!metadata?.path || !Number.isFinite(time)) return state.currentTime;
        const target = Math.max(0, metadata.duration > 0 ? Math.min(time, metadata.duration) : time);
        usePlayerStore.setState({
            pendingAudioSeek: target, currentTime: target, isSeeking: true,
            ...(state.audioLoadingCount > 0 ? { audioRetryPosition: target } : {}),
        });
        if (state.audioLoadingCount > 0 || state.audioSeekInFlight) return target;

        if (!state.isAudioLoaded) {
            try {
                const snapshot = await loadAudio(metadata.path, metadata, state.isPlaying, target);
                setPlaybackSnapshot(snapshot);
                return usePlayerStore.getState().currentTime;
            } catch (error) {
                reportPlaybackFailure(error, metadata);
                return usePlayerStore.getState().currentTime;
            }
        }

        const seekSession = state.playbackSessionId;
        const loadRequest = audioLoadRequestId;
        const isCurrent = () => audioLoadRequestId === loadRequest && usePlayerStore.getState().playbackSessionId === seekSession;
        usePlayerStore.setState({ audioSeekInFlight: true });
        try {
            while (isCurrent()) {
                const next = usePlayerStore.getState().pendingAudioSeek;
                if (next === null) break;
                usePlayerStore.setState({ pendingAudioSeek: null });
                const actualTime = await audioService.seek(next);
                if (!isCurrent()) break;
                if (usePlayerStore.getState().pendingAudioSeek === null) setPlaybackTime(actualTime);
            }
            return usePlayerStore.getState().currentTime;
        } catch (error) {
            if (isCurrent()) {
                usePlayerStore.setState({ audioRetryPosition: usePlayerStore.getState().currentTime, pendingAudioSeek: null });
                try {
                    await audioService.pause();
                } catch (pauseError) {
                    console.error('Failed to pause after seek failure', pauseError);
                }
                if (isCurrent()) reportPlaybackFailure(error, metadata);
            }
            return usePlayerStore.getState().currentTime;
        } finally {
            if (isCurrent()) usePlayerStore.setState({ audioSeekInFlight: false, isSeeking: false });
        }
    }, [loadAudio, setPlaybackSnapshot, setPlaybackTime]);

    const setVolume = useCallback(async (volume: number) => {
        const clamped = Math.max(0, Math.min(100, volume));
        await audioService.setVolume(clamped / 100);
        usePlayerStore.getState().setVolume(clamped);
    }, []);

    const playNext = useCallback(async () => {
        usePlayerStore.setState({ pendingQueuePlayback: null });
        await runPlaybackTransition(async (transitionId) => {
            const { playlist, currentSongIndex } = useLibraryStore.getState();
            if (playlist.length === 0) return;

            const { repeatMode } = usePlayerStore.getState();
            const nextIdx = getManualNextIndexFn({ playlist, currentSongIndex }, repeatMode);
            if (nextIdx < 0) return;
            const song = playlist[nextIdx];
            if (song?.path) {
                await applyQueueItemPlayback(song, nextIdx, transitionId);
            }
        }, true);
    }, [applyQueueItemPlayback]);

    const playPrev = useCallback(async (currentTime: number = 0) => {
        const player = usePlayerStore.getState();
        const queue = useLibraryStore.getState();
        if (player.audioLoadingCount > 0
            && getPreviousIndexFn(queue, player.repeatMode) === queue.currentSongIndex) return;
        usePlayerStore.setState({ pendingQueuePlayback: null });
        await runPlaybackTransition(async (transitionId) => {
            const { playlist, currentSongIndex } = useLibraryStore.getState();
            if (playlist.length === 0) return;

            // Check if we should just restart current song (> 3s)
            const state = usePlayerStore.getState();
            if (currentTime > 3 && state.audioLoadingCount === 0) {
                await seek(0); // Use the seek action to ensure UI sync
                return;
            }

            // Previous follows the visible playback order. For example, manually
            // selecting item 5 and pressing Previous plays item 4, not the item
            // that happened to be playing before item 5 was selected.
            const { repeatMode } = usePlayerStore.getState();
            const prevIdx = getPreviousIndexFn({ playlist, currentSongIndex }, repeatMode);
            if (prevIdx < 0) return;
            if (prevIdx === currentSongIndex) {
                await seek(0);
                return;
            }
            const song = playlist[prevIdx];
            if (song?.path) {
                await applyQueueItemPlayback(song, prevIdx, transitionId);
            }
        }, true);
    }, [applyQueueItemPlayback, seek]);

    const handlePlaybackEnded = useCallback(async () => {
        if (playbackTransitionRunning) return;

        await runPlaybackTransition(async (transitionId) => {
            const endedSessionId = usePlayerStore.getState().playbackSessionId;
            try {
                const { playlist, currentSongIndex, getNextIndex } = useLibraryStore.getState();
                const { repeatMode, metadata } = usePlayerStore.getState();
                if (playlist.length === 0 || currentSongIndex < 0 || currentSongIndex >= playlist.length) {
                    if (metadata?.path) {
                        await applyQueueItemPlayback(metadata, currentSongIndex, transitionId, false);
                    }
                    return;
                }

                if (repeatMode === 'one') {
                    const song = playlist[currentSongIndex];
                    if (song?.path) {
                        await applyQueueItemPlayback(song, currentSongIndex, transitionId, true, true);
                    }
                    return;
                }

                const nextIdx = getNextIndex(repeatMode);
                if (nextIdx === -1) {
                    const song = playlist[currentSongIndex];
                    if (song?.path) {
                        await applyQueueItemPlayback(song, currentSongIndex, transitionId, false);
                    }
                    return;
                }

                const song = playlist[nextIdx];
                if (song?.path) {
                    await applyQueueItemPlayback(song, nextIdx, transitionId, true, true);
                }
            } finally {
                // Failed loads and invalid queues must leave both the UI and SMTC stopped.
                if (isActiveTransition(transitionId) && usePlayerStore.getState().playbackSessionId === endedSessionId) {
                    try {
                        const snapshot = await audioService.pause();
                        if (isActiveTransition(transitionId) && usePlayerStore.getState().playbackSessionId === endedSessionId) {
                            setPlaybackSnapshot({ ...snapshot, status: 'paused' });
                        }
                    } catch (error) {
                        console.error('Failed to stop ended playback', error);
                        const state = usePlayerStore.getState();
                        if (isActiveTransition(transitionId) && state.playbackSessionId === endedSessionId) {
                            setPlaybackSnapshot({
                                session_id: endedSessionId, status: 'paused', path: state.playbackPath,
                                position: state.currentTime, duration: state.metadata?.duration ?? null,
                                volume: state.volume / 100,
                            });
                        }
                    }
                    if (isActiveTransition(transitionId) && usePlayerStore.getState().playbackSessionId === endedSessionId) {
                        usePlayerStore.setState({ isAudioLoaded: false });
                    }
                }
            }
        });
    }, [applyQueueItemPlayback, setPlaybackSnapshot]);

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
