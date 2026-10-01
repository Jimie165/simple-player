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

export const mediaControlService = {
    async update(metadata: SystemMediaInfo | null, playing: boolean, position: number) {
        if (!systemService.isMacOS) return;
        await invoke('update_macos_media', {
            metadata,
            playing,
            position: Number.isFinite(position) ? Math.max(0, position) : 0,
        });
    },
};
