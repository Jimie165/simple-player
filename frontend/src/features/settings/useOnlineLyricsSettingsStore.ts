import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { orderedLyricsProviders } from '@/services/onlineLyricsService';

interface OnlineLyricsSettings {
    autoFetchEnabled: boolean;
    setAutoFetchEnabled: (enabled: boolean) => void;
    providerOrder: string[];
    setProviderOrder: (order: string[]) => void;
}

export const useOnlineLyricsSettingsStore = create<OnlineLyricsSettings>()(
    persist(
        (set) => ({
            autoFetchEnabled: true,
            setAutoFetchEnabled: (autoFetchEnabled) => set({ autoFetchEnabled }),
            providerOrder: orderedLyricsProviders([]).map(([id]) => id),
            setProviderOrder: (order) => set({ providerOrder: orderedLyricsProviders(order).map(([id]) => id) }),
        }),
        {
            name: 'online-lyrics-settings',
            partialize: (state) => ({ providerOrder: state.providerOrder, autoFetchEnabled: state.autoFetchEnabled }),
        },
    ),
);
