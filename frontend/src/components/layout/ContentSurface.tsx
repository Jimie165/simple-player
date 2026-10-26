import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

const BackgroundTarget = createContext<HTMLDivElement | null>(null);

export function ContentSurface({ children, hidePageBackground }: {
    children: ReactNode;
    hidePageBackground: boolean;
}) {
    const [target, setTarget] = useState<HTMLDivElement | null>(null);

    return (
        <div className="relative isolate flex flex-1 min-w-0 overflow-hidden bg-surface dark:bg-surface-container-low base-theme:bg-background transition-colors duration-300">
            <div
                ref={setTarget}
                aria-hidden
                className={clsx('pointer-events-none absolute inset-0 overflow-hidden', hidePageBackground && 'invisible')}
            />
            <BackgroundTarget.Provider value={target}>{children}</BackgroundTarget.Provider>
            {/* Paint the corner without rounding the clipping ancestor of backdrop filters. */}
            <svg aria-hidden className="content-surface-corner pointer-events-none absolute left-0 top-0 z-90 size-4" viewBox="0 0 16 16">
                <path d="M0 0H16A16 16 0 0 0 0 16Z" />
            </svg>
        </div>
    );
}

// 页面背景绘制到完整内容区域，尺寸不受右侧队列的展开动画影响。
export function ContentBackground({ children }: { children: ReactNode }) {
    const target = useContext(BackgroundTarget);
    return target ? createPortal(children, target) : null;
}
