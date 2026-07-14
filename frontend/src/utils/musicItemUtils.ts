import type { SongMetadata, RecentItem, Playlist } from '@/types';
import { libraryService } from '@/services/libraryService';
import { fileService } from '@/services/fileService';

import type { ArtistData } from '@/features/library/components/ArtistGridView';
import type { AlbumData } from '@/features/library/components/AlbumGridView';
import type { VideoMetadata } from '@/types';
import { songMatchesAlbum } from '@/features/library/utils/grouping';

export type MusicItem = SongMetadata | RecentItem | Playlist | ArtistData | AlbumData | VideoMetadata;
type FlexibleMusicItem = MusicItem & Record<string, unknown>;

function asFlexibleMusicItem(item: unknown): FlexibleMusicItem | null {
    if (!item || typeof item !== 'object') return null;
    return item as FlexibleMusicItem;
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

export function getAlbumMusicItemId(name: string, artist?: string): string {
    const albumName = name.trim() || 'Unknown Album';
    return albumName === 'Unknown Album'
        ? `album:${albumName}:${artist?.trim() || 'Unknown Artist'}`
        : `album:${albumName}`;
}

/**
 * 标准化 MusicItem 以获取 ID 和类型。
 * 兼容 SongMetadata, RecentItem 以及 selectionStore 中的混合对象。
 */
export function getMusicItemId(rawItem: unknown): string {
    const item = asFlexibleMusicItem(rawItem);
    if (!item) return '';

    // 1. If it's a RecentItem or SelectionItem with an explicit type
    const type = item.type;
    if (typeof type === 'string' && ['album', 'artist', 'playlist', 'folder'].includes(type) && item.id !== undefined) {
        return String(item.id);
    }

    // 2. String ID with prefix (standardized)
    if (typeof item.id === 'string' && (
        item.id.startsWith('playlist:') ||
        item.id.startsWith('album:') ||
        item.id.startsWith('artist:')
    )) {
        return item.id;
    }

    // 3. Playlist object detection
    if (item.song_count !== undefined && item.updated_at !== undefined) {
        return `playlist:${item.id}`;
    }

    // 4. Album/Artist object detection (from Grid views)
    if (item.name && item.songs && Array.isArray(item.songs)) {
        if (item.artist && item.albumCount === undefined) {
            // AlbumData
            return getAlbumMusicItemId(asString(item.name), asString(item.artist));
        }
        // ArtistData
        return `artist:${item.name}`;
    }

    // 5. Video detection (usually has path and thumbnail_path but missing artist/album)
    if (item.thumbnail_path && typeof item.path === 'string') return item.path;

    // 6. Default for Song/File: Path is the best unique ID
    if (typeof item.path === 'string') return item.path;

    // 7. Last resort
    if (item.id !== undefined) return String(item.id);
    return '';
}

export function getMusicItemType(rawItem: unknown): string {
    const item = asFlexibleMusicItem(rawItem);
    if (!item) return 'song';
    if (typeof item.type === 'string') return item.type;

    // Video detection FIRST (before playlist, since both can have id and updated_at)
    // Video has: path, thumbnail_path or width/height, but NO artist/album/song_count
    if (item.path && !item.artist && !item.album && item.song_count === undefined) {
        if (item.thumbnail_path || item.width !== undefined || item.height !== undefined) {
            return 'video';
        }
    }

    // Artist / Album check
    if (item.count !== undefined && item.albumCount !== undefined) return 'artist';
    if (item.artist && item.songs && !item.duration) return 'album';

    // Heuristics for Playlist (must have song_count, not just updated_at)
    if (typeof item.id === 'string' && item.id.startsWith('playlist:')) return 'playlist';
    if (item.id !== undefined && item.song_count !== undefined) return 'playlist';

    // Basic heuristics for Song
    if (item.artist && item.album && item.title) return 'song';

    // If it has a path but no other metadata, assumes file
    if (item.path) return 'file';

    return 'song';
}

/**
 * 这是一个复杂的辅助函数，用于将任意选中的项目（包括文件夹、专辑、播放列表、单个文件）
 * 解析为扁平的 SongMetadata 数组。
 * 用于批量播放、添加到播放列表等操作。
 */
export async function resolveSongsFromItems(items: unknown[]): Promise<SongMetadata[]> {
    const songs: SongMetadata[] = [];

    for (const rawItem of items) {
        const item = asFlexibleMusicItem(rawItem);
        if (!item) continue;

        const type = getMusicItemType(item);

        try {
            if (type === 'playlist') {
                const idStr = String(item.id);
                // 处理 "playlist:123" 或 "123"
                const cleanId = idStr.replace('playlist:', '');

                if (cleanId === 'favorites') {
                    const favs = await libraryService.getFavorites();
                    songs.push(...favs);
                } else {
                    const plId = parseInt(cleanId);
                    if (!isNaN(plId)) {
                        const plSongs = await libraryService.getPlaylistSongs(plId);
                        songs.push(...plSongs);
                    }
                }
            } else if (type === 'album') {
                // 优先使用 item.songs 如果已经存在
                if (item.songs && Array.isArray(item.songs) && item.songs.length > 0) {
                    songs.push(...item.songs as SongMetadata[]);
                } else {
                    // 从库中查找
                    const all = await libraryService.scanLibrary();
                    const albumSongs = all.filter(s => songMatchesAlbum(s, asString(item.title), asString(item.artist)));
                    songs.push(...albumSongs);
                }
            } else if (type === 'artist') {
                if (item.songs && Array.isArray(item.songs) && item.songs.length > 0) {
                    songs.push(...item.songs as SongMetadata[]);
                } else {
                    const all = await libraryService.scanLibrary();
                    const artistSongs = all.filter(s => s.artist === asString(item.title)); // Title is usually Artist Name in RecentItem
                    songs.push(...artistSongs);
                }
            } else if (type === 'folder') {
                if (typeof item.path === 'string') {
                    const folderSongs = await fileService.readFolder(item.path);
                    songs.push(...folderSongs);
                }
            } else if (type === 'video' || (item.thumbnail_path && typeof item.path === 'string')) {
                const path = asString(item.path);
                // 视频转歌曲元数据逻辑
                songs.push({
                    id: asNumber(item.id),
                    path,
                    title: asString(item.title) || path.split(/[\\/]/).pop() || 'Unknown Video',
                    artist: 'Video',
                    album: item.folder_id ? 'Folder' : 'Unknown',
                    duration: asNumber(item.duration) ?? 0,
                    cover_path: asString(item.thumbnail_path) || undefined,
                });
            } else if (type === 'file' || type === 'song' || !type) {
                // 单曲逻辑
                if (typeof item.path === 'string') {
                    // 如果已经是完整的 SongMetadata (通常来自库)
                    if (typeof item.id === 'number' && item.title && item.artist) {
                        songs.push(item as SongMetadata);
                    } else {
                        // 可能是 RecentItem (file类型)，缺少完整元数据
                        // 尝试获取元数据
                        let meta: SongMetadata | null = null;
                        try {
                            meta = await fileService.getMetadata(item.path);
                        } catch (error) {
                            console.warn(`Failed to read metadata for ${item.path}`, error);
                        }

                        if (meta) {
                            songs.push(meta);
                        } else {
                            // 构造一个临时的
                            songs.push({
                                id: asNumber(item.id),
                                path: item.path,
                                title: asString(item.title) || item.path.split(/[\\/]/).pop() || 'Unknown',
                                artist: asString(item.artist) || asString(item.description) || 'Unknown Artist',
                                album: asString(item.album) || 'Unknown Album',
                                duration: asNumber(item.duration) ?? 0,
                                cover: null,
                                cover_path: asString(item.cover_path) || null,
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to resolve songs for item ${item.title || item.id}`, error);
        }
    }

    return songs;
}
