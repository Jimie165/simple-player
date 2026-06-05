export function getSelectedPath(selection: unknown): string | null {
    if (typeof selection === 'string' && selection.length > 0) {
        return selection;
    }

    if (Array.isArray(selection)) {
        const first = selection.find((item): item is string => typeof item === 'string' && item.length > 0);
        return first ?? null;
    }

    return null;
}
