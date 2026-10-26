const REACT_MEASURE_LIMIT = 4096;

function isReactMeasure(entry: PerformanceEntry): boolean {
    if (entry.entryType !== 'measure' || !('detail' in entry)) return false;
    const detail: unknown = entry.detail;
    if (!detail || typeof detail !== 'object' || !('devtools' in detail)) return false;
    const devtools = detail.devtools;
    return !!devtools && typeof devtools === 'object'
        && (('track' in devtools && devtools.track === 'Components ⚛')
            || ('trackGroup' in devtools && devtools.trackGroup === 'Scheduler ⚛'));
}

/** React's development performance tracks otherwise accumulate for the entire app session. */
export function installReactDevelopmentTimings(): () => void {
    if (typeof PerformanceObserver === 'undefined') return () => {};
    let count = 0;
    const names = new Set<string>();
    const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
            if (!isReactMeasure(entry)) continue;
            count++;
            names.add(entry.name);
        }
        if (count < REACT_MEASURE_LIMIT) return;
        for (const name of names) {
            // clearMeasures can only remove by name; preserve user measures sharing a React name.
            if (performance.getEntriesByName(name, 'measure').every(isReactMeasure)) {
                performance.clearMeasures(name);
            }
        }
        count = 0;
        names.clear();
    });
    observer.observe({ type: 'measure', buffered: true });
    return () => {
        observer.disconnect();
        names.clear();
    };
}
