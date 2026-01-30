import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { VirtuosoGrid } from 'react-virtuoso';

type VirtualizedGridProps<TItem> = {
    data: TItem[];
    itemKey: (index: number, item: TItem) => React.Key;
    itemContent: (index: number, item: TItem) => React.ReactNode;
    listClassName?: string;
    className?: string;
    overscan?: number | { main: number; reverse: number };
};

export default function VirtualizedGrid<TItem>({
    data,
    itemKey,
    itemContent,
    listClassName,
    className,
    overscan = { main: 800, reverse: 800 }
}: VirtualizedGridProps<TItem>) {
    const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const el = document.querySelector('[data-scroll-viewport]');
        if (el instanceof HTMLElement) setScrollParent(el);
    }, []);

    if (!scrollParent) {
        return <div className="opacity-0" />;
    }

    return (
        <VirtuosoGrid
            useWindowScroll={false}
            customScrollParent={scrollParent}
            data={data}
            itemContent={itemContent}
            computeItemKey={itemKey}
            overscan={overscan}
            listClassName={listClassName}
            itemClassName="min-w-0"
            className={clsx("w-full", className)}
        />
    );
}
