import {
    argbFromHex,
    themeFromSourceColor,
    hexFromArgb,
} from '@material/material-color-utilities';

// 预设种子颜色
export const PRESET_COLORS = [
    { id: 'blue', name: '默认蓝', value: '#005AC1' },
    { id: 'purple', name: '罗兰紫', value: '#6750A4' },
    { id: 'green', name: '森林绿', value: '#006C4C' },
    { id: 'orange', name: '活力橙', value: '#984800' },
    { id: 'red', name: '宝石红', value: '#B3261E' },
    { id: 'pink', name: '樱花粉', value: '#D02B6D' },
    { id: 'cyan', name: '青色', value: '#006874' },
];

export interface ThemeVariables {
    [key: string]: string;
}

/**
 * 根据种子颜色生成 CSS 变量
 * 强调色区分操作，低饱和表面色提供页面与容器层级。
 * 封面色板仍由内容区域独立覆盖。
 */
export function generateThemeVariables(sourceHex: string, isDark: boolean): ThemeVariables {
    const argb = argbFromHex(sourceHex);
    const theme = themeFromSourceColor(argb);
    const scheme = isDark ? theme.schemes.dark : theme.schemes.light;
    const surfaceTone = (tone: number) => hexFromArgb(theme.palettes.neutral.tone(tone));

    return {
        '--player-primary-light': hexFromArgb(theme.palettes.primary.tone(35)),
        '--player-primary-dark': hexFromArgb(theme.palettes.primary.tone(85)),
        // Primary
        '--md-sys-color-primary': hexFromArgb(scheme.primary),
        '--md-sys-color-on-primary': hexFromArgb(scheme.onPrimary),
        '--md-sys-color-primary-container': hexFromArgb(scheme.primaryContainer),
        '--md-sys-color-on-primary-container': hexFromArgb(scheme.onPrimaryContainer),

        // Secondary
        '--md-sys-color-secondary': hexFromArgb(scheme.secondary),
        '--md-sys-color-on-secondary': hexFromArgb(scheme.onSecondary),
        '--md-sys-color-secondary-container': hexFromArgb(scheme.secondaryContainer),
        '--md-sys-color-on-secondary-container': hexFromArgb(scheme.onSecondaryContainer),

        // Tertiary
        '--md-sys-color-tertiary': hexFromArgb(scheme.tertiary),
        '--md-sys-color-on-tertiary': hexFromArgb(scheme.onTertiary),
        '--md-sys-color-tertiary-container': hexFromArgb(scheme.tertiaryContainer),
        '--md-sys-color-on-tertiary-container': hexFromArgb(scheme.onTertiaryContainer),

        '--md-sys-color-background': `color-mix(in srgb, ${hexFromArgb(scheme.background)} ${isDark ? 50 : 95}%, ${isDark ? 'black' : 'white'})`,
        '--md-sys-color-surface': hexFromArgb(scheme.surface),
        '--md-sys-color-on-surface': hexFromArgb(scheme.onSurface),
        '--md-sys-color-surface-variant': hexFromArgb(scheme.surfaceVariant),
        '--md-sys-color-on-surface-variant': hexFromArgb(scheme.onSurfaceVariant),
        '--md-sys-color-surface-container-lowest': surfaceTone(isDark ? 4 : 100),
        '--md-sys-color-surface-container-low': surfaceTone(isDark ? 12 : 96),
        '--md-sys-color-surface-container': surfaceTone(isDark ? 17 : 94),
        '--md-sys-color-surface-container-high': surfaceTone(isDark ? 22 : 92),
        '--md-sys-color-surface-container-highest': surfaceTone(isDark ? 24 : 90),
        '--md-sys-color-outline': hexFromArgb(scheme.outline),
        '--md-sys-color-outline-variant': hexFromArgb(scheme.outlineVariant),
        '--glass-surface': `color-mix(in srgb, ${surfaceTone(isDark ? 22 : 98)} 80%, transparent)`,
        '--glass-border': `color-mix(in srgb, ${hexFromArgb(scheme.outlineVariant)} 35%, transparent)`,
        '--content-glass-background': isDark ? 'rgba(38, 38, 40, 0.6)' : 'rgba(245, 245, 247, 0.55)',
        '--settings-card': hexFromArgb(scheme.surface),
        '--settings-option': surfaceTone(isDark ? 24 : 100),
    };
}
