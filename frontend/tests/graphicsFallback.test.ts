import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeStore } from '@/store/useThemeStore';

vi.hoisted(() => {
    const storage = new Map<string, string>();
    const localStorage = {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
    };
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('window', { localStorage });
});

beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ graphicsUnavailable: false });
});

describe('automatic graphics fallback', () => {
    it('keeps a graphics failure out of persisted preferences and retries next session', async () => {
        useThemeStore.getState().setGraphicsUnavailable();
        expect(useThemeStore.getState().graphicsUnavailable).toBe(true);
        const saved = JSON.parse(localStorage.getItem('theme-storage') ?? '{}');
        expect(saved.state).not.toHaveProperty('graphicsUnavailable');
        await useThemeStore.persist.rehydrate();
        expect(useThemeStore.getState().graphicsUnavailable).toBe(false);
    });

    it('ignores the removed manual preference and stops persisting it', async () => {
        localStorage.setItem('theme-storage', JSON.stringify({ state: { themeMode: 'dark', reducedVisualEffects: true }, version: 0 }));
        await useThemeStore.persist.rehydrate();
        expect(useThemeStore.getState().themeMode).toBe('dark');
        expect(useThemeStore.getState()).not.toHaveProperty('reducedVisualEffects');
        expect(useThemeStore.getState().graphicsUnavailable).toBe(false);
        useThemeStore.getState().setPlayerEffectMode('animation');
        const saved = JSON.parse(localStorage.getItem('theme-storage') ?? '{}');
        expect(saved.state).not.toHaveProperty('reducedVisualEffects');
    });
});
