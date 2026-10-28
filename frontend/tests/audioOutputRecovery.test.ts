import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { handleAudioOutputError } from '@/features/player/runtime/handleAudioOutputError';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { audioService } from '@/services/audioService';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
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

describe('audio output failure and queue recovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        usePlayerStore.setState({ ...usePlayerStore.getInitialState(), metadata: songs[0], playbackPath: songs[0].path, mediaKind: 'audio', playbackSessionId: 41, isPlaying: true, isAudioLoaded: true, currentTime: 35 });
        useLibraryStore.setState({ playlist: songs, originalPlaylist: songs, currentSongIndex: 0 });
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

    it('reopens the track instead of resuming the invalid stream after an output error', async () => {
        handleAudioOutputError({ session_id: 41, message: 'device lost', unavailable: true });
        const play = vi.spyOn(audioService, 'play').mockResolvedValue({ ...snapshot, session_id: 42, status: 'playing' });
        const resume = vi.spyOn(audioService, 'resume');
        await actions().togglePlayback();
        expect(play).toHaveBeenCalledWith(songs[0].path, songs[0]);
        expect(resume).not.toHaveBeenCalled();
    });

    it('preserves the current song and clock when a manual next-track load fails', async () => {
        vi.spyOn(audioService, 'play').mockRejectedValue(new Error('output unavailable'));
        await actions().playNext();
        expect(usePlayerStore.getState().metadata?.path).toBe(songs[0].path);
        expect(usePlayerStore.getState().currentTime).toBe(35);
        expect(useLibraryStore.getState().currentSongIndex).toBe(0);
        expect(toast.error).toHaveBeenCalled();
    });

    it('retries the pending next track after automatic continuation fails', async () => {
        vi.spyOn(audioService, 'pause').mockResolvedValue(snapshot);
        const play = vi.spyOn(audioService, 'play').mockRejectedValueOnce(new Error('output unavailable'))
            .mockResolvedValue({ ...snapshot, session_id: 42, path: songs[1].path ?? null, status: 'playing', position: 0 });
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
