import React from 'react';
import clsx from 'clsx';

interface PageContainerProps {
    title: string;
    children: React.ReactNode;
    actions?: React.ReactNode;
    hideHeader?: boolean;
}

export default function PageContainer({ title, children, actions, hideHeader = false }: PageContainerProps) {
    return (
        <div className={clsx(
            "flex flex-col min-h-full pb-6 animate-in fade-in slide-in-from-bottom-2 duration-500",
            hideHeader ? "px-0 pt-0" : "px-8 pt-6"
        )}>
            {!hideHeader && (
                <div className="flex items-end justify-between mb-8 shrink-0 min-h-[50px]">
                    <h1 className="text-[42px] font-bold tracking-tight text-neutral-900 dark:text-neutral-50 leading-none">
                        {title}
                    </h1>
                    {actions && (
                        <div className="flex gap-2 mb-1.5">
                            {actions}
                        </div>
                    )}
                </div>
            )}

            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}