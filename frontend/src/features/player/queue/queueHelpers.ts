import type { SongMetadata } from '@/types';

export interface QueueEntry {
    song: SongMetadata;
    originalIndex: number;
}

export const VIRTUOSO_OVERSCAN = 600;

/**
 * 生成队列项稳定标识，确保拖拽与虚拟列表一致。
 */
export function getQueueItemId(entry: QueueEntry): string {
    return `${entry.originalIndex}-${entry.song.id || entry.song.path}`;
}

/**
 * 按当前播放位置拆分“队列中的下一首歌”和“下一首”。
 */
export function splitQueueEntries(
    playlist: SongMetadata[],
    currentSongIndex: number
): { queueList: QueueEntry[]; nextFromList: QueueEntry[] } {
    const nextItems = playlist.slice(currentSongIndex + 1);
    const queueList: QueueEntry[] = [];
    const nextFromList: QueueEntry[] = [];

    nextItems.forEach((song, index) => {
        const originalIndex = currentSongIndex + 1 + index;
        if (song.is_queue_item) {
            queueList.push({ song, originalIndex });
        } else {
            nextFromList.push({ song, originalIndex });
        }
    });

    return { queueList, nextFromList };
}
