export interface LyricsTimingStrategy {
    compressTightHandoffTail: boolean;
    focusNextLineByVisualEnd: boolean;
}

export const performanceLyricsTimingStrategy: LyricsTimingStrategy = {
    compressTightHandoffTail: false,
    focusNextLineByVisualEnd: false,
};

export const animationLyricsTimingStrategy: LyricsTimingStrategy = {
    compressTightHandoffTail: true,
    focusNextLineByVisualEnd: true,
};
