import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, Key, ReactNode } from 'react';
import clsx from 'clsx';
import { VirtuosoGrid } from 'react-virtuoso';

type VirtualizedGridProps<TItem> = {
    data: TItem[];
    itemKey: (index: number, item: TItem) => Key;
    itemContent: (index: number, item: TItem) => ReactNode;
    listClassName?: string;
    listStyle?: CSSProperties;
    className?: string;
    overscan?: number | { main: number; reverse: number };
};

export default function VirtualizedGrid<TItem>({
    data,
    itemKey,
    itemContent,
    listClassName,
    listStyle,
    className,
    overscan = { main: 800, reverse: 800 }
}: VirtualizedGridProps<TItem>) {
    const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const el = document.querySelector('[data-scroll-viewport]');
        if (el instanceof HTMLElement) setScrollParent(el);
    }, []);

    useLayoutEffect(() => {
        const listEl = wrapperRef.current?.querySelector('.virtualized-grid-list');
        if (!(listEl instanceof HTMLElement)) return;

        listEl.style.gridTemplateColumns = typeof listStyle?.gridTemplateColumns === 'string'
            ? listStyle.gridTemplateColumns
            : '';
    }, [listStyle]);

    if (!scrollParent) {
        return <div className="opacity-0" />;
    }

    return (
        <div ref={wrapperRef} className={clsx("w-full", className)}>
            <VirtuosoGrid
                useWindowScroll={false}
                customScrollParent={scrollParent}
                data={data}
                itemContent={itemContent}
                computeItemKey={itemKey}
                overscan={overscan}
                listClassName={clsx("virtualized-grid-list", listClassName)}
                itemClassName="min-w-0"
                className="w-full"
            />
        </div>
    );
}
