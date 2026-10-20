import { memo } from 'react';
import type { RefObject } from 'react';
import type { LyricsWord } from '@/types';
import { useThemeStore } from '@/store/useThemeStore';
import type { IndexedCharItem } from '@/features/player/lyrics/karaokeLayout';
import { cjkLayoutCharPattern } from '@/features/player/lyrics/karaokeLayout';
import { useKaraokeAnimation } from '@/features/player/lyrics/useKaraokeAnimation';

interface KaraokeTextProps {
    words: LyricsWord[];
    lineEndMs: number | null;
    nextLineStartMs?: number | null;
    enableTightHandoffTailCompression?: boolean;
    currentMs: number;
    preciseMsRef: RefObject<number>;
    isActive: boolean;
    isFocused: boolean;
    isSeekExiting?: boolean;
    /** Animated panels provide the playback state so paused rows do not keep a frame loop. */
    isPlaying?: boolean;
    playbackSyncKey?: number;
    glowDisabled?: boolean;
    fillAlpha?: number;
}

function KaraokeTextBase({
    words,
    lineEndMs,
    nextLineStartMs = null,
    enableTightHandoffTailCompression = false,
    preciseMsRef,
    isActive,
    isFocused,
    isSeekExiting = false,
    isPlaying,
    playbackSyncKey,
    glowDisabled = false,
    fillAlpha = 1,
}: KaraokeTextProps) {
    const lyricFloatMode = useThemeStore(state => state.lyricFloatMode);
    const wordFloat = lyricFloatMode === 'word';
    const lyricFillMode = useThemeStore(state => state.lyricFillMode);
    const lyricLineBlendEnabled = useThemeStore(state => state.lyricLineBlendEnabled);
    const visualFocused = isFocused && !isSeekExiting;
    // The active bright mask supplies its own dim tail; the resting copy fades out.
    const restingAlpha = lyricLineBlendEnabled ? (glowDisabled ? 0.08 : 0.2) : 0.3;
    const baseAlpha = lyricLineBlendEnabled ? 0 : glowDisabled ? 0.3 : 0.4;
    const fillLayerAlpha = lyricLineBlendEnabled && !glowDisabled ? 0.85 : fillAlpha;
    const dimMaskAlpha = lyricLineBlendEnabled
        ? (glowDisabled ? 0.16 : 0.3) / fillLayerAlpha
        : 0;
    const { contentRef, wordRefs, dimWordRefs, charRefCallbacks, dimCharRefCallbacks, layoutGroups, wordLayoutGroups, charRuntimes, wordCharacterLift } = useKaraokeAnimation({
        words, lineEndMs, nextLineStartMs, enableTightHandoffTailCompression,
        preciseMsRef, isActive, visualFocused, isSeekExiting, isPlaying,
        playbackSyncKey, glowDisabled, wordFloat, lyricFillMode,
    });

    const renderGroup = (group: IndexedCharItem[], dim: boolean) => {
        if (!group || group.length === 0) return null;
        const isCjkLayoutGroup = cjkLayoutCharPattern.test(group[0].item.char);

        return (
            <span
                key={`${lyricFloatMode}-${group[0].flatIndex}`}
                ref={wordFloat ? (element) => {
                    (dim ? dimWordRefs : wordRefs).current[group[0].flatIndex] = element;
                } : undefined}
                className={wordFloat ? 'karaoke-word-motion' : undefined}
                style={{
                    display: 'inline-block',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'bottom',
                    // Isolate Latin word groups, but leave CJK runs
                    // in the normal inline formatting context so
                    // glyph shaping and line metrics stay stable.
                    contain: isCjkLayoutGroup ? undefined : 'layout style',
                }}
            >
                {group.map(({ item: charItem, flatIndex }) => {
                    const runtime = charRuntimes[flatIndex];
                    if (!runtime) return null;
                    const { isLongTone, longToneAmount, glowToneAmount, fillEdgeWidth } = runtime;
                    const fillEdgeAlpha = fillAlpha >= 1
                        ? 0.72 + longToneAmount * 0.2
                        : fillAlpha;
                    const fillEdgeMaskAlpha = lyricLineBlendEnabled
                        ? Math.min(fillEdgeAlpha, fillLayerAlpha) / fillLayerAlpha
                        : fillAlpha > baseAlpha
                            ? (fillEdgeAlpha - baseAlpha) / (fillLayerAlpha * (1 - baseAlpha))
                            : 1;

                    return (
                        <span
                            key={flatIndex}
                            ref={(dim ? dimCharRefCallbacks : charRefCallbacks)[flatIndex]}
                            className={[
                                'karaoke-char',
                                isLongTone ? 'karaoke-char-long-tone' : '',
                                wordFloat && wordCharacterLift[charItem.wordIndex] ? 'karaoke-char-word-lift' : '',
                            ].filter(Boolean).join(' ')}
                            data-c={charItem.char}
                            style={{
                                '--kfe': fillEdgeWidth,
                                '--kfem': fillEdgeMaskAlpha,
                                '--kgb': `${Math.min(0.3, glowToneAmount * 0.3)}em`,
                            } as React.CSSProperties}
                        >
                            {charItem.char}
                        </span>
                    );
                })}
            </span>
        );
    };

    return (
        <span ref={contentRef} className={[
            lyricFillMode === 'character' ? 'karaoke-text-character' : '',
            wordFloat ? 'karaoke-text-word-float' : '',
            lyricLineBlendEnabled ? 'karaoke-text-background-blend' : '',
        ].filter(Boolean).join(' ')} style={{ display: 'block', position: 'relative', isolation: 'isolate' }}>
            {[false, true].map(dim => <span
                key={dim ? 'dim' : 'bright'}
                aria-hidden={dim ? true : undefined}
                className={`karaoke-brightness-layer karaoke-${dim ? 'dim' : 'bright'}-layer`}
                style={{
                    display: 'block',
                    fontKerning: 'none',
                    fontVariantLigatures: 'none',
                    opacity: dim ? (visualFocused ? 0 : 1) : (visualFocused ? 1 : 0),
                    '--kb': dim ? restingAlpha : baseAlpha,
                    '--kfa': fillLayerAlpha,
                    '--kfd': dimMaskAlpha,
                    '--kw-tail': (baseAlpha + (1 - baseAlpha) * fillLayerAlpha * dimMaskAlpha) /
                        (baseAlpha + (1 - baseAlpha) * fillLayerAlpha),
                    '--kf': lyricLineBlendEnabled ? -100 : undefined,
                } as React.CSSProperties}
            >
                {wordFloat ? wordLayoutGroups.map(groups => (
                    <span
                        key={groups[0][0].flatIndex}
                        style={{ display: 'inline-block', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}
                    >
                        {groups.map(group => renderGroup(group, dim))}
                    </span>
                )) : layoutGroups.map(group => renderGroup(group, dim))}
            </span>)}
        </span>
    );
}

const KaraokeText = memo(KaraokeTextBase, (prev, next) => {
    return (
        prev.words === next.words &&
        prev.lineEndMs === next.lineEndMs &&
        prev.nextLineStartMs === next.nextLineStartMs &&
        prev.enableTightHandoffTailCompression === next.enableTightHandoffTailCompression &&
        prev.preciseMsRef === next.preciseMsRef &&
        prev.isActive === next.isActive &&
        prev.isFocused === next.isFocused &&
        prev.isSeekExiting === next.isSeekExiting &&
        prev.isPlaying === next.isPlaying &&
        prev.playbackSyncKey === next.playbackSyncKey &&
        prev.glowDisabled === next.glowDisabled &&
        prev.fillAlpha === next.fillAlpha
    );
});

export default KaraokeText;
