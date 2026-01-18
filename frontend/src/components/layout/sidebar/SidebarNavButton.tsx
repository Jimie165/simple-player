import React from 'react';
import clsx from 'clsx';
import CustomTooltip from '../../common/CustomTooltip';

export type NavItem = {
    icon: React.ElementType;
    label: string;
    id: string;
};

interface SidebarNavButtonProps {
    item: NavItem;
    isActive?: boolean;
    collapsed: boolean;
    onClick: () => void;
    isBottom?: boolean;
}

export default function SidebarNavButton({ item, isActive, collapsed, onClick, isBottom = false }: SidebarNavButtonProps) {
    return (
        // 1. Tooltip 包在最外层，并给予 w-full
        <CustomTooltip
            text={item.label}
            // 2. 只有折叠(collapsed=true)时才启用 Tooltip (即 disabled=false)
            //    展开时禁用 Tooltip (disabled=true)
            disabled={!collapsed}
            // 3. 底部“设置”按钮向上弹，其它保持向下
            placement={isBottom ? "top" : "bottom"}
            className={clsx("w-full", isBottom && "mt-auto")}
        >
            <button
                onClick={onClick}
                className={clsx(
                    "group relative flex items-center min-h-[56px] w-full mb-1"
                    // mt-auto 移到了外层的 Tooltip 上，或者这里保留也没关系，但外层 wrapper 更安全
                )}
            >
                {/* 1. 独立的背景层 (胶囊) */}
                <div className={clsx(
                    "absolute top-1/2 -translate-y-1/2 h-10 rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                    "left-3",
                    // 宽度逻辑：因为现在父容器宽度正常了，这里计算就会准确
                    collapsed ? "w-12" : "w-[calc(100%-24px)]",
                    isActive
                        ? "bg-blue-100 dark:bg-blue-900/40"
                        : "bg-transparent group-hover:bg-neutral-200 dark:group-hover:bg-white/10"
                )} />

                {/* 2. 内容容器 (图标 + 文字) */}
                <div className="relative z-10 flex items-center w-full px-3">

                    {/* 图标容器 */}
                    <div className="w-12 h-12 flex items-center justify-center shrink-0">
                        <item.icon className={clsx(
                            "text-[24px] transition-colors duration-200",
                            isActive
                                ? "text-blue-900 dark:text-blue-100"
                                : "text-neutral-500 group-hover:text-neutral-900 dark:text-neutral-400 dark:group-hover:text-neutral-200"
                        )} />
                    </div>

                    {/* 文字标签 */}
                    <span className={clsx(
                        "whitespace-nowrap overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                        isActive
                            ? "text-neutral-900 dark:text-neutral-50 font-medium"
                            : "text-neutral-600 dark:text-neutral-400 font-normal group-hover:text-neutral-900 dark:group-hover:text-neutral-200",
                        // 文字显示逻辑：展开时显示，折叠时隐藏
                        collapsed ? "w-0 opacity-0 ml-0" : "w-auto opacity-100 ml-4"
                    )}>
                        <span className="text-sm tracking-wide">{item.label}</span>
                    </span>
                </div>
            </button>
        </CustomTooltip>
    );
}