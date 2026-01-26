import { create } from 'zustand';
import type { PageId } from '../types/index';

// ViewConfig for Overlays
export type ViewType = 'artist_detail' | 'album_detail' | 'playlist_detail';

export interface ViewState {
    type: ViewType;
    data?: any; // artist, album, or playlist data
}

interface MainState {
    page: PageId;
    tab?: string;
    overlayStack?: ViewState[];
}

interface NavigationState {
    // Main Page Navigation
    currentPage: PageId;
    currentTab: string;
    mainHistory: MainState[];

    // Overlay Stack
    overlayStack: ViewState[];

    // Persistent UI State
    lastLibraryTab: string;
    lastArtistDetailTab: string;

    // Actions
    navigate: (page: PageId, tab?: string) => void;
    setTab: (tab: string) => void; // For tab-only changes within current page
    setArtistDetailTab: (tab: string) => void;
    push: (view: ViewState) => void;
    pop: () => void;
    goBack: (onPreBack?: () => boolean) => void;
    reset: () => void; // Clear all overlays

    // Computed
    activeOverlay: ViewState | null; // Top of stack
    hasOverlay: boolean;
}

export const useNavigationStore = create<NavigationState>()((set, get) => ({
    currentPage: 'home',
    currentTab: 'songs',
    mainHistory: [],
    overlayStack: [],
    activeOverlay: null,
    hasOverlay: false,

    // Persistent UI State
    lastLibraryTab: 'songs',
    lastArtistDetailTab: 'songs',

    navigate: (page, tab) => set((state) => {
        // If navigating to the exact same spot, do nothing
        if (state.currentPage === page && (tab === undefined || state.currentTab === tab)) {
            return state;
        }

        const newHistory = [
            ...state.mainHistory,
            {
                page: state.currentPage,
                tab: state.currentTab,
                overlayStack: state.overlayStack.length > 0 ? [...state.overlayStack] : undefined
            }
        ];

        // Resolve target tab
        let targetTab = tab || 'songs';
        if (page === 'library') {
            targetTab = tab || state.lastLibraryTab;
        }

        return {
            currentPage: page,
            currentTab: targetTab,
            mainHistory: newHistory,
            // Clear overlays when explicitly switching main pages
            overlayStack: [],
            activeOverlay: null,
            hasOverlay: false
        };
    }),

    setTab: (tab) => set((state) => {
        if (state.currentTab === tab) return state;
        const newHistory = [
            ...state.mainHistory,
            {
                page: state.currentPage,
                tab: state.currentTab,
                overlayStack: state.overlayStack.length > 0 ? [...state.overlayStack] : undefined
            }
        ];

        // Update persistent state for library
        const updates: Partial<NavigationState> = {
            currentTab: tab,
            mainHistory: newHistory
        };

        if (state.currentPage === 'library') {
            updates.lastLibraryTab = tab;
        }

        return updates;
    }),

    setArtistDetailTab: (tab) => set({ lastArtistDetailTab: tab }),

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

    goBack: (onPreBack) => {
        // 0. Custom pre-back check (e.g. selection mode or full screen)
        if (onPreBack && onPreBack()) return;

        const { overlayStack, mainHistory, pop } = get();

        // 1. Pop Overlays first
        if (overlayStack.length > 0) {
            pop();
            return;
        }

        // 2. Pop Main History
        if (mainHistory.length > 0) {
            const newHistory = [...mainHistory];
            const prevState = newHistory.pop();
            if (prevState) {
                set({
                    currentPage: prevState.page,
                    currentTab: prevState.tab || 'songs',
                    mainHistory: newHistory,
                    overlayStack: prevState.overlayStack ?? [],
                    activeOverlay: prevState.overlayStack && prevState.overlayStack.length > 0
                        ? prevState.overlayStack[prevState.overlayStack.length - 1]
                        : null,
                    hasOverlay: !!(prevState.overlayStack && prevState.overlayStack.length > 0)
                });
            }
        }
    },

    reset: () => set({
        overlayStack: [],
        activeOverlay: null,
        hasOverlay: false
    })
}));

