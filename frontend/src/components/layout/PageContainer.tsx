import type { ReactNode } from 'react';
import clsx from 'clsx';

interface PageContainerProps {
    title?: string;
    actions?: ReactNode;
    children: ReactNode;
    hideHeader?: boolean;
    className?: string;
}

export default function PageContainer({
    title,
    actions,
    children,
    hideHeader = false,
    className
}: PageContainerProps) {
    return (
        <div className={clsx("flex flex-col h-full w-full min-h-0 px-8 pb-8", className)}>
            {!hideHeader && (
                <div className="flex items-center justify-between py-6 shrink-0 z-10 min-h-[88px]">
                    {title && (
                        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white animate-in fade-in slide-in-from-left-2 duration-300">
                            {title}
                        </h1>
                    )}
                    {actions && (
                        <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-2 duration-300">
                            {actions}
                        </div>
                    )}
                </div>
            )}

            <div className="flex-1 min-h-0 relative animate-in fade-in duration-500 delay-75 fill-mode-backwards">
                {children}
            </div>
        </div>
    );
}
