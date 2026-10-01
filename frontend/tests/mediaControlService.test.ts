import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), platform: { isMacOS: true } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@/services/systemService', () => ({ systemService: mocks.platform }));

import { mediaControlService } from '@/services/mediaControlService';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.platform.isMacOS = true;
    mocks.invoke.mockResolvedValue(undefined);
});

describe('native media session bridge', () => {
    it('preserves Unicode metadata and relative artwork paths for backend resolution', async () => {
        const metadata = {
            title: 'それを世界と言うんだね', artist: '花譜', album: '狂想',
            cover_path: 'cache/covers/封面 图片.jpg', duration: 239,
        };
        await mediaControlService.update(metadata, true, 12.5);
        expect(mocks.invoke).toHaveBeenCalledWith('update_macos_media', {
            metadata, playing: true, position: 12.5,
        });
    });

    it('clears the session and avoids invalid JSON progress values', async () => {
        await mediaControlService.update(null, false, NaN);
        expect(mocks.invoke).toHaveBeenCalledWith('update_macos_media', {
            metadata: null, playing: false, position: 0,
        });
    });

    it('leaves Windows SMTC in charge', async () => {
        mocks.platform.isMacOS = false;
        await mediaControlService.update(null, false, 0);
        expect(mocks.invoke).not.toHaveBeenCalled();
    });
});
