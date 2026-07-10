export interface LyricsTimingStrategy {
    compressTightHandoffTail: boolean;
    focusNextLineByVisualEnd: boolean;
    nextLineFocusLeadMs: number;
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
    nextLineFocusLeadMs: 800,
    enableLineLyricsEarlyFocus: true,
};
