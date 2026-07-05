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
    let lastQueuedOffset = -1;
    for (let index = nextItems.length - 1; index >= 0; index--) {
        if (nextItems[index].is_queue_item) {
            lastQueuedOffset = index;
            break;
        }
    }
    const entries = nextItems.map((song, index) => ({
        song,
        originalIndex: currentSongIndex + 1 + index,
    }));

    // Keep the displayed queue in playback order. Context songs between the
    // current position and the last manual queue item belong to that queue block.
    const queueList = lastQueuedOffset >= 0
        ? entries.slice(0, lastQueuedOffset + 1)
        : [];
    const nextFromList = entries.slice(lastQueuedOffset + 1);

    return { queueList, nextFromList };
}
