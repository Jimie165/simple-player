import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties, Key, ReactNode } from 'react';
import clsx from 'clsx';
import { VirtuosoGrid } from 'react-virtuoso';
import { useScrollViewport } from '@/hooks/useScrollViewport';
import { useViewportOverscan } from '@/hooks/useViewportOverscan';

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
    overscan
}: VirtualizedGridProps<TItem>) {
    const scrollParent = useScrollViewport(true);
    const viewportOverscan = useViewportOverscan(scrollParent);
    const wrapperRef = useRef<HTMLDivElement | null>(null);

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
                overscan={overscan ?? viewportOverscan}
                listClassName={clsx("virtualized-grid-list", listClassName)}
                itemClassName="min-w-0"
                className="w-full"
            />
        </div>
    );
}
