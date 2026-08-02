import { useEffect, useState } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { audioService } from '@/services/audioService';
import type { SongMetadata } from '@/types';

interface UseImmersivePlaybackControlsArgs {
    volume: number;
    setVolume: (volume: number) => void;
    metadata: SongMetadata | null;
    isOpen: boolean;
    isPlaying: boolean;
    setPlaybackTime: (time: number) => void;
    seek: (time: number) => Promise<number>;
    onNarrowActivity: () => void;
}

export function useImmersivePlaybackControls({
    volume,
    setVolume,
    metadata,
    isOpen,
    isPlaying,
    setPlaybackTime,
    seek,
    onNarrowActivity,
}: UseImmersivePlaybackControlsArgs) {
    const [localVolume, setLocalVolume] = useState(volume);
    const [isVolumeDragging, setIsVolumeDragging] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const displayVolume = isVolumeDragging ? localVolume : volume;

    useEffect(() => {
        if (!metadata) return;
        const syncTime = async () => {
            const t = await audioService.getCurrentTime();
            setPlaybackTime(t);
        };
        syncTime();

        const handleSeekEvent = (event: Event) => {
            const detail = (event as CustomEvent<{ time?: unknown }>).detail;
            if (detail && typeof detail.time === 'number') {
                setPlaybackTime(detail.time);
            }
        };
        window.addEventListener('playback:seeked', handleSeekEvent);

        return () => {
            window.removeEventListener('playback:seeked', handleSeekEvent);
        };
    }, [metadata, isOpen, setPlaybackTime]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;

        if (isPlaying && !isDragging) {
            interval = setInterval(() => {
                audioService.getCurrentTime().then(t => {
                    usePlayerStore.setState((state) => {
                        const prev = state.currentTime;
                        if (t < prev - 0.75 || Math.abs(t - prev) > 0.75) return { currentTime: t };
                        return {};
                    });
                }).catch((error) => console.warn('Failed to sync playback time', error));
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying, isDragging]);

    const handleVolumeChange = (val: number) => {
        setLocalVolume(val);
        audioService.setVolume(val / 100);
    };

    const handleVolumeSeekStart = () => {
        onNarrowActivity();
        setIsVolumeDragging(true);
    };

    const handleVolumeSeekEnd = () => {
        setIsVolumeDragging(false);
        setVolume(localVolume);
    };

    const handleSeekStart = () => {
        onNarrowActivity();
        setIsDragging(true);
        window.dispatchEvent(new CustomEvent('playback:dragging', { detail: { dragging: true } }));
    };

    const handleSeekChange = (val: number) => {
        setPlaybackTime(val);
        window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { time: val } }));
    };

    const handleSeekEnd = async () => {
        setIsDragging(false);
        const actualTime = await seek(usePlayerStore.getState().currentTime);
        setPlaybackTime(actualTime);
        window.dispatchEvent(new CustomEvent('playback:dragging', { detail: { dragging: false } }));
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
