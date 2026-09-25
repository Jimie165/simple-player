import { useThemeStore } from '@/store/useThemeStore';
import { PRESET_COLORS } from '@/utils/themeColors';

/**
 * Facade Hook for Theme Store
 * 保持简单的 API 供 UI 组件使用
 */
export function useTheme() {
    const themeMode = useThemeStore((state) => state.themeMode);
    const setThemeMode = useThemeStore((state) => state.setThemeMode);

    const sourceColor = useThemeStore((state) => state.sourceColor);
    const setSourceColor = useThemeStore((state) => state.setSourceColor);

    const isCustomColor = useThemeStore((state) => state.isCustomColor);
    const isDark = useThemeStore((state) => state.isDark);

    const playerEffectMode = useThemeStore((state) => state.playerEffectMode);
    const setPlayerEffectMode = useThemeStore((state) => state.setPlayerEffectMode);
    const lyricFillMode = useThemeStore((state) => state.lyricFillMode);
    const setLyricFillMode = useThemeStore((state) => state.setLyricFillMode);
    const fullScreenMode = useThemeStore((state) => state.fullScreenMode);
    const setFullScreenMode = useThemeStore((state) => state.setFullScreenMode);
    const reactiveBackgroundEnabled = useThemeStore((state) => state.reactiveBackgroundEnabled);
    const setReactiveBackgroundEnabled = useThemeStore((state) => state.setReactiveBackgroundEnabled);

    return {
        theme: themeMode,
        setTheme: setThemeMode, // Alias for compatibility

        themeMode,
        setThemeMode,

        sourceColor,
        setSourceColor,

        isCustomColor,
        isDark,

        playerEffectMode,
        setPlayerEffectMode,
        lyricFillMode,
        setLyricFillMode,
        fullScreenMode,
        setFullScreenMode,
        reactiveBackgroundEnabled,
        setReactiveBackgroundEnabled,

        presetColors: PRESET_COLORS
    };
}
