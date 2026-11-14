import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { handleAudioOutputError } from '@/features/player/runtime/handleAudioOutputError';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { audioService } from '@/services/audioService';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useDialogStore } from '@/store/useDialogStore';
import { parseLyrics } from '@/utils/lyrics/parseLyrics';
import type { PlaybackSnapshot, SongMetadata } from '@/types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

const songs: SongMetadata[] = ['first', 'second'].map(title => ({ title, artist: 'Artist', album: 'Album', duration: 100, path: `D:/Music/${title}.flac` }));
const snapshot: PlaybackSnapshot = { session_id: 41, path: songs[0].path ?? null, status: 'paused', position: 35, duration: 100, volume: 0.7 };

function PlaybackHarness({ ready }: { ready: (actions: ReturnType<typeof usePlaybackActions>) => void }) {
    ready(usePlaybackActions());
    return null;
}

function actions() {
    let result: ReturnType<typeof usePlaybackActions> | undefined;
    renderToString(createElement(PlaybackHarness, { ready: value => { result = value; } }));
    if (!result) throw new Error('Playback actions were not initialized');
    return result;
}

function deferred<T>() {
    let complete: (value: T) => void = () => { throw new Error('Promise was not initialized'); };
    const promise = new Promise<T>(resolve => { complete = resolve; });
    return { promise, resolve: (value: T) => complete(value) };
}

