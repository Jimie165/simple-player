param(
    [int]$DurationMs = 12000,
    [double]$StartSeconds = 35,
    [int]$WarmupMs = 250,
    [int]$CdpPort = 9222,
    [int]$DevServerPort = 5173,
    [string]$TrackTitle,
    [switch]$DisableRowBlur,
    [switch]$DisableEdgeMask,
    [switch]$DisableBackgroundRaster,
    [switch]$PromoteScaleLayer,
    [switch]$DisableActiveLineShadow,
    [switch]$DisableContentVisibility,
    [switch]$DisableKaraokeFillMask,
    [switch]$DisableKaraokeWordMask,
    [switch]$DisableKaraokeMotion,
    [switch]$DisableKaraokeWaapi,
    [switch]$PromoteKaraokeCharacters,
    [switch]$HideKaraokeBackfaces,
    [switch]$DisableScalePromotion,
    [switch]$IncludeMemoryInfra,
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
if ($DurationMs -lt 1000 -or $DurationMs -gt 30000) {
    throw 'DurationMs must be between 1000 and 30000.'
}
if (-not $OutputPath) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $OutputPath = Join-Path $PWD "logs/diagnostics/lyrics-trace-$stamp.json"
}
$OutputPath = [IO.Path]::GetFullPath($OutputPath)

$targets = @(Invoke-RestMethod -Uri "http://127.0.0.1:$CdpPort/json/list" -ErrorAction Stop)
$targetUrlPattern = "http://localhost:$DevServerPort/*"
$target = $targets |
    Where-Object { $_.type -eq 'page' -and $_.webSocketDebuggerUrl -and $_.url -like $targetUrlPattern } |
    Select-Object -First 1
