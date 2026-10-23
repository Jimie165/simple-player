import { Activity, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import ScrollArea from '@/components/common/ScrollArea';
import { pageMotion } from '@/utils/viewTransition';

/** Only the four fixed media pages use this boundary; hidden effects are disconnected. */
export default function RetainedMediaPage({ active, children }: { active: boolean; children: ReactNode }) {
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
                className="absolute inset-0 min-w-0 overflow-hidden bg-surface dark:bg-surface-container-low"
            >
                <ScrollArea className="h-full" topOffset={48}>
                    <div className="pt-12 min-h-full pb-24 transition-colors duration-300">{children}</div>
                </ScrollArea>
            </motion.div>
        </Activity>
    );
}
