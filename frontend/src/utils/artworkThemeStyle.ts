import type { CSSProperties } from 'react';
import type { ArtworkTheme } from '@/utils/artworkTheme';

export function getArtworkThemeStyle(theme: ArtworkTheme | null): CSSProperties & Record<string, string | undefined> {
    if (!theme) return {};
    const foreground = theme.isDark ? '#ffffffeb' : '#000000e0';
    const secondary = theme.isDark ? '#ffffffa3' : '#00000099';
    const style: CSSProperties & Record<string, string | undefined> = {
        colorScheme: theme.isDark ? 'dark' : 'light',
        '--artwork-background': theme.background,
        '--artwork-sidebar-background': theme.sidebarBackground,
        '--artwork-on-primary': theme.isDark ? theme.background : '#ffffff',
        '--md-sys-color-surface': theme.background,
        '--md-sys-color-surface-container-low': theme.background,
        '--md-sys-color-surface-container': theme.background,
        '--md-sys-color-surface-container-high': `color-mix(in srgb, ${foreground} 6%, ${theme.background})`,
        '--md-sys-color-surface-container-highest': `color-mix(in srgb, ${foreground} 10%, ${theme.background})`,
        '--md-sys-color-on-surface': foreground,
        '--md-sys-color-on-surface-variant': secondary,
        '--md-sys-color-outline-variant': `color-mix(in srgb, ${foreground} 20%, transparent)`,
        '--glass-surface': theme.isDark ? '#ffffff1a' : '#0000000d',
        '--glass-border': theme.isDark ? '#ffffff1a' : '#0000000d',
        '--color-glass-surface': theme.isDark ? '#ffffff1a' : '#0000000d',
        '--color-glass-border': theme.isDark ? '#ffffff1a' : '#0000000d',
        '--content-glass-background': theme.isDark ? '#26262899' : '#f5f5f78c',
        '--content-glass-edge': theme.isDark ? '#ffffff33' : '#0000000d',
        '--content-glass-divider': theme.isDark ? '#ffffff1a' : '#0000001a',
        '--content-glass-shadow': theme.isDark ? '#00000033' : '#0000001a',
    };
    // Tailwind's theme aliases are resolved at their declaration scope, so override
    // both the semantic values and their utility aliases within this page.
    for (const [key, value] of Object.entries(style)) {
        if (key.startsWith('--md-sys-color-')) {
            style[key.replace('--md-sys-color-', '--color-')] = value;
        }
    }

    return style;
}
