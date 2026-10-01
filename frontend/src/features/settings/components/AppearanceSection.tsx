import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { MdAdd, MdBrightness6, MdCheck, MdColorLens, MdExpandMore } from 'react-icons/md';
import clsx from 'clsx';

import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/store/useThemeStore';
import CustomTooltip from '@/components/common/CustomTooltip';

type ThemeMode = 'light' | 'dark' | 'system';

function PopupChoice<T extends string>({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: T;
    onChange: (value: T) => void;
    options: { value: T; label: string }[];
}) {
    return (
        <Listbox value={value} onChange={onChange}>
            {({ open }) => (
                <div className="settings-card flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm text-on-surface">
                    <span className="font-medium">{label}</span>
                    <div className="relative shrink-0">
                        <ListboxButton
                            aria-label={label}
                            className={clsx(
                                "settings-control flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm text-on-surface transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                                open ? "border-primary/50" : "border-outline-variant/30 hover:border-primary/30"
                            )}
                        >
                            {options.find((option) => option.value === value)?.label}
                            <MdExpandMore className={clsx("shrink-0 text-lg text-on-surface-variant transition-transform duration-200", open && "rotate-180")} />
                        </ListboxButton>
                        <AnimatePresence>
                            {open && (
                                <ListboxOptions
                                    static
                                    anchor="bottom end"
                                    as={motion.div}
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: "easeOut" } }}
                                    exit={{ opacity: 0, y: -8, transition: { duration: 0.15, ease: "easeIn" } }}
                                    className="settings-card z-50 min-w-44 rounded-xl border border-outline-variant/30 p-1 shadow-xl focus:outline-none"
                                >
                                    {options.map((option) => (
                                        <ListboxOption
                                            key={option.value}
                                            value={option.value}
                                            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-on-surface data-focus:bg-primary/5 data-selected:text-primary"
                                        >
                                            <span>{option.label}</span>
                                            {value === option.value && <MdCheck className="shrink-0 text-primary" />}
                                        </ListboxOption>
                                    ))}
                                </ListboxOptions>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            )}
        </Listbox>
    );
}

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
    const reducedVisualEffects = useThemeStore((state) => state.reducedVisualEffects);
    const setReducedVisualEffects = useThemeStore((state) => state.setReducedVisualEffects);
    const graphicsUnavailable = useThemeStore((state) => state.graphicsUnavailable);
    const {
        theme,
        setTheme,
        sourceColor,
        setSourceColor,
        presetColors,
        isCustomColor,
        playerEffectMode,
        setPlayerEffectMode,
        lyricFillMode,
        setLyricFillMode,
        reactiveBackgroundEnabled,
        setReactiveBackgroundEnabled,
        lyricLineBlendEnabled,
        setLyricLineBlendEnabled,
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

            <div className="space-y-2">
                <PopupChoice
                    label="简化视觉效果"
                    value={reducedVisualEffects ? 'enabled' : 'disabled'}
                    onChange={(value) => setReducedVisualEffects(value === 'enabled')}
                    options={[{ value: 'disabled', label: '关闭' }, { value: 'enabled', label: '开启' }]}
                />
                <p className="px-1 text-xs text-on-surface-variant">
                    {graphicsUnavailable
                        ? '图形效果不可用，已自动使用静态背景和实色面板。重启应用后重新检测。'
                        : '使用静态封面背景，关闭顶栏、播放器、菜单等区域的毛玻璃。适合虚拟机或图形显示异常时开启。'}
                </p>
            </div>

            {/* Player Effect Selection */}
            <div>
                <PopupChoice
                    label="播放页效果"
                    value={playerEffectMode}
                    onChange={setPlayerEffectMode}
                    options={[{ value: 'performance', label: '性能优先' }, { value: 'animation', label: '动画优先' }]}
                />
                <AnimatePresence initial={false}>
                    {playerEffectMode === 'animation' && (
                        <motion.div
                            key="reactive-background"
                            initial={{ height: 0, opacity: 0, marginTop: 0 }}
                            animate={{ height: 'auto', opacity: 1, marginTop: 12 }}
                            exit={{ height: 0, opacity: 0, marginTop: 0 }}
                            transition={{ duration: 0.22, ease: 'easeInOut' }}
                            className="overflow-hidden"
                        >
                            <div className="settings-card flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left">
                                <span>
                                    <span className="block text-sm font-medium text-on-surface">音乐律动背景</span>
                                    <span className="block text-xs text-on-surface-variant">背景会随低频和鼓点轻微律动</span>
                                </span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-label="音乐律动背景"
                                    aria-checked={reactiveBackgroundEnabled}
                                    onClick={() => setReactiveBackgroundEnabled(!reactiveBackgroundEnabled)}
                                    className="flex shrink-0 items-center justify-center rounded-full p-2 -mr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                    <span className={clsx(
                                        "relative block h-6 w-11 rounded-full transition-colors",
                                        reactiveBackgroundEnabled ? "bg-primary" : "bg-outline-variant/50",
                                    )}>
                                        <span
                                            className={clsx(
                                                "absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                                                reactiveBackgroundEnabled ? "translate-x-5" : "translate-x-0",
                                            )}
                                        />
                                    </span>
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div className="mt-3">
                    <PopupChoice
                        label="逐字歌词刷白方式"
                        value={lyricFillMode}
                        onChange={setLyricFillMode}
                        options={[{ value: 'line', label: '整行连续推进' }, { value: 'character', label: '逐字符推进' }]}
                    />
                </div>
                <div className="mt-3">
                    <div className="settings-card flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left">
                        <span>
                            <span className="block text-sm font-medium text-on-surface">歌词背景混合</span>
                            <span className="block text-xs text-on-surface-variant">让歌词与背后的画面以增亮方式混合</span>
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-label="歌词背景混合"
                            aria-checked={lyricLineBlendEnabled}
                            onClick={() => setLyricLineBlendEnabled(!lyricLineBlendEnabled)}
                            className="flex shrink-0 items-center justify-center rounded-full p-2 -mr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                            <span className={clsx(
                                'relative block h-6 w-11 rounded-full transition-colors',
                                lyricLineBlendEnabled ? 'bg-primary' : 'bg-outline-variant/50',
                            )}>
                                <span className={clsx(
                                    'absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                                    lyricLineBlendEnabled ? 'translate-x-5' : 'translate-x-0',
                                )} />
                            </span>
                        </button>
                    </div>
                </div>
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
