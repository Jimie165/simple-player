import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useOnlineLyricsSettingsStore } from '@/features/settings/useOnlineLyricsSettingsStore';
import { fetchAutomaticLyrics } from '@/features/player/runtime/autoOnlineLyrics';
import { onlineLyricsService } from '@/services/onlineLyricsService';
import { audioService } from '@/services/audioService';

export function useAutoOnlineLyrics() {
    const autoFetchEnabled = useOnlineLyricsSettingsStore(state => state.autoFetchEnabled);
    const path = usePlayerStore(state => state.metadata?.path);
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const mediaKind = usePlayerStore(state => state.mediaKind);
    const lyricsPath = usePlayerStore(state => state.lyricsPath);
    const lyricsStatus = usePlayerStore(state => state.lyricsStatus);
    const requestId = usePlayerStore(state => state.lyricsRequestId);
    const attemptedPath = useRef<string | null>(null);

    useEffect(() => { attemptedPath.current = null; }, [path, autoFetchEnabled]);
    useEffect(() => {
        if (!autoFetchEnabled || !path || !isPlaying || mediaKind !== 'audio' || lyricsPath !== path || lyricsStatus !== 'empty') return;
        let active = true;
        const run = async () => {
            if (attemptedPath.current === path) return;
            attemptedPath.current = path;
            const song = usePlayerStore.getState().metadata;
            if (!song?.id || song.path !== path || song.lyrics_text?.trim() || song.lyrics_source_path?.trim()) return;
            usePlayerStore.getState().setAutoLyricsSearchPath(path);
            const isCurrent = () => {
                const state = usePlayerStore.getState();
                return active && useOnlineLyricsSettingsStore.getState().autoFetchEnabled
                    && state.metadata?.path === path && state.mediaKind === 'audio'
                    && state.lyricsRequestId === requestId && !state.metadata.lyrics_text?.trim()
                    && state.metadata.title === song.title && state.metadata.artist === song.artist;
            };
            try {
                const text = await fetchAutomaticLyrics(song, useOnlineLyricsSettingsStore.getState().providerOrder, isCurrent);
                if (!text || !isCurrent()) return;
                // Recheck after the network wait in case a local lyric or user edit appeared.
                const existing = await audioService.getLyrics(path);
                if (!isCurrent() || existing.lines.some(line => line.text.trim())) return;
                const saved = await onlineLyricsService.saveIfMissing(song.id, path, text);
                if (!saved || !isCurrent()) return;
                const current = usePlayerStore.getState();
                if (!current.metadata) return;
                const updated = { ...current.metadata, lyrics_text: text, lyrics_source_path: null };
                current.setMetadata(updated);
                const library = useLibraryStore.getState();
                library.updateSongInQueues(updated);
                library.triggerLibraryUpdate();
                library.triggerPlaylistUpdate();
                await current.reloadLyricsForPath(path);
            } catch (error) {
                if (active) console.warn('Automatic online lyrics acquisition failed', error);
            } finally {
                if (active) usePlayerStore.getState().setAutoLyricsSearchPath(null);
            }
        };
        // Avoid requests for rapidly skipped tracks and StrictMode's setup/cleanup probe.
        const timer = window.setTimeout(() => { void run(); }, 500);
        return () => {
            active = false;
            window.clearTimeout(timer);
            if (usePlayerStore.getState().autoLyricsSearchPath === path) {
                usePlayerStore.getState().setAutoLyricsSearchPath(null);
            }
        };
    }, [autoFetchEnabled, path, isPlaying, mediaKind, lyricsPath, lyricsStatus, requestId]);
}
