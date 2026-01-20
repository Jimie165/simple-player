import { create } from 'zustand';


export type ViewType = 'library' | 'artist_detail' | 'album_detail' | 'playlist_list' | 'playlist_detail';

export interface ViewState {
    type: ViewType;
    data?: any; // artist or album data
    tab?: 'songs' | 'albums' | 'artists'; // For library view
    // Optional: title for the header, etc.
}

interface NavigationState {
    // History Stack
    history: ViewState[];

    // Actions
    push: (view: ViewState) => void;
    pop: () => void;
    replace: (view: ViewState) => void;
    reset: () => void; // Go back to root
    clearSubviews: () => void; // Remove detail views, keep tabs

    // Computed
    currentView: ViewState;
    canGoBack: boolean;

    // Legacy (to be removed or adapted if needed, but we'll likely drop it)
    // customBackHandler: (() => void) | null;
    // setCustomBackHandler: (handler: (() => void) | null) => void;
}

// Initial State
const INITIAL_VIEW: ViewState = { type: 'library', tab: 'songs' };

export const useNavigationStore = create<NavigationState>((set) => ({
    history: [INITIAL_VIEW],

    currentView: INITIAL_VIEW,
    canGoBack: false,

    push: (view) => set((state) => {
        const newHistory = [...state.history, view];
        return {
            history: newHistory,
            currentView: view,
            canGoBack: newHistory.length > 1
        };
    }),

    pop: () => set((state) => {
        if (state.history.length <= 1) return state;
        const newHistory = state.history.slice(0, -1);
        return {
            history: newHistory,
            currentView: newHistory[newHistory.length - 1],
            canGoBack: newHistory.length > 1
        };
    }),

    replace: (view) => set((state) => {
        // Replace current view (top of stack)
        const newHistory = [...state.history.slice(0, -1), view];
        return {
            history: newHistory,
            currentView: view,
            canGoBack: newHistory.length > 1
        };
    }),

    reset: () => set({
        history: [INITIAL_VIEW],
        currentView: INITIAL_VIEW,
        canGoBack: false
    }),

    clearSubviews: () => set((state) => {
        // Find the last view that is a 'library' root view (has a tab)
        // Actually, just type === 'library'
        // We want to keep the stack up to the last library tab, but remove any detail views on top of it.
        // If the stack is [Lib(Songs), Lib(Albums), AlbumDetail], we want [Lib(Songs), Lib(Albums)].
        let lastLibIndex = -1;
        for (let i = state.history.length - 1; i >= 0; i--) {
            if (state.history[i].type === 'library') {
                lastLibIndex = i;
                break;
            }
        }

        if (lastLibIndex !== -1) {
            const newHistory = state.history.slice(0, lastLibIndex + 1);
            return {
                history: newHistory,
                currentView: newHistory[newHistory.length - 1],
                canGoBack: newHistory.length > 1
            };
        }

        // If no library view found (unlikely), reset to initial
        return {
            history: [INITIAL_VIEW],
            currentView: INITIAL_VIEW,
            canGoBack: false
        };
    })
}));
