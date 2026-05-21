export const getInterludeFocusOffsetPx = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return 18;
    const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const vmin = Math.min(window.innerWidth, window.innerHeight) / 100;
    return Math.round(Math.min(Math.max(0.9 * rootFontSize, 2.4 * vmin), 1.5 * rootFontSize));
};

export const getInterludeRowHeightPx = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return 48;
    const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const vmin = Math.min(window.innerWidth, window.innerHeight) / 100;
    return Math.min(Math.max(2.5 * rootFontSize, 6 * vmin), 4 * rootFontSize);
};
