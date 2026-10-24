import { useState } from 'react';
import { MdAdd } from 'react-icons/md';
import PlaylistSearchControl from '@/features/playlists/detail/PlaylistSearchControl';

interface PlaylistListActionsProps {
    searchQuery: string;
    setSearchQuery: (value: string) => void;
    setIsCreateOpen: (value: boolean) => void;
}

export default function PlaylistListActions({
    searchQuery,
    setSearchQuery,
    setIsCreateOpen,
}: PlaylistListActionsProps) {
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [suppressTooltip, setSuppressTooltip] = useState(false);

    return (
        <div className="flex items-center gap-2">
            <PlaylistSearchControl
                isSearchOpen={isSearchOpen}
                setIsSearchOpen={setIsSearchOpen}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                suppressTooltip={suppressTooltip}
                setSuppressTooltip={setSuppressTooltip}
                placeholder="搜索播放列表..."
            />

            <button
                onClick={() => setIsCreateOpen(true)}
                className="flex items-center gap-1 bg-primary text-on-primary px-4 py-1.5 rounded-full text-sm font-medium hover:bg-primary/90 transition-all shadow-sm active:scale-95"
            >
                <MdAdd className="text-lg" />
                新建
            </button>
        </div>
    );
}
