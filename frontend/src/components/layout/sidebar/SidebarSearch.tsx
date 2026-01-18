import { useRef } from 'react';
import clsx from 'clsx';
import { MdSearch } from 'react-icons/md';
import CustomTooltip from '../../common/CustomTooltip';

interface SidebarSearchProps {
    collapsed: boolean;
    onToggle: () => void;
}

export default function SidebarSearch({ collapsed, onToggle }: SidebarSearchProps) {
    const searchInputRef = useRef<HTMLInputElement>(null);

    const handleSearchClick = () => {
        if (collapsed) {
            onToggle();
            setTimeout(() => searchInputRef.current?.focus(), 300);
        }
    };

    return (
        <div className="px-3 mt-1">
            <CustomTooltip
                text="搜索"
                // 只有折叠时显示 Tooltip (以免遮挡输入框)，如果你想展开也显示，去掉这行即可
                disabled={!collapsed}
                placement="bottom" // 文字在下方
                className="w-full" // 确保外层容器撑满
            >
                <div
                    onClick={handleSearchClick}
                    className="group relative flex items-center w-full min-h-[48px] cursor-pointer"
                >
                    {/* 背景层 */}
                    <div className={clsx(
                        "absolute top-1/2 -translate-y-1/2 h-12 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                        "left-0",
                        collapsed
                            ? "w-12 rounded-full bg-transparent group-hover:bg-neutral-100 dark:group-hover:bg-neutral-800"
                            : "w-full rounded-full bg-neutral-100 dark:bg-neutral-800"
                    )} />

                    {/* 内容容器 */}
                    <div className="relative z-10 flex items-center w-full">
                        <div className={clsx(
                            "w-12 h-12 flex items-center justify-center shrink-0",
                            collapsed ? "" : "ml-1"
                        )}>
                            <MdSearch className={clsx(
                                "text-[24px] transition-colors",
                                collapsed ? "text-neutral-600 dark:text-neutral-400" : "text-neutral-500"
                            )} />
                        </div>

                        {/* 输入框 */}
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="搜索"
                            readOnly={collapsed}
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