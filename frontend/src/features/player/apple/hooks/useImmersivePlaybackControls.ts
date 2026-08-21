import { useState } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';

interface UseImmersivePlaybackControlsArgs {
    volume: number;
    setPlaybackTime: (time: number) => void;
    seek: (time: number) => Promise<number>;
    setVolume: (volume: number) => Promise<void>;
    onNarrowActivity: () => void;
}

export function useImmersivePlaybackControls({
    volume,
    setVolume,
    setPlaybackTime,
    seek,
    onNarrowActivity,
}: UseImmersivePlaybackControlsArgs) {
    const [localVolume, setLocalVolume] = useState(volume);
    const [isVolumeDragging, setIsVolumeDragging] = useState(false);
    const displayVolume = isVolumeDragging ? localVolume : volume;

    const handleVolumeChange = (val: number) => {
        setLocalVolume(val);
        void setVolume(val);
    };

    const handleVolumeSeekStart = () => {
        onNarrowActivity();
        setIsVolumeDragging(true);
    };

    const handleVolumeSeekEnd = () => {
        setIsVolumeDragging(false);
        void setVolume(localVolume);
    };

    const handleSeekStart = () => {
        onNarrowActivity();
        usePlayerStore.getState().setSeeking(true);
    };

    const handleSeekChange = (val: number) => {
        setPlaybackTime(val);
    };

    const handleSeekEnd = async () => {
        try {
            const actualTime = await seek(usePlayerStore.getState().currentTime);
            setPlaybackTime(actualTime);
        } finally {
            usePlayerStore.getState().setSeeking(false);
        }
    };

    return {
        displayVolume,
        handleSeekChange,
        handleSeekStart,
        handleSeekEnd,
        handleVolumeChange,
        handleVolumeSeekStart,
        handleVolumeSeekEnd,
    };
}
