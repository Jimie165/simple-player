import { useMemo } from 'react';
import { IoEllipsisHorizontal } from 'react-icons/io5';

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
            buttonClassName="w-[clamp(1.5rem,3.8vmin,2.25rem)] h-[clamp(1.5rem,3.8vmin,2.25rem)] rounded-full bg-white/10 ring-1 ring-white/10 hover:bg-white/20 flex items-center justify-center transition-all backdrop-blur-md text-white/50 hover:text-white"
        >
            <IoEllipsisHorizontal className="w-[60%] h-[60%]" />
        </MusicContextMenu>
    );
}

export function PlayerMenuWrapper({ metadata, onClose }: { metadata: SongMetadata | null; onClose: () => void }) {
    if (!metadata) return null;
    return <PlayerMenuButton metadata={metadata} onClose={onClose} />;
}
