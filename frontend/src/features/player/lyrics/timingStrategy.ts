import { tightHandoffLeadMs } from '@/features/player/lyrics/constants';

export interface LyricsTimingStrategy {
    compressTightHandoffTail: boolean;
    focusNextLineByVisualEnd: boolean;
    nextLineFocusLeadMs: number;
    /** 逐字歌词行间有空隙时的提前聚焦量；缺省同 nextLineFocusLeadMs。 */
    nextLineHandoffLeadMs?: number;
    enableLineLyricsEarlyFocus?: boolean;
}

export const performanceLyricsTimingStrategy: LyricsTimingStrategy = {
    compressTightHandoffTail: false,
    focusNextLineByVisualEnd: false,
    nextLineFocusLeadMs: 400,
    enableLineLyricsEarlyFocus: false,
};

export const animationLyricsTimingStrategy: LyricsTimingStrategy = {
    compressTightHandoffTail: true,
    focusNextLineByVisualEnd: true,
    nextLineFocusLeadMs: 600,
    nextLineHandoffLeadMs: tightHandoffLeadMs,
    enableLineLyricsEarlyFocus: true,
};
