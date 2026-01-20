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
                "bg-surface-container-high hover:bg-surface-container-highest active:bg-secondary-container",
                "text-on-surface-variant hover:text-on-surface active:text-on-secondary-container",
                "border border-outline-variant/20 shadow-sm",
                "hover:elevation-1 active:scale-95"
            )}
        >
            <MdCreateNewFolder className="text-lg text-primary" />
            <span>添加文件夹</span>
        </button>
    );
}