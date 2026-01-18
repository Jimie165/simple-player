import React from 'react';

interface PageContainerProps {
    title: string;
    children: React.ReactNode;
    actions?: React.ReactNode;
}

export default function PageContainer({ title, children, actions }: PageContainerProps) {
    return (
        // 关键修改：将 pt-10 改回 pt-6 或 pt-4
        // 之前为了防止被悬浮标题栏挡住才加的 pt-10，现在标题栏是独立的 div，不需要这个 padding 了
        <div className="flex flex-col min-h-full px-8 pt-6 pb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

            {/* 标题区域 */}
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

            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}