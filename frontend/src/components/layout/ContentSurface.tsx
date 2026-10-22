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
        <div className="relative flex flex-1 min-w-0 overflow-hidden rounded-tl-2xl">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-surface dark:bg-surface-container-low transition-colors duration-300" />
            <div
                ref={setTarget}
                aria-hidden
                className={clsx('pointer-events-none absolute inset-0 overflow-hidden', hidePageBackground && 'invisible')}
            />
            <BackgroundTarget.Provider value={target}>{children}</BackgroundTarget.Provider>
        </div>
    );
}

// 页面背景绘制到完整内容区域，尺寸不受右侧队列的展开动画影响。
export function ContentBackground({ children }: { children: ReactNode }) {
    const target = useContext(BackgroundTarget);
    return target ? createPortal(children, target) : null;
}
