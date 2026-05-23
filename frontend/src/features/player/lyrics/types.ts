import type { LyricsLine } from '@/types';

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
}

export type DisplayItem =
    | { type: 'line'; line: LyricsLine; lineIndex: number }
    | { type: 'interlude'; afterLineIndex: number; startMs: number; endMs: number };
