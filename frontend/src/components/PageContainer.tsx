import React from 'react';

interface PageContainerProps {
    title: string;
    children: React.ReactNode;
    actions?: React.ReactNode;
}

export default function PageContainer({ title, children, actions }: PageContainerProps) {
    return (
        <div className="flex flex-col min-h-full px-8 pt-0 pb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

            {/* 修改点：增加了 -mt-2
        负 margin 可以把整个标题栏向上拉 8px，抵消掉大号字体自带的顶部空白，
        让文字的最高点几乎贴到内容区的最顶端。
      */}
            <div className="flex items-end justify-between mb-10 shrink-0 min-h-[50px] -mt-2">

                <h1 className="text-[42px] font-bold tracking-tight text-neutral-900 dark:text-neutral-50 leading-none">
                    {title}
                </h1>

                {/* 右侧操作区 */}
                {actions && (
                    <div className="flex gap-2 mb-1.5">
                        {actions}
                    </div>
                )}
            </div>

            {/* 页面内容 */}
            <div className="flex-1">
                {children}
            </div>
        </div>
    );
}