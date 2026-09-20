import { useMemo } from 'react';

import type { SongMetadata } from '@/types';
import { useSongOperations } from '@/hooks/menu/useSongOperations';
import MusicContextMenu from '@/components/common/MusicContextMenu';

export function PlayerMenuButton({ metadata, onClose }: { metadata: SongMetadata; onClose: () => void }) {
    const ops = useSongOperations({
        items: [metadata],
        context: 'other',
        hideSelect: true,
        onNavigate: onClose,
    });

    const filteredGroups = useMemo(() => {
        return ops.menuItems.map(group =>
            group.filter(item => item.id !== 'play' && item.id !== 'delete')
        ).filter(group => group.length > 0);
    }, [ops.menuItems]);

    return (
        <MusicContextMenu
            groups={filteredGroups}
            variant="clean"
            buttonClassName="group/player-menu w-[clamp(1.5rem,3.8vmin,2.25rem)] h-[clamp(1.5rem,3.8vmin,2.25rem)] shrink-0 rounded-full flex items-center justify-center hover:opacity-100!"
        >
            <svg viewBox="0 0 60 60" className="block w-full h-full shrink-0 overflow-visible text-white" fill="currentColor" aria-hidden="true">
                <circle cx="30" cy="30" r="30" className="opacity-10 group-hover/player-menu:opacity-20" />
                <g className="opacity-80">
                    <circle cx="18" cy="30" r="3.5" />
                    <circle cx="30" cy="30" r="3.5" />
                    <circle cx="42" cy="30" r="3.5" />
                </g>
            </svg>
        </MusicContextMenu>
    );
}

export function PlayerMenuWrapper({ metadata, onClose }: { metadata: SongMetadata | null; onClose: () => void }) {
    if (!metadata) return null;
    return <PlayerMenuButton metadata={metadata} onClose={onClose} />;
}
