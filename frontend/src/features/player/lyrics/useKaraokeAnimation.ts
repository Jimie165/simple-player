import { useInsertionEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { LyricsWord } from '@/types';
import type { LyricFillMode } from '@/store/useThemeStore';
import { parseLyricsWordsToChars } from '@/features/player/lyrics/lyricCharSplitting';
import type { FlatCharItem } from '@/features/player/lyrics/lyricCharSplitting';
import { useLyricsFrameTaskRegistry } from '@/features/player/lyrics/lyricsFrameScheduler';
import { getLyricsDebugSink } from '@/features/player/lyrics/lyricsDebug';
import { applyCharacterFillStyles, getCharacterFillStop } from '@/features/player/lyrics/karaokeCharacterFill';
import { createLineFill } from '@/features/player/lyrics/karaokeLineFill';
import { groupKaraokeWords, groupKaraokeLayout } from '@/features/player/lyrics/karaokeLayout';
import type { IndexedCharItem } from '@/features/player/lyrics/karaokeLayout';
import {
    karaokeExitDurationMs, wordFloatDelayMs, regularLiftMinDurationMs, syllableLiftEm,
    restingCharTransform, clamp01, WORD_PHASE_FUTURE, WORD_PHASE_MOTION, WORD_PHASE_SETTLED,
    getWordMotionOrders, prepareKaraokeCharRuntime, getKaraokeCharStyle, getWordMotionWindow,
} from '@/features/player/lyrics/karaokeMotion';
import type { KaraokeCharStyle, KaraokeCharRuntime, WordMotionWindow } from '@/features/player/lyrics/karaokeMotion';

interface KaraokeAnimationOptions {
    words: LyricsWord[];
    lineEndMs: number | null;
    nextLineStartMs: number | null;
    enableTightHandoffTailCompression: boolean;
    preciseMsRef: RefObject<number>;
    isActive: boolean;
    visualFocused: boolean;
    isSeekExiting: boolean;
    isPlaying?: boolean;
    playbackSyncKey?: number;
    glowDisabled: boolean;
    wordFloat: boolean;
    lyricFillMode: LyricFillMode;
}

type KaraokeRuntimeState = {
    flatChars: FlatCharItem[];
    wordGroups: IndexedCharItem[][];
    wordMotionWindows: WordMotionWindow[];
    charRuntimes: Array<KaraokeCharRuntime | undefined>;
    previousTransforms: Array<string | undefined>;
    previousWordTransforms: Array<string | undefined>;
    previousFillStops: Array<number | undefined>;
    previousGlowAlphas: Array<number | undefined>;
    wordPhaseCodes: Uint8Array;
    wordPhaseChanges: Uint8Array;
    wordStartOrder: number[];
    wordEndOrder: number[];
    startCursor: number;
    endCursor: number;
    activeWordIndices: Set<number>;
    changedWordIndices: number[];
    scratchStyle: KaraokeCharStyle;
    elements: Array<HTMLSpanElement | null>;
    lastTimeMs: number;
    needsVisualSync: boolean;
    forceVisualWrite: boolean;
    frameCallback: (() => void) | null;
    syncNow: (() => void) | null;
};

/** Owns the DOM runtime and its ordered synchronization, subscription and exit effects. */
export function useKaraokeAnimation({
    words, lineEndMs, nextLineStartMs, enableTightHandoffTailCompression,
    preciseMsRef, isActive, visualFocused, isSeekExiting, isPlaying,
    playbackSyncKey, glowDisabled, wordFloat, lyricFillMode,
}: KaraokeAnimationOptions) {
    const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const frameRegistry = useLyricsFrameTaskRegistry();
    const charRefs = useRef<Array<HTMLSpanElement | null>>([]);
    const contentRef = useRef<HTMLSpanElement | null>(null);
    const wasFocusedRef = useRef(visualFocused);
    const runtimeRef = useRef<KaraokeRuntimeState | null>(null);
    const previousFillModeRef = useRef(lyricFillMode);
    const isActiveRef = useRef(isActive);
    const isFocusedRef = useRef(visualFocused);
    const isSeekExitingRef = useRef(isSeekExiting);
    const glowDisabledRef = useRef(glowDisabled);

    useInsertionEffect(() => {
        if (glowDisabledRef.current !== glowDisabled && runtimeRef.current) {
            runtimeRef.current.needsVisualSync = true;
        }
        isActiveRef.current = isActive;
        isFocusedRef.current = visualFocused;
        isSeekExitingRef.current = isSeekExiting;
        glowDisabledRef.current = glowDisabled;
    }, [glowDisabled, isActive, isSeekExiting, visualFocused]);

    useLayoutEffect(() => () => {
        const runtime = runtimeRef.current;
        if (!runtime) return;
        getLyricsDebugSink()?.({
            type: 'karaoke-runtime',
            action: 'destroy',
            charCount: runtime.flatChars.length,
            wordCount: runtime.wordMotionWindows.length,
        });
    }, []);

    const flatChars = useMemo(
        () => parseLyricsWordsToChars(words, lineEndMs, {
            enabled: enableTightHandoffTailCompression,
            nextLineStartMs,
        }),
        [enableTightHandoffTailCompression, words, lineEndMs, nextLineStartMs]
    );

    const charRefCallbacks = useMemo(() => flatChars.map((_item, index) =>
        (element: HTMLSpanElement | null) => { charRefs.current[index] = element; }
    ), [flatChars]);

    const wordGroups = useMemo(() => groupKaraokeWords(flatChars), [flatChars]);
    const layoutGroups = useMemo(
        () => wordFloat ? wordGroups : groupKaraokeLayout(flatChars),
        [flatChars, wordFloat, wordGroups]
    );

    const wordMotionWindows = useMemo(
        () => wordGroups.map((group, wordIndex) => {
            const window = getWordMotionWindow(group, wordIndex === wordGroups.length - 1);
            if (wordFloat) {
                const startMs = group[0].item.time_ms;
                const endMs = Math.max(...group.map(({ item }) => item.nextStart));
                // Keep ticking until the delayed group lift reaches its final height.
                window.endMs = Math.max(window.endMs,
                    startMs + wordFloatDelayMs + Math.max(regularLiftMinDurationMs, endMs - startMs));
            }
            return window;
        }),
        [wordGroups, wordFloat]
    );

    // All values that only depend on the parsed lyric item are prepared once
    // per line. The frame callback then evaluates only the time-dependent
    // progress, avoiding repeated cubic/sqrt work and short-lived objects.
    const charRuntimes = useMemo(() => {
        const runtimes: Array<KaraokeCharRuntime | undefined> = [];
        wordGroups.forEach((group, wordIndex) => {
            const isLastWord = wordIndex === wordGroups.length - 1;
            group?.forEach(({ item, flatIndex }) => {
                runtimes[flatIndex] = prepareKaraokeCharRuntime(item, isLastWord);
            });
        });
        return runtimes;
    }, [wordGroups]);

    const wordRuntimes = useMemo(() => wordGroups.map((group, wordIndex) => {
        const first = group[0].item;
        // Reuse the parsed timing, including any compressed handoff tail.
        const endMs = Math.max(...group.map(({ item }) => item.nextStart));
        return prepareKaraokeCharRuntime({
            ...first,
            time_ms: first.time_ms,
            durationMs: Math.max(20, endMs - first.time_ms),
            activeCharCountInWord: 1,
            activeCharIndexInWord: 0,
        }, wordIndex === wordGroups.length - 1);
    }), [wordGroups]);

    useLayoutEffect(() => {
        const charElements = charRefs.current;
        let runtime = runtimeRef.current;
        if (
            !runtime ||
            runtime.flatChars !== flatChars ||
            runtime.wordGroups !== wordGroups ||
            runtime.wordMotionWindows !== wordMotionWindows ||
            runtime.charRuntimes !== charRuntimes
        ) {
            const wordMotionOrders = getWordMotionOrders(wordMotionWindows);
            runtime = {
                flatChars,
                wordGroups,
                wordMotionWindows,
                charRuntimes,
                previousTransforms: new Array(flatChars.length),
                previousWordTransforms: new Array(flatChars.length),
                previousFillStops: new Array(flatChars.length),
                previousGlowAlphas: new Array(flatChars.length),
                wordPhaseCodes: new Uint8Array(wordMotionWindows.length),
                wordPhaseChanges: new Uint8Array(wordMotionWindows.length),
                wordStartOrder: wordMotionOrders.starts,
                wordEndOrder: wordMotionOrders.ends,
                startCursor: 0,
                endCursor: 0,
                activeWordIndices: new Set<number>(),
                changedWordIndices: [],
                scratchStyle: {
                    transform: '',
                    fillStop: 0,
                    glowAlpha: 0,
                },
                elements: [],
                lastTimeMs: Number.NaN,
                needsVisualSync: true,
                forceVisualWrite: false,
                frameCallback: null,
                syncNow: null,
            };
            runtime.wordPhaseCodes.fill(255);
            runtimeRef.current = runtime;
            getLyricsDebugSink()?.({
                type: 'karaoke-runtime',
                action: 'create',
                charCount: flatChars.length,
                wordCount: wordMotionWindows.length,
            });
        }

        const domChanged =
            runtime.elements.length !== charElements.length ||
            runtime.elements.some((element, index) => element !== charElements[index]);
        if (domChanged) {
            runtime.elements = [...charElements];
            runtime.previousTransforms.fill(undefined);
            runtime.previousWordTransforms.fill(undefined);
            runtime.previousFillStops.fill(undefined);
            runtime.previousGlowAlphas.fill(undefined);
            runtime.needsVisualSync = true;
            // The effect may be rerun for a focus change while the same DOM is
            // still mounted. Only a new set of nodes needs an initial cancel.
            charElements.forEach(element => {
                element?.style.setProperty('animation', 'none');
            });
        }
        if (previousFillModeRef.current !== lyricFillMode) {
            previousFillModeRef.current = lyricFillMode;
            runtime.previousFillStops.fill(undefined);
            runtime.needsVisualSync = true;
        }

        if (!wordFloat && lyricFillMode === 'character') {
            applyCharacterFillStyles(charElements, charRuntimes);
        }

        const lineFill = lyricFillMode === 'line' || wordFloat
            ? createLineFill(wordGroups, charElements, charRuntimes, words, lineEndMs, wordFloat && lyricFillMode === 'line')
            : null;

        const runtimeState = runtime;
        let debugWrites: { transform: number; fill: number; glow: number } | null = null;

        const updateCharStyles = (flatIndex: number, style: KaraokeCharStyle, motionOnly = false) => {
            const el = motionOnly ? wordRefs.current[flatIndex] : charElements[flatIndex];
            if (!el) return;
            // 退出过渡期间，不再覆写 transform 和发光，交由 CSS transition 处理；
            // 但保留 --kf 进度写入，确保未完成的刷白继续进行直到真正卸载。
            const transforms = motionOnly ? runtime.previousWordTransforms : runtime.previousTransforms;
            if (isFocusedRef.current && (!wordFloat || motionOnly || charRuntimes[flatIndex]?.isLongTone)) {
                if (runtime.forceVisualWrite || style.transform !== transforms[flatIndex]) {
                    el.style.transform = style.transform;
                    transforms[flatIndex] = style.transform;
                    if (debugWrites) debugWrites.transform++;
                }
                if (!motionOnly && (runtime.forceVisualWrite || style.glowAlpha !== runtime.previousGlowAlphas[flatIndex])) {
                    el.style.setProperty('--kg', String(style.glowAlpha));
                    runtime.previousGlowAlphas[flatIndex] = style.glowAlpha;
                    if (debugWrites) debugWrites.glow++;
                }
            }

            if ((!wordFloat || motionOnly) && style.fillStop !== runtime.previousFillStops[flatIndex]) {
                el.style.setProperty('--kf', String(style.fillStop));
                runtime.previousFillStops[flatIndex] = style.fillStop;
                if (debugWrites) debugWrites.fill++;
            }
        };

        const updateWordStyles = (timeMs: number, forceAll = false, reason = 'normal') => {
            const debugSink = getLyricsDebugSink();
            debugWrites = debugSink ? { transform: 0, fill: 0, glow: 0 } : null;
            const changedWords = runtimeState.changedWordIndices;
            changedWords.length = 0;
            let evaluatedWordCount = 0;
            lineFill?.update(timeMs);

            const markChanged = (wordIndex: number) => {
                if (runtimeState.wordPhaseChanges[wordIndex] !== 0) return;
                runtimeState.wordPhaseChanges[wordIndex] = 1;
                changedWords.push(wordIndex);
            };
            const setPhase = (wordIndex: number, phase: number) => {
                if (runtimeState.wordPhaseCodes[wordIndex] === phase) return;
                runtimeState.wordPhaseCodes[wordIndex] = phase;
                if (phase === WORD_PHASE_MOTION) runtimeState.activeWordIndices.add(wordIndex);
                else runtimeState.activeWordIndices.delete(wordIndex);
                markChanged(wordIndex);
            };
            const applyWord = (wordIndex: number) => {
                evaluatedWordCount++;
                const group = wordGroups[wordIndex];
                if (wordFloat && group?.length) {
                    const word = wordRuntimes[wordIndex].item;
                    const progress = clamp01((timeMs - word.time_ms - wordFloatDelayMs) / Math.max(regularLiftMinDurationMs, word.durationMs));
                    const style = runtimeState.scratchStyle;
                    style.transform = `translateY(${(-Math.sin(progress * Math.PI / 2) * syllableLiftEm).toFixed(6)}em)`;
                    style.fillStop = lineFill?.getWordFillStop(wordIndex) ?? -100;
                    updateCharStyles(group[0].flatIndex, style, true);
                }
                group?.forEach(({ flatIndex }) => {
                    const charRuntime = charRuntimes[flatIndex];
                    if (!charRuntime || (wordFloat && !charRuntime.isLongTone)) return;
                    const fillStop = wordFloat ? 0 : (lineFill?.getFillStop(wordIndex, charRuntime)
                        ?? getCharacterFillStop(charRuntime.item, charRuntime.fillEdgeWidth, timeMs));
                    const style = wordFloat && !charRuntime.isLongTone ? runtimeState.scratchStyle : getKaraokeCharStyle(
                        charRuntime,
                        timeMs,
                        fillStop,
                        glowDisabledRef.current,
                        runtimeState.scratchStyle,
                        wordFloat,
                    );
                    style.fillStop = fillStop;
                    updateCharStyles(flatIndex, style);
                });
            };

            const hasPreviousTime = Number.isFinite(runtimeState.lastTimeMs);
            const canAdvanceCursor = hasPreviousTime &&
                timeMs >= runtimeState.lastTimeMs &&
                timeMs - runtimeState.lastTimeMs <= 200 &&
                !forceAll;

            if (!canAdvanceCursor) {
                runtimeState.activeWordIndices.clear();
                runtimeState.startCursor = 0;
                runtimeState.endCursor = 0;
                wordMotionWindows.forEach((motionWindow, wordIndex) => {
                    if (!motionWindow) return;
                    const phase = timeMs < motionWindow.startMs
                        ? WORD_PHASE_FUTURE
                        : timeMs < motionWindow.endMs
                            ? WORD_PHASE_MOTION
                            : WORD_PHASE_SETTLED;
                    runtimeState.wordPhaseCodes[wordIndex] = phase;
                    if (phase === WORD_PHASE_MOTION) runtimeState.activeWordIndices.add(wordIndex);
                    applyWord(wordIndex);
                });
                while (
                    runtimeState.startCursor < runtimeState.wordStartOrder.length &&
                    timeMs >= wordMotionWindows[runtimeState.wordStartOrder[runtimeState.startCursor]].startMs
                ) runtimeState.startCursor++;
                while (
                    runtimeState.endCursor < runtimeState.wordEndOrder.length &&
                    timeMs >= wordMotionWindows[runtimeState.wordEndOrder[runtimeState.endCursor]].endMs
                ) runtimeState.endCursor++;
            } else {
                while (runtimeState.startCursor < runtimeState.wordStartOrder.length) {
                    const wordIndex = runtimeState.wordStartOrder[runtimeState.startCursor];
                    const motionWindow = wordMotionWindows[wordIndex];
                    if (!motionWindow || timeMs < motionWindow.startMs) break;
                    runtimeState.startCursor++;
                    setPhase(
                        wordIndex,
                        timeMs < motionWindow.endMs ? WORD_PHASE_MOTION : WORD_PHASE_SETTLED,
                    );
                }
                while (runtimeState.endCursor < runtimeState.wordEndOrder.length) {
                    const wordIndex = runtimeState.wordEndOrder[runtimeState.endCursor];
                    const motionWindow = wordMotionWindows[wordIndex];
                    if (!motionWindow || timeMs < motionWindow.endMs) break;
                    runtimeState.endCursor++;
                    setPhase(wordIndex, WORD_PHASE_SETTLED);
                }

                changedWords.forEach(wordIndex => {
                    if (runtimeState.wordPhaseCodes[wordIndex] !== WORD_PHASE_MOTION) applyWord(wordIndex);
                });
                runtimeState.activeWordIndices.forEach(applyWord);
            }

            if (debugSink) {
                debugSink({
                    type: 'karaoke-sync',
                    mode: canAdvanceCursor ? 'incremental' : 'full',
                    reason,
                    timeMs,
                    wordCount: wordMotionWindows.length,
                    charCount: flatChars.length,
                    evaluatedWordCount,
                    activeWordCount: runtimeState.activeWordIndices.size,
                });
                if (debugWrites) debugSink({ type: 'karaoke-style-writes', ...debugWrites });
            }
            runtimeState.forceVisualWrite = false;
            changedWords.forEach(wordIndex => {
                runtimeState.wordPhaseChanges[wordIndex] = 0;
            });
            changedWords.length = 0;
            debugWrites = null;
        };

        const tick = () => {
            if (isSeekExitingRef.current) return;
            const audioMs = preciseMsRef.current;
            if (Number.isFinite(audioMs) && (audioMs !== runtimeState.lastTimeMs || runtimeState.needsVisualSync)) {
                const hasPreviousTime =
                    Number.isFinite(runtimeState.lastTimeMs);
                const hasTimelineJump =
                    hasPreviousTime &&
                    (
                        audioMs < runtimeState.lastTimeMs ||
                        audioMs - runtimeState.lastTimeMs > 200
                    );
                const visualSync = runtimeState.needsVisualSync;
                updateWordStyles(
                    audioMs,
                    hasTimelineJump || visualSync,
                    hasTimelineJump ? 'timeline-jump' : visualSync ? 'visual-reacquire' : 'normal',
                );
                runtimeState.lastTimeMs = audioMs;
                runtimeState.needsVisualSync = false;
            }
        };

        const initialMs = preciseMsRef.current;
        if (initialMs !== null && !isSeekExitingRef.current) {
            const hasTimelineJump = Number.isFinite(runtimeState.lastTimeMs) &&
                (initialMs < runtimeState.lastTimeMs || initialMs - runtimeState.lastTimeMs > 200);
            const visualSync = runtimeState.needsVisualSync;
            updateWordStyles(
                initialMs,
                domChanged || hasTimelineJump || visualSync,
                domChanged ? 'dom-change' : hasTimelineJump ? 'timeline-jump' : 'initial',
            );
            runtimeState.lastTimeMs = initialMs;
            runtimeState.needsVisualSync = false;
        }

        runtimeState.frameCallback = tick;
        runtimeState.syncNow = tick;

        return () => {
            if (runtimeState.frameCallback === tick) runtimeState.frameCallback = null;
            if (runtimeState.syncNow === tick) runtimeState.syncNow = null;
        };
    }, [
        preciseMsRef,
        words,
        lineEndMs,
        flatChars,
        wordGroups,
        wordMotionWindows,
        charRuntimes,
        lyricFillMode,
        wordFloat,
        wordRuntimes,
    ]);

    // Focus and play/pause changes should only change ownership of the stable
    // frame callback. Recreating the callback for every handoff caused the
    // scheduler subscription set to churn at exactly the expensive boundary.
    useLayoutEffect(() => {
        const runtime = runtimeRef.current;
        if (!runtime?.frameCallback || !isActiveRef.current || isSeekExiting || isPlaying === false) return;
        const callback = runtime.frameCallback;
        let frame: number | null = null;
        let unsubscribe: (() => void) | undefined;
        if (frameRegistry) {
            unsubscribe = frameRegistry.subscribe(callback);
        } else {
            const loop = () => {
                callback();
                frame = requestAnimationFrame(loop);
            };
            frame = requestAnimationFrame(loop);
        }
        return () => {
            unsubscribe?.();
            if (frame !== null) cancelAnimationFrame(frame);
        };
    }, [wordFloat, wordRuntimes, charRuntimes, flatChars, frameRegistry, isActive, isPlaying, isSeekExiting, lyricFillMode, preciseMsRef, wordGroups, wordMotionWindows]);

    useLayoutEffect(() => {
        const motionElements = wordFloat
            ? [...wordRefs.current, ...charRefs.current.filter((_element, index) => charRuntimes[index]?.isLongTone)]
            : charRefs.current;
        const wasFocused = wasFocusedRef.current;
        wasFocusedRef.current = visualFocused;

        if (visualFocused) {
            const runtime = runtimeRef.current;
            // Stop the previous CSS owner before synchronizing the runtime,
            // including a paused reactivation at the very same media time.
            contentRef.current?.classList.remove('karaoke-text-exiting');
            if (runtime && !wasFocused) {
                runtime.needsVisualSync = true;
                runtime.forceVisualWrite = true;
                // A paused handoff has no scheduler frame to perform the
                // re-acquire. Synchronize immediately while still in layout.
                runtime.syncNow?.();
            }
            return;
        }

        if (!wasFocused) {
            contentRef.current?.classList.remove('karaoke-text-exiting');
            // 从未聚焦过（如初始非激活行）：无动画残留，直接归位
            motionElements.forEach((el) => {
                if (!el) return;
                el.style.transform = el.classList.contains('karaoke-char-long-tone')
                    ? 'translate(0, 0) scale(1)'
                    : restingCharTransform;
                el.style.setProperty('--kg', '0');
            });
            return;
        }

        // 聚焦→失焦：行级退出过渡。只移除 inline transform/--kg（每字 2 次写入），
        // 由 .karaoke-text-exiting 的 transition 统一驱动退出动画，
        // 不再为每字写 4 个退出变量 + 创建 CSS 动画。
        const exitContent = contentRef.current;
        exitContent?.classList.add('karaoke-text-exiting');
        motionElements.forEach((el) => {
            if (!el) return;
            el.style.transform = '';
            el.style.removeProperty('--kg');
        });

        const releaseTimer = window.setTimeout(() => {
            if (contentRef.current !== exitContent || isFocusedRef.current) return;
            exitContent?.classList.remove('karaoke-text-exiting');
            motionElements.forEach((el) => {
                if (!el) return;
                el.style.transform = el.classList.contains('karaoke-char-long-tone')
                    ? 'translate(0, 0) scale(1)'
                    : restingCharTransform;
                el.style.setProperty('--kg', '0');
            });
        }, karaokeExitDurationMs);

        return () => {
            window.clearTimeout(releaseTimer);
        };
    }, [flatChars, visualFocused, preciseMsRef, wordGroups.length, wordFloat, charRuntimes]);

    // These events invalidate playback state, not the DOM runtime. In
    // particular a paused seek has no content frame to refresh the fill.
    useLayoutEffect(() => {
        const runtime = runtimeRef.current;
        if (!runtime || isSeekExiting) return;
        runtime.syncNow?.();
    }, [glowDisabled, isActive, isPlaying, isSeekExiting, playbackSyncKey, preciseMsRef]);

    return { contentRef, wordRefs, charRefCallbacks, layoutGroups, charRuntimes };
}
