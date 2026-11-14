import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SongCoverOverlay from '@/components/common/SongCoverOverlay';
import { SongListRow } from '@/features/library/components/SongListRow';
import { SongListItem } from '@/features/playlists/songlist/SongListItem';
import type { SongMetadata } from '@/types';

const player = vi.hoisted(() => ({ metadata: null as SongMetadata | null, isPlaying: false, togglePlayback: vi.fn() }));
vi.mock('react', async importOriginal => {
    const react = await importOriginal<typeof import('react')>();
    const memo = <T,>(component: T) => component;
    return { ...react, memo, default: { ...react, memo } };
});
vi.mock('@/store/usePlayerStore', () => ({ usePlayerStore: Object.assign(
    (select: (state: typeof player) => unknown) => select(player), { getState: () => player },
) }));
vi.mock('@/hooks/playback/usePlaybackActions', () => ({ usePlaybackActions: () => ({ togglePlayback: player.togglePlayback }) }));
vi.mock('@/store/useNavigationStore', () => ({ useNavigationStore: () => ({ push: vi.fn() }) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: vi.fn() }));

const song: SongMetadata = { title: 'Song', artist: '', album: '', duration: 100, path: 'D:/Music/song.flac' };

const doubleClickRow = (kind: 'library' | 'playlist', isSelectionMode: boolean) => {
    const onPlay = vi.fn();
    const common = { song, index: 0, isSelectionMode, selected: false, onPlay, formatDuration: () => '' };
    const view = kind === 'library' ? SongListRow({
        ...common, isLast: true, gridStyle: {}, gridGapClass: '', rowPaddingClass: '',
        isFav: false, hideCover: false, hideArtist: true, effectiveHideAlbum: true, context: 'library',
        enableDelete: false, toggleFavorite: vi.fn(), onContextMenu: vi.fn(), onRowClick: vi.fn(), onSelect: vi.fn(),
    }) : SongListItem({ ...common, style: {} });
    if (!isValidElement<{ onDoubleClick: () => void }>(view)) throw new Error('Song row was not rendered');
    view.props.onDoubleClick();
    return onPlay;
};

const clickCover = async (selected: SongMetadata, isActive?: boolean) => {
    const onPlay = vi.fn();
    const stopPropagation = vi.fn();
    // Reproduce the old list callers: even a stale restart flag must not override the pause icon.
    const props = { song: selected, onPlay, isActive, restartOnPlay: true };
    const view = SongCoverOverlay(props);
    if (!isValidElement<{ onClick: (event: { stopPropagation: () => void }) => void }>(view)) {
        throw new Error('Song cover was not rendered');
    }
    view.props.onClick({ stopPropagation });
    await Promise.resolve();
    return { onPlay, stopPropagation };
};

describe('song cover play and pause', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        player.metadata = song;
        player.isPlaying = true;
        player.togglePlayback.mockResolvedValue(undefined);
    });

    it.each([true, false])('toggles the current track without selecting it again (playing=%s)', async playing => {
        player.isPlaying = playing;
        const { onPlay, stopPropagation } = await clickCover(song);
        expect(player.togglePlayback).toHaveBeenCalledOnce();
        expect(onPlay).not.toHaveBeenCalled();
        expect(stopPropagation).toHaveBeenCalledOnce();
    });

    it('selects another song through the parent playback action', async () => {
        const { onPlay } = await clickCover({ ...song, path: 'D:/Music/another.flac' });
        expect(onPlay).toHaveBeenCalledOnce();
        expect(player.togglePlayback).not.toHaveBeenCalled();
    });

    it('respects an explicitly inactive duplicate in the queue', async () => {
        const { onPlay } = await clickCover(song, false);
        expect(onPlay).toHaveBeenCalledOnce();
        expect(player.togglePlayback).not.toHaveBeenCalled();
    });

    it.each(['library', 'playlist'] as const)('double-clicking the current %s row requests a restart, playing or paused', kind => {
        for (const playing of [true, false]) {
            player.isPlaying = playing;
            const onPlay = doubleClickRow(kind, false);
            expect(onPlay).toHaveBeenCalledExactlyOnceWith(song, 0, { restartIfCurrent: true });
            expect(player.togglePlayback).not.toHaveBeenCalled();
        }
    });

    it.each(['library', 'playlist'] as const)('does not play on double-click in %s selection mode', kind => {
        expect(doubleClickRow(kind, true)).not.toHaveBeenCalled();
        expect(player.togglePlayback).not.toHaveBeenCalled();
    });
});
