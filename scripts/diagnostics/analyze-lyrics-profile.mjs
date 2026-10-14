import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const compact = process.argv.includes('--compact');
const paths = process.argv.slice(2).filter(argument => argument !== '--compact');
if (paths.length === 0) {
    console.error('Usage: node scripts/diagnostics/analyze-lyrics-profile.mjs <profile-or-trace.json> [...]');
    process.exit(1);
}

const average = values => values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const percentile = (values, ratio) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
};

const emptyWrites = () => ({ position: 0, scale: 0, filter: 0, opacity: 0, transition: 0 });

const addFrameDiagnostics = (target, frame) => {
    const mutations = frame.mutations ?? {};
    const writes = mutations.writes ?? {};
    for (const key of Object.keys(target.writes)) target.writes[key] += writes[key] ?? 0;
    target.rowMounts += mutations.rowMounts ?? 0;
    target.rowUnmounts += mutations.rowUnmounts ?? 0;
    target.domCommitBatches += mutations.mutationObserverBatches ?? mutations.domCommitBatches ?? 0;
    target.resizeObserverCallbacks += mutations.resizeObserverCallbacks ?? 0;
    target.resizeObserverEntries += mutations.resizeObserverEntries ?? 0;
};

const summarizeDebug = (report, boundaries) => {
    const debug = report.debug;
    if (!debug) return {
        enabled: false,
        schedulerFrameCount: null,
        schedulerSubscriptionAdds: null,
        schedulerSubscriptionRemoves: null,
        schedulerRafPendingMax: null,
        schedulerMaxDeltaMs: null,
        karaokeRuntimeCreates: null,
        karaokeRuntimeDestroys: null,
        karaokeFullSyncs: null,
        karaokeIncrementalSyncs: null,
        karaokeStyleWrites: null,
        karaokeEvaluatedWords: null,
        rowLifecycleMounts: null,
        rowLifecycleUnmounts: null,
        rowVisibilityChanges: null,
        rowLayerHintWrites: null,
        measurementBatchCount: null,
        measurementChangedCount: null,
        panelCommitCount: null,
        window: () => null,
    };

    const profileDurationMs = Number(report.durationMs);
    const isInProfile = entry => Number(entry.atMs) >= 0 &&
        (!Number.isFinite(profileDurationMs) || Number(entry.atMs) <= profileDurationMs + 1);
    const inProfile = entries => entries.filter(isInProfile);
    const schedulerFrames = inProfile(debug.schedulerFrames ?? []);
    const subscriptions = inProfile(debug.subscriptions ?? []);
    const runtimes = inProfile(debug.karaokeRuntimes ?? []);
    const syncs = inProfile(debug.karaokeSyncs ?? []);
    const styleWrites = inProfile(debug.karaokeStyleWrites ?? []);
    const rowLifecycles = inProfile(debug.rowLifecycles ?? []);
    const rowVisibility = inProfile(debug.rowVisibility ?? []);
    const rowLayerHints = inProfile(debug.rowLayerHints ?? []);
    const measurementBatches = inProfile(debug.measurementBatches ?? []);
    const measurementChanges = inProfile(debug.measurementChanges ?? []);
    const reactCommits = inProfile(debug.reactCommits ?? []);
    const sum = (entries, field) => entries.reduce((total, entry) => total + (Number(entry[field]) || 0), 0);
    const styleTotals = {
        transform: sum(styleWrites, 'transform'),
        fill: sum(styleWrites, 'fill'),
        glow: sum(styleWrites, 'glow'),
    };
    const evaluatedWordTotal = sum(syncs, 'evaluatedWordCount');
    const inWindow = (entries, atMs) => entries.filter(entry => Math.abs(Number(entry.atMs) - atMs) <= 100);
    const window = atMs => {
        const frameEntries = inWindow(schedulerFrames, atMs);
        const syncEntries = inWindow(syncs, atMs);
        const writeEntries = inWindow(styleWrites, atMs);
        const rowEntries = inWindow(rowLifecycles, atMs);
        const visibilityEntries = inWindow(rowVisibility, atMs);
        const measurementEntries = inWindow(measurementChanges, atMs);
        const commitEntries = inWindow(reactCommits, atMs);
        return {
            schedulerFrameCount: frameEntries.length,
            schedulerMaxDeltaMs: Math.max(0, ...frameEntries.map(entry => Number(entry.deltaMs) || 0)),
            karaokeFullSyncs: syncEntries.filter(entry => entry.mode === 'full').length,
            karaokeIncrementalSyncs: syncEntries.filter(entry => entry.mode === 'incremental').length,
            karaokeStyleWrites: {
                transform: sum(writeEntries, 'transform'),
                fill: sum(writeEntries, 'fill'),
                glow: sum(writeEntries, 'glow'),
            },
            karaokeEvaluatedWords: sum(syncEntries, 'evaluatedWordCount'),
            rowLifecycleMounts: rowEntries.filter(entry => entry.action === 'mount').length,
            rowLifecycleUnmounts: rowEntries.filter(entry => entry.action === 'unmount').length,
            rowVisibilityChanges: visibilityEntries.length,
            rowLayerHintWrites: inWindow(rowLayerHints, atMs).length,
            measurementChangedCount: sum(measurementEntries, 'changed'),
            panelCommitCount: commitEntries.length,
        };
    };
    return {
        enabled: true,
        schedulerFrameCount: schedulerFrames.length,
        schedulerSubscriptionAdds: subscriptions.filter(entry => entry.action === 'subscribe').length,
        schedulerSubscriptionRemoves: subscriptions.filter(entry => entry.action === 'unsubscribe').length,
        schedulerRafPendingMax: Math.max(0, ...schedulerFrames.map(entry => entry.pendingRaf ? 1 : 0)),
        schedulerMaxDeltaMs: Math.max(0, ...schedulerFrames.map(entry => Number(entry.deltaMs) || 0)),
        karaokeRuntimeCreates: runtimes.filter(entry => entry.action === 'create').length,
        karaokeRuntimeDestroys: runtimes.filter(entry => entry.action === 'destroy').length,
        karaokeFullSyncs: syncs.filter(entry => entry.mode === 'full').length,
        karaokeIncrementalSyncs: syncs.filter(entry => entry.mode === 'incremental').length,
        karaokeStyleWrites: styleTotals,
        karaokeEvaluatedWords: evaluatedWordTotal,
        rowLifecycleMounts: rowLifecycles.filter(entry => entry.action === 'mount').length,
        rowLifecycleUnmounts: rowLifecycles.filter(entry => entry.action === 'unmount').length,
        rowVisibilityChanges: rowVisibility.length,
        rowLayerHintWrites: rowLayerHints.length,
        measurementBatchCount: measurementBatches.length,
        measurementChangedCount: sum(measurementChanges, 'changed'),
        panelCommitCount: reactCommits.length,
        window,
    };
};

