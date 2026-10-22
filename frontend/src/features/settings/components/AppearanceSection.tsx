import { AnimatePresence, motion } from 'framer-motion';
import { MdAdd } from 'react-icons/md';
import clsx from 'clsx';

import { useTheme } from '@/hooks/useTheme';
import CustomTooltip from '@/components/common/CustomTooltip';
import {
    SettingsGroup,
    SettingsPopup,
    SettingsRow,
    SettingsSegmented,
    SettingsSwitch,
} from '@/features/settings/components/SettingsControls';

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
        lyricFillMode,
        setLyricFillMode,
        lyricFloatMode,
        setLyricFloatMode,
        reactiveBackgroundEnabled,
        setReactiveBackgroundEnabled,
        lyricLineBlendEnabled,
        setLyricLineBlendEnabled,
        artworkBackgroundEnabled,
        setArtworkBackgroundEnabled,
        moreTransitionsEnabled,
        setMoreTransitionsEnabled,
    } = useTheme();

    return (
        <>
            <SettingsGroup title="应用外观">
                <SettingsRow label="主题模式">
                    <SettingsSegmented
                        label="主题模式"
                        value={theme}
                        onChange={setTheme}
                        options={[
                            { value: 'light', label: '浅色' },
                            { value: 'dark', label: '深色' },
                            { value: 'system', label: '自动' },
                        ]}
                    />
                </SettingsRow>

                <SettingsRow label="主题颜色" description="影响按钮、开关、选中态等强调色">
                    <div className="flex items-center gap-2.5">
                        {/* Presets */}
                        {presetColors.map((color) => {
                            const isSelected = !isCustomColor && sourceColor === color.value;
                            return (
                                <CustomTooltip key={color.id} text={color.name}>
                                    <button
                                        onClick={() => setSourceColor(color.value, false)}
                                        aria-label={color.name}
                                        aria-pressed={isSelected}
                                        className={clsx(
                                            'grid h-5 w-5 place-items-center rounded-full shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.18)] transition-transform hover:scale-110 focus:outline-none',
                                            isSelected && 'ring-2 ring-on-surface/25 ring-offset-1 ring-offset-transparent'
                                        )}
                                        style={{ backgroundColor: color.value }}
                                    >
                                        {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                    </button>
                                </CustomTooltip>
                            );
                        })}

                        {/* Custom Picker */}
                        <CustomTooltip text="自定义颜色" className="relative">
                            <div
                                className={clsx(
                                    'relative grid h-5 w-5 cursor-pointer place-items-center rounded-full transition-transform hover:scale-110',
                                    isCustomColor && 'ring-2 ring-on-surface/25 ring-offset-1 ring-offset-transparent'
                                )}
                                style={{
                                    background: isCustomColor
                                        ? sourceColor
                                        : 'conic-gradient(from 90deg, #ff3b30, #ff9500, #ffcc00, #34c759, #00c7be, #007aff, #af52de, #ff2d55, #ff3b30)',
                                }}
                            >
                                {isCustomColor ? (
                                    <span className="pointer-events-none h-1.5 w-1.5 rounded-full bg-white" />
                                ) : (
                                    <MdAdd className="pointer-events-none text-sm text-white drop-shadow" />
                                )}

                                {/* Invisible Color Input covering the button */}
                                <input
                                    type="color"
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    value={sourceColor}
                                    onChange={(e) => setSourceColor(e.target.value, true)}
                                    aria-label="自定义颜色"
                                />
                            </div>
                        </CustomTooltip>
                    </div>
                </SettingsRow>

                <SettingsRow label="页面背景跟随封面" description="根据专辑封面或播放列表第一首歌曲的封面颜色，自动调整详情页背景">
                    <SettingsSwitch
                        label="页面背景跟随封面"
                        checked={artworkBackgroundEnabled}
                        onChange={setArtworkBackgroundEnabled}
                    />
                </SettingsRow>
                <SettingsRow label="更多的过渡动画">
                    <SettingsSwitch
                        label="更多的过渡动画"
                        checked={moreTransitionsEnabled}
                        onChange={setMoreTransitionsEnabled}
                    />
                </SettingsRow>
            </SettingsGroup>

            <SettingsGroup title="播放页">
                {/* Player Effect Selection */}
                <SettingsRow label="播放页效果">
                    <SettingsPopup
                        label="播放页效果"
                        value={playerEffectMode}
                        onChange={setPlayerEffectMode}
                        options={[{ value: 'performance', label: '性能优先' }, { value: 'animation', label: '动画优先' }]}
                    />
                </SettingsRow>
                <AnimatePresence initial={false}>
                    {playerEffectMode === 'animation' && (
                        <motion.div
                            key="reactive-background"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: 'easeInOut' }}
                            className="overflow-hidden"
                        >
                            <SettingsRow label="音乐律动背景" description="背景会随低频和鼓点轻微律动">
                                <SettingsSwitch
                                    label="音乐律动背景"
                                    checked={reactiveBackgroundEnabled}
                                    onChange={setReactiveBackgroundEnabled}
                                />
                            </SettingsRow>
                        </motion.div>
                    )}
                </AnimatePresence>
                <SettingsRow label="歌词上浮方式">
                    <SettingsPopup
                        label="歌词上浮方式"
                        value={lyricFloatMode}
                        onChange={setLyricFloatMode}
                        options={[{ value: 'character', label: '逐字符上浮' }, { value: 'word', label: '逐词组上浮' }]}
                    />
                </SettingsRow>
                <SettingsRow label="逐字歌词刷白方式">
                    <SettingsPopup
                        label="逐字歌词刷白方式"
                        value={lyricFillMode}
                        onChange={setLyricFillMode}
                        options={[{ value: 'line', label: '整行连续推进' }, { value: 'character', label: '逐字符推进' }]}
                    />
                </SettingsRow>
                <SettingsRow label="歌词背景混合" description="让歌词与背后的画面以增亮方式混合">
                    <SettingsSwitch
                        label="歌词背景混合"
                        checked={lyricLineBlendEnabled}
                        onChange={setLyricLineBlendEnabled}
                    />
                </SettingsRow>
            </SettingsGroup>
        </>
    );
}
