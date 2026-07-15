import { useRef } from 'react';
import clsx from 'clsx';
import { MdSearch } from 'react-icons/md';
import CustomTooltip from '@/components/common/CustomTooltip';

interface SidebarSearchProps {
    collapsed: boolean;
    onToggle: () => void;
    onSearch: (query: string) => void;
}

export default function SidebarSearch({ collapsed, onToggle, onSearch }: SidebarSearchProps) {
    const searchInputRef = useRef<HTMLInputElement>(null);

    const submitSearch = (query: string) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) return;
        onSearch(trimmedQuery);
    };

    const handleSearchClick = () => {
        if (collapsed) {
            onToggle();
            setTimeout(() => {
                const input = searchInputRef.current;
                if (!input) return;
                try {
                    input.focus({ preventScroll: true });
                } catch {
                    input.focus();
                }
            }, 300);
            return;
        }

        submitSearch(searchInputRef.current?.value ?? '');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            submitSearch(e.currentTarget.value);
        }
    };

    return (
        <div className="px-3 mt-1">
            <CustomTooltip
                text="搜索"
                // 只有折叠时显示 Tooltip (以免遮挡输入框)
                disabled={!collapsed}
                placement="bottom" // 文字在下方
                className={clsx(collapsed ? "w-12" : "w-full")} // 折叠时宽度缩小跟随搜索圆圈，居中计算就准了
            >
                <div
                    onClick={collapsed ? handleSearchClick : undefined}
                    className={clsx(
                        "relative flex items-center w-full min-h-12",
                        collapsed && "cursor-pointer"
                    )}
                >
                    {/* 背景层 */}
                    <div className={clsx(
                        "absolute top-1/2 -translate-y-1/2 h-12 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                        "left-0",
                        collapsed
                            ? "w-12 rounded-full bg-transparent group-hover/tooltip:bg-neutral-100 dark:group-hover/tooltip:bg-neutral-800"
                            : "w-full rounded-full bg-neutral-100 dark:bg-neutral-800"
                    )} />

                    {/* 内容容器 */}
                    <div className="relative z-10 flex items-center w-full">
                        <button
                            type="button"
                            aria-label={collapsed ? "展开搜索" : "搜索"}
                            onClick={(event) => {
                                event.stopPropagation();
                                handleSearchClick();
                            }}
                            className={clsx(
                                "flex items-center justify-center shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                                collapsed ? "w-12 h-12" : "ml-1 w-10 h-10 cursor-pointer"
                            )}
                        >
                            <MdSearch className={clsx(
                                "text-[24px] transition-colors",
                                collapsed ? "text-neutral-600 dark:text-neutral-400" : "text-neutral-500"
                            )} />
                        </button>

                        {/* 输入框 */}
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="搜索"
                            readOnly={collapsed}
                            onKeyDown={handleKeyDown}
                            className={clsx(
                                "bg-transparent text-base text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 focus:outline-none min-w-0 transition-all duration-300",
                                collapsed ? "w-0 opacity-0 pointer-events-none" : "w-full opacity-100 ml-2 mr-4"
                            )}
                        />
                    </div>
                </div>
            </CustomTooltip>
        </div>
    );
}
