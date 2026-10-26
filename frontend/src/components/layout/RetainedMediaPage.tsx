import { Activity, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import ScrollArea from '@/components/common/ScrollArea';
import DetailScrollHeader from '@/components/common/DetailScrollHeader';
import { pageMotion } from '@/utils/viewTransition';

/** Only the four fixed media pages use this boundary; hidden effects are disconnected. */
export default function RetainedMediaPage({ active, children, scrollKey }: {
    active: boolean;
    children: ReactNode;
    scrollKey: number | undefined;
}) {
    const [retainedScrollKey, setRetainedScrollKey] = useState(scrollKey);
    if (scrollKey !== undefined && scrollKey !== retainedScrollKey) setRetainedScrollKey(scrollKey);
    const [visited, setVisited] = useState(active);
    const [exited, setExited] = useState(!active);
    if (active && !visited) setVisited(true);
    if (active && exited) setExited(false);
    if (!visited) return null;

    return (
        <Activity mode={!active && exited ? 'hidden' : 'visible'}>
            <motion.div
                data-retained-media-page
                initial={pageMotion.initial}
                variants={{ enter: pageMotion.animate, leave: pageMotion.exit }}
                animate={active ? 'enter' : 'leave'}
                transition={pageMotion.transition}
                onAnimationComplete={definition => {
                    if (definition === 'leave' && !active) setExited(true);
                }}
                inert={!active}
                aria-hidden={!active}
                className="absolute inset-0 min-w-0 overflow-hidden bg-surface dark:bg-surface-container-low base-theme:bg-background"
            >
                <ScrollArea className="h-full" topOffset={48} navigationScrollKey={retainedScrollKey} navigationActive={active}>
                    <div className="relative">
                        <DetailScrollHeader className="-mb-10" />
                        <div className="pt-12 min-h-full pb-24 transition-colors duration-300">{children}</div>
                    </div>
                </ScrollArea>
            </motion.div>
        </Activity>
    );
}
