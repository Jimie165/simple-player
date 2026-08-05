import type { LyricsDocument, LyricsLine } from '@/types';
import type { PlayerEffectMode } from '@/store/useThemeStore';

export interface LyricsPanelProps {
    isOpen: boolean;
    lyricsDocument: LyricsDocument | null;
    status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    playerEffectMode: PlayerEffectMode;
    currentTime: number;
    onSeek: (time: number) => void;
    onUserScrollDirection?: (direction: 'up' | 'down', delta?: number) => void;
    variant?: 'side' | 'narrow';
    narrowControlsVisible?: boolean;
}

export type DisplayLine = LyricsLine & { visual_end_ms: number | null };

export type DisplayItem =
    | { type: 'line'; line: DisplayLine; lineIndex: number }
    | { type: 'interlude'; afterLineIndex: number; startMs: number; endMs: number };
