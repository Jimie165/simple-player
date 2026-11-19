import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackRuntime } from '@/features/player/runtime/usePlaybackRuntime';
import { audioService } from '@/services/audioService';
import { usePlayerStore } from '@/store/usePlayerStore';
import type { PlaybackSnapshot, SongMetadata } from '@/types';

const runtime = vi.hoisted(() => ({
    effects: [] as Array<() => void | (() => void)>,
    cleanup: [] as Array<() => void>,
    events: new Map<string, (event: { payload: unknown }) => void>(),
    ended: vi.fn(),
}));

vi.mock('react', async importOriginal => ({
    ...await importOriginal<typeof import('react')>(),
    useEffect: (effect: () => void | (() => void)) => { runtime.effects.push(effect); },
}));
vi.mock('@/store/usePlayerStore', async importOriginal => {
    const { usePlayerStore: store } = await importOriginal<typeof import('@/store/usePlayerStore')>();
    return { usePlayerStore: Object.assign(
        (selector: (state: ReturnType<typeof store.getState>) => unknown) => selector(store.getState()), store,
    ) };
});
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: vi.fn() }));
vi.mock('@/services/systemService', () => ({ systemService: { isMacOS: false } }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn((event: string, handler: (event: { payload: unknown }) => void) => {
    runtime.events.set(event, handler);
    return Promise.resolve(() => runtime.events.delete(event));
}) }));
vi.mock('@/features/player/runtime/useAutoOnlineLyrics', () => ({ useAutoOnlineLyrics: () => {} }));
vi.mock('@/hooks/playback/usePlaybackActions', () => ({ usePlaybackActions: () => ({ handlePlaybackEnded: runtime.ended }) }));

const song: SongMetadata = { title: 'Song', artist: '', album: '', duration: 10, path: 'D:/Music/song.flac' };
const snapshot: PlaybackSnapshot = { session_id: 41, path: song.path ?? null, status: 'ended', position: 10, duration: 10, volume: 0.7 };

const mount = () => {
    renderToString(createElement(PlaybackRuntime));
    runtime.effects.forEach(effect => {
        const cleanup = effect();
        if (cleanup) runtime.cleanup.push(cleanup);
    });
};

const unmount = async () => {
    runtime.cleanup.forEach(cleanup => cleanup());
    runtime.cleanup.length = 0;
    runtime.effects.length = 0;
    await Promise.resolve();
};

describe('playback end notification recovery', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('window', globalThis);
        runtime.ended.mockResolvedValue(undefined);
        usePlayerStore.setState({ ...usePlayerStore.getInitialState(), metadata: song, playbackPath: song.path,
            playbackSessionId: 41, mediaKind: 'audio', isPlaying: true, isAudioLoaded: true });
        vi.spyOn(audioService, 'getPlaybackSnapshot').mockResolvedValue(snapshot);
    });
    afterEach(async () => {
        await unmount();
        runtime.events.clear();
        vi.clearAllMocks();
        vi.restoreAllMocks();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('advances from the authoritative ended snapshot when audio:ended is missing', async () => {
        mount();
        await vi.advanceTimersByTimeAsync(0);
        expect(runtime.ended).toHaveBeenCalledWith(41);
    });

    it('rechecks an end event ignored while a track is loading', async () => {
        usePlayerStore.setState({ audioLoadingCount: 1 });
        mount();
        runtime.events.get('audio:ended')?.({ payload: 41 });
        await vi.advanceTimersByTimeAsync(0);
        expect(runtime.ended).not.toHaveBeenCalled();
        usePlayerStore.setState({ audioLoadingCount: 0 });
        await unmount();
        mount();
        await vi.advanceTimersByTimeAsync(0);
        expect(runtime.ended).toHaveBeenCalledWith(41);
    });

    it('does not poll while paused and checks for a missed end after resuming', async () => {
        usePlayerStore.setState({ isPlaying: false });
        mount();
        await vi.advanceTimersByTimeAsync(3000);
        expect(audioService.getPlaybackSnapshot).not.toHaveBeenCalled();
        usePlayerStore.setState({ isPlaying: true });
        await unmount();
        mount();
        await vi.advanceTimersByTimeAsync(0);
        expect(runtime.ended).toHaveBeenCalledWith(41);
    });

    it('stops querying immediately when continuation fails, before effects are cleaned up', async () => {
        runtime.ended.mockImplementation(() => {
            usePlayerStore.setState({ isPlaying: false, isAudioLoaded: false, handledEndedSessionId: 41 });
            return Promise.resolve();
        });
        mount();
        await vi.advanceTimersByTimeAsync(3000);
        expect(audioService.getPlaybackSnapshot).toHaveBeenCalledOnce();
        expect(runtime.ended).toHaveBeenCalledOnce();
    });

    it('stops querying a session whose end has already been claimed by a transition', async () => {
        usePlayerStore.setState({ handledEndedSessionId: 41 });
        mount();
        await vi.advanceTimersByTimeAsync(3000);
        expect(audioService.getPlaybackSnapshot).not.toHaveBeenCalled();
        expect(runtime.ended).not.toHaveBeenCalled();
    });

    it('does not accept a snapshot arriving after the user pauses', async () => {
        let finish: (value: PlaybackSnapshot) => void = () => {};
        vi.mocked(audioService.getPlaybackSnapshot).mockReturnValue(new Promise(resolve => { finish = resolve; }));
        mount();
        usePlayerStore.setState({ isPlaying: false });
        finish(snapshot);
        await vi.advanceTimersByTimeAsync(2000);
        expect(runtime.ended).not.toHaveBeenCalled();
        expect(audioService.getPlaybackSnapshot).toHaveBeenCalledOnce();
    });

    it('uses a state notification as another recovery path', () => {
        usePlayerStore.setState({ isPlaying: false });
        mount();
        runtime.events.get('audio:state-changed')?.({ payload: snapshot });
        expect(runtime.ended).toHaveBeenCalledWith(41);
    });

    it('does not interpret an output failure or another path as a natural end', async () => {
        vi.mocked(audioService.getPlaybackSnapshot).mockResolvedValue({ ...snapshot, output_unavailable: true });
        mount();
        await vi.advanceTimersByTimeAsync(0);
        runtime.events.get('audio:state-changed')?.({ payload: { ...snapshot, path: 'D:/Music/old.flac' } });
        expect(runtime.ended).not.toHaveBeenCalled();
    });

    it('discards an ended reply requested before a completed seek', async () => {
        let finish: (value: PlaybackSnapshot) => void = () => {};
        vi.mocked(audioService.getPlaybackSnapshot).mockReturnValue(new Promise(resolve => { finish = resolve; }));
        mount();
        usePlayerStore.setState({ isSeeking: true });
        usePlayerStore.setState({ isSeeking: false, currentTime: 2 });
        finish(snapshot);
        await vi.advanceTimersByTimeAsync(0);
        expect(runtime.ended).not.toHaveBeenCalled();
    });

    it('cleans up polling and ignores a snapshot arriving after unmount', async () => {
        let finish: (value: PlaybackSnapshot) => void = () => {};
        vi.mocked(audioService.getPlaybackSnapshot).mockReturnValue(new Promise(resolve => { finish = resolve; }));
        mount();
        runtime.cleanup.forEach(cleanup => cleanup());
        runtime.cleanup.length = 0;
        finish(snapshot);
        await vi.advanceTimersByTimeAsync(2000);
        expect(runtime.ended).not.toHaveBeenCalled();
        expect(audioService.getPlaybackSnapshot).toHaveBeenCalledOnce();
    });
});
