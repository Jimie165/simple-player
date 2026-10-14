import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    effects: [] as Array<() => void | (() => void)>,
    setters: [] as Array<ReturnType<typeof vi.fn>>,
    fileExists: vi.fn(), invoke: vi.fn(), listen: vi.fn(), unlisten: vi.fn(),
}));
vi.mock('react', () => ({
    useRef: (value: unknown) => ({ current: value }),
    useState: (value: unknown) => {
        const setter = vi.fn();
        mocks.setters.push(setter);
        return [value, setter];
    },
    useEffect: (effect: () => void | (() => void)) => mocks.effects.push(effect),
}));
vi.mock('@/services/videoService', () => ({ videoService: { fileExists: mocks.fileExists } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));

import { useMkvPrepare } from '@/features/player/hooks/useMkvPrepare';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.effects.length = 0;
    mocks.setters.length = 0;
    mocks.fileExists.mockResolvedValue(true);
    mocks.invoke.mockResolvedValue('D:/Cache/prepared.mp4');
    mocks.listen.mockResolvedValue(mocks.unlisten);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

function PrepareVideo(path: string) {
    const onPrepareError = vi.fn();
    useMkvPrepare({
        isOpen: true, sourcePath: path, isMkv: path.endsWith('.mkv'),
        supportsHevc: false, supportsAv1: false, supportedAudioCodecs: ['aac'], onPrepareError,
    });
    mocks.effects[0]();
    const cleanup = mocks.effects[1]();
    return { onPrepareError, cleanup };
}

describe('video file preflight', () => {
    it('checks a direct MP4 before exposing its source without invoking transcoding', async () => {
        PrepareVideo('D:/Video/movie.mp4');
        expect(mocks.setters[0]).not.toHaveBeenCalledWith(expect.objectContaining({ path: 'D:/Video/movie.mp4' }));
        await vi.waitFor(() => expect(mocks.setters[0]).toHaveBeenCalledWith({ source: 'D:/Video/movie.mp4', path: 'D:/Video/movie.mp4' }));
        expect(mocks.fileExists).toHaveBeenCalledWith('D:/Video/movie.mp4');
        expect(mocks.invoke).not.toHaveBeenCalled();
        expect(mocks.listen).not.toHaveBeenCalled();
    });

    it.each(['mp4', 'mkv'])('reports a missing %s before media loading or cache preparation', async extension => {
        mocks.fileExists.mockResolvedValue(false);
        const { onPrepareError } = PrepareVideo(`D:/Video/missing.${extension}`);
        await vi.waitFor(() => expect(onPrepareError).toHaveBeenCalledWith(expect.objectContaining({ message: 'VIDEO_FILE_NOT_FOUND' })));
        expect(mocks.invoke).not.toHaveBeenCalled();
        expect(mocks.listen).not.toHaveBeenCalled();
        expect(mocks.setters[0]).not.toHaveBeenCalledWith(expect.objectContaining({ path: expect.any(String) }));
    });

    it('keeps permission errors distinct from missing files', async () => {
        mocks.fileExists.mockRejectedValue('Access denied');
        const { onPrepareError } = PrepareVideo('D:/Video/movie.mp4');
        await vi.waitFor(() => expect(onPrepareError).toHaveBeenCalledWith('Access denied'));
        expect(mocks.invoke).not.toHaveBeenCalled();
    });

    it('ignores a check completed after closing or switching videos', async () => {
        let finish: ((exists: boolean) => void) | undefined;
        mocks.fileExists.mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve; }));
        const { cleanup, onPrepareError } = PrepareVideo('D:/Video/old.mkv');
        if (typeof cleanup === 'function') cleanup();
        finish?.(false);
        await Promise.resolve();
        await Promise.resolve();
        expect(onPrepareError).not.toHaveBeenCalled();
        expect(mocks.invoke).not.toHaveBeenCalled();
    });

    it('prepares an existing MKV and releases its progress listener', async () => {
        const { cleanup } = PrepareVideo('D:/Video/movie.mkv');
        await vi.waitFor(() => expect(mocks.setters[0]).toHaveBeenCalledWith({ source: 'D:/Video/movie.mkv', path: 'D:/Cache/prepared.mp4' }));
        expect(mocks.invoke).toHaveBeenCalledWith('prepare_video_for_playback', {
            path: 'D:/Video/movie.mkv', supportsHevc: false, supportsAv1: false, supportedAudioCodecs: ['aac'],
        });
        if (typeof cleanup === 'function') cleanup();
        expect(mocks.unlisten).toHaveBeenCalledOnce();
    });
});
