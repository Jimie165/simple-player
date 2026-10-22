import { MdAdd, MdSearch } from 'react-icons/md';

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
    return (
        <div className="flex items-center gap-2">
            <div className="relative group">
                <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-primary transition-colors" />
                <input
                    type="text"
                    placeholder="搜索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-on-surface/5 hover:bg-on-surface/10 focus:bg-on-surface/10 backdrop-blur-md border-none rounded-full py-1.5 pl-9 pr-4 text-sm text-on-surface w-40 outline-none ring-0 focus:w-60 focus:outline-none focus-visible:outline-none focus:ring-0 transition-all duration-300 placeholder:text-on-surface-variant/60"
                />
            </div>

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
