import { withoutQueueMetadata } from '@/store/actions/queueActions';
import type { RecentItem, SongMetadata } from '@/types';

interface QueueContext {
    type: string;
    name: string;
    id?: string;
}

function recentTracks(songs: SongMetadata[]): SongMetadata[] {
    return songs.flatMap(song => {
        if (!song.path) return [];
        const track = { ...withoutQueueMetadata(song) };
        delete track.cover;
        delete track.lyrics_text;
        return [track];
    });
}

export function playlistSnapshotItem(songs: SongMetadata[], context?: QueueContext): RecentItem {
    const tracks = recentTracks(songs);
    // 曲目也参与哈希，同一页面的两次不同选择可以分别回放。
    const key = JSON.stringify([context?.type, context?.id, context?.name, tracks.map(song => song.path)]);
    let hash = 2166136261;
    for (let index = 0; index < key.length; index++) {
        hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
    }
    const id = `queue:${(hash >>> 0).toString(36)}`;
    return {
        id,
        path: id,
        type: 'playlist',
        title: context?.name ?? '播放列表',
        description: `${tracks.length} 首歌曲`,
        cover_path: tracks.find(song => song.cover_path)?.cover_path,
        lastPlayed: Date.now(),
        songs: tracks,
    };
}

export function artistRecentItem(name: string, songs: SongMetadata[], cover?: string | null): RecentItem {
    const id = `artist:${name}`;
    return {
        id,
        path: id,
        type: 'artist',
        title: name,
        description: '',
        cover_path: cover || null,
        lastPlayed: Date.now(),
        songs: recentTracks(songs),
    };
}
