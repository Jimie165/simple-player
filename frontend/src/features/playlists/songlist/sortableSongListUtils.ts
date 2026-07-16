import type { Modifier } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { SongMetadata } from '@/types';

export function getSongId(song: SongMetadata, index: number): string {
    if (song.unique_id !== undefined && song.unique_id !== null) return song.unique_id.toString();
    if (song.id !== undefined && song.id !== null) return `${song.id}-${index}`;
    return song.path ? `${song.path}-${index}` : `temp-${index}`;
}

export function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getGridTemplateColumns(shouldHideAlbum: boolean, shouldHideArtist = false): string {
    let cols = '24px minmax(0,4fr)';
    if (!shouldHideArtist) cols += ' minmax(0,3fr)';
    if (!shouldHideAlbum) cols += ' minmax(0,3fr)';
    cols += ' 100px 40px';
    return cols;
}

export function createRestrictToViewportModifier(viewportSelector: string): Modifier {
    return ({ transform, draggingNodeRect, containerNodeRect }) => {
        if (!draggingNodeRect || !containerNodeRect) return transform;

        const viewport = document.querySelector(viewportSelector);
        if (!viewport) return transform;

        const viewportRect = viewport.getBoundingClientRect();
        const draggedTop = draggingNodeRect.top + transform.y;
        const draggedBottom = draggingNodeRect.bottom + transform.y;

        let adjustedY = transform.y;

        if (draggedTop < viewportRect.top) {
            adjustedY = transform.y + (viewportRect.top - draggedTop);
        }

        if (draggedBottom > viewportRect.bottom) {
            adjustedY = transform.y - (draggedBottom - viewportRect.bottom);
        }

        return {
            ...transform,
            y: adjustedY,
        };
    };
}

interface BuildReorderedSongsArgs {
    songs: SongMetadata[];
    isSelectionMode: boolean;
    selectedIds: Set<string>;
    activeIdStr: string;
    overIdStr: string;
}

export function buildReorderedSongs({
    songs,
    isSelectionMode,
    selectedIds,
    activeIdStr,
    overIdStr,
}: BuildReorderedSongsArgs): SongMetadata[] | null {
    const isDraggingSelection = isSelectionMode && selectedIds.has(activeIdStr);

    if (isDraggingSelection) {
        if (selectedIds.has(overIdStr)) return null;

        const activeIndex = songs.findIndex((s, i) => getSongId(s, i) === activeIdStr);
        const overIndex = songs.findIndex((s, i) => getSongId(s, i) === overIdStr);

        if (activeIndex === -1 || overIndex === -1) return null;

        const selectedItems: SongMetadata[] = [];
        const unselectedItems: SongMetadata[] = [];

        songs.forEach((s, i) => {
            if (selectedIds.has(getSongId(s, i))) {
                selectedItems.push(s);
            } else {
                unselectedItems.push(s);
            }
        });

        let insertAtIndex = unselectedItems.findIndex((s) => {
            const originalIndex = songs.indexOf(s);
            return getSongId(s, originalIndex) === overIdStr;
        });

        if (insertAtIndex === -1) return null;

        if (activeIndex < overIndex) {
            insertAtIndex += 1;
        }

        const newSongs = [...unselectedItems];
        newSongs.splice(insertAtIndex, 0, ...selectedItems);
        return newSongs;
    }

    if (activeIdStr !== overIdStr) {
        const oldIndex = songs.findIndex((s, i) => getSongId(s, i) === activeIdStr);
        const newIndex = songs.findIndex((s, i) => getSongId(s, i) === overIdStr);

        if (oldIndex !== -1 && newIndex !== -1) {
            return arrayMove(songs, oldIndex, newIndex);
        }
    }

    return null;
}
