import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    videos: [] as Array<{ id: number; path: string }>,
    videoQueue: [] as Array<{ id: number; path: string }>,
    videoMetadata: null as { path: string } | null,
    currentVideoIndex: 0,
    isVideoMode: true,
    openDeleteConfirm: vi.fn(), batchDeleteVideos: vi.fn(), setVideos: vi.fn(),
    removeFromRecent: vi.fn(), triggerLibraryUpdate: vi.fn(), setVideoQueue: vi.fn(),
    setVideoMode: vi.fn(), setVideoMetadata: vi.fn(), error: vi.fn(),
}));
vi.mock('@/store/useDialogStore', () => ({ useDialogStore: { getState: () => mocks } }));
vi.mock('@/store/useLibraryStore', () => ({ useLibraryStore: { getState: () => mocks } }));
vi.mock('@/store/useVideoStore', () => ({ useVideoStore: { getState: () => mocks } }));
vi.mock('@/store/usePlayerStore', () => ({ usePlayerStore: { getState: () => mocks } }));
vi.mock('@/services/libraryService', () => ({ libraryService: mocks }));
vi.mock('react-hot-toast', () => ({ default: { error: mocks.error } }));

import { handleMissingVideo } from '@/features/player/video/handleMissingVideo';

const video = { id: 42, title: '测试视频', path: 'D:/Video/missing.mp4' };
beforeEach(() => {
    vi.clearAllMocks();
    mocks.videos = [video];
    mocks.videoQueue = [video, { id: 43, path: 'D:/Video/next.mp4' }];
    mocks.videoMetadata = video;
    mocks.currentVideoIndex = 0;
    mocks.isVideoMode = true;
    mocks.batchDeleteVideos.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

async function confirm() {
    const action: () => Promise<void> = mocks.openDeleteConfirm.mock.calls[0][1];
    await action();
}

describe('missing video removal', () => {
    it('keeps the library unchanged until confirmation, then clears the current missing video', async () => {
        handleMissingVideo(video);
        expect(mocks.openDeleteConfirm).toHaveBeenCalledWith([video], expect.any(Function), expect.stringContaining('测试视频'), '找不到视频文件', '从视频库移除');
        expect(mocks.batchDeleteVideos).not.toHaveBeenCalled();
        await confirm();
        expect(mocks.batchDeleteVideos).toHaveBeenCalledWith([42]);
        expect(mocks.setVideos).toHaveBeenCalledWith([]);
        expect(mocks.removeFromRecent).toHaveBeenCalledWith(video.path);
        expect(mocks.setVideoQueue).toHaveBeenCalledWith([{ id: 43, path: 'D:/Video/next.mp4' }], -1);
        expect(mocks.setVideoMode).toHaveBeenCalledWith(false);
        expect(mocks.setVideoMetadata).toHaveBeenCalledWith(null);
    });

    it('preserves a different video selected before confirming removal', async () => {
        handleMissingVideo(video);
        mocks.currentVideoIndex = 1;
        mocks.videoMetadata = { path: 'D:/Video/next.mp4' };
        await confirm();
        expect(mocks.setVideoQueue).toHaveBeenCalledWith([{ id: 43, path: 'D:/Video/next.mp4' }], 0);
        expect(mocks.setVideoMode).not.toHaveBeenCalled();
    });

    it('resolves a recent video placeholder ID using its library path', async () => {
        handleMissingVideo({ ...video, id: -1 });
        await confirm();
        expect(mocks.batchDeleteVideos).toHaveBeenCalledWith([42]);
    });

    it('does not reset the audio media kind if the video player was already closed', async () => {
        handleMissingVideo(video);
        mocks.isVideoMode = false;
        await confirm();
        expect(mocks.setVideoMode).not.toHaveBeenCalled();
        expect(mocks.setVideoMetadata).toHaveBeenCalledWith(null);
    });

    it('only acknowledges an external file without a library identity', async () => {
        mocks.videos = [];
        handleMissingVideo({ ...video, id: -1 });
        expect(mocks.openDeleteConfirm.mock.calls[0][4]).toBe('知道了');
        await confirm();
        expect(mocks.batchDeleteVideos).not.toHaveBeenCalled();
    });

    it('retains the library and queue when removal fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.batchDeleteVideos.mockRejectedValueOnce('database error');
        handleMissingVideo(video);
        await confirm();
        expect(mocks.setVideos).not.toHaveBeenCalled();
        expect(mocks.setVideoQueue).not.toHaveBeenCalled();
        expect(mocks.error).toHaveBeenCalledWith('移除失败，请重试');
    });
});
