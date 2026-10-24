import { useCallback, useEffect, useRef, useState } from 'react';
import type { LyricsDocument } from '@/types';
import { onlineLyricsService } from '@/services/onlineLyricsService';
import type { OnlineLyricsCandidate } from '@/services/onlineLyricsService';
import { onlineLyricsText } from '@/features/library/dialogs/song-edit/onlineLyricsText';
import { parseLyrics } from '@/utils/lyrics/parseLyrics';

export interface OnlineLyricsDetails {
    text: string;
    document: LyricsDocument;
    format: string;
}

export const lyricsCandidateKey = (candidate: OnlineLyricsCandidate) => `${candidate.provider}:${candidate.id}`;

export function useOnlineLyricsDetails() {
    const [details, setDetails] = useState(new Map<string, OnlineLyricsDetails | null>());
    const cache = useRef(new Map<string, OnlineLyricsDetails>());
    const pending = useRef(new Map<string, Promise<OnlineLyricsDetails>>());
    const queue = useRef<Array<{ key: string; run: () => void; cancel: () => void }>>([]);
    const active = useRef(0);
    const mounted = useRef(false);

    const pump = useCallback(() => {
        while (active.current < 3 && queue.current.length) {
            const task = queue.current.shift();
            if (!task) break;
            active.current++;
            task.run();
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        const tasks = queue.current;
        return () => {
            mounted.current = false;
            tasks.splice(0).forEach(task => task.cancel());
        };
    }, []);

    const load = useCallback((candidate: OnlineLyricsCandidate, priority = false): Promise<OnlineLyricsDetails> => {
        const key = lyricsCandidateKey(candidate);
        const cached = cache.current.get(key);
        if (cached) return Promise.resolve(cached);
        const existing = pending.current.get(key);
        if (existing) {
            if (priority) {
                const index = queue.current.findIndex(task => task.key === key);
                if (index > 0) queue.current.unshift(...queue.current.splice(index, 1));
            }
            return existing;
        }
        const promise = new Promise<OnlineLyricsDetails>((resolve, reject) => {
            const task = {
                key,
                cancel: () => { pending.current.delete(key); reject(new Error('歌词信息请求已取消')); },
                run: () => {
                    void (async () => {
                        try {
                            const payload = await onlineLyricsService.fetch(candidate);
                            const text = onlineLyricsText(payload);
                            const document = parseLyrics({ rawText: text });
                            if (!document.lines.some(line => line.text.trim())) throw new Error('此候选没有可用歌词');
                            const value = { text, document, format: payload.format };
                            cache.current.set(key, value);
                            if (mounted.current) setDetails(current => new Map(current).set(key, value));
                            resolve(value);
                        } catch (error) {
                            if (mounted.current) setDetails(current => new Map(current).set(key, null));
                            reject(error);
                        } finally {
                            pending.current.delete(key);
                            active.current--;
                            pump();
                        }
                    })();
                },
            };
            if (priority) queue.current.unshift(task);
            else queue.current.push(task);
        });
        pending.current.set(key, promise);
        pump();
        return promise;
    }, [pump]);

    return { details, load };
}
