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
    useThemeStore.setState({ reducedVisualEffects: false, graphicsUnavailable: false });
});

describe('graphics fallback preference', () => {
    it('restores the user preference after a restart', async () => {
        useThemeStore.getState().setReducedVisualEffects(true);
        const saved = localStorage.getItem('theme-storage')!;
        useThemeStore.setState({ reducedVisualEffects: false });
        // Simulate the saved preference from the previous app session.
        localStorage.setItem('theme-storage', saved);
        await useThemeStore.persist.rehydrate();
        expect(useThemeStore.getState().reducedVisualEffects).toBe(true);
    });

    it('keeps a graphics failure out of persisted preferences and retries next session', async () => {
        useThemeStore.getState().setGraphicsUnavailable();
        expect(useThemeStore.getState().graphicsUnavailable).toBe(true);
        const saved = JSON.parse(localStorage.getItem('theme-storage') ?? '{}');
        expect(saved.state).not.toHaveProperty('graphicsUnavailable');
        await useThemeStore.persist.rehydrate();
        expect(useThemeStore.getState().graphicsUnavailable).toBe(false);
        expect(useThemeStore.getState().reducedVisualEffects).toBe(false);
    });

    it('keeps old preferences compatible and lets the user restore normal effects', async () => {
        localStorage.setItem('theme-storage', JSON.stringify({ state: { themeMode: 'dark' }, version: 0 }));
        await useThemeStore.persist.rehydrate();
        expect(useThemeStore.getState().themeMode).toBe('dark');
        expect(useThemeStore.getState().reducedVisualEffects).toBe(false);
        useThemeStore.getState().setReducedVisualEffects(true);
        useThemeStore.getState().setReducedVisualEffects(false);
        expect(useThemeStore.getState().reducedVisualEffects).toBe(false);
    });
});
