import { getDetailMotion } from '@/utils/viewTransition';
import type { CoverTransitionSource } from '@/utils/viewTransition';
import { AnimatePresence } from 'framer-motion';
import ArtworkThemeLayer from '@/components/layout/ArtworkThemeLayer';
import ScrollArea from '@/components/common/ScrollArea';
import PlaylistDetail from '@/features/playlists/detail/PlaylistDetail';
import PlaylistList from '@/features/playlists/PlaylistList';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useThemeStore } from '@/store/useThemeStore';

export default function PlaylistsRoot() {
    const activePlaylistDetail = useNavigationStore((state) => state.activePlaylistDetail);
    const entered = useNavigationStore((state) => state.playlistDetailEntered);

    // Suppress the covered list's paint while retaining measurable return targets.
    return (
        <div
            className={activePlaylistDetail && entered ? 'min-h-full opacity-0' : 'min-h-full'}
            inert={!!activePlaylistDetail}
            aria-hidden={!!activePlaylistDetail}
        >
            <PlaylistList />
        </div>
    );
}

/** Keep the source cards and their scroll position intact throughout the return transition. */
export function PlaylistDetailOverlay() {
    const detail = useNavigationStore((state) => state.activePlaylistDetail);
    const coverTransition = useNavigationStore((state) => state.coverTransition);
    const moreTransitionsEnabled = useThemeStore(state => state.moreTransitionsEnabled);

    return (
        <AnimatePresence initial={false} custom={coverTransition}>
            {detail && (
                <ArtworkThemeLayer
                    key={detail.id}
                    data-transition-layer={detail.transitionSource?.coverId}
                    {...getDetailMotion(detail.transitionSource, undefined, moreTransitionsEnabled)}
                    variants={{
                        exit: (returnSource: CoverTransitionSource | null) =>
                            getDetailMotion(detail.transitionSource, returnSource, moreTransitionsEnabled).exit,
                    }}
                    exit="exit"
                    onAnimationComplete={(definition) => {
                        if (definition !== 'exit') {
                            useNavigationStore.getState().completePlaylistDetailEnter(detail);
                        }
                    }}
                    className="absolute inset-0 z-50 overflow-hidden bg-surface dark:bg-surface-container-low"
                >
                    <div data-tauri-drag-region className="absolute top-0 left-0 right-0 h-6 z-100 bg-transparent" />
                    <ScrollArea className="h-full" topOffset={48}>
                        <div className="min-h-full pb-24">
                            <PlaylistDetail
                                id={detail.id}
                                name={detail.name}
                                transitionSource={detail.transitionSource}
                            />
                        </div>
                    </ScrollArea>
                </ArtworkThemeLayer>
            )}
        </AnimatePresence>
    );
}
