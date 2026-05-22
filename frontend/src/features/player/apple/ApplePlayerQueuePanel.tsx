import clsx from 'clsx';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import AppleMusicQueue from '@/features/player/AppleMusicQueue';

interface ApplePlayerQueuePanelProps {
    isQueueOpen: boolean;
    queueMounted: boolean;
    panelFlipTarget: 'queue' | 'lyrics' | null;
    isPanelFlipping: boolean;
    onClose: () => void;
    queueScrollToTopSignal: number;
}

export default function ApplePlayerQueuePanel({
    isQueueOpen,
    queueMounted,
    panelFlipTarget,
    isPanelFlipping,
    onClose,
    queueScrollToTopSignal,
}: ApplePlayerQueuePanelProps) {
    const isFlippingIn = panelFlipTarget === 'queue' && isPanelFlipping && isQueueOpen;
    const isFlippingOut = panelFlipTarget === 'lyrics' && isPanelFlipping;
    const isVisible = isQueueOpen && !isFlippingOut;

    // 动画配置
    const variants: Variants = {
        visible: {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: {
                y: { type: 'spring', stiffness: 90, damping: 14, mass: 0.8 },
                scale: { type: 'spring', stiffness: 90, damping: 14, mass: 0.8 },
                opacity: { duration: 0.35, ease: 'easeOut' },
                delay: (panelFlipTarget === null && isQueueOpen) ? 0.22 : (isFlippingIn ? 0.08 : 0)
            }
        },
        hidden: {
            opacity: 0,
            scale: isPanelFlipping ? 0.96 : 0.94,
            y: isPanelFlipping ? 16 : 40,
            transition: {
                duration: isFlippingOut ? 0.25 : 0.35,
                ease: 'easeOut'
            }
        }
    };

    return (
        <div
            className={clsx(
                'absolute inset-y-0 right-0 w-[56%] h-full max-h-[95%] flex flex-col z-10 overflow-hidden justify-center',
                'pl-[clamp(1rem,3vw,2.25rem)] pr-[clamp(1rem,3vw,2rem)]',
                isQueueOpen ? 'pointer-events-auto' : 'pointer-events-none'
            )}
        >
            <div className="relative flex-1 overflow-hidden">
                <motion.div
                    className={clsx(
                        'absolute inset-0 origin-center transform-gpu',
                        !isVisible && 'pointer-events-none'
                    )}
                    initial="hidden"
                    animate={isVisible ? "visible" : "hidden"}
                    variants={variants}
                >
                    {queueMounted && (
                        <AppleMusicQueue
                            onNavigate={onClose}
                            scrollToTopSignal={queueScrollToTopSignal}
                            isOpen={isQueueOpen}
                        />
                    )}
                </motion.div>
            </div>
        </div>
    );
}
