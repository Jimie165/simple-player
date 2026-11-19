import type { usePlayerStore } from '@/store/usePlayerStore';

export const selectPlaybackAdvancing = (state: Pick<ReturnType<typeof usePlayerStore.getState>, 'isPlaying' | 'isAudioLoaded' | 'audioLoadingCount'>) =>
    state.isPlaying && state.isAudioLoaded && state.audioLoadingCount === 0;
