import { MdAdd, MdBrightness6, MdCheck, MdColorLens, MdGraphicEq, MdWeb } from 'react-icons/md';
import clsx from 'clsx';

import { useTheme } from '@/hooks/useTheme';
import CustomTooltip from '@/components/common/CustomTooltip';

type ThemeMode = 'light' | 'dark' | 'system';

function ThemeOption({
    val,
    label,
    current,
    onSelect,
}: {
    val: ThemeMode;
    label: string;
    current: ThemeMode;
    onSelect: (value: ThemeMode) => void;
}) {
    return (
        <button
            onClick={() => onSelect(val)}
            className={clsx(
                "flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-all border",
                current === val
                    ? "bg-primary/10 text-primary border-primary/20 ring-1 ring-primary/10"
                    : "settings-control border text-on-surface-variant"
            )}
        >
            <span>{label}</span>
            {current === val && <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--md-sys-color-primary),0.5)]" />}
        </button>
    );
}

export default function AppearanceSection() {
    const {
        theme,
        setTheme,
        sourceColor,
        setSourceColor,
        presetColors,
        isCustomColor,
        playerEffectMode,
        setPlayerEffectMode,
        reactiveBackgroundEnabled,
        setReactiveBackgroundEnabled,
    } = useTheme();

    return (
        <section className="space-y-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider px-1">
                <MdBrightness6 className="text-lg" />
                <span>外观与主题</span>
            </div>

            {/* Mode Selection */}
            <div className="space-y-3">
                <h4 className="text-sm font-medium text-on-surface px-1">主题模式</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <ThemeOption val="light" label="浅色模式" current={theme} onSelect={setTheme} />
                    <ThemeOption val="dark" label="深色模式" current={theme} onSelect={setTheme} />
                    <ThemeOption val="system" label="跟随系统" current={theme} onSelect={setTheme} />
                </div>
            </div>

            {/* Player Effect Selection */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                    <MdWeb className="text-primary text-lg" />
                    <h4 className="text-sm font-medium text-on-surface">播放页效果</h4>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                        onClick={() => setPlayerEffectMode('performance')}
                        className={clsx(
                            "flex items-center justify-between gap-4 rounded-xl px-4 py-3 text-left text-sm font-medium transition-all border",
                            playerEffectMode === 'performance'
                                ? "bg-primary/10 text-primary border-primary/20 ring-1 ring-primary/10"
                                : "settings-control border text-on-surface-variant"
                        )}
                    >
                        <span>性能优先</span>
                        {playerEffectMode === 'performance' && <div className="h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--md-sys-color-primary),0.5)]" />}
                    </button>
                    <button
                        onClick={() => setPlayerEffectMode('animation')}
                        className={clsx(
                            "flex items-center justify-between gap-4 rounded-xl px-4 py-3 text-left text-sm font-medium transition-all border",
                            playerEffectMode === 'animation'
                                ? "bg-primary/10 text-primary border-primary/20 ring-1 ring-primary/10"
                                : "settings-control border text-on-surface-variant"
                        )}
                    >
                        <span>动画优先</span>
                        {playerEffectMode === 'animation' && <div className="h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--md-sys-color-primary),0.5)]" />}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => setReactiveBackgroundEnabled(!reactiveBackgroundEnabled)}
                    disabled={playerEffectMode !== 'animation'}
                    className={clsx(
                        "settings-card flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-opacity",
                        playerEffectMode !== 'animation' && "cursor-not-allowed opacity-45",
                    )}
                >
                    <span className="flex items-center gap-3">
                        <MdGraphicEq className="text-xl text-primary" />
                        <span>
                            <span className="block text-sm font-medium text-on-surface">音乐律动背景</span>
                            <span className="block text-xs text-on-surface-variant">背景会随低频和鼓点轻微律动</span>
                        </span>
                    </span>
                    <span
                        className={clsx(
                            "relative h-6 w-11 rounded-full transition-colors",
                            reactiveBackgroundEnabled && playerEffectMode === 'animation'
                                ? "bg-primary"
                                : "bg-outline-variant/50",
                        )}
                    >
                        <span
                            className={clsx(
                                "absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                                reactiveBackgroundEnabled && playerEffectMode === 'animation'
                                    ? "translate-x-6"
                                    : "translate-x-1",
                            )}
                        />
                    </span>
                </button>
            </div>

            {/* Color Selection */}
            <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <h4 className="text-sm font-medium text-on-surface">应用配色</h4>
                    <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 px-2 py-1 rounded-md">
                        <MdColorLens />
                        <span>主题颜色</span>
                    </div>
                </div>

                <div className="settings-card rounded-2xl p-5">
                    <div className="flex flex-wrap gap-4 items-center">
                        {/* Presets */}
                        {presetColors.map((color) => {
                            const isSelected = !isCustomColor && sourceColor === color.value;
                            return (
                                <CustomTooltip key={color.id} text={color.name}>
                                    <button
                                        onClick={() => setSourceColor(color.value, false)}
                                        aria-label={color.name}
                                        className="group relative w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none"
                                    >
                                        <div
                                            className="absolute inset-0 rounded-full border border-outline-variant/20 shadow-sm"
                                            style={{ backgroundColor: color.value }}
                                        />
                                        {isSelected && (
                                            <MdCheck className="relative z-10 text-white text-xl drop-shadow-md" />
                                        )}
                                    </button>
                                </CustomTooltip>
                            );
                        })}

                        {/* Divider */}
                        <div className="w-px h-8 bg-outline-variant/30 mx-2" />

                        {/* Custom Picker */}
                        <CustomTooltip text="自定义颜色" className="relative group">
                            <div
                                className={clsx(
                                    "w-12 h-12 rounded-full flex items-center justify-center border transition-all cursor-pointer overflow-hidden",
                                    isCustomColor
                                        ? "border-primary ring-2 ring-primary/30"
                                        : "border-outline-variant/50 border-dashed hover:border-primary/50"
                                )}
                            >
                                {isCustomColor ? (
                                    <div
                                        className="w-full h-full"
                                        style={{ backgroundColor: sourceColor }}
                                    />
                                ) : (
                                    <MdAdd className="text-2xl text-on-surface-variant" />
                                )}

                                {/* Invisible Color Input covering the button */}
                                <input
                                    type="color"
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                    value={sourceColor}
                                    onChange={(e) => setSourceColor(e.target.value, true)}
                                    aria-label="自定义颜色"
                                />
                            </div>
                            {isCustomColor && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <MdCheck className="text-white text-xl drop-shadow-md mix-blend-difference" />
                                </div>
                            )}
                        </CustomTooltip>
                        <span className="text-sm text-on-surface-variant ml-2">自定义</span>
                    </div>
                </div>
            </div>
        </section>
    );
}
