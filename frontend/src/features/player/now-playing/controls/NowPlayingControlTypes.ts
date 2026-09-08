import type { SongMetadata } from '@/types';
import type { ViewState } from '@/store/useNavigationStore';

export interface NowPlayingControlsSectionProps {
    controlsRef: React.RefObject<HTMLDivElement | null>;
    metadata: SongMetadata | null;
    marqueeResetToken: number;
    onClose: () => void;
    push: (entry: ViewState) => void;
    toggleFavorite: (song: SongMetadata) => Promise<void>;
    handleSeekChange: (value: number) => void;
    handleSeekStart: () => void;
    handleSeekEnd: () => void;
    isShuffling: boolean;
    toggleShuffle: () => void;
    playPrev: () => void;
    togglePlay: () => void;
    isPlaying: boolean;
    playNext: () => void;
    toggleRepeat: () => void;
    repeatMode: 'off' | 'all' | 'one';
    localVolume: number;
    handleVolumeChange: (value: number) => void;
    handleVolumeSeekStart: () => void;
    handleVolumeSeekEnd: () => void;
}
