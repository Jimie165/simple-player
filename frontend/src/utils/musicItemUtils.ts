import type { SongMetadata, RecentItem, Playlist } from '@/types';
import { libraryService } from '@/services/libraryService';
import { fileService } from '@/services/fileService';

import type { ArtistData } from '@/features/library/components/ArtistGridView';
import type { AlbumData } from '@/features/library/components/AlbumGridView';
import type { VideoMetadata } from '@/types';

export type MusicItem = SongMetadata | RecentItem | Playlist | ArtistData | AlbumData | VideoMetadata;

/**
 * 标准化 MusicItem 以获取 ID 和类型。
 * 兼容 SongMetadata, RecentItem 以及 selectionStore 中的混合对象。
 */
export function getMusicItemId(item: any): string {
    if (!item) return '';

    // 1. If it's a RecentItem or SelectionItem with an explicit type
    const type = item.type;
    if (type && ['album', 'artist', 'playlist', 'folder'].includes(type) && item.id !== undefined) {
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
            return `album:${item.name}:${item.artist}`;
        }
        // ArtistData
        return `artist:${item.name}`;
    }

    // 5. Video detection (usually has path and thumbnail_path but missing artist/album)
    if (item.thumbnail_path && item.path) return item.path;

    // 6. Default for Song/File: Path is the best unique ID
    if (item.path) return item.path;

    // 7. Last resort
    if (item.id !== undefined) return String(item.id);
    return '';
}

export function getMusicItemType(item: any): string {
    if (!item) return 'song';
    if (item.type) return item.type;

    // Video detection FIRST (before playlist, since both can have id and updated_at)
    // Video has: path, thumbnail_path or width/height, but NO artist/album/song_count
    if (item.path && !item.artist && !item.album && item.song_count === undefined) {
        if (item.thumbnail_path || item.width !== undefined || item.height !== undefined) {
            return 'video';
        }
    }

    // Artist / Album check
    if ((item as any).count !== undefined && (item as any).albumCount !== undefined) return 'artist';
    if ((item as any).artist && (item as any).songs && !(item as any).duration) return 'album';

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
export async function resolveSongsFromItems(items: any[]): Promise<SongMetadata[]> {
    const songs: SongMetadata[] = [];

    for (const item of items) {
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
                    songs.push(...item.songs);
                } else {
                    // 从库中查找
                    const all = await libraryService.scanLibrary();
                    const albumSongs = all.filter(s =>
                        s.album === item.title &&
                        (item.artist ? s.artist === item.artist : true)
                    );
                    songs.push(...albumSongs);
                }
            } else if (type === 'artist') {
                if (item.songs && Array.isArray(item.songs) && item.songs.length > 0) {
                    songs.push(...item.songs);
                } else {
                    const all = await libraryService.scanLibrary();
                    const artistSongs = all.filter(s => s.artist === item.title); // Title is usually Artist Name in RecentItem
                    songs.push(...artistSongs);
                }
            } else if (type === 'folder') {
                if (item.path) {
                    const folderSongs = await fileService.readFolder(item.path);
                    songs.push(...folderSongs);
                }
            } else if (type === 'video' || (item.thumbnail_path && item.path)) {
                // 视频转歌曲元数据逻辑
                songs.push({
                    id: typeof item.id === 'number' ? item.id : undefined,
                    path: item.path,
                    title: item.title || item.path.split(/[\\/]/).pop() || 'Unknown Video',
                    artist: 'Video',
                    album: item.folder_id ? 'Folder' : 'Unknown',
                    duration: item.duration || 0,
                    cover_path: item.thumbnail_path,
                });
            } else if (type === 'file' || type === 'song' || !type) {
                // 单曲逻辑
                if (item.path) {
                    // 如果已经是完整的 SongMetadata (通常来自库)
                    if (typeof item.id === 'number' && item.title && item.artist) {
                        songs.push(item as SongMetadata);
                    } else {
                        // 可能是 RecentItem (file类型)，缺少完整元数据
                        // 尝试获取元数据
                        let meta: SongMetadata | null = null;
                        try {
                            meta = await fileService.getMetadata(item.path);
                        } catch { }

                        if (meta) {
                            songs.push(meta);
                        } else {
                            // 构造一个临时的
                            songs.push({
                                id: typeof item.id === 'number' ? item.id : undefined,
                                path: item.path,
                                title: item.title || item.path.split(/[\\/]/).pop() || 'Unknown',
                                artist: item.artist || item.description || 'Unknown Artist',
                                album: item.album || 'Unknown Album',
                                duration: item.duration || 0,
                                cover: item.cover || null,
                                cover_path: item.cover_path || null,
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
