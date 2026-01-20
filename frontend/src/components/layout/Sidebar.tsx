import clsx from 'clsx';
import { MdHomeFilled, MdLibraryMusic, MdVideoLibrary, MdQueueMusic, MdFeaturedPlayList, MdSettings } from 'react-icons/md';
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
}

const navItems: NavItem[] = [
    { id: 'home', icon: MdHomeFilled, label: '主页' },
    { id: 'library', icon: MdLibraryMusic, label: '音乐库' },
    { id: 'videos', icon: MdVideoLibrary, label: '视频库' },
    { id: 'playlists', icon: MdFeaturedPlayList, label: '播放列表' },
];

export default function Sidebar({ activeId, onNavigate, collapsed, onToggle, canGoBack, onBack, onSearch }: SidebarProps) {
    return (
        <div
            className={clsx(
                // 修改点 1: 添加 overflow-hidden 禁止根容器出现滚动条
                "flex h-full flex-col transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] z-50 overflow-hidden",
                "bg-[#FDFDFD] dark:bg-[#141414] border-r border-transparent dark:border-neutral-800",
                "py-2", // 保持 py-2
                collapsed ? "w-[72px]" : "w-[280px]"
            )}
        >
            {/* 顶部 Header 区 (固定不滚动) */}
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

            {/* 导航列表 (占据剩余空间，允许滚动) */}
            {/* 修改点 2: 确保 flex-1 和 overflow-y-auto 在这里生效，并隐藏 x 轴溢出 */}
            <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-2">
                {navItems.map((item) => (
                    <SidebarNavButton
                        key={item.id}
                        item={item}
                        isActive={activeId === item.id}
                        collapsed={collapsed}
                        onClick={() => onNavigate(item.id)}
                    />
                ))}
            </div>

            {/* 底部设置按钮 (固定不滚动) */}
            <div className="mb-4 shrink-0">
                <SidebarNavButton
                    isBottom
                    item={{ id: 'settings', icon: MdSettings, label: '设置' }}
                    isActive={activeId === 'settings'}
                    collapsed={collapsed}
                    onClick={() => onNavigate('settings')}
                />
            </div>
        </div>
    );
}