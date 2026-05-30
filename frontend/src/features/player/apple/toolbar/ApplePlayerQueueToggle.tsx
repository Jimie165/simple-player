import clsx from 'clsx';
import { IoList } from 'react-icons/io5';

interface ApplePlayerQueueToggleProps {
    isQueueOpen: boolean;
    onToggle: () => void;
}

export default function ApplePlayerQueueToggle({ isQueueOpen, onToggle }: ApplePlayerQueueToggleProps) {
    return (
        <button
            onClick={onToggle}
            style={{
                width: 'clamp(1.92rem,3.67vw,2.58rem)',
                height: 'clamp(1.92rem,3.67vw,2.58rem)',
                borderRadius: 'clamp(0.5rem,0.95vw,0.72rem)'
            }}
            className={clsx(
                'flex items-center justify-center transition-all backdrop-blur-md',
                isQueueOpen
                    ? 'bg-white/10 border border-white/10 text-white shadow-lg'
                    : 'hover:bg-white/10 hover:text-white text-white/50'
            )}
        >
            <IoList className={clsx('text-[clamp(1.15rem,2.2vw,1.55rem)]', isQueueOpen ? 'text-primary' : '')} />
        </button>
    );
}
