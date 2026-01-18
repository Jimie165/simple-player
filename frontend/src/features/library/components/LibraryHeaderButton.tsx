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
                "relative inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium z-20 transition-all duration-200",
                "bg-white dark:bg-[#202020]",
                "border border-neutral-300 dark:border-neutral-600",
                "text-neutral-700 dark:text-neutral-200",
                "hover:bg-neutral-100 dark:hover:bg-neutral-700",
                "shadow-sm"
            )}
        >
            <MdCreateNewFolder className="text-lg text-blue-600 dark:text-blue-400" />
            <span>添加文件夹</span>
        </button>
    );
}