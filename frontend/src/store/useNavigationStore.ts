import { create } from 'zustand';
import type { PageId } from '@/types/index';
import type { CoverTransitionSource } from '@/utils/viewTransition';
import { captureReturnCover } from '@/utils/viewTransition';

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

    // Drop artwork after handoff, but retain exit geometry until the next return.
    returnCoverSource: CoverTransitionSource | null;
    releaseReturnCover: (coverId: string) => void;
    completeReturnCoverFlight: (coverId: string) => void;
    finishReturnCoverHandoff: (coverId: string) => void;

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
    returnCoverSource: null,
    releaseReturnCover: (coverId) => set(state => {
        const source = state.returnCoverSource;
        if (source?.coverId !== coverId) return state;
        if (!source.flight) return { returnCoverSource: null };
        if (source.flight.ready) return state;
        return { returnCoverSource: { ...source, flight: { ...source.flight, ready: true } } };
    }),
    completeReturnCoverFlight: (coverId) => set(state => {
        const source = state.returnCoverSource;
        if (source?.coverId !== coverId || !source.flight) return state;
        if (source.flight.completed) return state;
        return { returnCoverSource: { ...source, flight: { ...source.flight, completed: true } } };
    }),
    finishReturnCoverHandoff: (coverId) => set(state => {
        const source = state.returnCoverSource;
        return source?.coverId === coverId && source.flight?.completed && source.flight.ready && !source.flight.handedOff
            ? { returnCoverSource: { ...source, images: undefined, flight: { ...source.flight, handedOff: true } } }
            : state;
    }),
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
            returnCoverSource: null,
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
            returnCoverSource: null,
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
                returnCoverSource: null,
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
            returnCoverSource: null,
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
        const returnCoverSource = captureReturnCover(get().activePlaylistDetail?.transitionSource);
        set({ activePlaylistDetail: null, playlistDetailEntered: false, returnCoverSource });
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
            returnCoverSource: null,
            _lastPushedOverlayKey: incomingKey,
            _lastPushedAt: now
        };
    }),

    pop: () => set((state) => {
        if (state.overlayStack.length === 0) return state;
        const returnCoverSource = captureReturnCover(state.activeOverlay?.transitionSource);
        const newStack = state.overlayStack.slice(0, -1);
        return {
            overlayStack: newStack,
            activeOverlay: newStack.length > 0 ? newStack[newStack.length - 1] : null,
            hasOverlay: newStack.length > 0,
            returnCoverSource,
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
                    returnCoverSource: null,
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
        returnCoverSource: null,
        overlayStack: [],
        activeOverlay: null,
        hasOverlay: false
    })
}));

