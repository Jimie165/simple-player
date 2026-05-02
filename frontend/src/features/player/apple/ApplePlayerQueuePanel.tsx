import clsx from 'clsx';
import { motion } from 'framer-motion';
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
    const isFlipPreparing = panelFlipTarget === 'queue' && !isPanelFlipping && !isQueueOpen;
    const isFlippingIn = panelFlipTarget === 'queue' && isPanelFlipping && isQueueOpen;
    const isFlippingOut = panelFlipTarget === 'lyrics' && isPanelFlipping;
    const isVisible = isQueueOpen && !isFlippingOut;

    // 动画配置
    const variants = {
        visible: {
            opacity: 1,
            scale: 1,
            y: 0,
            rotateY: 0,
            transition: {
                duration: isFlippingIn ? 0.36 : 0.5,
                ease: [0.32, 0.72, 0, 1],
                delay: (panelFlipTarget === null && isQueueOpen) ? 0.22 : (isFlippingIn ? 0.08 : 0)
            }
        },
        hidden: {
            opacity: 0,
            scale: isPanelFlipping ? 0.96 : 0.94,
            y: isPanelFlipping ? 0 : 40,
            rotateY: isFlipPreparing ? 90 : (isFlippingOut ? -90 : 0),
            transition: {
                duration: isFlippingOut ? 0.25 : 0.35,
                ease: [0.32, 0.72, 0, 1]
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
            style={{ perspective: '1200px' }}
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
