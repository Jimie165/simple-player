// import { readFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { SongMetadata } from '@/types';

interface AppDirectories {
    data: string;
    cache: string;
}

let cachedAppDirectories: Promise<AppDirectories> | null = null;

/** Windows 路径忽略大小写；保留 macOS 大小写敏感卷上的文件身份。 */
export function mediaPathKey(path: string): string {
    if (/^[a-z]:[\\/]/i.test(path) || path.startsWith('\\\\') || path.startsWith('//')) {
        return path.replace(/\\/g, '/').toLowerCase();
    }
    return path;
}

function getAppDirectories(): Promise<AppDirectories> {
    cachedAppDirectories ??= invoke<AppDirectories>('get_app_directories').catch(error => {
        cachedAppDirectories = null;
        throw error;
    });
    return cachedAppDirectories;
}

export async function getAppDataDir(): Promise<string> {
    return (await getAppDirectories()).data;
}

export async function getAppCacheDir(): Promise<string> {
    return (await getAppDirectories()).cache;
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
    // 2. 无封面
    return null;
}

export type CoverThumbnailSize = 128 | 512;

/** 返回内置音乐封面对应档位的列表缩略图路径。 */
export function getCoverThumbnailPath(
    path: string | null | undefined,
    size: CoverThumbnailSize,
): string | null {
    if (!path) return null;
    const normalized = path.replace(/\\/g, '/');
    const match = normalized.match(/^(cache\/covers\/)([^/]+)\.(jpg|jpeg|png|gif|webp)$/i);
    if (!match || match[2].includes('.thumb')) return null;
    return `${match[1]}${match[2]}.thumb-${size}.jpg`;
}
