import { useState, useEffect } from 'react';
import { systemService } from '../../services/systemService'; // 确保 systemService 已创建
import { VscChromeMinimize, VscChromeMaximize, VscChromeRestore, VscChromeClose } from 'react-icons/vsc';

export default function TitleBar() {
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        const checkMaximized = async () => {
            setIsMaximized(await systemService.isMaximized());
        };
        checkMaximized();

        const unlisten = systemService.onResize(checkMaximized);
        return () => { unlisten.then(f => f()); };
    }, []);

    return (
        // 修改点 1: 添加 pr-3 (右侧留白)，gap-1 (按钮间距)
        <div className="fixed top-0 right-0 z-[100] flex h-10 items-center pr-3 gap-1">

            {/* 最小化 */}
            <button
                onClick={systemService.minimize}
                // 修改点 2: 
                // - w-8 h-8: 固定正方形尺寸，小于标题栏高度(h-10)，实现垂直居中
                // - rounded-full: Material 3 标志性的圆形按钮 (或者改为 rounded-lg 变成圆角矩形)
                className="group flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-neutral-200 dark:hover:bg-white/10"
            >
                <VscChromeMinimize className="text-sm text-neutral-900 dark:text-neutral-100" />
            </button>

            {/* 最大化/还原 */}
            <button
                onClick={systemService.toggleMaximize}
                className="group flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-neutral-200 dark:hover:bg-white/10"
            >
                {isMaximized ? (
                    <VscChromeRestore className="text-sm text-neutral-900 dark:text-neutral-100" />
                ) : (
                    <VscChromeMaximize className="text-sm text-neutral-900 dark:text-neutral-100" />
                )}
            </button>

            {/* 关闭 */}
            <button
                onClick={systemService.close}
                // 关闭按钮保留 M3 风格，但在 Hover 时使用红色背景+白字
                className="group flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-red-500 hover:text-white"
            >
                {/* 图标在 group-hover 时变白 */}
                <VscChromeClose className="text-base text-neutral-900 dark:text-neutral-100 group-hover:text-white" />
            </button>

        </div>
    );
}