const summarizeProfile = (path, report) => {
    const frames = report.frameSamples ?? [];
    const frameByNumber = new Map(frames.map((sample, index) => [sample.frame, index]));
    const debugSummary = summarizeDebug(report);
    const totals = {
        writes: emptyWrites(),
        rowMounts: 0,
        rowUnmounts: 0,
        domCommitBatches: 0,
        resizeObserverCallbacks: 0,
        resizeObserverEntries: 0,
    };
    frames.forEach(frame => addFrameDiagnostics(totals, frame));

    const boundaries = (report.boundarySamples ?? [])
        .filter(boundary => boundary.previousText && boundary.activeText)
        .map(boundary => {
            const index = frameByNumber.get(boundary.frame);
            const nextFrames = index === undefined ? [] : frames.slice(index, index + 2);
            const windowFrames = frames.filter(frame => Math.abs(frame.atMs - boundary.atMs) <= 100);
            const diagnostics = {
                writes: emptyWrites(),
                rowMounts: 0,
                rowUnmounts: 0,
                domCommitBatches: 0,
                resizeObserverCallbacks: 0,
                resizeObserverEntries: 0,
            };
            windowFrames.forEach(frame => addFrameDiagnostics(diagnostics, frame));
            return {
                atMs: boundary.atMs,
                audioSeconds: boundary.audioSeconds,
                activeText: boundary.activeText,
                peakFrameMs: Math.max(0, ...windowFrames.map(frame => frame.intervalMs)),
                immediatePeakFrameMs: Math.max(0, ...nextFrames.map(frame => frame.intervalMs)),
                connectedRows: boundary.connectedRows ?? boundary.mountedRows ?? 0,
                contentRows: boundary.contentRows ?? boundary.mountedRows ?? 0,
                characterCount: boundary.characterCount ?? 0,
                debug: debugSummary.window(boundary.atMs),
                observedStyleMutationCounts: diagnostics.writes,
                ...diagnostics,
            };
        });

    const classifiedLongFrames = (report.longFrames ?? []).map(frame => {
        const nearestBoundary = boundaries.reduce((nearest, boundary) => {
            const distanceMs = Math.abs(frame.atMs - boundary.atMs);
            return !nearest || distanceMs < nearest.distanceMs
                ? { atMs: boundary.atMs, audioSeconds: boundary.audioSeconds, distanceMs }
                : nearest;
        }, null);
        const mutations = frame.mutations ?? {};
        const nodeChurn = (mutations.rowMounts ?? mutations.addedNodes ?? 0) +
            (mutations.rowUnmounts ?? mutations.removedNodes ?? 0) > 0;
        return {
            atMs: frame.atMs,
            intervalMs: frame.intervalMs,
            audioSeconds: report.startAudioSeconds + frame.atMs / 1000,
            category: nearestBoundary?.distanceMs <= 100
                ? 'line-boundary'
                : nodeChurn
                    ? 'render-window'
                    : 'other',
            nearestBoundaryDistanceMs: nearestBoundary?.distanceMs ?? null,
            connectedRows: frame.connectedRows ?? frame.mountedRows ?? 0,
            contentRows: frame.contentRows ?? frame.mountedRows ?? 0,
            mutations,
        };
    });

    const intervals = frames.map(frame => frame.intervalMs);
    const behaviorSamples = report.behaviorSamples ?? [];
    const worstFrame = frames.reduce((worst, frame) => !worst || frame.intervalMs > worst.intervalMs ? frame : worst, null);
    const environment = report.environmentSamples ?? [];
    const heapSamples = environment
        .map(sample => sample.usedJsHeapBytes)
        .filter(value => Number.isFinite(value));
    const domSamples = environment
        .map(sample => sample.domNodeCount)
        .filter(value => Number.isFinite(value));
    const canvasPixelSamples = environment
        .flatMap(sample => sample.canvasBackingStores ?? [])
        .map(canvas => Number(canvas.width) * Number(canvas.height))
        .filter(value => Number.isFinite(value) && value > 0);
    return {
        type: 'profile',
        path,
        track: report.track ?? null,
        timingMode: report.timingMode ?? 'unknown',
        hasWordLyrics: report.hasWordLyrics ?? null,
        lyricLineCount: report.lyricLineCount ?? null,
        disableEdgeMask: report.disableEdgeMask ?? false,
        audioRangeSeconds: [report.startAudioSeconds, report.endAudioSeconds],
        frameCount: report.frameCount,
        stoppedOnTrackChange: report.stoppedOnTrackChange ?? false,
        estimatedRefreshPeriodMs: report.estimatedRefreshPeriodMs ?? percentile(intervals, 0.5),
        estimatedRefreshHz: report.estimatedRefreshHz ?? 0,
        droppedRefreshes: report.droppedRefreshes ?? 0,
        maxConsecutiveDroppedFrames: report.maxConsecutiveDroppedFrames ?? 0,
        medianFrameMs: report.medianFrameMs,
        p95FrameMs: report.p95FrameMs,
        p99FrameMs: report.p99FrameMs,
        maxFrameMs: report.maxFrameMs,
        jsHeapStartMB: heapSamples.length > 0 ? heapSamples[0] / 1e6 : null,
        jsHeapEndMB: heapSamples.length > 0 ? heapSamples.at(-1) / 1e6 : null,
        jsHeapMaxMB: heapSamples.length > 0 ? Math.max(...heapSamples) / 1e6 : null,
        domNodeMax: domSamples.length > 0 ? Math.max(...domSamples) : null,
        canvasBackingPixelsMax: canvasPixelSamples.length > 0 ? Math.max(...canvasPixelSamples) : null,
        framesOver12Ms: intervals.filter(interval => interval > 12).length,
        framesOver16_67Ms: intervals.filter(interval => interval > 16.67).length,
        framesOverTwoRefreshes: intervals.filter(interval => interval > (report.estimatedRefreshPeriodMs ?? report.medianFrameMs) * 2).length,
        connectedRowsAverage: average(frames.map(frame => frame.connectedRows ?? frame.mountedRows ?? 0)),
        connectedRowsMax: Math.max(0, ...frames.map(frame => frame.connectedRows ?? frame.mountedRows ?? 0)),
        contentRowsAverage: average(frames.map(frame => frame.contentRows ?? frame.mountedRows ?? 0)),
        contentRowsMax: Math.max(0, ...frames.map(frame => frame.contentRows ?? frame.mountedRows ?? 0)),
        // `writes` comes from observed style-attribute mutations, not a
        // property-setter hook. Exact Karaoke setter counts are reported only
        // by the optional debug sink below.
        observedStyleMutationCounts: totals.writes,
        domMutationBatchCount: totals.domCommitBatches,
        reactCommitCount: debugSummary.panelCommitCount,
        debugEnabled: debugSummary.enabled,
        schedulerFrameCount: debugSummary.schedulerFrameCount,
        schedulerSubscriptionAdds: debugSummary.schedulerSubscriptionAdds,
        schedulerSubscriptionRemoves: debugSummary.schedulerSubscriptionRemoves,
        schedulerRafPendingMax: debugSummary.schedulerRafPendingMax,
        schedulerMaxDeltaMs: debugSummary.schedulerMaxDeltaMs,
        karaokeRuntimeCreates: debugSummary.karaokeRuntimeCreates,
        karaokeRuntimeDestroys: debugSummary.karaokeRuntimeDestroys,
        karaokeFullSyncs: debugSummary.karaokeFullSyncs,
        karaokeIncrementalSyncs: debugSummary.karaokeIncrementalSyncs,
        karaokeStyleWrites: debugSummary.karaokeStyleWrites,
        rowLifecycleMounts: debugSummary.rowLifecycleMounts,
        rowLifecycleUnmounts: debugSummary.rowLifecycleUnmounts,
        rowVisibilityChanges: debugSummary.rowVisibilityChanges,
        measurementBatchCount: debugSummary.measurementBatchCount,
        measurementChangedCount: debugSummary.measurementChangedCount,
        panelCommitCount: debugSummary.panelCommitCount,
        behaviorSampleCount: behaviorSamples.length,
        behaviorSampleSpanMs: behaviorSamples.length > 1
            ? behaviorSamples.at(-1).atMs - behaviorSamples[0].atMs
            : 0,
        ...totals,
        boundaryCount: boundaries.length,
        boundaryPeakAverageMs: average(boundaries.map(boundary => boundary.peakFrameMs)),
        boundaryPeakWorstMs: Math.max(0, ...boundaries.map(boundary => boundary.peakFrameMs)),
        worstFrame: worstFrame ? {
            atMs: worstFrame.atMs,
            audioSeconds: report.startAudioSeconds + worstFrame.atMs / 1000,
            intervalMs: worstFrame.intervalMs,
            activeText: worstFrame.activeText,
            mutations: worstFrame.mutations,
        } : null,
        longFrameCategories: classifiedLongFrames.reduce((counts, frame) => {
            counts[frame.category] = (counts[frame.category] ?? 0) + 1;
            return counts;
        }, {}),
        classifiedLongFrames,
        boundaries,
    };
};

