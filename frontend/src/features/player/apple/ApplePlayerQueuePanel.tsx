import clsx from 'clsx';
import { motion } from 'framer-motion';
import AppleMusicQueue from '@/features/player/AppleMusicQueue';

interface ApplePlayerQueuePanelProps {
    isQueueOpen: boolean;
    queueMounted: boolean;
    onClose: () => void;
    queueScrollToTopSignal: number;
}

export default function ApplePlayerQueuePanel({
    isQueueOpen,
    queueMounted,
    onClose,
    queueScrollToTopSignal,
}: ApplePlayerQueuePanelProps) {
    return (
        <div
            className={clsx(
                'flex-1 min-w-0 h-full max-h-[95%] flex flex-col z-30 overflow-hidden justify-center',
                'transition-[max-width,padding-left,padding-right] duration-500 ease-[0.32,0.72,0,1]',
                isQueueOpen ? 'max-w-full pl-[clamp(1rem,3vw,2.25rem)] pr-[clamp(1rem,3vw,2rem)]' : 'max-w-0 pl-0 pr-0'
            )}
        >
            <div className="relative flex-1 overflow-hidden">
                <motion.div
                    className={clsx(
                        'absolute inset-0',
                        'transition-[opacity,transform] duration-500 ease-[0.32,0.72,0,1]',
                        isQueueOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-5 pointer-events-none'
                    )}
                >
                    {queueMounted && isQueueOpen && (
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
