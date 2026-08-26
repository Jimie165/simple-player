import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { checkForAppUpdate } from '@/services/updateService';
import type { AppRelease, UpdateCheckResult } from '@/services/updateService';

export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'error';

interface UpdateState {
    autoCheckEnabled: boolean;
    status: UpdateStatus;
    latestRelease: AppRelease | null;
    setAutoCheckEnabled: (enabled: boolean) => void;
    checkForUpdates: () => Promise<UpdateCheckResult>;
}

export const useUpdateStore = create<UpdateState>()(
    persist(
        (set) => ({
            autoCheckEnabled: true,
            status: 'idle',
            latestRelease: null,
            setAutoCheckEnabled: (enabled) => set({ autoCheckEnabled: enabled }),
            checkForUpdates: async () => {
                set({ status: 'checking' });
                try {
                    const result = await checkForAppUpdate();
                    set({
                        status: result.updateAvailable ? 'available' : 'up-to-date',
                        latestRelease: result.latestRelease,
                    });
                    return result;
                } catch (error) {
                    set({ status: 'error' });
                    throw error;
                }
            },
        }),
        {
            name: 'update-preferences',
            partialize: (state) => ({ autoCheckEnabled: state.autoCheckEnabled }),
        }
    )
);
