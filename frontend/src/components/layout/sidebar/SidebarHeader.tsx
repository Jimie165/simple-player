import clsx from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
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
  const reducedMotion = useReducedMotion();
  const transition = reducedMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 320, damping: 30 };
  return (
    <>
      {/* 返回按钮与应用图标 */}
      <div className="relative flex items-center h-14 w-full px-3 overflow-visible">
        <motion.div
          initial={false}
          animate={{ opacity: canGoBack ? 1 : 0, x: canGoBack ? 0 : -24, scale: canGoBack ? 1 : 0.85 }}
          transition={transition}
          inert={!canGoBack}
          aria-hidden={!canGoBack}
          className={clsx("absolute left-3 z-20", !canGoBack && "pointer-events-none")}
        >
          {/* 这里也改为 bottom */}
          <CustomTooltip text="返回上级" placement="bottom">
            <button
              onClick={onBack}
              aria-label="返回上级"
              className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-on-surface/8 transition-colors"
            >
              <MdArrowBack className="text-[24px] text-on-surface-variant" />
            </button>
          </CustomTooltip>
        </motion.div>

        <motion.div
          initial={false}
          animate={{ x: canGoBack ? 56 : 0 }}
          transition={transition}
          className="flex items-center"
        >
          <div className="w-12 h-12 flex items-center justify-center shrink-0">
            <img
              src={appLogo}
              alt="App Logo"
              className="w-8 h-8 object-contain rounded-full"
            />
          </div>

          <span className={clsx(
            "whitespace-nowrap font-semibold text-lg text-on-surface ml-2 transition-all duration-300",
            collapsed ? "opacity-0 w-0 scale-95" : "opacity-100 w-auto scale-100"
          )}>
            Simple Player
          </span>
        </motion.div>
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
              "bg-transparent group-hover:bg-on-surface/8"
            )} />

            {/* 图标 */}
            <div className="relative z-10 w-12 h-12 flex items-center justify-center shrink-0">
              <MdMenu className="text-[24px] text-on-surface-variant" />
            </div>
          </button>
        </CustomTooltip>
      </div>
    </>
  );
}
