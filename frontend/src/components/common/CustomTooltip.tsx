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
    const [isClicked, setIsClicked] = React.useState(false);

    return (
        <div
            className={clsx("group/tooltip relative flex items-center justify-center", className)}
            onClick={() => setIsClicked(true)}
            onMouseLeave={() => setIsClicked(false)}
        >
            {children}

            {!disabled && !isClicked && (
                <div className={clsx(
                    "absolute z-[9999] px-2.5 py-1.5 pointer-events-none",
                    "bg-primary/90 text-on-primary backdrop-blur-sm",
                    "text-xs font-medium rounded-md shadow-sm whitespace-nowrap",
                    "tooltip-animation", // 使用 CSS 类控制延迟 (进入有延迟)

                    // 如果传入了 show，则听 show 的强制覆盖
                    show === true && "!opacity-100 !scale-100 !delay-0",
                    show === false && "!opacity-0 !scale-95 !delay-0",

                    // --- 位置逻辑 ---
                    placement === 'top' && "bottom-full mb-1 left-1/2 -translate-x-1/2 origin-bottom",
                    placement === 'right' && "left-full ml-1.5 top-1/2 -translate-y-1/2 origin-left",
                    placement === 'bottom' && "top-full mt-1 left-1/2 -translate-x-1/2 origin-top",
                )}>
                    {text}

                    {/* 小三角箭头 */}
                    {placement === 'top' && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-primary/90" />
                    )}
                    {placement === 'right' && (
                        <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-[1px] border-4 border-transparent border-r-primary/90" />
                    )}
                    {placement === 'bottom' && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-[1px] border-4 border-transparent border-b-primary/90" />
                    )}
                </div>
            )}
        </div>
    );
}