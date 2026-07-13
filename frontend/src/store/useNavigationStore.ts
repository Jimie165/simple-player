import { create } from 'zustand';
import type { PageId } from '@/types/index';

// ViewConfig for Overlays
export type ViewType = 'artist_detail' | 'album_detail';

export interface PlaylistDetailState {
    id: number | 'favorites';
    name: string;
}

export interface ViewState {
    type: ViewType;
    data?: unknown; // artist, album, or playlist data
}

interface MainState {
    page: PageId;
    tab?: string;
    overlayStack?: ViewState[];
    playlistDetail?: PlaylistDetailState | null;
}

interface NavigationState {
    // Main Page Navigation
    currentPage: PageId;
    currentTab: string;
    mainHistory: MainState[];
    activePlaylistDetail: PlaylistDetailState | null;

    // Overlay Stack
    overlayStack: ViewState[];

    // Persistent UI State
    lastLibraryTab: string;
    lastVideoTab: string;
    lastArtistDetailTab: string;

    // Actions
    navigate: (page: PageId, tab?: string) => void;
    setTab: (tab: string) => void; // For tab-only changes within current page
    setArtistDetailTab: (tab: string) => void;
    openPlaylistDetail: (detail: PlaylistDetailState) => void;
    closePlaylistDetail: () => void;
    push: (view: ViewState) => void;
    pop: () => void;
    goBack: (onPreBack?: () => boolean) => void;
    reset: () => void; // Clear all overlays

    // Computed
    activeOverlay: ViewState | null; // Top of stack
    hasOverlay: boolean;

    // Internal guard against rapid duplicate overlay pushes
    _lastPushedOverlayKey: string | null;
    _lastPushedAt: number;
}

const OVERLAY_PUSH_DEBOUNCE_MS = 260;

function getOverlayKey(view: ViewState): string {
    const data = view.data && typeof view.data === 'object'
        ? view.data as Record<string, unknown>
        : undefined;
    const idPart = data?.id ?? data?.name ?? '';
    const artistPart = data?.artist ?? '';
    return `${view.type}:${String(idPart)}:${String(artistPart)}`;
}

export const useNavigationStore = create<NavigationState>()((set, get) => ({
    currentPage: 'home',
    currentTab: 'songs',
    mainHistory: [],
    activePlaylistDetail: null,
    overlayStack: [],
    activeOverlay: null,
    hasOverlay: false,
    _lastPushedOverlayKey: null,
    _lastPushedAt: 0,

    // Persistent UI State
    lastLibraryTab: 'songs',
    lastVideoTab: 'all',
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
                overlayStack: state.overlayStack.length > 0 ? [...state.overlayStack] : undefined,
                playlistDetail: state.activePlaylistDetail,
            }
        ];

        // Resolve target tab
        let targetTab = tab || 'songs';
        if (page === 'library') {
            targetTab = tab || state.lastLibraryTab;
            // Update persistence if explicit tab provided
            if (tab) targetTab = tab;
        } else if (page === 'videos') {
            targetTab = tab || state.lastVideoTab || 'all';
        }

        // Update persistence immediately for target page
        // tailored for library and videos
        const updates: Partial<NavigationState> = {
            currentPage: page,
            currentTab: targetTab,
            mainHistory: newHistory,
            activePlaylistDetail: null,
            overlayStack: [],
            activeOverlay: null,
            hasOverlay: false
        };

        if (page === 'library') updates.lastLibraryTab = targetTab;
        if (page === 'videos') updates.lastVideoTab = targetTab;

        return updates;
    }),

    setTab: (tab) => set((state) => {
        if (state.currentTab === tab) return state;
        const newHistory = [
            ...state.mainHistory,
            {
                page: state.currentPage,
                tab: state.currentTab,
                overlayStack: state.overlayStack.length > 0 ? [...state.overlayStack] : undefined,
                playlistDetail: state.activePlaylistDetail,
            }
        ];

        // Update persistent state for library
        const updates: Partial<NavigationState> = {
            currentTab: tab,
            mainHistory: newHistory
        };

        if (state.currentPage === 'library') {
            updates.lastLibraryTab = tab;
        } else if (state.currentPage === 'videos') {
            updates.lastVideoTab = tab;
        }

        return updates;
    }),

    setArtistDetailTab: (tab) => set({ lastArtistDetailTab: tab }),

    openPlaylistDetail: (detail) => set((state) => {
        if (state.currentPage === 'playlists') {
            return {
                activePlaylistDetail: detail,
                overlayStack: [],
                activeOverlay: null,
                hasOverlay: false,
            };
        }

        return {
            currentPage: 'playlists',
            currentTab: 'songs',
            mainHistory: [
                ...state.mainHistory,
                {
                    page: state.currentPage,
                    tab: state.currentTab,
                    overlayStack: state.overlayStack.length > 0 ? [...state.overlayStack] : undefined,
                    playlistDetail: state.activePlaylistDetail,
                },
            ],
            activePlaylistDetail: detail,
            overlayStack: [],
            activeOverlay: null,
            hasOverlay: false,
        };
    }),

    closePlaylistDetail: () => set({ activePlaylistDetail: null }),

    push: (view) => set((state) => {
        const now = Date.now();
        const incomingKey = getOverlayKey(view);
        const top = state.overlayStack[state.overlayStack.length - 1];
        const topKey = top ? getOverlayKey(top) : null;

        const isSameAsTop = topKey === incomingKey;
        const isRapidDuplicate = state._lastPushedOverlayKey === incomingKey && (now - state._lastPushedAt) < OVERLAY_PUSH_DEBOUNCE_MS;

        if (isSameAsTop || isRapidDuplicate) {
            return {
                _lastPushedOverlayKey: incomingKey,
                _lastPushedAt: now
            };
        }

        const newStack = [...state.overlayStack, view];
        return {
            overlayStack: newStack,
            activeOverlay: view,
            hasOverlay: true,
            _lastPushedOverlayKey: incomingKey,
            _lastPushedAt: now
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

        const { overlayStack, mainHistory, currentPage, activePlaylistDetail, pop } = get();

        // 1. Pop Overlays first
        if (overlayStack.length > 0) {
            pop();
            return;
        }

        // 2. Playlist detail is a first-class page inside the playlists module.
        if (currentPage === 'playlists' && activePlaylistDetail) {
            set({ activePlaylistDetail: null });
            return;
        }

        // 3. Pop Main History
        if (mainHistory.length > 0) {
            const newHistory = [...mainHistory];
            const prevState = newHistory.pop();
            if (prevState) {
                set({
                    currentPage: prevState.page,
                    currentTab: prevState.tab || 'songs',
                    mainHistory: newHistory,
                    activePlaylistDetail: prevState.playlistDetail ?? null,
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

