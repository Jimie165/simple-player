import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { audioService } from '@/services/audioService';

interface AudioOutputState {
    preferredDevice: string | null; // null = follow system default
    activeDevice: string | null;
    hydrated: boolean;

    setPreferredDevice: (device: string | null) => Promise<void>;
    setActiveDevice: (device: string | null) => void;
    syncToBackend: () => Promise<void>;
}

export const useAudioOutputStore = create<AudioOutputState>()(
    persist(
        (set, get) => ({
            preferredDevice: null,
            activeDevice: null,
            hydrated: false,

            setPreferredDevice: async (device) => {
                set({ preferredDevice: device });
                try {
                    await audioService.setAudioOutput(device);
                    const state = await audioService.getAudioOutput();
                    set({ activeDevice: state.active_device });
                } catch (e) {
                    console.error('Failed to apply audio output preference', e);
                }
            },

            setActiveDevice: (device) => set({ activeDevice: device }),

            syncToBackend: async () => {
                const { preferredDevice } = get();
                try {
                    await audioService.setAudioOutput(preferredDevice);
                    const state = await audioService.getAudioOutput();
                    set({ activeDevice: state.active_device, hydrated: true });
                } catch (e) {
                    console.error('Failed to sync audio output preference to backend', e);
                    set({ hydrated: true });
                }
            },
        }),
        {
            name: 'audio-output-storage',
            partialize: (state) => ({ preferredDevice: state.preferredDevice }),
        }
    )
);
