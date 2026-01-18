import React from 'react';
import clsx from 'clsx';

interface CustomTooltipProps {
    text: string;
    children: React.ReactNode;
    /* 修复 1: 添加 show 属性解决 TS 报错 */
    show?: boolean;
    /* disabled: 某些情况（如侧边栏展开时）可能想完全禁用 */
    disabled?: boolean;
    placement?: 'top' | 'right' | 'bottom';
    className?: string;
}

export default function CustomTooltip({
    text,
    children,
    show, // 接收 show
    disabled = false,
    // 默认改成 top
    placement = 'top',
    className
}: CustomTooltipProps) {
    return (
        <div className={clsx("group/tooltip relative flex items-center justify-center", className)}>
            {children}

            {!disabled && (
                <div className={clsx(
                    "absolute z-[9999] px-2.5 py-1.5 pointer-events-none",
                    "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900",
                    "text-xs font-medium rounded-md shadow-sm whitespace-nowrap",
                    "transition-all duration-200 ease-out",

                    // 修复 3: 显隐逻辑
                    // 如果传入了 show (boolean)，则强制听 show 的
                    // 如果没传 show (undefined)，则听 hover 的
                    show === true
                        ? "opacity-100 scale-100"
                        : show === false
                            ? "opacity-0 scale-95"
                            : "opacity-0 scale-95 group-hover/tooltip:opacity-100 group-hover/tooltip:scale-100 delay-100",

                    // --- 位置逻辑 (调整了 margin 让它更近) ---

                    // Top
                    placement === 'top' && "bottom-full mb-1 left-1/2 -translate-x-1/2 origin-bottom",

                    // Right
                    placement === 'right' && "left-full ml-1.5 top-1/2 -translate-y-1/2 origin-left",

                    // Bottom (修复 4: 将 mt-2 改为 mt-1 或 mt-0.5，让它贴得更近)
                    placement === 'bottom' && "top-full mt-1 left-1/2 -translate-x-1/2 origin-top",
                )}>
                    {text}

                    {/* 小三角箭头 (位置也要微调适配新的 margin) */}
                    {placement === 'top' && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-neutral-800 dark:border-t-neutral-200" />
                    )}
                    {placement === 'right' && (
                        <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-[1px] border-4 border-transparent border-r-neutral-800 dark:border-r-neutral-200" />
                    )}
                    {placement === 'bottom' && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-[1px] border-4 border-transparent border-b-neutral-800 dark:border-b-neutral-200" />
                    )}
                </div>
            )}
        </div>
    );
}