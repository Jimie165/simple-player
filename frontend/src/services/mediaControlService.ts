import { invoke } from '@tauri-apps/api/core';
import { systemService } from '@/services/systemService';

export interface SystemMediaInfo {
    title: string;
    artist: string;
    album: string;
    cover_path: string | null;
    duration: number;
}

export interface SystemMediaAction {
    action: 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'seek';
    position: number | null;
}

// Keep audio/video transitions and play/pause snapshots in their original order.
let pendingUpdate: Promise<unknown> = Promise.resolve();

export const mediaControlService = {
    async update(metadata: SystemMediaInfo | null, playing: boolean, position: number) {
        if (!systemService.isMacOS) return;
        const update = pendingUpdate.then(() => invoke('update_macos_media', {
            metadata,
            playing,
            position: Number.isFinite(position) ? Math.max(0, position) : 0,
        }));
        pendingUpdate = update.catch(() => undefined);
        await update;
    },
};
