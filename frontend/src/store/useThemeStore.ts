import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateThemeVariables, PRESET_COLORS } from '../utils/themeColors';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
    themeMode: ThemeMode;
    sourceColor: string; // Hex Code
    isCustomColor: boolean;
    isDark: boolean; // Computed actual state

    setThemeMode: (mode: ThemeMode) => void;
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

            setThemeMode: (mode) => {
                set({ themeMode: mode });
                get().applyTheme();
            },

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
                isCustomColor: state.isCustomColor
            }),
        }
    )
);
