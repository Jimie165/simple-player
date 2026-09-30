import clsx from 'clsx';
import { MdHomeFilled, MdLibraryMusic, MdVideoLibrary, MdFeaturedPlayList, MdSettings } from 'react-icons/md';
import SidebarHeader from '@/components/layout/sidebar/SidebarHeader';
import SidebarSearch from '@/components/layout/sidebar/SidebarSearch';
import SidebarNavButton from '@/components/layout/sidebar/SidebarNavButton';
import type { NavItem } from '@/components/layout/sidebar/SidebarNavButton';

interface SidebarProps {
    activeId: string;
    onNavigate: (id: string) => void;
    collapsed: boolean;
    onToggle: () => void;
    canGoBack: boolean;
    onBack: () => void;
    onSearch: (query: string) => void;
    isOverlay?: boolean;
    onRequestClose?: () => void;
}

const navItems: NavItem[] = [
    { id: 'home', icon: MdHomeFilled, label: '主页' },
    { id: 'library', icon: MdLibraryMusic, label: '音乐库' },
    { id: 'videos', icon: MdVideoLibrary, label: '视频库' },
    { id: 'playlists', icon: MdFeaturedPlayList, label: '播放列表' },
];

export default function Sidebar({
    activeId,
    onNavigate,
    collapsed,
    onToggle,
    canGoBack,
    onBack,
    onSearch,
    isOverlay = false,
    onRequestClose
}: SidebarProps) {
    const handleNavigate = (id: string) => {
        onNavigate(id);
        if (isOverlay) {
            onRequestClose?.();
        }
    };

    // Determine the width of the layout placeholder
    // In Overlay mode, it always stays at collapsed width (72px) to not push content
    // In Normal mode, it expands/collapses with the sidebar
    const layoutWidth = isOverlay ? "w-[72px]" : (collapsed ? "w-[72px]" : "w-[280px]");

    return (
        // 1. Layout Placeholder (participates in Flex flow)
        <div
            className={clsx(
                "relative z-80 shrink-0 h-full",
                "transition-[width] duration-300 cubic-bezier(0.2, 0.0, 0.0, 1.0)",
                layoutWidth
            )}
        >
            {/* 2. Visual Sidebar Container */}
            <div
                className={clsx(
                    "relative flex flex-col h-full overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                    "py-2",

                    // 核心修复：Overlay 模式下保持定位一致，只改变宽度和样式
                    isOverlay ? [
                        "absolute left-0 top-0 bottom-0 z-50 rounded-r-3xl",
                        collapsed
                            ? "w-18 bg-transparent backdrop-blur-0"
                            : "w-70 bg-surface-container/80 dark:bg-surface-container-low/72 backdrop-blur-xl shadow-2xl"
                    ] : [
                        "relative w-full"
                    ]
                )}
            >
                <div
                    aria-hidden
                    className={clsx("pointer-events-none absolute inset-0 opacity-0", isOverlay && !collapsed && "dark:opacity-100")}
                    style={{
                        backgroundImage:
                            'linear-gradient(180deg, color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent) 0%, color-mix(in srgb, var(--md-sys-color-primary) 7%, transparent) 38%, transparent 100%)'
                    }}
                />
                {/* 3. Inner Fixed Content (always 280px to prevent wrapping) */}
                <div className="relative z-10 w-70 flex flex-col flex-1 h-full min-h-0">

                    {/* Header */}
                    <div className="flex flex-col gap-1 pb-2 shrink-0">
                        <SidebarHeader
                            collapsed={collapsed}
                            onToggle={onToggle}
                            canGoBack={canGoBack}
                            onBack={onBack}
                        />
                        <SidebarSearch
                            collapsed={collapsed}
                            onToggle={onToggle}
                            onSearch={onSearch}
                        />
                    </div>

                    {/* Navigation */}
                    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide py-2">
                        {navItems.map((item) => (
                            <SidebarNavButton
                                key={item.id}
                                item={item}
                                isActive={activeId === item.id}
                                collapsed={collapsed}
                                isOverlay={isOverlay}
                                onClick={() => handleNavigate(item.id)}
                            />
                        ))}
                    </div>

                    {/* Settings */}
                    <div className="mb-4 shrink-0">
                        <SidebarNavButton
                            isBottom
                            item={{ id: 'settings', icon: MdSettings, label: '设置' }}
                            isActive={activeId === 'settings'}
                            collapsed={collapsed}
                            isOverlay={isOverlay}
                            onClick={() => handleNavigate('settings')}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
