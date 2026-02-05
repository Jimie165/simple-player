// import { readFile } from '@tauri-apps/plugin-fs';
import { appDataDir, appCacheDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { SongMetadata } from '@/types';

let cachedAppDataDir: string | null = null;
let cachedAppCacheDir: string | null = null;

async function getAppDataDir(): Promise<string> {
    if (cachedAppDataDir) return cachedAppDataDir;
    cachedAppDataDir = await appDataDir();
    return cachedAppDataDir;
}

async function getAppCacheDir(): Promise<string> {
    if (cachedAppCacheDir) return cachedAppCacheDir;
    cachedAppCacheDir = await appCacheDir();
    return cachedAppCacheDir;
}

/**
 * 解析相对路径（从 AppData 或 Cache 目录加载）
 * 用于程序生成的缓存文件（如 cache/covers/abc.jpg）
 */
export async function resolveLocalPath(relativePath: string): Promise<string | null> {
    try {
        let baseDir: string;
        if (relativePath.startsWith('cache/')) {
            baseDir = await getAppCacheDir();
        } else {
            // Default to AppData (Roaming) for 'data/' etc.
            baseDir = await getAppDataDir();
        }

        // 规范化路径分隔符，确保 join 能正确处理
        const normalizedPath = relativePath.replace(/\\/g, '/');
        const fullPath = await join(baseDir, normalizedPath);

        // 直接转换为 asset 协议 URL，让浏览器去加载
        return convertFileSrc(fullPath, 'asset');
    } catch (error) {
        console.warn(`[resolveLocalPath] Failed for path: "${relativePath}"`, error);
        return null;
    }
}

/**
 * 通用媒体路径解析器
 * 
 * 路径类型判断规则：
 * 1. 已是有效 URL（data:, blob:, http:, https:, asset:）→ 直接返回
 * 2. 程序相对路径（cache/ 或 data/ 开头）→ 从 AppData 加载
 * 3. 用户文件绝对路径 → 使用 convertFileSrc 转换
 */
export async function resolveMediaPath(path: string | null | undefined): Promise<string | null> {
    if (!path) return null;

    // 1. 已是有效的 URL/协议
    if (
        path.startsWith('data:') ||
        path.startsWith('blob:') ||
        path.startsWith('http:') ||
        path.startsWith('https:') ||
        path.startsWith('asset:')
    ) {
        return path;
    }

    // 2. 程序相对路径（缓存或用户数据）
    if (path.startsWith('cache/') || path.startsWith('data/')) {
        return await resolveLocalPath(path);
    }

    // 3. 用户文件绝对路径（Windows: 盘符, Unix: /）
    return convertFileSrc(path, 'asset');
}

/**
 * 解析歌曲封面（兼容旧数据）
 */
export async function resolveCover(song: SongMetadata): Promise<string | null> {
    // 1. 优先使用缓存路径
    if (song.cover_path) {
        return await resolveMediaPath(song.cover_path);
    }

    // 2. 降级到 base64（旧数据）
    if (song.cover) {
        return song.cover;
    }

    // 3. 无封面
    return null;
}
