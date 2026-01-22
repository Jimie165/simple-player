import { create } from 'zustand';
import type { SongMetadata } from '../types';

interface AddToPlaylistState {
    isOpen: boolean;
    songsToAdd: SongMetadata[]; // Can be single or multiple
    open: (songs: SongMetadata | SongMetadata[]) => void;
    close: () => void;
}

export const useAddToPlaylistStore = create<AddToPlaylistState>((set) => ({
    isOpen: false,
    songsToAdd: [],
    open: (songs) => set({
        isOpen: true,
        songsToAdd: Array.isArray(songs) ? songs : [songs]
    }),
    close: () => set({ isOpen: false, songsToAdd: [] }),
}));
