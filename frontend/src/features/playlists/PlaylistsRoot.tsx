import { useLayoutEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import PlaylistDetail from '@/features/playlists/detail/PlaylistDetail';
import PlaylistList from '@/features/playlists/PlaylistList';
import { useNavigationStore } from '@/store/useNavigationStore';

export default function PlaylistsRoot() {
    const activePlaylistDetail = useNavigationStore((state) => state.activePlaylistDetail);
    const rootRef = useRef<HTMLDivElement>(null);
    const previousPageKey = useRef('list');
    const scrollPositions = useRef(new Map<string, number>());
    const pageKey = activePlaylistDetail
        ? `detail:${activePlaylistDetail.id}`
        : 'list';

    useLayoutEffect(() => {
        const viewport = rootRef.current?.closest<HTMLElement>('[data-scroll-viewport]');
        if (!viewport) return;

        scrollPositions.current.set(previousPageKey.current, viewport.scrollTop);
        viewport.scrollTop = scrollPositions.current.get(pageKey) ?? 0;
        previousPageKey.current = pageKey;
    }, [pageKey]);

    return (
        <div ref={rootRef} className="min-h-full">
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={pageKey}
                    initial={{ opacity: 0, y: 14, scale: 0.99 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.995 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className={activePlaylistDetail
                        ? '-mt-12 min-h-[calc(100%+3rem)] origin-top'
                        : 'min-h-full origin-top'
                    }
                >
                    {activePlaylistDetail ? (
                        <PlaylistDetail
                            id={activePlaylistDetail.id}
                            name={activePlaylistDetail.name}
                        />
                    ) : (
                        <PlaylistList />
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
