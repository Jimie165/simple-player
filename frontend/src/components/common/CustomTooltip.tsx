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

const VIEWPORT_MARGIN = 12;
const TOOLTIP_EDGE_PADDING = 12;

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
    const [coords, setCoords] = useState({ top: 0, left: 0, arrowOffset: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    // 计算弹窗位置
    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();

        let top = 0;
        let left = 0;
        let arrowOffset = 0;

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

        const tooltip = tooltipRef.current;

        if (tooltip && (placement === 'top' || placement === 'bottom')) {
            const halfWidth = tooltip.offsetWidth / 2;
            const minLeft = VIEWPORT_MARGIN + halfWidth;
            const maxLeft = window.innerWidth - VIEWPORT_MARGIN - halfWidth;
            const centeredLeft = left;

            left = maxLeft < minLeft
                ? window.innerWidth / 2
                : Math.min(Math.max(centeredLeft, minLeft), maxLeft);

            const maxArrowOffset = Math.max(0, halfWidth - TOOLTIP_EDGE_PADDING);
            arrowOffset = Math.min(
                Math.max(centeredLeft - left, -maxArrowOffset),
                maxArrowOffset
            );
        } else if (tooltip && placement === 'right') {
            const halfHeight = tooltip.offsetHeight / 2;
            const minTop = VIEWPORT_MARGIN + halfHeight;
            const maxTop = window.innerHeight - VIEWPORT_MARGIN - halfHeight;
            const centeredTop = top;

            top = maxTop < minTop
                ? window.innerHeight / 2
                : Math.min(Math.max(centeredTop, minTop), maxTop);

            const maxArrowOffset = Math.max(0, halfHeight - TOOLTIP_EDGE_PADDING);
            arrowOffset = Math.min(
                Math.max(centeredTop - top, -maxArrowOffset),
                maxArrowOffset
            );
        }

        setCoords({ top, left, arrowOffset });
    }, [placement]);
    const setTooltipElement = useCallback((element: HTMLDivElement | null) => {
        tooltipRef.current = element;
        if (element) requestAnimationFrame(updatePosition);
    }, [updatePosition]);
    const hoverTimeoutRef = useRef<number | null>(null);
    const leaveTimeoutRef = useRef<number | null>(null);

    const hideTooltip = useCallback(() => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        if (leaveTimeoutRef.current) {
            clearTimeout(leaveTimeoutRef.current);
        }
        setIsVisible(false);
        leaveTimeoutRef.current = window.setTimeout(() => {
            setIsRendered(false);
            leaveTimeoutRef.current = null;
        }, 200);
    }, []);

    const handleMouseEnter = () => {
        if (disabled || show === false) return;
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
        hideTooltip();
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

    // 全局 pointerdown：触摸和鼠标点击都立即关闭 tooltip。
    useEffect(() => {
        window.addEventListener('pointerdown', hideTooltip);
        return () => window.removeEventListener('pointerdown', hideTooltip);
    }, [hideTooltip]);

    useEffect(() => {
        if (!disabled) return;
        const frame = requestAnimationFrame(hideTooltip);
        return () => cancelAnimationFrame(frame);
    }, [disabled, hideTooltip]);

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
            onClick={hideTooltip}
        >
            {children}

            {shouldRender && createPortal(
                <div
                    key={text}
                    ref={setTooltipElement}
                    className={clsx(
                        "fixed z-99999 px-2.5 py-1.5 pointer-events-none",
                        "bg-primary/90 text-on-primary backdrop-blur-sm",
                        "text-xs font-medium leading-relaxed text-center rounded-md shadow-sm whitespace-normal",
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
                        width: 'max-content',
                        maxWidth: 'min(30rem, calc(100vw - 24px))',
                        overflowWrap: 'anywhere',
                    }}
                >
                    {text}

                    {/* 小三角箭头 */}
                    {placement === 'top' && (
                        <div
                            className="absolute top-full -translate-x-1/2 -mt-px border-4 border-transparent border-t-primary/90"
                            style={{ left: `calc(50% + ${coords.arrowOffset}px)` }}
                        />
                    )}
                    {placement === 'right' && (
                        <div
                            className="absolute right-full -translate-y-1/2 -mr-px border-4 border-transparent border-r-primary/90"
                            style={{ top: `calc(50% + ${coords.arrowOffset}px)` }}
                        />
                    )}
                    {placement === 'bottom' && (
                        <div
                            className="absolute bottom-full -translate-x-1/2 -mb-px border-4 border-transparent border-b-primary/90"
                            style={{ left: `calc(50% + ${coords.arrowOffset}px)` }}
                        />
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}
