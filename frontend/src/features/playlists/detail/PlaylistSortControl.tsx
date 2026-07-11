import clsx from 'clsx';
import { MdSort, MdCheck } from 'react-icons/md';
import CustomTooltip from '@/components/common/CustomTooltip';
import type { SortKey, SortOrder } from '@/utils/songSort';

interface PlaylistSortControlProps {
    isSortMenuOpen: boolean;
    setIsSortMenuOpen: (value: boolean) => void;
    suppressSortTooltip: boolean;
    setSuppressSortTooltip: (value: boolean) => void;
    sortKey: SortKey;
    sortOrder: SortOrder;
    updateSortKey: (value: SortKey) => void;
    updateSortOrder: (value: SortOrder) => void;
}

export default function PlaylistSortControl({
    isSortMenuOpen,
    setIsSortMenuOpen,
    suppressSortTooltip,
    setSuppressSortTooltip,
    sortKey,
    sortOrder,
    updateSortKey,
    updateSortOrder,
}: PlaylistSortControlProps) {
    return (
        <div className="relative">
            <CustomTooltip text="排序方式" placement="bottom" show={suppressSortTooltip ? false : undefined}>
                <button
                    onMouseLeave={() => setSuppressSortTooltip(false)}
                    onClick={() => {
                        if (isSortMenuOpen) {
                            setIsSortMenuOpen(false);
                            setSuppressSortTooltip(true);
                        } else {
                            setIsSortMenuOpen(true);
                        }
                    }}
                    className={clsx(
                        'w-10 h-10 flex items-center justify-center rounded-full transition-colors',
                        isSortMenuOpen
                            ? 'bg-primary text-on-primary shadow-lg'
                            : 'btn-blur text-on-surface-variant hover:bg-surface-container-highest hover:text-primary'
                    )}
                >
                    <MdSort className="text-xl" />
                </button>
            </CustomTooltip>

            {isSortMenuOpen && (
                <>
                    <div
                        className="fixed inset-0 z-50"
                        onClick={() => {
                            setIsSortMenuOpen(false);
                            setSuppressSortTooltip(true);
                        }}
                    />
                    <div className="absolute right-0 mt-2 w-56 bg-white/60 dark:bg-primary/10 border border-primary/10 rounded-xl shadow-2xl py-2 z-70 backdrop-blur-3xl animate-in fade-in zoom-in duration-200 origin-top-right">
                        <div className="px-3 py-1.5 text-[11px] font-bold text-on-surface-variant/60 uppercase tracking-wider">排序依据</div>
                        {[
                            { label: '播放列表顺序', key: 'manual' as SortKey },
                            { label: '标题', key: 'title' as SortKey },
                            { label: '专辑', key: 'album' as SortKey },
                            { label: '艺人', key: 'artist' as SortKey },
                            { label: '时长', key: 'duration' as SortKey },
                        ].map((item) => (
                            <button
                                key={item.key}
                                onClick={() => {
                                    updateSortKey(item.key);
                                    setIsSortMenuOpen(false);
                                    setSuppressSortTooltip(true);
                                }}
                                className="w-full flex items-center justify-between px-4 py-2 text-sm text-on-surface hover:bg-primary/10 transition-colors"
                            >
                                {item.label}
                                {sortKey === item.key && <MdCheck className="text-primary text-lg" />}
                            </button>
                        ))}

                        <div className="my-1.5 border-t-2 border-outline-variant/30" />

                        {[
                            { label: '升序', order: 'asc' as SortOrder },
                            { label: '降序', order: 'desc' as SortOrder },
                        ].map((item) => (
                            <button
                                key={item.order}
                                onClick={() => {
                                    updateSortOrder(item.order);
                                    setIsSortMenuOpen(false);
                                    setSuppressSortTooltip(true);
                                }}
                                className="w-full flex items-center justify-between px-4 py-2 text-sm text-on-surface hover:bg-primary/10 transition-colors"
                            >
                                {item.label}
                                {sortOrder === item.order && <MdCheck className="text-primary text-lg" />}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
