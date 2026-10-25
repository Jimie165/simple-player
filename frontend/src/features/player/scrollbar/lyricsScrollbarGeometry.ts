export function getLyricsScrollbarGeometry(height: number, total: number, offset: number, trackHeight = height) {
    const max = Math.max(0, total - height);
    const thumbHeight = total > 0 ? Math.min(trackHeight, Math.max(24, trackHeight * height / total)) : trackHeight;
    return { height: trackHeight, max, thumbHeight, offset: Math.max(0, Math.min(max, offset)) };
}

export function getLyricsWheelDelta(delta: number, mode: number, viewportHeight: number) {
    return delta * (mode === 1 ? 16 : mode === 2 ? viewportHeight : 1);
}
