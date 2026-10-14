param(
    [int]$DurationMs = 30000,
    [Nullable[double]]$StartSeconds,
    [int]$WarmupMs = 250,
    [int]$CdpPort = 9222,
    [int]$DevServerPort = 5173,
    [string]$TrackTitle,
    [switch]$DisableRowBlur,
    [switch]$DisableRowBlurTransition,
    [switch]$PromoteRowBlur,
    [switch]$UseConstantRowTransition,
    [switch]$DisableEdgeMask,
    [switch]$DisableBackgroundRaster,
    [switch]$DisableRowShellPromotion,
    [switch]$DisableActiveLineShadow,
    [switch]$DisableContentVisibility,
    [switch]$DisableKaraokeFillMask,
    [switch]$DisableKaraokeWordMaskImage,
    [switch]$DisableKaraokeWordMask,
    [switch]$EnableKaraokeWordOverlay,
    [switch]$DisableKaraokeMotion,
    [switch]$UseKaraoke2DTransform,
    [switch]$UseKaraoke3DTransform,
    [switch]$DisableKaraokeCharPromotion,
    [switch]$UseLyrics2DScale,
    [switch]$UseLyrics3DScale,
    [switch]$DisableKaraokeWaapi,
    [switch]$EnableKaraokeWaapi,
    [switch]$StopOnTrackChange,
    [switch]$LowOverhead,
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

if ($DurationMs -lt 1000 -or $DurationMs -gt 600000) {
    throw 'DurationMs must be between 1000 and 600000.'
}
if ($WarmupMs -lt 0 -or $WarmupMs -gt 10000) {
    throw 'WarmupMs must be between 0 and 10000.'
}

if (-not $OutputPath) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $OutputPath = Join-Path $PWD "logs/diagnostics/lyrics-frame-profile-$stamp.json"
}
$OutputPath = [IO.Path]::GetFullPath($OutputPath)

$targets = @(Invoke-RestMethod -Uri "http://127.0.0.1:$CdpPort/json/list" -ErrorAction Stop)
$targetUrlPattern = "http://localhost:$DevServerPort/*"
$target = $targets |
    Where-Object { $_.type -eq 'page' -and $_.webSocketDebuggerUrl -and $_.url -like $targetUrlPattern } |
    Select-Object -First 1
if (-not $target) {
    throw "No Simple Player WebView2 debug target found at localhost:$DevServerPort on port $CdpPort; refusing to profile an unrelated page."
}

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$socket.ConnectAsync(
    [Uri][string]$target.webSocketDebuggerUrl,
    [Threading.CancellationToken]::None
).GetAwaiter().GetResult() | Out-Null

function Send-CdpMessage([object]$Message) {
    $json = $Message | ConvertTo-Json -Depth 20 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $socket.SendAsync(
        [ArraySegment[byte]]::new($bytes),
        [System.Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        [Threading.CancellationToken]::None
    ).GetAwaiter().GetResult() | Out-Null
}

function Receive-CdpMessage {
    $buffer = New-Object byte[] 1048576
    $stream = [IO.MemoryStream]::new()
    do {
        $result = $socket.ReceiveAsync(
            [ArraySegment[byte]]::new($buffer),
            [Threading.CancellationToken]::None
        ).GetAwaiter().GetResult()
        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
            throw 'WebView2 closed the CDP connection.'
        }
        $stream.Write($buffer, 0, $result.Count)
    } while (-not $result.EndOfMessage)
    $message = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
    $stream.Dispose()
    return $message
}

Send-CdpMessage @{ id = 1; method = 'Runtime.enable' }
do { $message = Receive-CdpMessage } while ($message.id -ne 1)

$startSecondsLiteral = if ($null -eq $StartSeconds) { 'null' } else {
    [Convert]::ToString($StartSeconds, [Globalization.CultureInfo]::InvariantCulture)
}
$stopOnTrackChangeLiteral = if ($StopOnTrackChange) { 'true' } else { 'false' }
$lowOverheadLiteral = if ($LowOverhead) { 'true' } else { 'false' }
$trackTitleLiteral = $TrackTitle | ConvertTo-Json -Compress
$disableRowBlurLiteral = if ($DisableRowBlur) { 'true' } else { 'false' }
$disableRowBlurTransitionLiteral = if ($DisableRowBlurTransition) { 'true' } else { 'false' }
$promoteRowBlurLiteral = if ($PromoteRowBlur) { 'true' } else { 'false' }
$useConstantRowTransitionLiteral = if ($UseConstantRowTransition) { 'true' } else { 'false' }
$disableEdgeMaskLiteral = if ($DisableEdgeMask) { 'true' } else { 'false' }
$disableBackgroundRasterLiteral = if ($DisableBackgroundRaster) { 'true' } else { 'false' }
$disableRowShellPromotionLiteral = if ($DisableRowShellPromotion) { 'true' } else { 'false' }
$disableActiveLineShadowLiteral = if ($DisableActiveLineShadow) { 'true' } else { 'false' }
$disableContentVisibilityLiteral = if ($DisableContentVisibility) { 'true' } else { 'false' }
$disableKaraokeFillMaskLiteral = if ($DisableKaraokeFillMask) { 'true' } else { 'false' }
$disableKaraokeWordMaskImageLiteral = if ($DisableKaraokeWordMaskImage) { 'true' } else { 'false' }
$disableKaraokeWordMaskLiteral = if ($DisableKaraokeWordMask) { 'true' } else { 'false' }
$enableKaraokeWordOverlayLiteral = if ($EnableKaraokeWordOverlay) { 'true' } else { 'false' }
$disableKaraokeMotionLiteral = if ($DisableKaraokeMotion) { 'true' } else { 'false' }
$useKaraoke3DOverrideLiteral = if ($UseKaraoke3DTransform) { 'true' } elseif ($UseKaraoke2DTransform) { 'false' } else { 'null' }
$disableKaraokeCharPromotionLiteral = if ($DisableKaraokeCharPromotion) { 'true' } else { 'false' }
$useLyrics3DOverrideLiteral = if ($UseLyrics3DScale) { 'true' } elseif ($UseLyrics2DScale) { 'false' } else { 'null' }
$disableKaraokeWaapiLiteral = if ($DisableKaraokeWaapi) { 'true' } else { 'false' }
$enableKaraokeWaapiLiteral = if ($EnableKaraokeWaapi) { 'true' } else { 'false' }

