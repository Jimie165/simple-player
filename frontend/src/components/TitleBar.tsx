import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
    VscChromeMinimize,
    VscChromeMaximize,
    VscChromeRestore,
    VscChromeClose
} from 'react-icons/vsc';

export default function TitleBar() {
    const [isMaximized, setIsMaximized] = useState(false);
    // 获取当前窗口实例
    const appWindow = getCurrentWindow();

    useEffect(() => {
        // 定义检查函数
        const checkMaximized = async () => {
            const maximized = await appWindow.isMaximized();
            setIsMaximized(maximized);
        };

        // 1. 初始化时检查一次
        checkMaximized();

        // 2. 监听窗口 resize 事件
        // 无论是拖拽、双击标题栏还是点击按钮，只要窗口大小变了，都会触发这个事件
        const unlisten = appWindow.listen('tauri://resize', checkMaximized);

        // 清理监听器
        return () => {
            unlisten.then(f => f());
        };
    }, []);

    // 最小化
    const handleMinimize = () => {
        appWindow.minimize();
    };

    // 切换最大化/还原
    const handleToggleMaximize = () => {
        appWindow.toggleMaximize();
        // 注意：这里不需要手动 setIsMaximized，因为 toggle 会触发 resize 事件，
        // 上面的 useEffect 会自动监听到并更新状态。
    };

    // 关闭
    const handleClose = () => {
        appWindow.close();
    };

    return (
        // 固定在右上角，z-index 设为最高，防止被其他层遮挡
        <div className="fixed top-0 right-0 z-[100] flex h-10 items-center">

            {/* 最小化按钮 */}
            <button
                onClick={handleMinimize}
                className="group flex h-full w-12 items-center justify-center transition-colors hover:bg-neutral-200 dark:hover:bg-white/10"
            >
                <VscChromeMinimize className="text-sm text-neutral-900 dark:text-neutral-100" />
            </button>

            {/* 最大化/还原按钮 (根据状态切换图标) */}
            <button
                onClick={handleToggleMaximize}
                className="group flex h-full w-12 items-center justify-center transition-colors hover:bg-neutral-200 dark:hover:bg-white/10"
            >
                {isMaximized ? (
                    // 还原图标 (两个小方块)
                    <VscChromeRestore className="text-sm text-neutral-900 dark:text-neutral-100" />
                ) : (
                    // 最大化图标 (一个方块)
                    <VscChromeMaximize className="text-sm text-neutral-900 dark:text-neutral-100" />
                )}
            </button>

            {/* 关闭按钮 (Hover 变红) */}
            <button
                onClick={handleClose}
                className="group flex h-full w-12 items-center justify-center transition-colors hover:bg-red-500"
            >
                {/* 关闭按钮图标在 hover 时变白，平时跟随主题色 */}
                <VscChromeClose className="text-base text-neutral-900 dark:text-neutral-100 group-hover:text-white" />
            </button>

        </div>
    );
}