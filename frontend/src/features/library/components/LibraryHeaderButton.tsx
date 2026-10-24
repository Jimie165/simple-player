import { MdCreateNewFolder } from 'react-icons/md';
import clsx from 'clsx';

interface LibraryHeaderButtonProps {
    onClick: () => void;
}

export default function LibraryHeaderButton({ onClick }: LibraryHeaderButtonProps) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "relative inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium z-20 transition-all duration-200",
                "bg-on-surface/5 hover:bg-on-surface/10 active:bg-on-surface/15 backdrop-blur-md",
                "text-on-surface-variant hover:text-on-surface",
                "border border-outline-variant/20 shadow-sm",
                "base-theme:bg-secondary-container base-theme:text-on-secondary-container base-theme:hover:bg-secondary-container/80",
                "hover:elevation-1 active:scale-95"
            )}
        >
            <MdCreateNewFolder className="text-lg text-primary" />
            <span>添加文件夹</span>
        </button>
    );
}
