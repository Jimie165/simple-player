import { getDetailMotion, pageMotion } from '@/utils/viewTransition';
import { AnimatePresence } from 'framer-motion';
import ArtworkThemeLayer from '@/components/layout/ArtworkThemeLayer';
import ScrollArea from '@/components/common/ScrollArea';
import PlaylistDetail from '@/features/playlists/detail/PlaylistDetail';
import PlaylistList from '@/features/playlists/PlaylistList';
import { useNavigationStore } from '@/store/useNavigationStore';
import { useThemeStore } from '@/store/useThemeStore';

export default function PlaylistsRoot({ isPageVisible }: { isPageVisible: boolean }) {
    const activePlaylistDetail = useNavigationStore((state) => state.activePlaylistDetail);
    const entered = useNavigationStore((state) => state.playlistDetailEntered);

    // Suppress the covered list's paint while retaining measurable return targets.
    return (
        <div
            className={activePlaylistDetail && entered ? 'min-h-full opacity-0' : 'min-h-full'}
            inert={!!activePlaylistDetail}
            aria-hidden={!!activePlaylistDetail}
        >
            <PlaylistList isVisible={isPageVisible && !activePlaylistDetail} />
        </div>
    );
}

/** Keep the source cards and their scroll position intact throughout the return transition. */
export function PlaylistDetailOverlay({ isVisible }: { isVisible: boolean }) {
    const currentPage = useNavigationStore((state) => state.currentPage);
    const detail = useNavigationStore((state) => state.activePlaylistDetail);
    const coverTransition = useNavigationStore((state) => state.coverTransition);
    const moreTransitionsEnabled = useThemeStore(state => state.moreTransitionsEnabled);

    return (
        <AnimatePresence initial={false} custom={{ page: currentPage, coverTransition }}>
            {detail && (
                <ArtworkThemeLayer
                    key={detail.id}
                    data-transition-layer={detail.transitionSource?.coverId}
                    {...getDetailMotion(detail.transitionSource, undefined, moreTransitionsEnabled)}
                    variants={{
                        exit: (context: { page: string; coverTransition: typeof coverTransition }) =>
                            context.page !== currentPage
                                ? { ...pageMotion.exit, x: '0%', clipPath: 'inset(0% 0% 0% 0% round 0px)', transition: pageMotion.transition }
                                : getDetailMotion(detail.transitionSource, context.coverTransition, moreTransitionsEnabled).exit,
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
                                isVisible={isVisible}
                            />
                        </div>
                    </ScrollArea>
                </ArtworkThemeLayer>
            )}
        </AnimatePresence>
    );
}
