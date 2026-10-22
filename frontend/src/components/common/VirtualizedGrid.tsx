import { memo, useLayoutEffect, useRef } from 'react';
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

function GridItem<TItem>({ index, item, renderItem }: {
    index: number;
    item: TItem;
    renderItem: (index: number, item: TItem) => ReactNode;
}) {
    return renderItem(index, item);
}

// 保留泛型签名；尺寸测量更新时复用未变化的卡片子树。
const MemoGridItem = memo(GridItem) as typeof GridItem;

export default function VirtualizedGrid<TItem>({
    data,
    itemKey,
    itemContent,
    listClassName,
    listStyle,
    className,
    overscan
}: VirtualizedGridProps<TItem>) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const scrollParent = useScrollViewport(true, wrapperRef);
    const viewportOverscan = useViewportOverscan(scrollParent);

    useLayoutEffect(() => {
        const listEl = wrapperRef.current?.querySelector('.virtualized-grid-list');
        if (!(listEl instanceof HTMLElement)) return;

        listEl.style.gridTemplateColumns = typeof listStyle?.gridTemplateColumns === 'string'
            ? listStyle.gridTemplateColumns
            : '';
    }, [listStyle, scrollParent]);

    return (
        // Grid recycling changes top padding; browser scroll anchoring must not compensate for it.
        <div ref={wrapperRef} className={clsx("w-full [overflow-anchor:none]", className)}>
            {scrollParent && <VirtuosoGrid
                useWindowScroll={false}
                customScrollParent={scrollParent}
                data={data}
                itemContent={(index, item) => (
                    <MemoGridItem index={index} item={item} renderItem={itemContent} />
                )}
                computeItemKey={itemKey}
                overscan={overscan ?? viewportOverscan}
                listClassName={clsx("virtualized-grid-list", listClassName)}
                itemClassName="min-w-0"
                className="w-full"
            />}
        </div>
    );
}
