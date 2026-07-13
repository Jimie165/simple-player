import clsx from 'clsx';
import { MdSearch, MdClose } from 'react-icons/md';
import CustomTooltip from '@/components/common/CustomTooltip';

interface PlaylistSearchControlProps {
    isSearchOpen: boolean;
    setIsSearchOpen: (value: boolean) => void;
    searchQuery: string;
    setSearchQuery: (value: string) => void;
    suppressTooltip: boolean;
    setSuppressTooltip: (value: boolean) => void;
}

export default function PlaylistSearchControl({
    isSearchOpen,
    setIsSearchOpen,
    searchQuery,
    setSearchQuery,
    suppressTooltip,
    setSuppressTooltip,
}: PlaylistSearchControlProps) {
    return (
        <CustomTooltip text="搜索" placement="bottom" show={suppressTooltip ? false : undefined}>
            <div
                onMouseLeave={() => setSuppressTooltip(false)}
                className={clsx(
                    'flex items-center transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] overflow-hidden rounded-full',
                    isSearchOpen
                        ? 'w-64 bg-surface-container-lowest/90 dark:bg-surface-container-highest/90 backdrop-blur-md border border-outline-variant/20 shadow-sm mr-2'
                        : 'w-10 h-10 btn-blur text-on-surface-variant hover:bg-surface-container-lowest dark:hover:bg-surface-container-highest hover:text-primary cursor-pointer'
                )}
                onClick={() => !isSearchOpen && setIsSearchOpen(true)}
            >
                <div className="flex items-center w-full px-3 py-1.5 h-10">
                    <MdSearch
                        className={clsx(
                            'text-xl shrink-0 transition-colors transform',
                            isSearchOpen ? 'text-on-surface-variant translate-x-0' : '-translate-x-[3px]'
                        )}
                    />
                    <input
                        autoFocus={isSearchOpen}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索歌单内..."
                        className={clsx(
                            'bg-transparent border-none focus:outline-none text-sm text-on-surface ml-2 placeholder:text-on-surface-variant/50 transition-all duration-300',
                            isSearchOpen ? 'w-full opacity-100' : 'w-0 opacity-0 pointer-events-none'
                        )}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                setSearchQuery('');
                                setIsSearchOpen(false);
                            }
                        }}
                    />
                    {isSearchOpen && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setSearchQuery('');
                                setIsSearchOpen(false);
                                setSuppressTooltip(true);
                            }}
                            className="p-1 hover:bg-on-surface/10 rounded-full text-on-surface-variant transition-colors shrink-0"
                        >
                            <MdClose />
                        </button>
                    )}
                </div>
            </div>
        </CustomTooltip>
    );
}
