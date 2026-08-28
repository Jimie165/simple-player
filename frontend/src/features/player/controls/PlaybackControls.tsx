import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { usePlaybackActions } from '@/hooks/playback/usePlaybackActions';
import { PlaybackControlButtons } from '@/features/player/controls/PlaybackControlButtons';
import { PlaybackProgressBar } from '@/features/player/controls/PlaybackProgressBar';

interface PlaybackControlsProps {
    mode: 'full' | 'compact' | 'mini';
    isSuspended: boolean;
}

interface PlaybackProgressClockProps {
    mode: PlaybackControlsProps['mode'];
    isMini: boolean;
    metadata: ReturnType<typeof usePlayerStore.getState>['metadata'];
    isDragging: boolean;
    isSuspended: boolean;
    handleSeekStart: () => void;
    handleSeekChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    handleSeekEnd: (event: React.MouseEvent<HTMLInputElement>) => void;
}

function PlaybackProgressClock({
    mode,
    isMini,
    metadata,
    isDragging,
    isSuspended,
    handleSeekStart,
    handleSeekChange,
    handleSeekEnd,
}: PlaybackProgressClockProps) {
    const lastCurrentTimeRef = useRef(usePlayerStore.getState().currentTime);
    const currentTime = usePlayerStore(state => isSuspended ? lastCurrentTimeRef.current : state.currentTime);
    useEffect(() => {
        if (!isSuspended) lastCurrentTimeRef.current = currentTime;
    }, [currentTime, isSuspended]);
    const progressPercent = metadata && metadata.duration > 0 ? (currentTime / metadata.duration) * 100 : 0;
    const displayCurrentTime = Math.max(0, Math.floor(currentTime));
    const displayDuration = Math.max(0, Math.floor(metadata?.duration || 0));
    const remainingTime = Math.max(displayDuration - displayCurrentTime, 0);

    return (
        <PlaybackProgressBar
            mode={mode}
            isMini={isMini}
            metadata={metadata}
            currentTime={currentTime}
            displayCurrentTime={displayCurrentTime}
            remainingTime={remainingTime}
            progressPercent={progressPercent}
            isDragging={isDragging}
            handleSeekStart={handleSeekStart}
            handleSeekChange={handleSeekChange}
            handleSeekEnd={handleSeekEnd}
        />
    );
}

export default function PlaybackControls({ mode, isSuspended }: PlaybackControlsProps) {
    const isMini = mode === 'mini';
    const isPlaying = usePlayerStore(state => state.isPlaying);
    const metadata = usePlayerStore(state => state.metadata);
    const isShuffling = usePlayerStore(state => state.isShuffling);
    const repeatMode = usePlayerStore(state => state.repeatMode);
    const toggleRepeat = usePlayerStore(state => state.toggleRepeat);
    const setPlaybackTime = usePlayerStore(state => state.setPlaybackTime);

    const { togglePlayback, toggleShuffle, seek, playNext, playPrev } = usePlaybackActions();

    const [isDragging, setIsDragging] = useState(false);

    // --- 按钮逻辑：下一首 ---
    const handleNext = async () => {
        await playNext();
    };

    // --- 按钮逻辑：上一首 ---
    const handlePrev = async () => {
        await playPrev(usePlayerStore.getState().currentTime);
    };

    const handleBtnShuffle = () => {
        toggleShuffle();
    };

    const handleBtnRepeat = () => {
        // Current: off -> all -> one -> off
        // 状态流转完全由 Store 控制
        toggleRepeat();
    };

    // 拖拽处理
    const handleSeekStart = () => {
        setIsDragging(true);
        usePlayerStore.getState().setSeeking(true);
    };
    const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = Number(e.target.value);
        setPlaybackTime(time);
    };
    const handleSeekEnd = async (e: React.MouseEvent<HTMLInputElement>) => {
        const newTime = Number((e.currentTarget as HTMLInputElement).value);
        setIsDragging(false);
        const actualTime = await seek(newTime);
        setPlaybackTime(actualTime);
    };
    return (
        <>
            <PlaybackControlButtons
                isMini={isMini}
                metadata={metadata}
                isPlaying={isPlaying}
                isShuffling={isShuffling}
                repeatMode={repeatMode}
                togglePlay={() => void togglePlayback()}
                handlePrev={handlePrev}
                handleNext={handleNext}
                handleBtnShuffle={handleBtnShuffle}
                handleBtnRepeat={handleBtnRepeat}
            />

            <PlaybackProgressClock
                mode={mode}
                isMini={isMini}
                metadata={metadata}
                isDragging={isDragging}
                isSuspended={isSuspended}
                handleSeekStart={handleSeekStart}
                handleSeekChange={handleSeekChange}
                handleSeekEnd={handleSeekEnd}
            />
        </>
    );
}