$expression = @'
(async ({ durationMs, startSeconds, warmupMs, stopOnTrackChange, lowOverhead, trackTitle, disableRowBlur, disableRowBlurTransition, promoteRowBlur, useConstantRowTransition, disableEdgeMask, disableBackgroundRaster, disableRowShellPromotion, disableActiveLineShadow, disableContentVisibility, disableKaraokeFillMask, disableKaraokeWordMaskImage, disableKaraokeWordMask, enableKaraokeWordOverlay, disableKaraokeMotion, useKaraoke3DOverride, disableKaraokeCharPromotion, useLyrics3DOverride, disableKaraokeWaapi, enableKaraokeWaapi }) => {
    const debug = {
        enabled: !lowOverhead,
        profileStartAt: 0,
        schedulerFrames: [],
        registryFrames: [],
        subscriptions: [],
        karaokeRuntimes: [],
        karaokeSyncs: [],
        karaokeStyleWrites: [],
        rowLifecycles: [],
        rowVisibility: [],
        rowLayerHints: [],
        measurementBatches: [],
        measurementChanges: [],
        reactCommits: [],
    };
    const recordDebugEvent = event => {
        if (!debug.enabled || !event || typeof event.type !== 'string') return;
        // Keep an absolute timestamp while the panel is being opened. The
        // report converts it to the timed profile window once `startedAt` is
        // known, so setup events cannot be mistaken for frame samples.
        const atMs = performance.now();
        if (event.type === 'scheduler-frame') debug.schedulerFrames.push({ atMs, ...event });
        else if (event.type === 'registry-frame') debug.registryFrames.push({ atMs, ...event });
        else if (event.type === 'scheduler-subscription') debug.subscriptions.push({ atMs, ...event });
        else if (event.type === 'karaoke-runtime') debug.karaokeRuntimes.push({ atMs, ...event });
        else if (event.type === 'karaoke-sync') debug.karaokeSyncs.push({ atMs, ...event });
        else if (event.type === 'karaoke-style-writes') debug.karaokeStyleWrites.push({ atMs, ...event });
        else if (event.type === 'row-lifecycle') debug.rowLifecycles.push({ atMs, ...event });
        else if (event.type === 'row-visibility') debug.rowVisibility.push({ atMs, ...event });
        else if (event.type === 'row-layer-hint') debug.rowLayerHints.push({ atMs, ...event });
        else if (event.type === 'measurement-batch') debug.measurementBatches.push({ atMs, ...event });
        else if (event.type === 'measurement-change') debug.measurementChanges.push({ atMs, ...event });
        else if (event.type === 'react-commit') debug.reactCommits.push({ atMs, ...event });
    };
    if (typeof window !== 'undefined') {
        // The renderer checks this optional sink without allocating events when
        // profiling is disabled. MutationObserver data below remains separate.
        window.__SIMPLE_PLAYER_LYRICS_DEBUG__ = debug.enabled ? recordDebugEvent : undefined;
    }
    if (typeof window !== 'undefined') {
        window.__SIMPLE_PLAYER_DISABLE_KARAOKE_WAAPI__ = disableKaraokeWaapi;
        window.__SIMPLE_PLAYER_ENABLE_KARAOKE_WAAPI__ = enableKaraokeWaapi;
        window.__SIMPLE_PLAYER_DISABLE_KARAOKE_WORD_MASK__ = disableKaraokeWordMask;
        // Keep the existing diagnostic switch meaningful for the current
        // per-word overlay implementation as well as older builds.
        window.__SIMPLE_PLAYER_DISABLE_KARAOKE_WORD_OVERLAY__ = disableKaraokeWordMask;
        window.__SIMPLE_PLAYER_ENABLE_KARAOKE_WORD_OVERLAY__ = enableKaraokeWordOverlay;
        window.__SIMPLE_PLAYER_KARAOKE_USE_3D__ = useKaraoke3DOverride;
        window.__SIMPLE_PLAYER_LYRICS_USE_3D_SCALE__ = useLyrics3DOverride;
    }
    const invoke = window.__TAURI__?.core?.invoke;
    if (typeof invoke !== 'function') throw new Error('Tauri invoke is unavailable.');

    let selectedSong = null;
    let playerStore = null;
    if (trackTitle) {
        const songs = await invoke('get_library_songs');
        const normalizedTitle = trackTitle.trim().toLocaleLowerCase();
        const songIndex = songs.findIndex(song =>
            String(song.title ?? '').trim().toLocaleLowerCase() === normalizedTitle
        );
        if (songIndex < 0) throw new Error(`Track not found in library: ${trackTitle}`);
        const song = songs[songIndex];
        selectedSong = song;
        const [{ usePlayerStore }, { useLibraryStore }] = await Promise.all([
            import('/src/store/usePlayerStore.ts'),
            import('/src/store/useLibraryStore.ts'),
        ]);
        const snapshot = await invoke('play_audio', { path: song.path, metadata: song });
        useLibraryStore.getState().setPlaylist(songs);
        useLibraryStore.getState().setCurrentSongIndex(songIndex);
        playerStore = usePlayerStore;
        const playerState = usePlayerStore.getState();
        playerState.setMetadata(song);
        playerState.resetPlaybackClock(song.path);
        playerState.setMediaKind('audio');
        playerState.setPlaybackSnapshot(snapshot);
        await playerState.requestLyricsForPath(song.path);
    }

    if (!playerStore) {
        const { usePlayerStore } = await import('/src/store/usePlayerStore.ts');
        playerStore = usePlayerStore;
        selectedSong = usePlayerStore.getState().metadata;
    }

    const { useThemeStore } = await import('/src/store/useThemeStore.ts');
    // The refactored renderer owns its row host imperatively, so the first
    // fullscreen overlay is not necessarily the lyrics player. Prefer the
    // overlay that actually contains the current lyric row.
    const findPlayer = () => {
        const lyricPanel = document.querySelector('[data-lyrics-panel]');
        return lyricPanel?.closest('div.absolute.inset-0.z-200')
            ?? Array.from(document.querySelectorAll('div.absolute.inset-0.z-200'))
                .find(node => node.querySelector('.animated-lyrics-row-shell, .lyrics-motion-row, .amll-lyric-player'))
            ?? document.querySelector('div.absolute.inset-0.z-200');
    };
    let player = findPlayer();
    player?.querySelector('button.w-12.h-1\\.5')?.click();
    await new Promise(resolve => setTimeout(resolve, 600));
    playerStore.setState({ isLyricsOpen: true, isQueueOpen: false });
    window.dispatchEvent(new Event('open-fullscreen-player'));
    await new Promise(resolve => setTimeout(resolve, 750));
    useThemeStore.getState().setPlayerEffectMode('performance');
    await new Promise(resolve => setTimeout(resolve, 250));
    useThemeStore.getState().setPlayerEffectMode('animation');
    await new Promise(resolve => setTimeout(resolve, 250));
    player = findPlayer();
    if (startSeconds !== null) {
        await invoke('seek_audio', { position: startSeconds });
        window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { time: startSeconds } }));
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    const lyricsDocument = playerStore.getState().lyricsDocument;
    const timingMode = lyricsDocument?.timing_mode ?? 'none';
    const lyricLines = lyricsDocument?.lines ?? [];
    const hasWordLyrics = lyricLines.some(line => (line.words?.length ?? 0) > 0);
    const lyricRoleCounts = lyricLines.reduce((counts, line) => {
        const role = line.role ?? 'missing';
        counts[role] = (counts[role] ?? 0) + 1;
        return counts;
    }, {});
    const { buildDisplayItems } = await import('/src/features/player/lyrics/lyricsDisplay.ts');
    const expectedDisplayItemCount = buildDisplayItems(
        lyricLines,
        timingMode !== 'none',
    ).length;
    const trackDurationSeconds = Number(selectedSong?.duration ?? 0);

    /* Keep the frontend playback state in sync with the resumed Rust audio. */
    const playToggle = player && Array.from(player.querySelectorAll('button')).find(button => String(button.className).includes('max-w-16'));
    const playIcon = playToggle && playToggle.querySelector('svg');
    const playIconClass = playIcon && playIcon.getAttribute('class') || '';
    if (playIconClass.includes('ml-[4%]')) {
        playToggle.click();
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    const hasLyricsRenderer = node => Boolean(node?.querySelector('.lyrics-motion-row, .amll-lyric-player'));
    // The overlay can be replaced while the fullscreen transition completes;
    // always resolve the current owner before sampling, even if the previous
    // node happened to contain a renderer as well.
    player = findPlayer();
    if (!hasLyricsRenderer(player)) {
        playerStore.setState({ isLyricsOpen: true, isQueueOpen: false });
    }
    // Lyrics mounting can lag the panel transition, especially for line-only
    // documents after a track switch. Wait for the actual renderer instead of
    // treating the header-only overlay as a failed profile setup.
    for (let attempt = 0; attempt < 60 && !hasLyricsRenderer(player); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 250));
        player = findPlayer();
    }
    if (!hasLyricsRenderer(player)) {
        const playerState = playerStore.getState();
        throw new Error(`Open the animation-priority lyrics panel before profiling. ` + JSON.stringify({
            isLyricsOpen: playerState.isLyricsOpen,
            lyricsStatus: playerState.lyricsStatus,
            timingMode: playerState.lyricsDocument?.timing_mode ?? null,
            lineCount: playerState.lyricsDocument?.lines?.length ?? 0,
            playerEffectMode: useThemeStore.getState().playerEffectMode,
            rowShells: document.querySelectorAll('.animated-lyrics-row-shell').length,
            fullscreenPlayers: document.querySelectorAll('div.absolute.inset-0.z-200').length,
            scrollRoots: player?.querySelectorAll('.relative.z-10').length ?? 0,
            playerText: player?.textContent?.trim().slice(0, 300) ?? '',
            globalRows: document.querySelectorAll('.lyrics-motion-row').length,
            rowAncestors: (() => {
                const row = document.querySelector('.lyrics-motion-row');
                const ancestors = [];
                for (let node = row?.parentElement; node && ancestors.length < 8; node = node.parentElement) {
                    ancestors.push(String(node.className));
                }
                return ancestors;
            })(),
        }));
    }

    const renderer = player.querySelector('.amll-lyric-player') ? 'amll' : 'animated';
    const rowShellSelector = renderer === 'amll'
        ? '[class*="_lyricLineWrapper"]'
        : '.animated-lyrics-row-shell';
    const contentRowSelector = renderer === 'amll'
        ? '[class*="_lyricLineWrapper"]'
        : '.lyrics-motion-row';
    const activeRowSelector = renderer === 'amll'
        ? '[class*="_lyricLine"][class*="_active"]'
        : '.lyrics-motion-row.drop-shadow-xl';

    document.querySelector('style[data-lyrics-profile-override]')?.remove();
    const overrideRules = [];
    if (disableRowBlur) {
        overrideRules.push('.animated-lyrics-row-shell, .lyrics-motion-row { filter: none !important; transition-property: opacity !important; }');
    } else if (disableRowBlurTransition) {
        overrideRules.push('.animated-lyrics-row-shell, .lyrics-motion-row { transition-property: opacity !important; }');
    } else if (promoteRowBlur) {
        overrideRules.push('.animated-lyrics-row-shell, .lyrics-motion-row { will-change: transform, filter, opacity; }');
    } else if (useConstantRowTransition) {
        overrideRules.push('.animated-lyrics-row-shell, .lyrics-motion-row { transition: filter 380ms ease-out, opacity 350ms ease-out !important; }');
    }
    if (disableActiveLineShadow) {
        overrideRules.push('.animated-lyrics-row-shell > .lyrics-motion-row, [data-animated-lyrics-translation] { filter: none !important; }');
    }
    if (disableRowShellPromotion) {
        overrideRules.push('.animated-lyrics-row-shell { will-change: auto !important; }');
    }
    if (disableContentVisibility) {
        overrideRules.push('.lyrics-motion-row { content-visibility: visible !important; contain-intrinsic-size: none !important; }');
    }
    if (disableKaraokeFillMask) {
        overrideRules.push('.karaoke-char::before, .karaoke-word-fill-group::before { display: none !important; }');
    }
    if (disableKaraokeWordMaskImage) {
        overrideRules.push('.karaoke-word-fill-group::before, .karaoke-word-mask { -webkit-mask-image: none !important; mask-image: none !important; }');
    }
    if (disableKaraokeMotion) {
        overrideRules.push('.karaoke-char-motion, .karaoke-char { transform: none !important; transition: none !important; will-change: auto !important; }');
    }
    if (disableKaraokeCharPromotion) {
        overrideRules.push('.karaoke-char-motion, .karaoke-char, .karaoke-char-long-tone { will-change: auto !important; }');
    }
    if (overrideRules.length > 0) {
        const style = document.createElement('style');
        style.dataset.lyricsProfileOverride = 'true';
        style.textContent = overrideRules.join('\n');
        document.head.appendChild(style);
    }

    const maskedScrollRoot = player.querySelector('.lyrics-motion-row')?.closest('.relative.z-10');
    const originalMask = maskedScrollRoot instanceof HTMLElement
        ? {
            maskImage: maskedScrollRoot.style.maskImage,
            webkitMaskImage: maskedScrollRoot.style.webkitMaskImage,
        }
        : null;
    if (disableEdgeMask && maskedScrollRoot instanceof HTMLElement) {
        maskedScrollRoot.style.maskImage = 'none';
        maskedScrollRoot.style.webkitMaskImage = 'none';
    }

    // Diagnostic-only isolation: keep the canvas and its 30fps renderer alive,
    // but reduce its backing store so WebGL raster work is negligible. This
    // isolates host/lyrics work without changing the product implementation.
    if (disableBackgroundRaster) {
        document.querySelectorAll('canvas').forEach(canvas => {
            canvas.width = 1;
            canvas.height = 1;
        });
    }

    await invoke('resume_audio');
    if (warmupMs > 0) await new Promise(resolve => setTimeout(resolve, warmupMs));

    const startedAt = performance.now();
    debug.profileStartAt = startedAt;
    const startAudioSeconds = await invoke('get_audio_position');
    const frameSamples = [];
    const boundarySamples = [];
    const longAnimationFrames = [];
    const longTasks = [];
    const layoutShifts = [];
    const behaviorSamples = [];
    const inputEvents = [];
    const environmentSamples = [];
    let previousFrameAt = startedAt;
    let frameIndex = 0;
    let activeText = '';
    let lastBoundaryAudioSeconds = startAudioSeconds;
    let latestAudioSeconds = startAudioSeconds;
    let trackEndAudioSeconds = null;
    let stoppedOnTrackChange = false;
    let panelLostAtMs = null;
    let consecutivePanelMisses = 0;
    let nextEnvironmentSampleAt = startedAt;
    let nextActiveTextSampleAt = startedAt;
    let nextBehaviorSampleAt = startedAt;
    // Low-overhead profiles refresh DOM cardinality only once per second and
    // reuse the last sample for frame rows. This keeps the frame sampler cheap
    // while still reporting the real mounted/content counts.
    let sampledConnectedRows = 0;
    let sampledContentRows = 0;
    let sampledCharacterCount = 0;
    let resizeObserverCallbacks = 0;
    let resizeObserverEntries = 0;
    let mutations = {
        total: 0,
        rowPosition: 0,
        rowScale: 0,
        writes: {
            position: 0,
            scale: 0,
            filter: 0,
            opacity: 0,
            transition: 0,
        },
        character: 0,
        otherStyle: 0,
        className: 0,
        addedNodes: 0,
        removedNodes: 0,
        rowMounts: 0,
        rowUnmounts: 0,
        mutationObserverBatches: 0,
        resizeObserverCallbacks: 0,
        resizeObserverEntries: 0,
        targets: {},
    };

    const takeMutations = () => {
        const result = mutations;
        mutations = {
            total: 0,
            rowPosition: 0,
            rowScale: 0,
            writes: {
                position: 0,
                scale: 0,
                filter: 0,
                opacity: 0,
                transition: 0,
            },
            character: 0,
            otherStyle: 0,
            className: 0,
            addedNodes: 0,
            removedNodes: 0,
            rowMounts: 0,
            rowUnmounts: 0,
            mutationObserverBatches: 0,
            resizeObserverCallbacks: 0,
            resizeObserverEntries: 0,
            targets: {},
        };
        result.resizeObserverCallbacks = resizeObserverCallbacks;
        result.resizeObserverEntries = resizeObserverEntries;
        resizeObserverCallbacks = 0;
        resizeObserverEntries = 0;
        return result;
    };

    const countRowsInNode = node => {
        if (!(node instanceof Element)) return 0;
        return (node.matches(rowShellSelector) ? 1 : 0) +
            node.querySelectorAll(rowShellSelector).length;
    };
    const readInlineStyle = cssText => {
        const style = document.createElement('div').style;
        style.cssText = cssText ?? '';
        return style;
    };
    const transitionValue = style => [
        style.transition,
        style.transitionProperty,
        style.transitionDuration,
        style.transitionDelay,
        style.transitionTimingFunction,
    ].join('|');

    const diagnosticResizeObserver = lowOverhead
        ? null
        : new ResizeObserver(entries => {
            resizeObserverCallbacks++;
            resizeObserverEntries += entries.length;
        });
    const observeRowShells = root => {
        if (!diagnosticResizeObserver || !(root instanceof Element || root instanceof Document)) return;
        if (root instanceof Element && root.matches(rowShellSelector)) {
            diagnosticResizeObserver.observe(root);
        }
        root.querySelectorAll(rowShellSelector).forEach(node => diagnosticResizeObserver.observe(node));
    };
    observeRowShells(player);

    const mutationObserver = new MutationObserver(records => {
        mutations.mutationObserverBatches++;
        for (const record of records) {
            mutations.total++;
            const target = record.target;
            const targetKey = target instanceof Element
                ? target.matches('.karaoke-char-float')
                    ? 'karaoke-char-float'
                    : target.matches('.karaoke-char-emphasis')
                        ? 'karaoke-char-emphasis'
                        : target.matches('.karaoke-char-motion')
                            ? 'karaoke-char-motion'
                            : target.matches('.karaoke-char')
                                ? 'karaoke-char'
                    : target.matches('[data-animated-lyrics-scale]')
                        ? 'row-scale'
                        : target.matches('.lyrics-motion-row')
                            ? 'lyrics-row'
                            : target.matches(rowShellSelector)
                                ? 'row-position'
                                : `${target.tagName.toLowerCase()}.${String(target.className).split(' ').slice(0, 2).join('.')}`
                : record.type;
            mutations.targets[targetKey] = (mutations.targets[targetKey] ?? 0) + 1;
            if (record.type === 'childList') {
                mutations.addedNodes += record.addedNodes.length;
                mutations.removedNodes += record.removedNodes.length;
                record.addedNodes.forEach(node => {
                    mutations.rowMounts += countRowsInNode(node);
                    observeRowShells(node);
                });
                record.removedNodes.forEach(node => {
                    mutations.rowUnmounts += countRowsInNode(node);
                });
                continue;
            }
            if (record.attributeName === 'class') {
                mutations.className++;
                continue;
            }
            if (!(target instanceof Element)) continue;
            if (record.attributeName === 'style') {
                const oldStyle = readInlineStyle(record.oldValue);
                const currentStyle = target.style;
                const isScaleLayer = target.matches('[data-animated-lyrics-scale]');
                const isRowShell = target.matches(rowShellSelector);
                const isRowContent = target.matches(contentRowSelector);
                if (isScaleLayer && oldStyle.transform !== currentStyle.transform) {
                    mutations.writes.scale++;
                    mutations.rowScale++;
                } else if (isRowShell && oldStyle.transform !== currentStyle.transform) {
                    mutations.writes.position++;
                    mutations.rowPosition++;
                }
                if ((isRowShell || isRowContent) && oldStyle.filter !== currentStyle.filter) {
                    mutations.writes.filter++;
                }
                if ((isRowShell || isRowContent) && oldStyle.opacity !== currentStyle.opacity) {
                    mutations.writes.opacity++;
                }
                if ((isRowShell || isRowContent) && transitionValue(oldStyle) !== transitionValue(currentStyle)) {
                    mutations.writes.transition++;
                }
            }
            if (target.matches('.karaoke-char-motion, .karaoke-char, .karaoke-char-float, .karaoke-char-emphasis')) mutations.character++;
            else if (!target.matches('[data-animated-lyrics-scale]') && !target.matches(rowShellSelector)) mutations.otherStyle++;
        }
    });
    if (!lowOverhead) {
        mutationObserver.observe(player, {
            attributes: true,
            attributeFilter: ['class', 'style'],
            attributeOldValue: true,
            childList: true,
            subtree: true,
        });
    }

    const recordInput = event => {
        inputEvents.push({
            atMs: performance.now() - startedAt,
            type: event.type,
            isTrusted: event.isTrusted,
            target: event.target instanceof Element
                ? `${event.target.tagName.toLowerCase()}${event.target.id ? `#${event.target.id}` : ''}`
                : '',
        });
    };
    const inputEventTypes = ['click', 'pointerdown', 'keydown'];
    inputEventTypes.forEach(type => document.addEventListener(type, recordInput, true));

    const supportedTypes = PerformanceObserver.supportedEntryTypes ?? [];
    const observers = [];
    const observe = (type, callback) => {
        if (!supportedTypes.includes(type)) return;
        const observer = new PerformanceObserver(list => callback(list.getEntries()));
        observer.observe({ type, buffered: false });
        observers.push(observer);
    };
    observe('long-animation-frame', entries => {
        for (const entry of entries) {
            longAnimationFrames.push({
                atMs: entry.startTime - startedAt,
                durationMs: entry.duration,
                blockingDurationMs: entry.blockingDuration,
                scripts: (entry.scripts ?? []).map(script => ({
                    durationMs: script.duration,
                    forcedStyleAndLayoutDurationMs: script.forcedStyleAndLayoutDuration,
                    functionName: script.sourceFunctionName,
                    sourceURL: script.sourceURL,
                    invoker: script.invoker,
                    invokerType: script.invokerType,
                })),
            });
        }
    });
    observe('longtask', entries => {
        for (const entry of entries) {
            longTasks.push({ atMs: entry.startTime - startedAt, durationMs: entry.duration });
        }
    });
    observe('layout-shift', entries => {
        for (const entry of entries) {
            if (!entry.hadRecentInput) {
                layoutShifts.push({ atMs: entry.startTime - startedAt, value: entry.value });
            }
        }
    });

    while (performance.now() - startedAt < durationMs && !stoppedOnTrackChange) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        if (!player?.isConnected || !hasLyricsRenderer(player)) {
            player = findPlayer();
        }
        const intervalMs = now - previousFrameAt;
        previousFrameAt = now;
        frameIndex++;

        let nextActiveText = activeText;
        if (!lowOverhead || now >= nextActiveTextSampleAt) {
            const activeRow = player?.querySelector(activeRowSelector);
            nextActiveText = activeRow?.textContent?.trim().slice(0, 160) ?? '';
            nextActiveTextSampleAt = now + 50;
        }
            const frameMutations = takeMutations();
            const contentRows = lowOverhead
                ? null
                : Array.from(player?.querySelectorAll(contentRowSelector) ?? []);
            const connectedRowShells = lowOverhead
                ? sampledConnectedRows
                : player?.querySelectorAll(rowShellSelector).length ?? 0;
            const contentRowCount = lowOverhead ? sampledContentRows : contentRows.length;
        const sample = {
            frame: frameIndex,
            atMs: now - startedAt,
            intervalMs,
            activeText: nextActiveText,
            connectedRows: connectedRowShells,
            contentRows: contentRowCount,
            mountedRows: contentRowCount,
            characterCount: lowOverhead ? sampledCharacterCount : (player?.querySelectorAll('.karaoke-char').length ?? 0),
            mutations: frameMutations,
        };
        frameSamples.push(sample);

        // The behavior baseline samples the already-rendered values at a low
        // cadence. It never writes styles or changes animation timing.
        if (!lowOverhead && now >= nextBehaviorSampleAt) {
            const behaviorRow = player?.querySelector(activeRowSelector);
            const behaviorChars = Array.from(behaviorRow?.querySelectorAll('.karaoke-char') ?? [])
                .slice(0, 16)
                .map(char => ({
                    char: char.dataset.c ?? '',
                    transform: getComputedStyle(char).transform,
                    fill: char.style.getPropertyValue('--kf'),
                    glow: char.style.getPropertyValue('--kg'),
                }));
            behaviorSamples.push({
                atMs: now - startedAt,
                audioSeconds: latestAudioSeconds,
                rowText: behaviorRow?.textContent?.trim().slice(0, 160) ?? '',
                rowTransform: behaviorRow ? getComputedStyle(behaviorRow).transform : '',
                rowOpacity: behaviorRow ? getComputedStyle(behaviorRow).opacity : '',
                rowFilter: behaviorRow ? getComputedStyle(behaviorRow).filter : '',
                chars: behaviorChars,
            });
            nextBehaviorSampleAt = now + 50;
        }

        if (now >= nextEnvironmentSampleAt) {
            player = findPlayer();
            const mountedRows = player?.querySelectorAll(contentRowSelector).length ?? 0;
            const connectedRows = player?.querySelectorAll(rowShellSelector).length ?? 0;
            sampledContentRows = mountedRows;
            sampledConnectedRows = connectedRows;
            sampledCharacterCount = player?.querySelectorAll('.karaoke-char').length ?? 0;
            const panelOpen = connectedRows > 0;
            const animatedRoot = player?.querySelector('[data-animated-display-count]');
            environmentSamples.push({
                atMs: now - startedAt,
                visibilityState: document.visibilityState,
                hasFocus: document.hasFocus(),
                usedJsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
                totalJsHeapBytes: performance.memory?.totalJSHeapSize ?? null,
                jsHeapLimitBytes: performance.memory?.jsHeapSizeLimit ?? null,
                domNodeCount: document.getElementsByTagName('*').length,
                domDocumentCount: document.querySelectorAll('html').length,
                canvasBackingStores: Array.from(document.querySelectorAll('canvas')).map(canvas => ({
                    width: canvas.width,
                    height: canvas.height,
                    cssWidth: canvas.clientWidth,
                    cssHeight: canvas.clientHeight,
                })),
                cssAnimationCount: document.getAnimations().length,
                rowAnimationCount: Array.from(player?.querySelectorAll(contentRowSelector) ?? [])
                    .reduce((count, row) => count + row.getAnimations().length, 0),
                mountedRows,
                connectedRows,
                contentRows: mountedRows,
                mountedKeys: Array.from(player?.querySelectorAll(rowShellSelector) ?? [])
                    .map((row, index) => row.dataset.animatedLyricsRowKey ?? `${renderer}-${index}`)
                    .filter(Boolean),
                panelOpen,
            });
            consecutivePanelMisses = !panelOpen || mountedRows === 0
                ? consecutivePanelMisses + 1
                : 0;
            if (consecutivePanelMisses >= 3) {
                panelLostAtMs = now - startedAt;
                break;
            }
            void invoke('get_audio_position').then(audioSeconds => {
                if (
                    stopOnTrackChange &&
                    lastBoundaryAudioSeconds > 5 &&
                    (
                        audioSeconds + 2 < lastBoundaryAudioSeconds ||
                        (trackDurationSeconds > 0 && audioSeconds >= trackDurationSeconds - 0.35)
                    )
                ) {
                    trackEndAudioSeconds = trackDurationSeconds > 0
                        ? Math.min(trackDurationSeconds, Math.max(audioSeconds, lastBoundaryAudioSeconds))
                        : lastBoundaryAudioSeconds;
                    stoppedOnTrackChange = true;
                } else {
                    latestAudioSeconds = audioSeconds;
                }
            });
            nextEnvironmentSampleAt = now + 1000;
        }

        if (nextActiveText !== activeText) {
            const audioSeconds = latestAudioSeconds + Math.max(0, now - nextEnvironmentSampleAt + 1000) / 1000;
            boundarySamples.push({
                frame: frameIndex,
                atMs: sample.atMs,
                previousText: activeText,
                activeText: nextActiveText,
                audioSeconds,
                mountedRows: sample.mountedRows,
                connectedRows: sample.connectedRows,
                contentRows: sample.contentRows,
                characterCount: sample.characterCount,
            });
            activeText = nextActiveText;
            lastBoundaryAudioSeconds = audioSeconds;
        }
    }

    mutationObserver.disconnect();
    diagnosticResizeObserver?.disconnect();
    inputEventTypes.forEach(type => document.removeEventListener(type, recordInput, true));
    document.querySelector('style[data-lyrics-profile-override]')?.remove();
    if (originalMask && maskedScrollRoot instanceof HTMLElement) {
        maskedScrollRoot.style.maskImage = originalMask.maskImage;
        maskedScrollRoot.style.webkitMaskImage = originalMask.webkitMaskImage;
    }
    observers.forEach(observer => observer.disconnect());
    const debugReport = debug.enabled ? {
        schedulerFrames: debug.schedulerFrames.map(event => ({ ...event, atMs: event.atMs - startedAt })),
        registryFrames: debug.registryFrames.map(event => ({ ...event, atMs: event.atMs - startedAt })),
        subscriptions: debug.subscriptions.map(event => ({ ...event, atMs: event.atMs - startedAt })),
        karaokeRuntimes: debug.karaokeRuntimes.map(event => ({ ...event, atMs: event.atMs - startedAt })),
        karaokeSyncs: debug.karaokeSyncs.map(event => ({ ...event, atMs: event.atMs - startedAt })),
        karaokeStyleWrites: debug.karaokeStyleWrites.map(event => ({ ...event, atMs: event.atMs - startedAt })),
        rowLifecycles: debug.rowLifecycles.map(event => ({ ...event, atMs: event.atMs - startedAt })),
        rowVisibility: debug.rowVisibility.map(event => ({ ...event, atMs: event.atMs - startedAt })),
        rowLayerHints: debug.rowLayerHints.map(event => ({ ...event, atMs: event.atMs - startedAt })),
        measurementBatches: debug.measurementBatches.map(event => ({ ...event, atMs: event.atMs - startedAt })),
        measurementChanges: debug.measurementChanges.map(event => ({ ...event, atMs: event.atMs - startedAt })),
        reactCommits: debug.reactCommits.map(event => ({ ...event, atMs: event.atMs - startedAt })),
    } : null;
    if (typeof window !== 'undefined') window.__SIMPLE_PLAYER_LYRICS_DEBUG__ = undefined;
    const endAudioSeconds = trackEndAudioSeconds ?? await invoke('get_audio_position');
    const sortedIntervals = frameSamples.map(sample => sample.intervalMs).sort((a, b) => a - b);
    const percentile = value => sortedIntervals[Math.min(sortedIntervals.length - 1, Math.floor(sortedIntervals.length * value))] ?? 0;
    const medianFrameMs = percentile(0.5);
    const longFrameThresholdMs = Math.max(12, medianFrameMs * 2.25);
    const longFrames = frameSamples.filter(sample => sample.intervalMs >= longFrameThresholdMs);
    const refreshCandidates = sortedIntervals.filter(interval => interval > 0 && interval <= percentile(0.8));
    const estimatedRefreshPeriodMs = refreshCandidates.length > 0
        ? refreshCandidates[Math.floor(refreshCandidates.length / 2)]
        : medianFrameMs;
    let droppedRefreshes = 0;
    let consecutiveDroppedFrames = 0;
    let maxConsecutiveDroppedFrames = 0;
    frameSamples.forEach(sample => {
        const missedRefreshes = estimatedRefreshPeriodMs > 0
            ? Math.max(0, Math.round(sample.intervalMs / estimatedRefreshPeriodMs) - 1)
            : 0;
        sample.missedRefreshes = missedRefreshes;
        droppedRefreshes += missedRefreshes;
        if (missedRefreshes > 0) {
            consecutiveDroppedFrames++;
            maxConsecutiveDroppedFrames = Math.max(maxConsecutiveDroppedFrames, consecutiveDroppedFrames);
        } else {
            consecutiveDroppedFrames = 0;
        }
    });

    return {
        recordedAt: new Date().toISOString(),
        track: selectedSong ? {
            title: selectedSong.title,
            artist: selectedSong.artist,
            durationSeconds: trackDurationSeconds,
        } : null,
        timingMode,
        renderer,
        hasWordLyrics,
        lyricLineCount: lyricLines.length,
        lyricNonEmptyLineCount: lyricLines.filter(line => line.text.length > 0).length,
        lyricRoleCounts,
        expectedDisplayItemCount,
        disableEdgeMask,
        disableBackgroundRaster,
        disableRowShellPromotion,
        disableActiveLineShadow,
        disableContentVisibility,
        disableKaraokeFillMask,
        disableKaraokeWordMaskImage,
        disableKaraokeWordMask,
        enableKaraokeWordOverlay,
        disableKaraokeMotion,
        useKaraoke3DOverride,
        disableKaraokeCharPromotion,
        useLyrics3DOverride,
        durationMs: performance.now() - startedAt,
        stoppedOnTrackChange,
        panelLostAtMs,
        startAudioSeconds,
        endAudioSeconds,
        frameCount: frameSamples.length,
        medianFrameMs,
        estimatedRefreshPeriodMs,
        estimatedRefreshHz: estimatedRefreshPeriodMs > 0 ? 1000 / estimatedRefreshPeriodMs : 0,
        droppedRefreshes,
        maxConsecutiveDroppedFrames,
        p95FrameMs: percentile(0.95),
        p99FrameMs: percentile(0.99),
        maxFrameMs: sortedIntervals.at(-1) ?? 0,
        longFrameThresholdMs,
        supportedPerformanceEntryTypes: supportedTypes,
        boundarySamples,
        longFrames,
        longAnimationFrames,
        longTasks,
        layoutShifts,
        inputEvents,
        debug: debugReport,
        behaviorSamples,
        environmentSamples,
        frameSamples,
    };
})({ durationMs: __DURATION_MS__, startSeconds: __START_SECONDS__, warmupMs: __WARMUP_MS__, stopOnTrackChange: __STOP_ON_TRACK_CHANGE__, lowOverhead: __LOW_OVERHEAD__, trackTitle: __TRACK_TITLE__, disableRowBlur: __DISABLE_ROW_BLUR__, disableRowBlurTransition: __DISABLE_ROW_BLUR_TRANSITION__, promoteRowBlur: __PROMOTE_ROW_BLUR__, useConstantRowTransition: __USE_CONSTANT_ROW_TRANSITION__, disableEdgeMask: __DISABLE_EDGE_MASK__, disableBackgroundRaster: __DISABLE_BACKGROUND_RASTER__, disableRowShellPromotion: __DISABLE_ROW_SHELL_PROMOTION__, disableActiveLineShadow: __DISABLE_ACTIVE_LINE_SHADOW__, disableContentVisibility: __DISABLE_CONTENT_VISIBILITY__, disableKaraokeFillMask: __DISABLE_KARAOKE_FILL_MASK__, disableKaraokeWordMaskImage: __DISABLE_KARAOKE_WORD_MASK_IMAGE__, disableKaraokeWordMask: __DISABLE_KARAOKE_WORD_MASK__, enableKaraokeWordOverlay: __ENABLE_KARAOKE_WORD_OVERLAY__, disableKaraokeMotion: __DISABLE_KARAOKE_MOTION__, useKaraoke3DOverride: __USE_KARAOKE_3D_OVERRIDE__, disableKaraokeCharPromotion: __DISABLE_KARAOKE_CHAR_PROMOTION__, useLyrics3DOverride: __USE_LYRICS_3D_OVERRIDE__, disableKaraokeWaapi: __DISABLE_KARAOKE_WAAPI__, enableKaraokeWaapi: __ENABLE_KARAOKE_WAAPI__ })
'@
$expression = $expression.Replace('__DURATION_MS__', [string]$DurationMs)
$expression = $expression.Replace('__START_SECONDS__', $startSecondsLiteral)
$expression = $expression.Replace('__WARMUP_MS__', [string]$WarmupMs)
$expression = $expression.Replace('__STOP_ON_TRACK_CHANGE__', $stopOnTrackChangeLiteral)
$expression = $expression.Replace('__LOW_OVERHEAD__', $lowOverheadLiteral)
$expression = $expression.Replace('__TRACK_TITLE__', $trackTitleLiteral)
$expression = $expression.Replace('__DISABLE_ROW_BLUR__', $disableRowBlurLiteral)
$expression = $expression.Replace('__DISABLE_ROW_BLUR_TRANSITION__', $disableRowBlurTransitionLiteral)
$expression = $expression.Replace('__PROMOTE_ROW_BLUR__', $promoteRowBlurLiteral)
$expression = $expression.Replace('__USE_CONSTANT_ROW_TRANSITION__', $useConstantRowTransitionLiteral)
$expression = $expression.Replace('__DISABLE_EDGE_MASK__', $disableEdgeMaskLiteral)
$expression = $expression.Replace('__DISABLE_BACKGROUND_RASTER__', $disableBackgroundRasterLiteral)
$expression = $expression.Replace('__DISABLE_ROW_SHELL_PROMOTION__', $disableRowShellPromotionLiteral)
$expression = $expression.Replace('__DISABLE_ACTIVE_LINE_SHADOW__', $disableActiveLineShadowLiteral)
$expression = $expression.Replace('__DISABLE_CONTENT_VISIBILITY__', $disableContentVisibilityLiteral)
$expression = $expression.Replace('__DISABLE_KARAOKE_FILL_MASK__', $disableKaraokeFillMaskLiteral)
$expression = $expression.Replace('__DISABLE_KARAOKE_WORD_MASK_IMAGE__', $disableKaraokeWordMaskImageLiteral)
$expression = $expression.Replace('__DISABLE_KARAOKE_WORD_MASK__', $disableKaraokeWordMaskLiteral)
$expression = $expression.Replace('__ENABLE_KARAOKE_WORD_OVERLAY__', $enableKaraokeWordOverlayLiteral)
$expression = $expression.Replace('__DISABLE_KARAOKE_MOTION__', $disableKaraokeMotionLiteral)
$expression = $expression.Replace('__USE_KARAOKE_3D_OVERRIDE__', $useKaraoke3DOverrideLiteral)
$expression = $expression.Replace('__DISABLE_KARAOKE_CHAR_PROMOTION__', $disableKaraokeCharPromotionLiteral)
$expression = $expression.Replace('__USE_LYRICS_3D_OVERRIDE__', $useLyrics3DOverrideLiteral)
$expression = $expression.Replace('__DISABLE_KARAOKE_WAAPI__', $disableKaraokeWaapiLiteral)
$expression = $expression.Replace('__ENABLE_KARAOKE_WAAPI__', $enableKaraokeWaapiLiteral)

Send-CdpMessage @{
    id = 2
    method = 'Runtime.evaluate'
    params = @{
        expression = $expression
        awaitPromise = $true
        returnByValue = $true
    }
}
do { $message = Receive-CdpMessage } while ($message.id -ne 2)
$socket.Dispose()

if ($message.result.exceptionDetails) {
    throw ($message.result.exceptionDetails | ConvertTo-Json -Depth 20)
}

$directory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
}
$json = $message.result.result.value | ConvertTo-Json -Depth 30
[IO.File]::WriteAllText($OutputPath, $json, [Text.UTF8Encoding]::new($false))
$OutputPath
