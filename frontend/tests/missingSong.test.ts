import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongMetadata } from '@/types';

const mocks = vi.hoisted(() => ({
    openDeleteConfirm: vi.fn(),
    batchDeleteSongs: vi.fn(),
    markSongsAsOptimisticallyDeleted: vi.fn(),
    clearOptimisticallyDeletedSongs: vi.fn(),
    removeSongFromPlaylist: vi.fn(),
    removeFromRecent: vi.fn(),
    triggerLibraryUpdate: vi.fn(),
    triggerPlaylistUpdate: vi.fn(),
    error: vi.fn(),
}));
vi.mock('@/store/useDialogStore', () => ({ useDialogStore: { getState: () => mocks } }));
vi.mock('@/store/useLibraryStore', () => ({ useLibraryStore: { getState: () => mocks } }));
vi.mock('@/services/libraryService', () => ({ libraryService: mocks }));
vi.mock('react-hot-toast', () => ({ default: { error: mocks.error } }));

import { handleMissingSong } from '@/hooks/playback/handleMissingSong';

const song: SongMetadata = {
    id: 42, title: '测试歌曲', artist: '歌手', album: '专辑', duration: 120, path: 'D:/Music/song.mp3',
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout });
    mocks.batchDeleteSongs.mockResolvedValue(undefined);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('missing song playback prompt', () => {
    it('does not offer library removal for decode or permission errors', () => {
        expect(handleMissingSong('Failed to decode audio file', song)).toBe(false);
        expect(handleMissingSong('Access denied', song)).toBe(false);
        expect(mocks.openDeleteConfirm).not.toHaveBeenCalled();
    });

    it('keeps the song until the user confirms removal', async () => {
        expect(handleMissingSong('AUDIO_FILE_NOT_FOUND', song)).toBe(true);
        expect(mocks.openDeleteConfirm).toHaveBeenCalledWith(
            [song], expect.any(Function), expect.stringContaining('测试歌曲'), '找不到歌曲文件', '从音乐库移除'
        );
        expect(mocks.batchDeleteSongs).not.toHaveBeenCalled();
        const confirm: () => Promise<void> = mocks.openDeleteConfirm.mock.calls[0][1];
        await confirm();
        expect(mocks.batchDeleteSongs).toHaveBeenCalledWith([42]);
        expect(mocks.removeSongFromPlaylist).toHaveBeenCalledWith(song.path);
        expect(mocks.removeFromRecent).toHaveBeenCalledWith(song.path);
        expect(mocks.triggerLibraryUpdate).toHaveBeenCalledOnce();
        expect(mocks.triggerPlaylistUpdate).toHaveBeenCalledOnce();
        vi.runAllTimers();
        expect(mocks.clearOptimisticallyDeletedSongs).toHaveBeenCalledWith([42]);
    });

    it('restores visibility and reports a failed removal', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.batchDeleteSongs.mockRejectedValueOnce('database error');
        handleMissingSong('AUDIO_FILE_NOT_FOUND', song);
        const confirm: () => Promise<void> = mocks.openDeleteConfirm.mock.calls[0][1];
        await confirm();
        expect(mocks.clearOptimisticallyDeletedSongs).toHaveBeenCalledWith([42]);
        expect(mocks.removeSongFromPlaylist).not.toHaveBeenCalled();
        expect(mocks.error).toHaveBeenCalledWith('移除失败，请重试');
    });

    it('only acknowledges files without a library identity', async () => {
        const externalSong = { ...song, id: undefined };
        handleMissingSong('AUDIO_FILE_NOT_FOUND', externalSong);
        expect(mocks.openDeleteConfirm.mock.calls[0][4]).toBe('知道了');
        const confirm: () => Promise<void> = mocks.openDeleteConfirm.mock.calls[0][1];
        await confirm();
        expect(mocks.batchDeleteSongs).not.toHaveBeenCalled();
    });
});
