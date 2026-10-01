import { describe, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => `asset:${path}` }));
import { buildVideoSrc } from '@/features/player/utils/videoSource';

describe('video source preparation', () => {
    it('never exposes raw MKV to the WebView while remuxing', () => {
        expect(buildVideoSrc('/影片/电影.MKV')).toBe('');
        expect(buildVideoSrc('/影片/电影.MKV', '/缓存/movie.mp4')).toBe('asset:/缓存/movie.mp4');
    });
    it('keeps MP4 playback direct', () => {
        expect(buildVideoSrc('C:/movie.mp4')).toBe('asset:C:/movie.mp4');
        expect(buildVideoSrc('/movie.mp4')).toBe('asset:/movie.mp4');
    });
});
