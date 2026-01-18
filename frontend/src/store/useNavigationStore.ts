import { create } from 'zustand';

interface NavigationState {
    customBackHandler: (() => void) | null;
    setCustomBackHandler: (handler: (() => void) | null) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
    customBackHandler: null,
    setCustomBackHandler: (handler) => set({ customBackHandler: handler }),
}));
