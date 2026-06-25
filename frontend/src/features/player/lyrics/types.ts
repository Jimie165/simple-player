import type { LyricsLine } from '@/types';
import type { LyricsTimingStrategy } from '@/features/player/lyrics/timingStrategy';

export interface LyricsPanelProps {
    isOpen: boolean;
    lyrics: LyricsLine[] | null;
    status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    hasTimestamps: boolean;
    currentTime: number;
    onSeek: (time: number) => void;
    onUserScrollDirection?: (direction: 'up' | 'down', delta?: number) => void;
    variant?: 'side' | 'narrow';
    narrowControlsVisible?: boolean;
    timingStrategy?: LyricsTimingStrategy;
}

export type DisplayItem =
    | { type: 'line'; line: LyricsLine; lineIndex: number }
    | { type: 'interlude'; afterLineIndex: number; startMs: number; endMs: number };
