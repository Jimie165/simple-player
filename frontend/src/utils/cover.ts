import { readFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import type { SongMetadata } from '../types';

let cachedAppDataDir: string | null = null;

async function getAppDataDir(): Promise<string> {
    if (cachedAppDataDir) return cachedAppDataDir;
    cachedAppDataDir = await appDataDir();
    return cachedAppDataDir;
}

export async function resolveCover(song: SongMetadata): Promise<string | null> {
    // 1. 优先使用文件缓存
    if (song.cover_path) {
        try {
            const appData = await getAppDataDir();
            const fullPath = await join(appData, song.cover_path);

            // 使用 readFile 读取二进制数据，绕过 asset 协议的潜在限制
            const data = await readFile(fullPath);
            const blob = new Blob([data]);
            return URL.createObjectURL(blob);
        } catch (error) {
            console.error('Failed to resolve cover path:', song.cover_path, error);
            // Fallback to old cover if read fails?
        }
    }

    // 2. 降级到 Base64 (旧数据)
    if (song.cover) {
        return song.cover;
    }

    // 3. 无封面
    return null;
}
