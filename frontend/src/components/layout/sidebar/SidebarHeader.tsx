import clsx from 'clsx';
import { MdArrowBack, MdMenu } from 'react-icons/md';
import CustomTooltip from '@/components/common/CustomTooltip';
import appLogo from '@/assets/logo.png';

interface SidebarHeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  canGoBack: boolean;
  onBack: () => void;
}

export default function SidebarHeader({ collapsed, onToggle, canGoBack, onBack }: SidebarHeaderProps) {
  return (
    <>
      {/* Logo & Back (保持不变，仅修改 Tooltip 位置) */}
      <div className="relative flex items-center h-14 w-full px-3 overflow-visible">
        <div className={clsx(
          "absolute left-3 z-20 transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)]",
          canGoBack ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-8 pointer-events-none"
        )}>
          {/* 这里也改为 bottom */}
          <CustomTooltip text="返回上级" placement="bottom">
            <button
              onClick={onBack}
              className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
            >
              <MdArrowBack className="text-[24px] text-neutral-600 dark:text-neutral-300" />
            </button>
          </CustomTooltip>
        </div>

        <div className={clsx(
          "flex items-center transition-transform duration-500 ease-[cubic-bezier(0.2,0,0,1)]",
          canGoBack ? "translate-x-[56px]" : "translate-x-0"
        )}>
          <div className="w-12 h-12 flex items-center justify-center shrink-0">
            <img
              src={appLogo}
              alt="App Logo"
              className="w-8 h-8 object-contain rounded-full"
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

      {/* 汉堡菜单 (重点修改) */}
      <div className="px-3 mt-1 flex">
        {/* Tooltip 只包裹按钮本身，不占满整行，这样 tooltip 会出现在图标下方 */}
        <CustomTooltip
          text={collapsed ? "展开菜单" : "收起菜单"}
          placement="bottom"
        // 移除 w-full，让 tooltip 只包裹按钮本身
        >
          <button
            onClick={onToggle}
            // 关键：固定 w-12，这样它永远靠左，背景色也永远只包住图标
            className="group relative flex items-center justify-center w-12 min-h-[56px]"
          >
            {/* 背景层：固定 w-12，只在 hover 时出现 */}
            <div className={clsx(
              "absolute top-1/2 -translate-y-1/2 h-10 rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
              "left-0 w-12", // 始终固定宽度和位置
              "bg-transparent group-hover:bg-neutral-100 dark:group-hover:bg-white/5"
            )} />

            {/* 图标 */}
            <div className="relative z-10 w-12 h-12 flex items-center justify-center shrink-0">
              <MdMenu className="text-[24px] text-neutral-600 dark:text-neutral-300" />
            </div>
          </button>
        </CustomTooltip>
      </div>
    </>
  );
}
