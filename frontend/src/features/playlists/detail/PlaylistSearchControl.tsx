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
    placeholder?: string;
}

export default function PlaylistSearchControl({
    isSearchOpen,
    setIsSearchOpen,
    searchQuery,
    setSearchQuery,
    suppressTooltip,
    setSuppressTooltip,
    placeholder = '搜索歌单内...',
}: PlaylistSearchControlProps) {
    return (
        <CustomTooltip
            text="搜索"
            placement="bottom"
            show={suppressTooltip ? false : undefined}
            disabled={isSearchOpen}
        >
            <div
                onMouseLeave={() => setSuppressTooltip(false)}
                className={clsx(
                    'flex h-10 items-center bg-on-surface/5 hover:bg-on-surface/10 focus-within:bg-on-surface/10 base-theme:bg-secondary-container/50 base-theme:hover:bg-secondary-container base-theme:focus-within:bg-secondary-container backdrop-blur-md border border-on-surface/10 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] overflow-hidden rounded-full',
                    isSearchOpen
                        ? 'w-64 mr-2'
                        : 'w-10 text-on-surface-variant hover:text-primary cursor-pointer'
                )}
                onClick={() => !isSearchOpen && setIsSearchOpen(true)}
            >
                <div className="flex items-center w-full px-3 py-1.5 h-full">
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
                        placeholder={placeholder}
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