const traceCategory = (event, isRendererMainThread) => {
    const name = String(event.name ?? '');
    if (/RasterTask|RasterizerTask|GpuRaster|RasterBuffer/i.test(name)) return 'gpuRaster';
    if (!isRendererMainThread) return null;
    if (name === 'Paint' || name === 'PaintImage') return 'paint';
    if (/Layerize|UpdateLayerTree/.test(name)) return 'layerize';
    if (/^(Commit|CommitLoad)$|::Commit$|::commit$/i.test(name)) return 'commit';
    return null;
};

const summarizeTrace = (path, trace) => {
    const metadataPath = `${resolve(path)}.meta.json`;
    const metadata = existsSync(metadataPath)
        ? JSON.parse(readFileSync(metadataPath, 'utf8'))
        : {};
    const events = trace.traceEvents ?? [];
    const debugEvents = metadata.debugEvents ?? [];
    const debugEventsInWindow = atMs => debugEvents.filter(event => Math.abs(Number(event.atMs) - atMs) <= 100);
    const debugTotals = {
        schedulerFrameCount: debugEvents.filter(event => event.type === 'scheduler-frame').length,
        registryFrameCount: debugEvents.filter(event => event.type === 'registry-frame').length,
        schedulerSubscriptionChanges: debugEvents.filter(event => event.type === 'scheduler-subscription').length,
        schedulerMaxDeltaMs: Math.max(0, ...debugEvents
            .filter(event => event.type === 'scheduler-frame')
            .map(event => Number(event.deltaMs) || 0)),
        schedulerRafPendingMax: Math.max(0, ...debugEvents
            .filter(event => event.type === 'scheduler-frame')
            .map(event => event.pendingRaf ? 1 : 0)),
        karaokeRuntimeCreates: debugEvents.filter(event => event.type === 'karaoke-runtime' && event.action === 'create').length,
        karaokeRuntimeDestroys: debugEvents.filter(event => event.type === 'karaoke-runtime' && event.action === 'destroy').length,
        karaokeFullSyncs: debugEvents.filter(event => event.type === 'karaoke-sync' && event.mode === 'full').length,
        karaokeIncrementalSyncs: debugEvents.filter(event => event.type === 'karaoke-sync' && event.mode === 'incremental').length,
        karaokeEvaluatedWords: debugEvents
            .filter(event => event.type === 'karaoke-sync')
            .reduce((total, event) => total + (Number(event.evaluatedWordCount) || 0), 0),
        karaokeStyleWrites: debugEvents
            .filter(event => event.type === 'karaoke-style-writes')
            .reduce((totals, event) => ({
                transform: totals.transform + (Number(event.transform) || 0),
                fill: totals.fill + (Number(event.fill) || 0),
                glow: totals.glow + (Number(event.glow) || 0),
            }), { transform: 0, fill: 0, glow: 0 }),
        rowLifecycleMounts: debugEvents.filter(event => event.type === 'row-lifecycle' && event.action === 'mount').length,
        rowLifecycleUnmounts: debugEvents.filter(event => event.type === 'row-lifecycle' && event.action === 'unmount').length,
        rowVisibilityChanges: debugEvents.filter(event => event.type === 'row-visibility').length,
        // Hint writes are not layer allocations; correlate with LayerTree data.
        rowLayerHintWrites: debugEvents.filter(event => event.type === 'row-layer-hint').length,
        measurementBatchCount: debugEvents.filter(event => event.type === 'measurement-batch').length,
        measurementChangedCount: debugEvents
            .filter(event => event.type === 'measurement-change')
            .reduce((total, event) => total + (Number(event.changed) || 0), 0),
        panelCommitCount: debugEvents.filter(event => event.type === 'react-commit').length,
    };
    const summarizeDebugWindow = atMs => {
        const entries = debugEventsInWindow(atMs);
        return {
            schedulerFrameCount: entries.filter(event => event.type === 'scheduler-frame').length,
            registryFrameCount: entries.filter(event => event.type === 'registry-frame').length,
            schedulerMaxDeltaMs: Math.max(0, ...entries
                .filter(event => event.type === 'scheduler-frame')
                .map(event => Number(event.deltaMs) || 0)),
            karaokeFullSyncs: entries.filter(event => event.type === 'karaoke-sync' && event.mode === 'full').length,
            karaokeIncrementalSyncs: entries.filter(event => event.type === 'karaoke-sync' && event.mode === 'incremental').length,
            karaokeEvaluatedWords: entries
                .filter(event => event.type === 'karaoke-sync')
                .reduce((total, event) => total + (Number(event.evaluatedWordCount) || 0), 0),
            karaokeStyleWrites: entries
                .filter(event => event.type === 'karaoke-style-writes')
                .reduce((totals, event) => ({
                    transform: totals.transform + (Number(event.transform) || 0),
                    fill: totals.fill + (Number(event.fill) || 0),
                    glow: totals.glow + (Number(event.glow) || 0),
                }), { transform: 0, fill: 0, glow: 0 }),
            rowLifecycleMounts: entries.filter(event => event.type === 'row-lifecycle' && event.action === 'mount').length,
            rowLifecycleUnmounts: entries.filter(event => event.type === 'row-lifecycle' && event.action === 'unmount').length,
            rowVisibilityChanges: entries.filter(event => event.type === 'row-visibility').length,
            rowLayerHintWrites: entries.filter(event => event.type === 'row-layer-hint').length,
            measurementBatchCount: entries.filter(event => event.type === 'measurement-batch').length,
            measurementChangedCount: entries
                .filter(event => event.type === 'measurement-change')
                .reduce((total, event) => total + (Number(event.changed) || 0), 0),
            panelCommitCount: entries.filter(event => event.type === 'react-commit').length,
        };
    };
    const rendererMainThreads = new Set(
        events
            .filter(event => event.ph === 'M' && event.name === 'thread_name' && /CrRendererMain|RendererMain/.test(String(event.args?.name ?? '')))
            .map(event => `${event.pid}:${event.tid}`)
    );
    const startMark = events.find(event => event.name === 'lyrics-trace-start');
    const traceStartUs = startMark?.ts ?? metadata.traceStartUs ?? 0;
    const traceEndUs = traceStartUs + Number(metadata.durationMs ?? 0) * 1000;
    const categorized = events
        .filter(event => event.ph === 'X' && Number.isFinite(event.dur))
        .flatMap(event => {
            const category = traceCategory(event, rendererMainThreads.has(`${event.pid}:${event.tid}`));
            const eventEndUs = event.ts + event.dur;
            const inRecordedWindow = traceStartUs === 0 || traceEndUs <= traceStartUs ||
                (eventEndUs >= traceStartUs && event.ts <= traceEndUs);
            return category && inRecordedWindow ? [{ event, category }] : [];
        });

    const aggregate = entries => {
        const result = {
            paint: { count: 0, totalMs: 0, maxMs: 0 },
            layerize: { count: 0, totalMs: 0, maxMs: 0 },
            commit: { count: 0, totalMs: 0, maxMs: 0 },
            gpuRaster: { count: 0, totalMs: 0, maxMs: 0 },
        };
        for (const { event, category } of entries) {
            const durationMs = event.dur / 1000;
            result[category].count++;
            result[category].totalMs += durationMs;
            result[category].maxMs = Math.max(result[category].maxMs, durationMs);
        }
        return result;
    };

    const boundaryWindows = (metadata.boundaries ?? []).map(boundary => {
        const centerUs = traceStartUs + boundary.atMs * 1000;
        const minimumUs = centerUs - 100_000;
        const maximumUs = centerUs + 100_000;
        const windowEntries = categorized.filter(({ event }) => {
            const endUs = event.ts + event.dur;
            return endUs >= minimumUs && event.ts <= maximumUs;
        });
        return {
            ...boundary,
            windowBeforeAfterMs: 100,
            phases: aggregate(windowEntries),
            debug: summarizeDebugWindow(boundary.atMs),
        };
    });

    return {
        type: 'trace',
        path,
        metadataPath: existsSync(metadataPath) ? metadataPath : null,
        track: metadata.track ?? null,
        timingMode: metadata.timingMode ?? 'unknown',
        hasWordLyrics: metadata.hasWordLyrics ?? null,
        startAudioSeconds: metadata.startAudioSeconds ?? null,
        durationMs: metadata.durationMs ?? null,
        rendererMainThreads: [...rendererMainThreads],
        debugEnabled: debugEvents.length > 0,
        debugTotals,
        totals: aggregate(categorized),
        boundaryWindows,
        worstBoundary: boundaryWindows.reduce((worst, boundary) => {
            const totalMs = boundary.phases.paint.totalMs + boundary.phases.layerize.totalMs +
                boundary.phases.commit.totalMs + boundary.phases.gpuRaster.totalMs;
            return !worst || totalMs > worst.totalMs ? { totalMs, boundary } : worst;
        }, null),
    };
};

const summaries = paths.map(path => {
    const report = JSON.parse(readFileSync(resolve(path), 'utf8'));
    return Array.isArray(report.traceEvents)
        ? summarizeTrace(path, report)
        : summarizeProfile(path, report);
});

const output = compact
    ? summaries.map(summary => summary.type === 'trace'
        ? {
            type: summary.type,
            path: summary.path,
            track: summary.track,
            timingMode: summary.timingMode,
            hasWordLyrics: summary.hasWordLyrics,
            startAudioSeconds: summary.startAudioSeconds,
            durationMs: summary.durationMs,
            totals: summary.totals,
            worstBoundary: summary.worstBoundary,
        }
        : {
            ...summary,
            classifiedLongFrames: undefined,
            boundaries: undefined,
        })
    : summaries;

console.log(JSON.stringify(output, null, 2));