if (-not $target) {
    throw "No Simple Player WebView2 debug target found at localhost:$DevServerPort on port $CdpPort; refusing to trace an unrelated page."
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

$traceCategories = 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,gpu,disabled-by-default-gpu.debug'
if ($IncludeMemoryInfra) {
    # Memory-infra is intentionally opt-in because it makes traces much larger.
    $traceCategories += ',disabled-by-default-memory-infra,disabled-by-default-memory-infra.v8'
}

Send-CdpMessage @{
    id = 1
    method = 'Tracing.start'
    params = @{
        categories = $traceCategories
        options = 'sampling-frequency=10000'
        transferMode = 'ReturnAsStream'
    }
}
do { $message = Receive-CdpMessage } while ($message.id -ne 1)

$startLiteral = $StartSeconds.ToString([Globalization.CultureInfo]::InvariantCulture)
$trackTitleLiteral = $TrackTitle | ConvertTo-Json -Compress
$disableRowBlurLiteral = if ($DisableRowBlur) { 'true' } else { 'false' }
$disableEdgeMaskLiteral = if ($DisableEdgeMask) { 'true' } else { 'false' }
$disableBackgroundRasterLiteral = if ($DisableBackgroundRaster) { 'true' } else { 'false' }
$promoteScaleLayerLiteral = if ($PromoteScaleLayer) { 'true' } else { 'false' }
$disableActiveLineShadowLiteral = if ($DisableActiveLineShadow) { 'true' } else { 'false' }
$disableContentVisibilityLiteral = if ($DisableContentVisibility) { 'true' } else { 'false' }
$disableKaraokeFillMaskLiteral = if ($DisableKaraokeFillMask) { 'true' } else { 'false' }
$disableKaraokeWordMaskLiteral = if ($DisableKaraokeWordMask) { 'true' } else { 'false' }
$disableKaraokeMotionLiteral = if ($DisableKaraokeMotion) { 'true' } else { 'false' }
$disableKaraokeWaapiLiteral = if ($DisableKaraokeWaapi) { 'true' } else { 'false' }
$promoteKaraokeCharactersLiteral = if ($PromoteKaraokeCharacters) { 'true' } else { 'false' }
$hideKaraokeBackfacesLiteral = if ($HideKaraokeBackfaces) { 'true' } else { 'false' }
$disableScalePromotionLiteral = if ($DisableScalePromotion) { 'true' } else { 'false' }
$expression = @'
(async ({ startSeconds, durationMs, warmupMs, trackTitle, disableRowBlur, disableEdgeMask, disableBackgroundRaster, promoteScaleLayer, disableActiveLineShadow, disableContentVisibility, disableKaraokeFillMask, disableKaraokeWordMask, disableKaraokeMotion, disableKaraokeWaapi, promoteKaraokeCharacters, hideKaraokeBackfaces, disableScalePromotion }) => {
    const debugEvents = [];
    let traceStartedAt = 0;
    if (typeof window !== 'undefined') {
        window.__SIMPLE_PLAYER_LYRICS_DEBUG__ = event => {
            if (!event || typeof event.type !== 'string') return;
            const tracked = event.type === 'scheduler-frame' ||
                event.type === 'registry-frame' ||
                event.type === 'scheduler-subscription' ||
                event.type === 'karaoke-runtime' ||
                event.type === 'karaoke-sync' ||
                event.type === 'karaoke-style-writes' ||
                event.type === 'row-lifecycle' ||
                event.type === 'row-visibility' ||
                event.type === 'measurement-batch' ||
                event.type === 'measurement-change' ||
                event.type === 'react-commit';
            if (!tracked) return;
            debugEvents.push({ atMs: performance.now(), ...event });
        };
    }
    if (typeof window !== 'undefined') {
        window.__SIMPLE_PLAYER_DISABLE_KARAOKE_WAAPI__ = disableKaraokeWaapi;
        window.__SIMPLE_PLAYER_ENABLE_KARAOKE_WAAPI__ = !disableKaraokeWaapi;
        window.__SIMPLE_PLAYER_DISABLE_KARAOKE_WORD_MASK__ = disableKaraokeWordMask;
        window.__SIMPLE_PLAYER_DISABLE_KARAOKE_WORD_OVERLAY__ = disableKaraokeWordMask;
    }
    document.querySelector('style[data-lyrics-profile-override]')?.remove();
    const invoke = window.__TAURI__?.core?.invoke;
    if (typeof invoke !== 'function') throw new Error('Tauri invoke is unavailable.');

    const [{ usePlayerStore }, { useLibraryStore }] = await Promise.all([
        import('/src/store/usePlayerStore.ts'),
        import('/src/store/useLibraryStore.ts'),
    ]);
    let selectedSong = usePlayerStore.getState().metadata;
    if (trackTitle) {
        const songs = await invoke('get_library_songs');
        const normalizedTitle = trackTitle.trim().toLocaleLowerCase();
        const songIndex = songs.findIndex(song =>
            String(song.title ?? '').trim().toLocaleLowerCase() === normalizedTitle
        );
        if (songIndex < 0) throw new Error(`Track not found in library: ${trackTitle}`);
        selectedSong = songs[songIndex];
        const snapshot = await invoke('play_audio', { path: selectedSong.path, metadata: selectedSong });
        useLibraryStore.getState().setPlaylist(songs);
        useLibraryStore.getState().setCurrentSongIndex(songIndex);
        const playerState = usePlayerStore.getState();
        playerState.setMetadata(selectedSong);
        playerState.resetPlaybackClock(selectedSong.path);
        playerState.setMediaKind('audio');
        playerState.setPlaybackSnapshot(snapshot);
        await playerState.requestLyricsForPath(selectedSong.path);
    }

    const { useThemeStore } = await import('/src/store/useThemeStore.ts');
    // The first fullscreen overlay can be a queue or another panel. Select
    // the overlay that actually owns the animation-priority lyric rows.
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
    usePlayerStore.setState({ isLyricsOpen: true, isQueueOpen: false });
    window.dispatchEvent(new Event('open-fullscreen-player'));
    await new Promise(resolve => setTimeout(resolve, 750));
    useThemeStore.getState().setPlayerEffectMode('performance');
    await new Promise(resolve => setTimeout(resolve, 250));
    useThemeStore.getState().setPlayerEffectMode('animation');
    await new Promise(resolve => setTimeout(resolve, 250));
    player = findPlayer();
    await invoke('seek_audio', { position: startSeconds });
    window.dispatchEvent(new CustomEvent('playback:seeked', { detail: { time: startSeconds } }));
    await new Promise(resolve => setTimeout(resolve, 100));
    const hasLyricsRenderer = node => Boolean(node?.querySelector('.lyrics-motion-row, .amll-lyric-player'));
    if (!hasLyricsRenderer(player)) {
        usePlayerStore.setState({ isLyricsOpen: true, isQueueOpen: false });
    }
    // The line-only renderer can mount after the fullscreen transition and
    // lyrics fetch have both completed. Wait for the real rows instead of
    // failing while the overlay still contains only its header.
    for (let attempt = 0; attempt < 60 && !hasLyricsRenderer(player); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 250));
        player = findPlayer();
    }
    if (!hasLyricsRenderer(player)) {
        throw new Error('Open the animation-priority lyrics panel before tracing.');
    }
    const renderer = player.querySelector('.amll-lyric-player') ? 'amll' : 'animated';
    const activeRowSelector = renderer === 'amll'
        ? '[class*="_lyricLine"][class*="_active"]'
        : '.lyrics-motion-row.drop-shadow-xl';

    const lyricsDocument = usePlayerStore.getState().lyricsDocument;
    const { buildDisplayItems } = await import('/src/features/player/lyrics/lyricsDisplay.ts');
    const expectedDisplayItemCount = buildDisplayItems(
        lyricsDocument?.lines ?? [],
        (lyricsDocument?.timing_mode ?? 'none') !== 'none',
    ).length;
    const maskedScrollRoot = player.querySelector('.lyrics-motion-row')?.closest('.relative.z-10');
    const originalMask = maskedScrollRoot instanceof HTMLElement
        ? { maskImage: maskedScrollRoot.style.maskImage, webkitMaskImage: maskedScrollRoot.style.webkitMaskImage }
        : null;
    if (disableEdgeMask && maskedScrollRoot instanceof HTMLElement) {
        maskedScrollRoot.style.maskImage = 'none';
        maskedScrollRoot.style.webkitMaskImage = 'none';
    }
    if (disableBackgroundRaster) {
        document.querySelectorAll('canvas').forEach(canvas => {
            canvas.width = 1;
            canvas.height = 1;
        });
    }
    const overrideRules = [];
    if (disableRowBlur) {
        overrideRules.push('.animated-lyrics-row-shell, .lyrics-motion-row { filter: none !important; transition-property: opacity !important; }');
    }
    if (disableActiveLineShadow) {
        overrideRules.push('.animated-lyrics-row-shell > .lyrics-motion-row, [data-animated-lyrics-translation] { filter: none !important; }');
    }
    if (disableContentVisibility) {
        overrideRules.push('.lyrics-motion-row { content-visibility: visible !important; contain-intrinsic-size: none !important; }');
    }
    if (disableKaraokeFillMask) {
        overrideRules.push('.karaoke-char::before, .karaoke-word-fill-group::before { display: none !important; }');
    }
    if (disableKaraokeMotion) {
        overrideRules.push('.karaoke-char-motion, .karaoke-char-float, .karaoke-char-emphasis, .karaoke-char { transform: none !important; translate: none !important; transition: none !important; will-change: auto !important; }');
    }
    if (promoteKaraokeCharacters) {
        overrideRules.push('.karaoke-motion-region .karaoke-char-motion, .karaoke-motion-region .karaoke-char-float, .karaoke-motion-region .karaoke-char-emphasis { will-change: transform !important; }');
    }
    if (hideKaraokeBackfaces) {
        overrideRules.push('.karaoke-motion-region .karaoke-char-motion, .karaoke-motion-region .karaoke-char-float, .karaoke-motion-region .karaoke-char-emphasis { backface-visibility: hidden !important; }');
    }
    if (disableScalePromotion) {
        overrideRules.push('[data-animated-lyrics-scale] { will-change: auto !important; }');
    }
    let profileOverrideStyle = null;
    if (overrideRules.length > 0) {
        profileOverrideStyle = document.createElement('style');
        profileOverrideStyle.dataset.lyricsProfileOverride = 'true';
        profileOverrideStyle.textContent = overrideRules.join('\n');
        document.head.appendChild(profileOverrideStyle);
    }
    let scalePromotionStyle = null;
    if (promoteScaleLayer) {
        scalePromotionStyle = document.createElement('style');
        scalePromotionStyle.dataset.lyricsScalePromotion = '';
        scalePromotionStyle.textContent = '[data-animated-lyrics-scale] { translate: 0 0 0; }';
        document.head.appendChild(scalePromotionStyle);
    }

    await invoke('resume_audio');
    if (warmupMs > 0) await new Promise(resolve => setTimeout(resolve, warmupMs));

    const startedAt = performance.now();
    traceStartedAt = startedAt;
    const startAudioSeconds = await invoke('get_audio_position');
    const boundaries = [];
    let activeText = '';
    let latestAudioSeconds = startAudioSeconds;
    let nextAudioSampleAt = startedAt;
    performance.clearMarks('lyrics-trace-start');
    performance.mark('lyrics-trace-start');

    while (performance.now() - startedAt < durationMs) {
        await new Promise(requestAnimationFrame);
        const now = performance.now();
        const nextText = player.querySelector(activeRowSelector)
            ?.textContent?.trim().slice(0, 160) ?? '';
        if (nextText !== activeText) {
            boundaries.push({
                atMs: now - startedAt,
                audioSeconds: latestAudioSeconds + Math.max(0, now - nextAudioSampleAt + 1000) / 1000,
                previousText: activeText,
                activeText: nextText,
            });
            activeText = nextText;
        }
        if (now >= nextAudioSampleAt) {
            void invoke('get_audio_position').then(position => { latestAudioSeconds = position; });
            nextAudioSampleAt = now + 1000;
        }
    }

    if (originalMask && maskedScrollRoot instanceof HTMLElement) {
        maskedScrollRoot.style.maskImage = originalMask.maskImage;
        maskedScrollRoot.style.webkitMaskImage = originalMask.webkitMaskImage;
    }
    scalePromotionStyle?.remove();
    profileOverrideStyle?.remove();
    if (typeof window !== 'undefined') window.__SIMPLE_PLAYER_LYRICS_DEBUG__ = undefined;

    return {
        recordedAt: new Date().toISOString(),
        track: selectedSong ? {
            title: selectedSong.title,
            artist: selectedSong.artist,
            durationSeconds: Number(selectedSong.duration ?? 0),
        } : null,
        renderer,
        timingMode: lyricsDocument?.timing_mode ?? 'none',
        hasWordLyrics: (lyricsDocument?.lines ?? []).some(line => (line.words?.length ?? 0) > 0),
        expectedDisplayItemCount,
        disableRowBlur,
        startAudioSeconds,
        durationMs: performance.now() - startedAt,
        disableEdgeMask,
        promoteScaleLayer,
        disableActiveLineShadow,
        disableContentVisibility,
        disableKaraokeFillMask,
        disableKaraokeWordMask,
        disableKaraokeMotion,
        includeMemoryInfra: __INCLUDE_MEMORY_INFRA__,
        promoteKaraokeCharacters,
        hideKaraokeBackfaces,
        disableScalePromotion,
        debugEvents: debugEvents.map(event => ({ ...event, atMs: event.atMs - traceStartedAt })),
        boundaries,
    };
})({ startSeconds: __START_SECONDS__, durationMs: __DURATION_MS__, warmupMs: __WARMUP_MS__, trackTitle: __TRACK_TITLE__, disableRowBlur: __DISABLE_ROW_BLUR__, disableEdgeMask: __DISABLE_EDGE_MASK__, disableBackgroundRaster: __DISABLE_BACKGROUND_RASTER__, promoteScaleLayer: __PROMOTE_SCALE_LAYER__, disableActiveLineShadow: __DISABLE_ACTIVE_LINE_SHADOW__, disableContentVisibility: __DISABLE_CONTENT_VISIBILITY__, disableKaraokeFillMask: __DISABLE_KARAOKE_FILL_MASK__, disableKaraokeWordMask: __DISABLE_KARAOKE_WORD_MASK__, disableKaraokeMotion: __DISABLE_KARAOKE_MOTION__, disableKaraokeWaapi: __DISABLE_KARAOKE_WAAPI__, promoteKaraokeCharacters: __PROMOTE_KARAOKE_CHARACTERS__, hideKaraokeBackfaces: __HIDE_KARAOKE_BACKFACES__, disableScalePromotion: __DISABLE_SCALE_PROMOTION__ })
'@
$expression = $expression.Replace('__START_SECONDS__', $startLiteral)
$expression = $expression.Replace('__DURATION_MS__', [string]$DurationMs)
$expression = $expression.Replace('__WARMUP_MS__', [string]$WarmupMs)
$expression = $expression.Replace('__TRACK_TITLE__', $trackTitleLiteral)
$expression = $expression.Replace('__DISABLE_ROW_BLUR__', $disableRowBlurLiteral)
$expression = $expression.Replace('__DISABLE_EDGE_MASK__', $disableEdgeMaskLiteral)
$expression = $expression.Replace('__DISABLE_BACKGROUND_RASTER__', $disableBackgroundRasterLiteral)
$expression = $expression.Replace('__PROMOTE_SCALE_LAYER__', $promoteScaleLayerLiteral)
$expression = $expression.Replace('__DISABLE_ACTIVE_LINE_SHADOW__', $disableActiveLineShadowLiteral)
$expression = $expression.Replace('__DISABLE_CONTENT_VISIBILITY__', $disableContentVisibilityLiteral)
$expression = $expression.Replace('__DISABLE_KARAOKE_FILL_MASK__', $disableKaraokeFillMaskLiteral)
$expression = $expression.Replace('__DISABLE_KARAOKE_WORD_MASK__', $disableKaraokeWordMaskLiteral)
$expression = $expression.Replace('__DISABLE_KARAOKE_MOTION__', $disableKaraokeMotionLiteral)
$expression = $expression.Replace('__DISABLE_KARAOKE_WAAPI__', $disableKaraokeWaapiLiteral)
$expression = $expression.Replace('__INCLUDE_MEMORY_INFRA__', $(if ($IncludeMemoryInfra) { 'true' } else { 'false' }))
$expression = $expression.Replace('__PROMOTE_KARAOKE_CHARACTERS__', $promoteKaraokeCharactersLiteral)
$expression = $expression.Replace('__HIDE_KARAOKE_BACKFACES__', $hideKaraokeBackfacesLiteral)
$expression = $expression.Replace('__DISABLE_SCALE_PROMOTION__', $disableScalePromotionLiteral)
Send-CdpMessage @{
    id = 2
    method = 'Runtime.evaluate'
    params = @{ expression = $expression; awaitPromise = $true; returnByValue = $true }
}
do { $message = Receive-CdpMessage } while ($message.id -ne 2)
if ($message.result.exceptionDetails) {
    throw ($message.result.exceptionDetails | ConvertTo-Json -Depth 20)
}

$traceMetadata = $message.result.result.value
Send-CdpMessage @{ id = 3; method = 'Tracing.end' }

$streamHandle = $null
do {
    $message = Receive-CdpMessage
    if ($message.method -eq 'Tracing.tracingComplete') {
        $streamHandle = $message.params.stream
    }
} while (-not $streamHandle)

$builder = [Text.StringBuilder]::new()
$readId = 10
do {
    Send-CdpMessage @{ id = $readId; method = 'IO.read'; params = @{ handle = $streamHandle } }
    do { $message = Receive-CdpMessage } while ($message.id -ne $readId)
    $null = $builder.Append([string]$message.result.data)
    $eof = [bool]$message.result.eof
    $readId++
} while (-not $eof)
Send-CdpMessage @{ id = $readId; method = 'IO.close'; params = @{ handle = $streamHandle } }
$socket.Dispose()

$directory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
}
[IO.File]::WriteAllText($OutputPath, $builder.ToString(), [Text.UTF8Encoding]::new($false))
$metadataPath = "$OutputPath.meta.json"
$metadataJson = $traceMetadata | ConvertTo-Json -Depth 20
[IO.File]::WriteAllText($metadataPath, $metadataJson, [Text.UTF8Encoding]::new($false))
$OutputPath
