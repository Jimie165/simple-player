import clsx from 'clsx';
import { MdHomeFilled, MdLibraryMusic, MdVideoLibrary, MdFeaturedPlayList, MdSettings } from 'react-icons/md';
import SidebarHeader from './sidebar/SidebarHeader';
import SidebarSearch from './sidebar/SidebarSearch';
import SidebarNavButton from './sidebar/SidebarNavButton';
import type { NavItem } from './sidebar/SidebarNavButton';

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
                "relative z-50 shrink-0 h-full",
                "transition-[width] duration-300 cubic-bezier(0.2, 0.0, 0.0, 1.0)",
                layoutWidth
            )}
        >
            {/* 2. Visual Sidebar Container */}
            <div
                className={clsx(
                    "flex flex-col h-full overflow-hidden",
                    "bg-surface-container border-r border-transparent dark:border-outline-variant/10",
                    "transition-all duration-300 cubic-bezier(0.2, 0.0, 0.0, 1.0)",
                    "py-2",

                    // Overlay Expanded Mode: Break out of layout
                    (isOverlay && !collapsed) ? [
                        "absolute left-0 top-0 bottom-0 w-[280px]", // Floating
                        "rounded-r-[24px]", // Rounded corners for floating feel
                        "shadow-2xl", // Shadow for elevation
                        "bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl", // Glassmorphism
                        "border-neutral-200/50 dark:border-neutral-700/50" // Border adjustment
                    ] : [
                        "w-full", // Fill placeholder
                        "relative" // Stay in flow
                    ]
                )}
            >
                {/* 3. Inner Fixed Content (always 280px to prevent wrapping) */}
                <div className="w-[280px] flex flex-col flex-1 h-full min-h-0">

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
                            onClick={() => handleNavigate('settings')}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
