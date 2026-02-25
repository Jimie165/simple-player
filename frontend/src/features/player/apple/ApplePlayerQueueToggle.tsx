import clsx from 'clsx';
import { IoList } from 'react-icons/io5';

interface ApplePlayerQueueToggleProps {
    isQueueOpen: boolean;
    onToggle: () => void;
}

export default function ApplePlayerQueueToggle({ isQueueOpen, onToggle }: ApplePlayerQueueToggleProps) {
    return (
        <div className="absolute bottom-8 right-8 z-30">
            <button
                onClick={onToggle}
                className={clsx(
                    'p-3 rounded-xl transition-all backdrop-blur-md',
                    isQueueOpen
                        ? 'bg-white/10 border border-white/10 text-white shadow-lg'
                        : 'hover:bg-white/10 hover:text-white text-white/50'
                )}
            >
                <IoList className={clsx('text-xl', isQueueOpen ? 'text-primary' : '')} />
            </button>
        </div>
    );
}
