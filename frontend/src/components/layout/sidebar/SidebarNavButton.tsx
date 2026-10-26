import React from 'react';
import clsx from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
import CustomTooltip from '@/components/common/CustomTooltip';
import { useThemeStore } from '@/store/useThemeStore';

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
    isOverlay?: boolean;
}

export default function SidebarNavButton({ item, isActive, collapsed, onClick, isBottom = false, isOverlay = false }: SidebarNavButtonProps) {
    const [isClicked, setIsClicked] = React.useState(false);
    const reducedMotion = useReducedMotion();
    const moreTransitionsEnabled = useThemeStore(state => state.moreTransitionsEnabled);

    const handleClick = () => {
        setIsClicked(true);
        onClick();
        // 500ms 后重置，足以覆盖侧边栏关闭动画
        setTimeout(() => setIsClicked(false), 500);
    };

    return (
        <CustomTooltip
            text={item.label}
            // 只有折叠且没有被点击、且不是在 Overlay 展开状态下才显示
            disabled={!collapsed || isClicked || (isOverlay && !collapsed)}
            placement={isBottom ? "top" : "bottom"}
            className={clsx(collapsed ? "w-[72px]" : "w-full", isBottom && "mt-auto")}
        >
            <motion.button
                onClick={handleClick}
                aria-current={isActive ? 'page' : undefined}
                whileTap={reducedMotion || !moreTransitionsEnabled ? undefined : { scale: 0.96 }}
                className={clsx(
                    "group relative flex items-center min-h-[56px] mb-1 outline-none",
                    collapsed ? "w-[72px]" : "w-full"
                )}
            >
                {/* 1. 独立的背景层 (胶囊) */}
                <div className={clsx(
                    "absolute top-1/2 -translate-y-1/2 h-10 rounded-full transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                    "left-3",
                    collapsed ? "w-12" : "w-[calc(100%-24px)]",
                    isActive && !moreTransitionsEnabled ? "bg-primary/15" : "bg-transparent",
                    !isActive && !isClicked && "group-hover:bg-on-surface/8"
                )} />
                {isActive && moreTransitionsEnabled && (
                    <motion.div
                        layoutId="sidebar-active"
                        initial={false}
                        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }}
                        className={clsx("absolute top-2 left-3 h-10 rounded-full bg-primary/15", collapsed ? "w-12" : "w-[calc(100%-24px)]")}
                    />
                )}

                {/* 2. 内容容器 (图标 + 文字) */}
                <div className="relative z-10 flex items-center w-full px-3">

                    {/* 图标容器 */}
                    <div className="w-12 h-12 flex items-center justify-center shrink-0">
                        <item.icon className={clsx(
                            "text-[24px] transition-colors duration-200",
                            isActive
                                ? "text-primary"
                                : "text-on-surface-variant group-hover:text-on-surface"
                        )} />
                    </div>

                    {/* 文字标签 */}
                    <span className={clsx(
                        "whitespace-nowrap overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                        isActive
                            ? "text-primary font-bold"
                            : "text-on-surface-variant font-medium group-hover:text-on-surface",
                        // 文字显示逻辑：展开时显示，折叠时隐藏
                        collapsed ? "w-0 opacity-0 ml-0" : "w-auto opacity-100 ml-4"
                    )}>
                        <span className="text-sm tracking-wide">{item.label}</span>
                    </span>
                </div>
            </motion.button>
        </CustomTooltip>
    );
}
