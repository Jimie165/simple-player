import clsx from 'clsx';
import { useScrollBlur } from '@/hooks/useScrollBlur';

// 滚动状态只更新标题栏；原生窗口拖动区域必须留在滚动容器外，避免干扰滚轮命中测试。
export default function DetailScrollHeader() {
    const { isScrolled, topSentinelRef } = useScrollBlur();

    return (
        <>
            <div ref={topSentinelRef} className="absolute top-0 h-1 w-full pointer-events-none z-0" />
            <div className={clsx(
                'sticky top-0 left-0 right-0 h-10 z-60 transition-all duration-300 border-b',
                isScrolled
                    ? 'bg-surface/60 dark:bg-surface/35 backdrop-blur-xl border-outline-variant/10 opacity-100 pointer-events-auto'
                    : 'bg-transparent border-transparent opacity-0 pointer-events-none'
            )} />
        </>
    );
}
