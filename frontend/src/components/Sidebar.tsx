import { useRef } from 'react';
import { MdHomeFilled, MdLibraryMusic, MdVideoLibrary, MdQueueMusic, MdFeaturedPlayList, MdSettings, MdMenu, MdArrowBack, MdSearch } from 'react-icons/md';
import clsx from 'clsx';
// 请确保你的 logo 图片路径正确
import appLogo from '../assets/logo.png';

interface SidebarProps {
    activeId: string;
    onNavigate: (id: string) => void;
    collapsed: boolean;
    onToggle: () => void;
    canGoBack: boolean;
    onBack: () => void;
}

type NavItem = {
    icon: React.ElementType;
    label: string;
    id: string;
};

const navItems: NavItem[] = [
    { id: 'home', icon: MdHomeFilled, label: '主页' },
    { id: 'library', icon: MdLibraryMusic, label: '音乐库' },
    { id: 'videos', icon: MdVideoLibrary, label: '视频库' },
    { id: 'queue', icon: MdQueueMusic, label: '播放队列' },
    { id: 'playlists', icon: MdFeaturedPlayList, label: '播放列表' },
];

export default function Sidebar({ activeId, onNavigate, collapsed, onToggle, canGoBack, onBack }: SidebarProps) {
    const searchInputRef = useRef<HTMLInputElement>(null);

    const handleSearchClick = () => {
        if (collapsed) {
            onToggle();
            setTimeout(() => searchInputRef.current?.focus(), 300);
        }
    };

    // --- 自定义 Tooltip 组件 (保持不变，用于折叠时显示提示) ---
    const CustomTooltip = ({ text, children, show }: { text: string, children: React.ReactNode, show: boolean }) => {
        return (
            <div className="group/tooltip relative flex items-center justify-center w-full">
                {children}
                {show && (
                    <div className={clsx(
                        "absolute top-full mt-1 z-[9999] px-2 py-1",
                        "left-1/2 -translate-x-1/2",
                        "bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900",
                        "text-[10px] font-medium rounded shadow-sm whitespace-nowrap pointer-events-none",
                        "opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-200 delay-100",
                    )}>
                        {text}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-[1px] border-4 border-transparent border-b-neutral-700 dark:border-b-neutral-200" />
                    </div>
                )}
            </div>
        );
    };

    // --- 导航按钮组件 (核心重构) ---
    const NavButton = ({ item, isBottom = false }: { item: NavItem, isBottom?: boolean }) => {
        const isActive = activeId === item.id;

        return (
            <button
                onClick={() => onNavigate(item.id)}
                className={clsx(
                    "group relative flex items-center min-h-[56px] w-full mb-1", // 移除 justify-start，改由内部 padding 控制
                    isBottom && "mt-auto"
                )}
            >
                {/* Tooltip 包裹 */}
                <CustomTooltip text={item.label} show={collapsed}>
                    {/* 1. 独立的背景层 (胶囊) 
               - 使用 absolute 定位，不占空间，只负责显示背景
               - 宽度根据 collapsed 状态变化：折叠时包图标，展开时包整行
            */}
                    <div className={clsx(
                        "absolute top-1/2 -translate-y-1/2 h-10 rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                        // 位置控制：始终从左侧 pl-3 (12px) 处开始
                        "left-3",
                        // 宽度控制：
                        // collapsed: w-12 (48px) -> 只包图标
                        // expanded: w-[calc(100%-24px)] -> 填满整行 (减去左右各 12px margin)
                        collapsed ? "w-12" : "w-[calc(100%-24px)]",

                        // 颜色逻辑 (选中高亮 vs 悬停高亮)
                        isActive
                            ? "bg-blue-100 dark:bg-blue-900/40"
                            : "bg-transparent group-hover:bg-neutral-200 dark:group-hover:bg-white/10"
                    )} />

                    {/* 2. 内容容器 (图标 + 文字) 
               - 使用 relative z-10 确保浮在背景层之上
               - pointer-events-none 让鼠标事件穿透到 button 上 (可选)
            */}
                    <div className="relative z-10 flex items-center w-full px-3"> {/* px-3 对应 left-3 */}

                        {/* 图标容器 */}
                        <div className="w-12 h-12 flex items-center justify-center shrink-0">
                            <item.icon className={clsx(
                                "text-[24px] transition-colors duration-200",
                                // 颜色修复：确保 dark 模式 hover 时是亮色
                                isActive
                                    ? "text-blue-900 dark:text-blue-100"
                                    : "text-neutral-500 group-hover:text-neutral-900 dark:text-neutral-400 dark:group-hover:text-neutral-200"
                            )} />
                        </div>

                        {/* 文字标签 */}
                        <span className={clsx(
                            "whitespace-nowrap overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                            // 文字颜色修复
                            isActive
                                ? "text-neutral-900 dark:text-neutral-50 font-medium"
                                : "text-neutral-600 dark:text-neutral-400 font-normal group-hover:text-neutral-900 dark:group-hover:text-neutral-200",

                            // 展开动画
                            collapsed ? "w-0 opacity-0 ml-0" : "w-auto opacity-100 ml-4"
                        )}>
                            <span className="text-sm tracking-wide">{item.label}</span>
                        </span>
                    </div>
                </CustomTooltip>
            </button>
        );
    };

    return (
        <div
            className={clsx(
                "flex h-full flex-col transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] z-50",
                "bg-[#FDFDFD] dark:bg-[#141414] border-r border-transparent dark:border-neutral-800",
                "py-2 overflow-x-hidden", // 隐藏横向溢出
                collapsed ? "w-[72px]" : "w-[280px]"
            )}
        >
            {/* 顶部 App Header 区 */}
            <div className="flex flex-col gap-1 pb-2">

                {/* Logo & Back */}
                <div className="relative flex items-center h-14 w-full px-3 overflow-visible">

                    {/* 后退按钮 */}
                    <div className={clsx(
                        "absolute left-3 z-20 transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)]",
                        canGoBack ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-8 pointer-events-none"
                    )}>
                        <CustomTooltip text="返回上级" show={true}>
                            <button
                                onClick={onBack}
                                className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
                            >
                                <MdArrowBack className="text-[24px] text-neutral-600 dark:text-neutral-300" />
                            </button>
                        </CustomTooltip>
                    </div>

                    {/* Logo 和 标题 */}
                    <div className={clsx(
                        "flex items-center transition-transform duration-500 ease-[cubic-bezier(0.2,0,0,1)]",
                        canGoBack ? "translate-x-[56px]" : "translate-x-0"
                    )}>
                        {/* 这里的 w-12 h-12 容器是为了保持对齐 */}
                        <div className="w-12 h-12 flex items-center justify-center shrink-0">
                            {/* 使用你的图片 Logo */}
                            <img
                                src={appLogo}
                                alt="App Logo"
                                className="w-8 h-8 object-contain rounded-full" // 控制图片尺寸，保持比例
                            />
                        </div>

                        <span className={clsx(
                            "whitespace-nowrap font-semibold text-lg text-neutral-800 dark:text-neutral-100 ml-2 transition-all duration-300",
                            collapsed ? "opacity-0 w-0 scale-95" : "opacity-100 w-auto scale-100"
                        )}>
                            Simple Player
                        </span>
                    </div>
                </div>

                {/* 汉堡菜单 */}
                <div className="px-3 mt-1">
                    <button
                        onClick={onToggle}
                        className="group relative flex items-center w-full min-h-[56px]"
                    >
                        <CustomTooltip text={collapsed ? "展开菜单" : "收起菜单"} show={true}>
                            {/* 背景层 - 与 NavButton 保持一致 */}
                            <div className={clsx(
                                "absolute top-1/2 -translate-y-1/2 h-10 rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                                "left-0",
                                collapsed ? "w-12" : "w-[calc(100%-0px)]",
                                "bg-transparent group-hover:bg-neutral-100 dark:group-hover:bg-white/5"
                            )} />

                            {/* 内容容器 - 图标固定在左侧 */}
                            <div className="relative z-10 flex items-center w-full">
                                <div className="w-12 h-12 flex items-center justify-center shrink-0">
                                    <MdMenu className="text-[24px] text-neutral-600 dark:text-neutral-300" />
                                </div>
                            </div>
                        </CustomTooltip>
                    </button>
                </div>

                {/* 搜索 FAB */}
                <div className="px-3 mt-1">
                    <div
                        onClick={handleSearchClick}
                        className="group relative flex items-center w-full min-h-[48px] cursor-pointer"
                    >
                        <CustomTooltip text="搜索" show={collapsed}>
                            {/* 背景层 - 圆形/圆角矩形切换 */}
                            <div className={clsx(
                                "absolute top-1/2 -translate-y-1/2 h-12 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                                "left-0",
                                collapsed 
                                    ? "w-12 rounded-full bg-transparent group-hover:bg-neutral-100 dark:group-hover:bg-neutral-800"
                                    : "w-full rounded-full bg-neutral-100 dark:bg-neutral-800"
                            )} />

                            {/* 内容容器 - 图标固定在左侧 */}
                            <div className="relative z-10 flex items-center w-full">
                                {/* 图标容器 - 固定宽度和位置 */}
                                <div className={clsx(
                                    "w-12 h-12 flex items-center justify-center shrink-0",
                                    collapsed ? "" : "ml-1"
                                )}>
                                    <MdSearch className={clsx(
                                        "text-[24px] transition-colors",
                                        collapsed ? "text-neutral-600 dark:text-neutral-400" : "text-neutral-500"
                                    )} />
                                </div>

                                {/* 输入框 - 展开时显示 */}
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="搜索"
                                    readOnly={collapsed}
                                    className={clsx(
                                        "bg-transparent text-base text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 focus:outline-none min-w-0 transition-all duration-300",
                                        collapsed ? "w-0 opacity-0 pointer-events-none" : "w-full opacity-100 ml-2 mr-4"
                                    )}
                                />
                            </div>
                        </CustomTooltip>
                    </div>
                </div>
            </div>

            {/* 导航列表 */}
            <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-2">
                {navItems.map((item) => <NavButton key={item.id} item={item} />)}
            </div>

            {/* 底部设置 */}
            <div className="mb-4">
                <NavButton isBottom item={{ id: 'settings', icon: MdSettings, label: '设置' }} />
            </div>
        </div>
    );
}