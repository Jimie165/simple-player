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
 * 只覆盖 Primary / Secondary / Tertiary 及其衍生色
 * Surface / Outline / Error 保持默认（index.css 定义）
 */
export function generateThemeVariables(sourceHex: string, isDark: boolean): ThemeVariables {
    const argb = argbFromHex(sourceHex);
    const theme = themeFromSourceColor(argb);
    const scheme = isDark ? theme.schemes.dark : theme.schemes.light;

    return {
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
    };
}
