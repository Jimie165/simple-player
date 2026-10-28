import toast from 'react-hot-toast';
import { usePlayerStore } from '@/store/usePlayerStore';

export interface AudioOutputError {
    session_id: number;
    message: string;
    unavailable: boolean;
}

export function handleAudioOutputError(error: AudioOutputError) {
    const state = usePlayerStore.getState();
    if (state.mediaKind !== 'audio' || state.playbackSessionId !== error.session_id) return;
    if (error.unavailable) {
        usePlayerStore.setState({ isPlaying: false, isAudioLoaded: false });
    }
    console.error('Audio output recovery failed', error.message);
    toast.error('音频输出恢复失败，请检查输出设备后重试');
}
