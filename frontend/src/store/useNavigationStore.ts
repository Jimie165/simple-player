import { create } from 'zustand';

// ViewConfig for Overlays
export type ViewType = 'artist_detail' | 'album_detail' | 'playlist_detail';

export interface ViewState {
    type: ViewType;
    data?: any; // artist, album, or playlist data
}

interface NavigationState {
    // Overlay Stack
    // "Base" is handled by App (Home/Library). This stack is purely for overlays.
    overlayStack: ViewState[];

    // Actions
    push: (view: ViewState) => void;
    pop: () => void;
    reset: () => void; // Clear all overlays

    // Computed
    activeOverlay: ViewState | null; // Top of stack
    hasOverlay: boolean;
}

export const useNavigationStore = create<NavigationState>((set) => ({
    overlayStack: [],

    activeOverlay: null,
    hasOverlay: false,

    push: (view) => set((state) => {
        const newStack = [...state.overlayStack, view];
        return {
            overlayStack: newStack,
            activeOverlay: view,
            hasOverlay: true
        };
    }),

    pop: () => set((state) => {
        if (state.overlayStack.length === 0) return state;
        const newStack = state.overlayStack.slice(0, -1);
        return {
            overlayStack: newStack,
            activeOverlay: newStack.length > 0 ? newStack[newStack.length - 1] : null,
            hasOverlay: newStack.length > 0
        };
    }),

    reset: () => set({
        overlayStack: [],
        activeOverlay: null,
        hasOverlay: false
    })
}));

