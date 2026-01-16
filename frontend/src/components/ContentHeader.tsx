import { VscMenu, VscArrowLeft } from 'react-icons/vsc';

interface ContentHeaderProps {
    title?: string;
    canGoBack: boolean;
    onToggleSidebar: () => void;
    onBack: () => void;
}

export default function ContentHeader({ title, canGoBack, onToggleSidebar, onBack }: ContentHeaderProps) {
    return (
        <div className="flex h-16 items-center gap-4 px-6 shrink-0 z-20">
            {/* 侧栏开关 (Hamburger) */}
            <button
                onClick={onToggleSidebar}
                className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-700 transition-colors"
            >
                <VscMenu className="text-xl" />
            </button>

            {/* 后退按钮 (仅当有历史记录时可用) */}
            <button
                onClick={onBack}
                disabled={!canGoBack}
                className={`
          rounded-lg p-2 transition-colors
          ${canGoBack
                        ? 'text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-700 cursor-pointer'
                        : 'text-neutral-300 dark:text-neutral-700 cursor-default'}
        `}
            >
                <VscArrowLeft className="text-xl" />
            </button>

            {/* 当前页面标题 (可选) */}
            {title && (
                <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100 animate-in fade-in slide-in-from-left-2">
                    {title}
                </h2>
            )}
        </div>
    );
}