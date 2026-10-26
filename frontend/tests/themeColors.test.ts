import { describe, expect, it } from 'vitest';
import { generateThemeVariables, PRESET_COLORS } from '@/utils/themeColors';

describe('theme color generation', () => {
    it('provides valid preset seed colors', () => {
        expect(PRESET_COLORS.length).toBeGreaterThan(0);
        for (const preset of PRESET_COLORS) expect(preset.value).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it.each([true, false])('generates complete light and dark color schemes (dark=%s)', isDark => {
        const variables = generateThemeVariables('#6750A4', isDark);
        expect(variables['--md-sys-color-primary']).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(variables['--md-sys-color-surface']).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(variables['--player-primary-light']).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(variables['--player-primary-dark']).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
});
