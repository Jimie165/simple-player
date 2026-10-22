import { create } from 'zustand';
import type { PageId } from '@/types/index';
import type { CoverTransitionFrame, CoverTransitionSource } from '@/utils/viewTransition';
import { captureReturnCover } from '@/utils/viewTransition';
import { useThemeStore } from '@/store/useThemeStore';

// ViewConfig for Overlays
export type ViewType = 'artist_detail' | 'album_detail';

export interface PlaylistDetailState {
    id: number | 'favorites';
    name: string;
    transitionSource?: CoverTransitionSource;
}

export interface ViewState {
    type: ViewType;
    data?: unknown; // artist, album, or playlist data
    transitionSource?: CoverTransitionSource;
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
    playlistDetailEntered: boolean;

    // One moving cover, shared by entry and return; no per-card animation registry.
    coverTransition: CoverTransitionSource | null;
    startCoverEnter: (source: CoverTransitionSource, target: CoverTransitionFrame, scroll: { top: number; left: number }) => void;
    releaseCoverTransition: (coverId: string, from: CoverTransitionFrame) => void;
    completeCoverTransition: (coverId: string, from: CoverTransitionFrame) => void;
    finishCoverTransition: (coverId: string) => void;
    clearCoverTransition: () => void;

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
    completePlaylistDetailEnter: (detail: PlaylistDetailState) => void;
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

function historyCover(source?: CoverTransitionSource): CoverTransitionSource | undefined {
    return source ? { ...source, images: undefined, flight: undefined } : undefined;
}

/** History restores details through their existing loaders, without retaining song datasets. */
function appendMainHistory(state: NavigationState): MainState[] {
    return [
        ...state.mainHistory,
        {
            page: state.currentPage,
            tab: state.currentTab,
            overlayStack: state.overlayStack.length > 0 ? state.overlayStack.map(view => ({
                ...view,
                data: view.data && typeof view.data === 'object' ? { ...view.data, songs: [] } : view.data,
                transitionSource: historyCover(view.transitionSource),
            })) : undefined,
            playlistDetail: state.activePlaylistDetail ? {
                ...state.activePlaylistDetail,
                transitionSource: historyCover(state.activePlaylistDetail.transitionSource),
            } : null,
        },
    ];
}

function getOverlayKey(view: ViewState): string {
    const data = view.data && typeof view.data === 'object'
        ? view.data as Record<string, unknown>
        : undefined;
    const idPart = data?.id ?? data?.name ?? '';
    const artistPart = view.type === 'album_detail' && idPart === 'Unknown Album'
        ? `:${String(data?.artist ?? 'Unknown Artist')}`
        : '';
    return `${view.type}:${String(idPart)}${artistPart}`;
}

export const useNavigationStore = create<NavigationState>()((set, get) => ({
    currentPage: 'home',
    currentTab: 'songs',
    mainHistory: [],
    activePlaylistDetail: null,
    playlistDetailEntered: false,
    coverTransition: null,
    startCoverEnter: (source, target, scroll) => set(state => {
        const activeSource = state.hasOverlay
            ? state.activeOverlay?.transitionSource
            : state.activePlaylistDetail?.transitionSource;
        if (!useThemeStore.getState().moreTransitionsEnabled || activeSource !== source || !source.frame || !source.images?.length
            || state.coverTransition?.flight?.direction === 'return'
            || state.coverTransition?.frame === source.frame) return state;
        return { coverTransition: { ...source, flight: {
            direction: 'enter', from: source.frame, to: target, scroll,
        } } };
    }),
    releaseCoverTransition: (coverId, from) => set(state => {
        const source = state.coverTransition;
        if (!source || source.coverId !== coverId || !source.flight || source.flight.from !== from) return state;
        if (source.flight.ready) return state;
        return { coverTransition: { ...source, flight: { ...source.flight, ready: true } } };
    }),
    completeCoverTransition: (coverId, from) => set(state => {
        const source = state.coverTransition;
        if (!source || source.coverId !== coverId || !source.flight || source.flight.from !== from) return state;
        if (source.flight.completed) return state;
        return { coverTransition: { ...source, flight: { ...source.flight, completed: true } } };
    }),
    finishCoverTransition: (coverId) => set(state => {
        const source = state.coverTransition;
        return source?.coverId === coverId && source.flight?.completed && source.flight.ready && !source.flight.handedOff
            ? { coverTransition: { ...source, images: source.flight.direction === 'enter' ? source.images : undefined,
                flight: { ...source.flight, handedOff: true } } }
            : state;
    }),
    clearCoverTransition: () => set({ coverTransition: null }),
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

        const newHistory = appendMainHistory(state);

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
            coverTransition: null,
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
        const newHistory = appendMainHistory(state);

        // Update persistent state for library
        const updates: Partial<NavigationState> = {
            currentTab: tab,
            mainHistory: newHistory,
            coverTransition: null,
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
                playlistDetailEntered: false,
                coverTransition: null,
                overlayStack: [],
                activeOverlay: null,
                hasOverlay: false,
            };
        }

        return {
            currentPage: 'playlists',
            currentTab: 'songs',
            mainHistory: appendMainHistory(state),
            activePlaylistDetail: detail,
            playlistDetailEntered: false,
            coverTransition: null,
            overlayStack: [],
            activeOverlay: null,
            hasOverlay: false,
        };
    }),

    completePlaylistDetailEnter: (detail) => set(state =>
        state.activePlaylistDetail === detail && !state.playlistDetailEntered
            ? { playlistDetailEntered: true }
            : state),

    closePlaylistDetail: () => {
        const coverTransition = useThemeStore.getState().moreTransitionsEnabled
            ? captureReturnCover(get().activePlaylistDetail?.transitionSource) : null;
        set({ activePlaylistDetail: null, playlistDetailEntered: false, coverTransition });
    },

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
            coverTransition: null,
            _lastPushedOverlayKey: incomingKey,
            _lastPushedAt: now
        };
    }),

    pop: () => set((state) => {
        if (state.overlayStack.length === 0) return state;
        const coverTransition = useThemeStore.getState().moreTransitionsEnabled
            ? captureReturnCover(state.activeOverlay?.transitionSource) : null;
        const newStack = state.overlayStack.slice(0, -1);
        return {
            overlayStack: newStack,
            activeOverlay: newStack.length > 0 ? newStack[newStack.length - 1] : null,
            hasOverlay: newStack.length > 0,
            coverTransition,
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
            get().closePlaylistDetail();
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
                    coverTransition: null,
                    activePlaylistDetail: prevState.playlistDetail ?? null,
                    playlistDetailEntered: false,
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
        coverTransition: null,
        overlayStack: [],
        activeOverlay: null,
        hasOverlay: false
    })
}));

