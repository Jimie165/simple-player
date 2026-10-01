import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateThemeVariables, PRESET_COLORS } from '@/utils/themeColors';

type ThemeMode = 'light' | 'dark' | 'system';
export type PlayerEffectMode = 'performance' | 'animation';
export type LyricFillMode = 'line' | 'character';

interface ThemeState {
    themeMode: ThemeMode;
    sourceColor: string; // Hex Code
    isCustomColor: boolean;
    isDark: boolean; // Computed actual state
    playerEffectMode: PlayerEffectMode;
    lyricFillMode: LyricFillMode;
    fullScreenMode: PlayerEffectMode;
    reactiveBackgroundEnabled: boolean;
    lyricLineBlendEnabled: boolean;
    reducedVisualEffects: boolean;
    graphicsUnavailable: boolean;

    setThemeMode: (mode: ThemeMode) => void;
    setPlayerEffectMode: (mode: PlayerEffectMode) => void;
    setLyricFillMode: (mode: LyricFillMode) => void;
    setFullScreenMode: (mode: PlayerEffectMode) => void;
    setReactiveBackgroundEnabled: (enabled: boolean) => void;
    setLyricLineBlendEnabled: (enabled: boolean) => void;
    setReducedVisualEffects: (enabled: boolean) => void;
    setGraphicsUnavailable: () => void;
    setSourceColor: (hex: string, isCustom?: boolean) => void;

    // Internal use: update computed state and apply CSS
    applyTheme: () => void;
    init: () => () => void; // Returns cleanup function
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            themeMode: 'system',
            sourceColor: PRESET_COLORS[0].value, // Default Blue
            isCustomColor: false,
            isDark: false,
            playerEffectMode: 'performance',
            lyricFillMode: 'line',
            fullScreenMode: 'performance',
            reactiveBackgroundEnabled: false,
            lyricLineBlendEnabled: false,
            reducedVisualEffects: false,
            graphicsUnavailable: false,

            setThemeMode: (mode) => {
                set({ themeMode: mode });
                get().applyTheme();
            },

            setPlayerEffectMode: (mode) => {
                set({ playerEffectMode: mode, fullScreenMode: mode });
            },
            setLyricFillMode: (mode) => set({ lyricFillMode: mode }),

            setFullScreenMode: (mode) => {
                set({ playerEffectMode: mode, fullScreenMode: mode });
            },

            setReactiveBackgroundEnabled: (enabled) => {
                set({ reactiveBackgroundEnabled: enabled });
            },
            setLyricLineBlendEnabled: (enabled) => set({ lyricLineBlendEnabled: enabled }),
            setReducedVisualEffects: (enabled) => set({ reducedVisualEffects: enabled }),
            setGraphicsUnavailable: () => set({ graphicsUnavailable: true }),

            setSourceColor: (hex, isCustom = false) => {
                set({ sourceColor: hex, isCustomColor: isCustom });
                get().applyTheme();
            },

            applyTheme: () => {
                const { themeMode, sourceColor } = get();
                const root = window.document.documentElement;
                const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

                let isDark = false;
                if (themeMode === 'dark') {
                    isDark = true;
                } else if (themeMode === 'light') {
                    isDark = false;
                } else {
                    isDark = mediaQuery.matches;
                }

                // 1. Toggle Dark Class
                if (isDark) {
                    root.classList.add('dark');
                } else {
                    root.classList.remove('dark');
                }

                // 2. Generate and Apply CSS Variables
                const variables = generateThemeVariables(sourceColor, isDark);
                Object.entries(variables).forEach(([key, value]) => {
                    root.style.setProperty(key, value);
                });

                // Update computed state
                set({ isDark });
            },

            init: () => {
                const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
                const { applyTheme } = get();

                // Initial Apply
                applyTheme();

                // Listener
                const handleChange = () => {
                    const { themeMode } = get();
                    if (themeMode === 'system') {
                        applyTheme();
                    }
                };

                mediaQuery.addEventListener('change', handleChange);
                return () => mediaQuery.removeEventListener('change', handleChange);
            }
        }),
        {
            name: 'theme-storage',
            partialize: (state) => ({
                themeMode: state.themeMode,
                sourceColor: state.sourceColor,
                isCustomColor: state.isCustomColor,
                playerEffectMode: state.playerEffectMode,
                lyricFillMode: state.lyricFillMode,
                fullScreenMode: state.fullScreenMode,
                reactiveBackgroundEnabled: state.reactiveBackgroundEnabled,
                lyricLineBlendEnabled: state.lyricLineBlendEnabled,
                reducedVisualEffects: state.reducedVisualEffects,
            }),
            merge: (persisted, current) => {
                const persistedState = persisted as Partial<ThemeState> | undefined;
                const legacyMode = persistedState?.fullScreenMode as unknown;
                const persistedMode = persistedState?.playerEffectMode as unknown;
                const playerEffectMode =
                    persistedMode === 'animation' || legacyMode === 'immersive'
                        ? 'animation'
                        : 'performance';

                return {
                    ...current,
                    ...persistedState,
                    playerEffectMode,
                    lyricFillMode: persistedState?.lyricFillMode === 'character' ? 'character' : 'line',
                    fullScreenMode: playerEffectMode,
                    reactiveBackgroundEnabled: persistedState?.reactiveBackgroundEnabled === true,
                    lyricLineBlendEnabled: persistedState?.lyricLineBlendEnabled === true,
                    reducedVisualEffects: persistedState?.reducedVisualEffects === true,
                    graphicsUnavailable: false,
                };
            },
        }
    )
);
