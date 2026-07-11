import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

interface CustomTooltipProps {
    text: string;
    children: React.ReactNode;
    show?: boolean;
    disabled?: boolean;
    placement?: 'top' | 'right' | 'bottom';
    className?: string;
}

export default function CustomTooltip({
    text,
    children,
    show,
    disabled = false,
    placement = 'top',
    className
}: CustomTooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [isRendered, setIsRendered] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);

    // 计算弹窗位置
    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();

        let top = 0;
        let left = 0;

        // 留出一定的间距，基础配置
        const offset = 8;

        if (placement === 'top') {
            top = rect.top - offset;
            left = rect.left + rect.width / 2;
        } else if (placement === 'right') {
            top = rect.top + rect.height / 2;
            left = rect.right + offset;
        } else if (placement === 'bottom') {
            top = rect.bottom + offset;
            left = rect.left + rect.width / 2;
        }

        setCoords({ top, left });
    }, [placement]);
    const hoverTimeoutRef = useRef<number | null>(null);
    const leaveTimeoutRef = useRef<number | null>(null);

    const handleMouseEnter = () => {
        if (disabled) return;
        if (leaveTimeoutRef.current) {
            clearTimeout(leaveTimeoutRef.current);
            leaveTimeoutRef.current = null;
        }
        hoverTimeoutRef.current = setTimeout(() => {
            updatePosition();
            setIsRendered(true);
            // 给 React 渲染一帧的时间，然后再赋予 isVisible 去触发 opacity transition
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setIsVisible(true));
            });
        }, 800);
    };

    const handleMouseLeave = () => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        setIsVisible(false);
        // 延时 200ms 以匹配过渡动画时间
        leaveTimeoutRef.current = setTimeout(() => {
            setIsRendered(false);
        }, 200) as unknown as number;
    };

    // 清理定时器防泄漏
    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
            // 组件卸载时强制隐藏（防止快速点击导致 mouseleave 丢失残留）
            setIsVisible(false);
            setIsRendered(false);
        };
    }, []);

    // 全局 mousedown：任何点击都立即关闭 tooltip（兼容 React 重绘后 mouseleave 丢失的情况）
    useEffect(() => {
        const forceHide = () => {
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
            }
            setIsVisible(false);
            leaveTimeoutRef.current = setTimeout(() => setIsRendered(false), 200) as unknown as number;
        };
        window.addEventListener('mousedown', forceHide);
        return () => window.removeEventListener('mousedown', forceHide);
    }, []);
    // 如果父组件强制 show，也需要更新位置和渲染状态
    useEffect(() => {
        let frame: number | null = null;

        if (show === true) {
            frame = requestAnimationFrame(() => {
                updatePosition();
                setIsRendered(true);
                requestAnimationFrame(() => setIsVisible(true));
            });
        } else if (show === false) {
            frame = requestAnimationFrame(() => {
                setIsVisible(false);
                leaveTimeoutRef.current = setTimeout(() => setIsRendered(false), 200) as unknown as number;
            });
        }

        return () => {
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [show, updatePosition]);

    useEffect(() => {
        if (isVisible || show) {
            window.addEventListener('resize', updatePosition);
            window.addEventListener('scroll', updatePosition, true);
        }
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [isVisible, show, updatePosition]);

    const shouldRender = isRendered || show === true;

    return (
        <div
            ref={triggerRef}
            className={twMerge("group/tooltip relative flex items-center justify-center", className)}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            // 避免点击后仍然顽固显示的情况
            onClick={handleMouseLeave}
        >
            {children}

            {shouldRender && createPortal(
                <div
                    className={clsx(
                        "fixed z-99999 px-2.5 py-1.5 pointer-events-none",
                        "bg-primary/90 text-on-primary backdrop-blur-sm",
                        "text-xs font-medium rounded-md shadow-sm whitespace-nowrap",
                        // 定位基准点变换
                        placement === 'top' && "-translate-x-1/2 -translate-y-full origin-bottom",
                        placement === 'right' && "-translate-y-1/2 origin-left",
                        placement === 'bottom' && "-translate-x-1/2 origin-top",

                        // 动画过渡
                        "transition-all duration-200 ease-out",
                        (isVisible) ? "opacity-100 scale-100" : "opacity-0 scale-95"
                    )}
                    style={{
                        top: coords.top,
                        left: coords.left,
                    }}
                >
                    {text}

                    {/* 小三角箭头 */}
                    {placement === 'top' && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-primary/90" />
                    )}
                    {placement === 'right' && (
                        <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-px border-4 border-transparent border-r-primary/90" />
                    )}
                    {placement === 'bottom' && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-px border-4 border-transparent border-b-primary/90" />
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}
