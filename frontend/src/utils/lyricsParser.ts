import type { LyricsData, LyricsLine } from '@/types';

/**
 * Parsed LRC file content into time_ms and text format.
 */
export function parseLrcStrings(rawLines: LyricsLine[]): LyricsData {
    let hasTimestamps = false;
    const parsedLines: LyricsLine[] = [];

    // Pattern to match [mm:ss.xx] or [mm:ss:xx] or [00:00] 
    const timeRegExp = /\[(\d{2,}):(\d{2})(?:[\.:](\d{2,3}))?\]/g;

    for (const lineObj of rawLines) {
        const text = lineObj.text;

        let match;
        const matches = [];

        // Find all timestamps in the same line (e.g. [00:12][00:14] text)
        while ((match = timeRegExp.exec(text)) !== null) {
            matches.push(match);
        }

        if (matches.length > 0) {
            hasTimestamps = true;
            // Clean lyrics text from timestamps
            const cleanText = text.replace(timeRegExp, '').trim();

            for (const m of matches) {
                const minutes = parseInt(m[1], 10);
                const seconds = parseInt(m[2], 10);
                const fraction = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0; // Pad so 12 is 120ms, 123 is 123ms

                const timeMs = minutes * 60000 + seconds * 1000 + fraction;

                parsedLines.push({
                    time_ms: timeMs,
                    text: cleanText
                });
            }
        } else {
            // If it's a meta tag [ar:Artist], we can either ignore it or keep it with time_ms = 0 or null
            const metaRegExp = /^\[([a-zA-Z]+):(.*?)\].*/;
            const metaMatch = text.match(metaRegExp);

            if (metaMatch) {
                // keep the display without brackets, or just keep it as is
                parsedLines.push({
                    time_ms: null,
                    text: text // keeping verbatim for now, or could strip brackets
                });
            } else if (text.trim() !== "") {
                parsedLines.push({
                    time_ms: null,
                    text: text.trim()
                });
            }
        }
    }

    // Sort by time correctly 
    parsedLines.sort((a, b) => {
        if (a.time_ms === null && b.time_ms === null) return 0;
        if (a.time_ms === null) return -1; // Keep meta tags at top
        if (b.time_ms === null) return 1;
        return a.time_ms - b.time_ms;
    });

    return {
        lines: parsedLines,
        has_timestamps: hasTimestamps
    };
}
