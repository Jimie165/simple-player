import { useState, useEffect } from 'react';
import { systemService } from '@/services/systemService'; // 确保 systemService 已创建
import { VscChromeMinimize, VscChromeMaximize, VscChromeRestore, VscChromeClose } from 'react-icons/vsc';

export default function TitleBar() {
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        const checkMaximized = async () => {
            setIsMaximized(await systemService.isMaximized());
        };
        void (checkMaximized()).catch(console.error);

        const unlisten = systemService.onResize(() => { void checkMaximized().catch(console.error); });
        return () => {
            unlisten
                .then(f => {
                    if (f) {
                        Promise.resolve(f()).catch((e: unknown) => console.warn("TitleBar unlisten failed (async)", e));
                    }
                })
                .catch(e => console.warn("Failed to get resize unlisten handle", e));
        };
    }, []);

    return (
        // 修改点 1: 添加 pr-3 (右侧留白)，gap-1 (按钮间距)
        <div className="fixed top-0 right-0 z-100 flex h-10 items-center pr-3 gap-1">

            {/* 最小化 */}
            <button
                onClick={() => { void systemService.minimize().catch(console.error); }}
                className="group flex h-8 w-8 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-on-surface/10"
            >
                <VscChromeMinimize className="text-lg" />
            </button>

            {/* 最大化/还原 */}
            <button
                onClick={() => { void systemService.toggleMaximize().catch(console.error); }}
                className="group flex h-8 w-8 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-on-surface/10"
            >
                {isMaximized ? (
                    <VscChromeRestore className="text-lg" />
                ) : (
                    <VscChromeMaximize className="text-lg" />
                )}
            </button>

            {/* 关闭 */}
            <button
                onClick={() => { void systemService.close().catch(console.error); }}
                // 关闭按钮保留 M3 风格，但在 Hover 时使用红色背景+白字
                className="group flex h-8 w-8 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-red-500 hover:text-white"
            >
                {/* 图标在 group-hover 时变白 */}
                <VscChromeClose className="text-lg" />
            </button>

        </div>
    );
}
