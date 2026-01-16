import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { VscChromeClose, VscChromeMaximize, VscChromeMinimize, VscChromeRestore } from 'react-icons/vsc';

export default function TitleBar() {
    const [appWindow, setAppWindow] = useState<any>(null);
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        const win = getCurrentWindow();
        setAppWindow(win);

        // 1. 初始化时检查当前状态
        win.isMaximized().then(setIsMaximized);

        // 2. 建立监听器：当窗口大小改变时（包括拖拽边缘、Snap吸附、Win快捷键），同步状态
        const unlisten = win.listen('tauri://resize', async () => {
            const max = await win.isMaximized();
            setIsMaximized(max);
        });

        // 清理监听器
        return () => {
            unlisten.then((f) => f());
        };
    }, []);

    const minimize = () => appWindow?.minimize();

    const toggleMaximize = async () => {
        if (!appWindow) return;
        // 切换状态，图标状态会由上面的 listener 自动更新，这里不需要手动 set
        await appWindow.toggleMaximize();
    };

    const close = () => appWindow?.close();

    return (
        <div className="fixed top-0 left-0 right-0 h-10 flex justify-end items-center z-50 bg-transparent px-4 select-none transition-colors">

            {/* 空白拖拽区 (Spacer)
        1. flex-1: 占满左侧空间
        2. data-tauri-drag-region: 允许拖动
        3. onDoubleClick: 允许双击放大/还原 (Windows 标准体验)
      */}
            <div
                className="flex-1 h-full"
                data-tauri-drag-region
                onDoubleClick={toggleMaximize}
            />

            {/* 按钮区域 */}
            <div className="flex items-center gap-2 pl-2">
                <TitleButton onClick={minimize}>
                    <VscChromeMinimize />
                </TitleButton>
                <TitleButton onClick={toggleMaximize}>
                    {isMaximized ? <VscChromeRestore /> : <VscChromeMaximize />}
                </TitleButton>
                <TitleButton onClick={close} isClose>
                    <VscChromeClose />
                </TitleButton>
            </div>
        </div>
    );
}

function TitleButton({ children, onClick, isClose = false }: { children: React.ReactNode, onClick: () => void, isClose?: boolean }) {
    return (
        <div
            onClick={onClick}
            className={`
        flex h-8 w-8 items-center justify-center rounded-full transition-all cursor-pointer text-sm
        ${isClose
                    ? 'text-neutral-600 dark:text-neutral-400 hover:bg-red-500 hover:text-white'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 active:bg-neutral-300 dark:active:bg-neutral-600'}
      `}
        >
            {children}
        </div>
    );
}