describe('audio output failure and queue recovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        usePlayerStore.setState({ ...usePlayerStore.getInitialState(), metadata: songs[0], playbackPath: songs[0].path, mediaKind: 'audio', playbackSessionId: 41, isPlaying: true, isAudioLoaded: true, currentTime: 35 });
        useLibraryStore.setState({ playlist: songs, originalPlaylist: songs, currentSongIndex: 0 });
        vi.spyOn(audioService, 'pause').mockResolvedValue(snapshot);
        vi.spyOn(audioService, 'resume').mockImplementation(() => Promise.resolve({ ...snapshot, session_id: 42, path: usePlayerStore.getState().metadata?.path ?? null, status: 'playing', position: 0 }));
        vi.spyOn(audioService, 'getLyrics').mockResolvedValue(parseLyrics({ rawText: '', sourcePath: songs[1].path }));
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('ignores output errors for obsolete sessions and video playback', () => {
        handleAudioOutputError({ session_id: 40, message: 'device error', unavailable: true });
        expect(usePlayerStore.getState().isPlaying).toBe(true);
        usePlayerStore.setState({ mediaKind: 'video' });
        handleAudioOutputError({ session_id: 41, message: 'device error', unavailable: true });
        expect(usePlayerStore.getState().isPlaying).toBe(true);
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('keeps a working stream usable if switching the default endpoint fails', () => {
        handleAudioOutputError({ session_id: 41, message: 'new endpoint failed', unavailable: false });
        expect(usePlayerStore.getState().isPlaying).toBe(true);
        expect(usePlayerStore.getState().isAudioLoaded).toBe(true);
    });

    it('does not let a polled snapshot revive a failed output and accepts a recovered stream', () => {
        handleAudioOutputError({ session_id: 41, message: 'device lost', unavailable: true });
        usePlayerStore.getState().setPlaybackSnapshot({ ...snapshot, output_unavailable: true });
        expect(usePlayerStore.getState().isPlaying).toBe(false);
        expect(usePlayerStore.getState().isAudioLoaded).toBe(false);
        usePlayerStore.getState().setPlaybackSnapshot({ ...snapshot, status: 'playing', output_unavailable: false });
        expect(usePlayerStore.getState().isPlaying).toBe(true);
        expect(usePlayerStore.getState().isAudioLoaded).toBe(true);
    });

    it('prepares a fresh track before resuming after an output error', async () => {
        handleAudioOutputError({ session_id: 41, message: 'device lost', unavailable: true });
        const play = vi.spyOn(audioService, 'load').mockResolvedValue({ ...snapshot, session_id: 42, status: 'paused' });
        const resume = vi.spyOn(audioService, 'resume');
        await actions().togglePlayback();
        expect(play).toHaveBeenCalledWith(songs[0].path, songs[0]);
        expect(resume).toHaveBeenCalledOnce();
    });

    it('keeps the selected next song stopped and retryable when loading fails', async () => {
        vi.spyOn(audioService, 'load').mockRejectedValue(new Error('output unavailable'));
        await actions().playNext();
        expect(usePlayerStore.getState().metadata?.path).toBe(songs[1].path);
        expect(usePlayerStore.getState().currentTime).toBe(0);
        expect(useLibraryStore.getState().currentSongIndex).toBe(1);
        expect(usePlayerStore.getState().isPlaying).toBe(false);
        expect(toast.error).toHaveBeenCalled();
        expect(usePlayerStore.getState().audioLoadingCount).toBe(0);
    });

    it('keeps preparing in the background after pausing and never resumes by itself', async () => {
        const prepared = deferred<PlaybackSnapshot>();
        const lyrics = deferred<ReturnType<typeof parseLyrics>>();
        vi.mocked(audioService.getLyrics).mockReturnValue(lyrics.promise);
        const pause = vi.spyOn(audioService, 'pause').mockResolvedValue(snapshot);
        const play = vi.spyOn(audioService, 'load').mockReturnValue(prepared.promise);
        const switching = actions().playNext();
        expect(usePlayerStore.getState().audioLoadingCount).toBe(1);
        expect(usePlayerStore.getState().metadata?.path).toBe(songs[1].path);
        expect(usePlayerStore.getState().currentTime).toBe(0);
        expect(useLibraryStore.getState().currentSongIndex).toBe(1);
        expect(pause).toHaveBeenCalledOnce();
        usePlayerStore.getState().setPlaybackSnapshot({ ...snapshot, status: 'playing' });
        usePlayerStore.getState().setPlaybackTime(36);
        expect(usePlayerStore.getState().metadata?.path).toBe(songs[1].path);
        expect(usePlayerStore.getState().currentTime).toBe(0);
        expect(usePlayerStore.getState().isPlaying).toBe(true);
        await actions().togglePlayback();
        expect(usePlayerStore.getState().isPlaying).toBe(false);
        expect(usePlayerStore.getState().audioLoadingCount).toBe(1);
        prepared.resolve({ ...snapshot, session_id: 42, path: songs[1].path ?? null, status: 'paused', position: 0 });
        await switching;
        expect(usePlayerStore.getState().audioLoadingCount).toBe(0);
        expect(usePlayerStore.getState().metadata?.path).toBe(songs[1].path);
        expect(play).toHaveBeenCalledOnce();
        expect(audioService.resume).not.toHaveBeenCalled();
        expect(usePlayerStore.getState().isPlaying).toBe(false);
        expect(usePlayerStore.getState().isAudioLoaded).toBe(true);
        lyrics.resolve(parseLyrics({ rawText: '', sourcePath: songs[1].path }));
    });

    it.each(['next', 'song', 'queue', 'list', 'previous'] as const)('allows %s to replace a buffering load and ignores its late result', async entry => {
        const remote: SongMetadata = { ...songs[1], path: 'D:/Music/pending.flac' };
        useLibraryStore.setState({ playlist: [songs[0], remote, songs[0]], originalPlaylist: [songs[0], remote, songs[0]] });
        const pending = deferred<PlaybackSnapshot>();
        const load = vi.spyOn(audioService, 'load').mockReturnValueOnce(pending.promise)
            .mockResolvedValue({ ...snapshot, session_id: 43, status: 'playing', position: 0 });
        const playback = actions();
        const first = playback.playNext();
        await Promise.resolve();
        expect(load).toHaveBeenCalledOnce();
        if (entry === 'next') await playback.playNext();
        if (entry === 'song') await playback.playSong({ song: songs[0], index: 0 });
        if (entry === 'queue') await playback.playQueueItem({ song: songs[0], index: 0 });
        if (entry === 'list') await playback.playList({ songs });
        if (entry === 'previous') await playback.playPrev(35);
        expect(load).toHaveBeenCalledTimes(2);
        expect(usePlayerStore.getState().metadata?.path).toBe(songs[0].path);
        expect(usePlayerStore.getState().isAudioLoaded).toBe(true);
        expect(usePlayerStore.getState().audioLoadingCount).toBe(0);
        pending.resolve({ ...snapshot, session_id: 42, path: remote.path ?? null });
        await first;
        expect(usePlayerStore.getState().playbackSessionId).toBe(43);
        expect(usePlayerStore.getState().metadata?.path).toBe(songs[0].path);
        expect(usePlayerStore.getState().isPlaying).toBe(true);
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('ignores an obsolete load failure after the selected replacement starts', async () => {
        const pending = deferred<PlaybackSnapshot>();
        vi.spyOn(audioService, 'load').mockImplementationOnce(async () => {
            await pending.promise;
            throw new Error('old network failure');
        }).mockResolvedValue({ ...snapshot, session_id: 43, status: 'playing' });
        const playback = actions();
        const first = playback.playNext();
        await Promise.resolve();
        await playback.playSong({ song: songs[0], index: 0 });
        pending.resolve(snapshot);
        await first;
        expect(usePlayerStore.getState().playbackSessionId).toBe(43);
        expect(usePlayerStore.getState().isPlaying).toBe(true);
        expect(usePlayerStore.getState().audioLoadingCount).toBe(0);
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('defers seeking until preparation completes without overlapping source reloads', async () => {
        usePlayerStore.setState({ isPlaying: false });
        const prepared = deferred<PlaybackSnapshot>();
        const load = vi.spyOn(audioService, 'load').mockReturnValue(prepared.promise);
        const seek = vi.spyOn(audioService, 'seek').mockResolvedValue(12);
        const playback = actions();
        const firstLoad = playback.restartCurrent(songs[0]);
        await playback.restartCurrent(songs[0]);
        await playback.seek(12);
        expect(load).toHaveBeenCalledOnce();
        expect(seek).not.toHaveBeenCalled();
        expect(usePlayerStore.getState().audioLoadingCount).toBe(1);
        prepared.resolve({ ...snapshot, session_id: 42, status: 'paused' });
        await firstLoad;
        expect(usePlayerStore.getState().audioLoadingCount).toBe(0);
        expect(usePlayerStore.getState().isAudioLoaded).toBe(true);
        expect(usePlayerStore.getState().isPlaying).toBe(true);
        expect(seek).toHaveBeenCalledExactlyOnceWith(12);
    });

    it('coalesces seeks during a native seek without restoring an obsolete position', async () => {
        const first = deferred<number>();
        const nativeSeek = vi.spyOn(audioService, 'seek').mockReturnValueOnce(first.promise).mockResolvedValue(70);
        const playback = actions();
        const seeking = playback.seek(20);
        await playback.seek(40);
        await playback.seek(70);
        usePlayerStore.getState().setPlaybackSnapshot({ ...snapshot, status: 'playing', position: 20 });
        expect(usePlayerStore.getState().currentTime).toBe(70);
        expect(nativeSeek).toHaveBeenCalledOnce();
        first.resolve(20);
        await seeking;
        expect(nativeSeek.mock.calls).toEqual([[20], [70]]);
        expect(usePlayerStore.getState().currentTime).toBe(70);
        expect(usePlayerStore.getState().audioSeekInFlight).toBe(false);
        expect(usePlayerStore.getState().isSeeking).toBe(false);
    });

    it('applies a newer position requested during preparation seeking before resuming', async () => {
        usePlayerStore.setState({ isPlaying: false });
        const prepared = deferred<PlaybackSnapshot>();
        const firstSeek = deferred<number>();
        vi.spyOn(audioService, 'load').mockReturnValue(prepared.promise);
        const nativeSeek = vi.spyOn(audioService, 'seek').mockReturnValueOnce(firstSeek.promise).mockResolvedValue(80);
        vi.spyOn(audioService, 'resume').mockResolvedValue({ ...snapshot, session_id: 42, status: 'playing', position: 80 });
        const playback = actions();
        const loading = playback.restartCurrent(songs[0]);
        await playback.seek(30);
        prepared.resolve({ ...snapshot, session_id: 42, position: 0 });
        await Promise.resolve();
        await Promise.resolve();
        expect(nativeSeek).toHaveBeenCalledExactlyOnceWith(30);
        await playback.seek(80);
        firstSeek.resolve(30);
        await loading;
        expect(nativeSeek.mock.calls).toEqual([[30], [80]]);
        expect(usePlayerStore.getState().currentTime).toBe(80);
        expect(nativeSeek.mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(audioService.resume).mock.invocationCallOrder[0]);
    });

    it('pauses at the target and allows retry after a native seek fails', async () => {
        vi.spyOn(audioService, 'seek').mockRejectedValue(new Error('network unavailable'));
        await actions().seek(80);
        expect(usePlayerStore.getState().currentTime).toBe(80);
        expect(usePlayerStore.getState().audioRetryPosition).toBe(80);
        expect(usePlayerStore.getState().isPlaying).toBe(false);
        expect(usePlayerStore.getState().audioSeekInFlight).toBe(false);
        expect(usePlayerStore.getState().isSeeking).toBe(false);
        expect(toast.error).toHaveBeenCalledOnce();
    });

    it('discards queued seeks when switching tracks', async () => {
        const prepared = deferred<PlaybackSnapshot>();
        vi.spyOn(audioService, 'load').mockReturnValueOnce(prepared.promise)
            .mockResolvedValue({ ...snapshot, session_id: 43, status: 'playing', position: 0 });
        const nativeSeek = vi.spyOn(audioService, 'seek');
        const playback = actions();
        const loading = playback.playNext();
        await Promise.resolve();
        await playback.seek(80);
        await playback.playSong({ song: songs[0], index: 0 });
        prepared.resolve({ ...snapshot, session_id: 42, path: songs[1].path ?? null });
        await loading;
        expect(nativeSeek).not.toHaveBeenCalled();
        expect(usePlayerStore.getState().currentTime).toBe(0);
        expect(usePlayerStore.getState().pendingAudioSeek).toBeNull();
        expect(usePlayerStore.getState().playbackSessionId).toBe(43);
    });

    it('stops preparing when resume cannot start the source instead of retrying forever', async () => {
        vi.spyOn(audioService, 'load').mockResolvedValue({ ...snapshot, session_id: 42, path: songs[1].path ?? null, status: 'paused' });
        const resume = vi.mocked(audioService.resume).mockResolvedValueOnce({ ...snapshot, session_id: 42, path: songs[1].path ?? null, status: 'ended' })
            .mockRejectedValue(new Error('unexpected repeated resume'));
        await actions().playNext();
        expect(resume).toHaveBeenCalledOnce();
        expect(usePlayerStore.getState().audioLoadingCount).toBe(0);
        expect(usePlayerStore.getState().isPlaying).toBe(false);
        expect(usePlayerStore.getState().isAudioLoaded).toBe(false);
        expect(toast.error).toHaveBeenCalledOnce();
    });

    it.each(['resume', 'restart', 'missing file'] as const)('reports %s failure and retries the selected song with Play', async scenario => {
        usePlayerStore.setState({ isPlaying: false, isAudioLoaded: false });
        const showDialog = vi.spyOn(useDialogStore.getState(), 'openDeleteConfirm');
        const load = vi.spyOn(audioService, 'load')
            .mockRejectedValueOnce(scenario === 'missing file' ? 'AUDIO_FILE_NOT_FOUND' : new Error('source unavailable'))
            .mockResolvedValue({ ...snapshot, session_id: 42, status: 'paused' });
        const playback = actions();
        if (scenario === 'restart') await playback.restartCurrent(songs[0]);
        else await playback.resumePlayback();
        expect(usePlayerStore.getState().isPlaying).toBe(false);
        expect(usePlayerStore.getState().isAudioLoaded).toBe(false);
        expect(usePlayerStore.getState().audioLoadingCount).toBe(0);
        if (scenario === 'missing file') {
            expect(showDialog).toHaveBeenCalledOnce();
            expect(toast.error).not.toHaveBeenCalled();
        } else {
            expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('请点击播放重试'), { id: 'audio-playback-failure' });
            expect(showDialog).not.toHaveBeenCalled();
        }
        expect(usePlayerStore.getState().metadata?.path).toBe(songs[0].path);
        await playback.togglePlayback();
        expect(load).toHaveBeenCalledTimes(2);
        expect(load).toHaveBeenLastCalledWith(songs[0].path, songs[0]);
        expect(usePlayerStore.getState().isPlaying).toBe(true);
        expect(usePlayerStore.getState().isAudioLoaded).toBe(true);
        expect(useLibraryStore.getState().currentSongIndex).toBe(0);
    });

    it.each(['togglePlayback', 'resumePlayback'] as const)('restores the interrupted position when retrying through %s', async action => {
        usePlayerStore.setState({ isPlaying: false, isAudioLoaded: false, currentTime: 35, audioRetryPosition: 35 });
        usePlayerStore.getState().setPlaybackSnapshot({ ...snapshot, status: 'paused', position: 0 });
        expect(usePlayerStore.getState().currentTime).toBe(35);
        expect(usePlayerStore.getState().isAudioLoaded).toBe(false);
        const prepared = deferred<PlaybackSnapshot>();
        vi.spyOn(audioService, 'load').mockReturnValue(prepared.promise);
        const seek = vi.spyOn(audioService, 'seek').mockResolvedValue(35);
        vi.mocked(audioService.resume).mockResolvedValue({ ...snapshot, session_id: 42, status: 'playing', position: 35 });
        const retry = actions()[action]();
        await Promise.resolve();
        expect(usePlayerStore.getState().currentTime).toBe(35);
        prepared.resolve({ ...snapshot, session_id: 42, status: 'paused', position: 0 });
        await retry;
        expect(seek).toHaveBeenCalledWith(35);
        expect(seek.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(audioService.resume).mock.invocationCallOrder[0]);
        expect(usePlayerStore.getState().currentTime).toBe(35);
        expect(usePlayerStore.getState().isPlaying).toBe(true);
        expect(usePlayerStore.getState().audioRetryPosition).toBeNull();
    });

    it('retains the interrupted position when retrying fails again', async () => {
        usePlayerStore.setState({ isPlaying: false, isAudioLoaded: false, currentTime: 35, audioRetryPosition: 35 });
        vi.spyOn(audioService, 'load').mockRejectedValue(new Error('network unavailable'));
        await actions().togglePlayback();
        usePlayerStore.getState().setPlaybackSnapshot({ ...snapshot, status: 'paused', position: 0 });
        expect(usePlayerStore.getState().currentTime).toBe(35);
        expect(usePlayerStore.getState().audioRetryPosition).toBe(35);
        expect(usePlayerStore.getState().isPlaying).toBe(false);
        expect(usePlayerStore.getState().audioLoadingCount).toBe(0);
    });

    it('honors a resume request made before background preparation completes', async () => {
        const prepared = deferred<PlaybackSnapshot>();
        const load = vi.spyOn(audioService, 'load').mockReturnValue(prepared.promise);
        const playback = actions();
        const switching = playback.playNext();
        expect(usePlayerStore.getState().isPlaying).toBe(true);
        await playback.pausePlayback();
        expect(usePlayerStore.getState().isPlaying).toBe(false);
        await playback.resumePlayback();
        expect(usePlayerStore.getState().isPlaying).toBe(true);
        prepared.resolve({ ...snapshot, session_id: 42, path: songs[1].path ?? null, position: 0 });
        await switching;
        expect(load).toHaveBeenCalledOnce();
        expect(audioService.resume).toHaveBeenCalledOnce();
        expect(usePlayerStore.getState().isPlaying).toBe(true);
        expect(usePlayerStore.getState().audioLoadingCount).toBe(0);
    });

    it('retries the pending next track after automatic continuation fails', async () => {
        vi.spyOn(audioService, 'pause').mockResolvedValue(snapshot);
        const play = vi.spyOn(audioService, 'load').mockRejectedValueOnce(new Error('output unavailable'))
            .mockResolvedValue({ ...snapshot, session_id: 42, path: songs[1].path ?? null, status: 'paused', position: 0 });
        const playback = actions();
        await playback.handlePlaybackEnded();
        expect(usePlayerStore.getState().pendingQueuePlayback?.song.path).toBe(songs[1].path);
        expect(usePlayerStore.getState().isAudioLoaded).toBe(false);
        await playback.togglePlayback();
        expect(play).toHaveBeenLastCalledWith(songs[1].path, songs[1]);
        expect(useLibraryStore.getState().currentSongIndex).toBe(1);
        expect(usePlayerStore.getState().pendingQueuePlayback).toBeNull();
    });
});
