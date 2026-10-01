import { convertFileSrc } from '@tauri-apps/api/core';

export function isMkvPath(path?: string | null): boolean {
    return (path ?? '').toLowerCase().endsWith('.mkv');
}

export function buildVideoSrc(path?: string | null, preparedPath?: string | null): string {
    if (!path || (isMkvPath(path) && !preparedPath)) return '';
    const resolvedPath = preparedPath ?? path;
    return convertFileSrc(resolvedPath, 'asset');
}

export function inferVideoMimeType(path?: string | null, preparedPath?: string | null): string | undefined {
    const resolvedPath = (preparedPath ?? path ?? '').toLowerCase();
    if (resolvedPath.endsWith('.mp4')) return 'video/mp4';
    if (resolvedPath.endsWith('.webm')) return 'video/webm';
    if (resolvedPath.endsWith('.mov')) return 'video/quicktime';
    if (resolvedPath.endsWith('.avi')) return 'video/x-msvideo';
    if (resolvedPath.endsWith('.mkv')) return 'video/x-matroska';
    if (resolvedPath.endsWith('.flv')) return 'video/x-flv';
    return undefined;
}
