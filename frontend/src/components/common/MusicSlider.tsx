import clsx from 'clsx';

interface MusicSliderProps {
    value: number;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
    onChange: (value: number) => void;
    onMouseDown?: () => void;
    onMouseUp?: () => void;
    className?: string;
    // 颜色配置，默认为白色方案（适配沉浸式）
    trackColor?: string;
    fillColor?: string;
    // 允许通过 prop 覆盖默认的高度类
    trackHeightClass?: string;
    hoverHeightClass?: string;
    activeHeightClass?: string;
}

/**
 * MusicSlider - Apple Music 风格的滑动条
 * 特点：悬停时加粗，不显示滑块圆点 (Thumb)
 */
export default function MusicSlider({
    value, min, max, step = 1, disabled = false,
    onChange, onMouseDown, onMouseUp,
    className,
    trackColor = "bg-white/20",
    fillColor = "bg-white/80",
    trackHeightClass = "h-1.5",
    hoverHeightClass = "group-hover:h-2.5",
    activeHeightClass = "group-active:h-3"
}: MusicSliderProps) {
    const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;

    return (
        <div className={clsx(
            "relative w-full group flex items-center h-4",
            disabled ? "opacity-40 pointer-events-none cursor-not-allowed" : "",
            className
        )}>
            {/* 轨道 & 填充容器 */}
            <div className={clsx(
                "relative w-full rounded-full overflow-hidden transition-all duration-200 ease-out",
                trackHeightClass,
                !disabled && hoverHeightClass,
                !disabled && activeHeightClass,
                trackColor
            )}>
                {/* 填充进度 */}
                <div
                    className={clsx("absolute left-0 top-0 bottom-0 rounded-full", fillColor)}
                    style={{ width: `${percent}%` }}
                />
            </div>

            {/* 原生 Input 用于交互 (完全透明) */}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp}
                onChange={(e) => onChange(Number(e.target.value))}
                className={clsx(
                    "absolute inset-0 w-full h-full opacity-0 z-10 appearance-none",
                    disabled ? "cursor-not-allowed" : "cursor-pointer",
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-0 [&::-webkit-slider-thumb]:h-0",
                    "[&::-moz-range-thumb]:w-0 [&::-moz-range-thumb]:h-0 [&::-moz-range-thumb]:border-0"
                )}
            />
        </div>
    );
}
