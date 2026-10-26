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
                        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
                            {title}
                        </h1>
                    )}
                    {actions && (
                        <div className="flex items-center gap-3">
                            {actions}
                        </div>
                    )}
                </div>
            )}

            <div className="flex-1 min-h-0 relative">
                {children}
            </div>
        </div>
    );
}
