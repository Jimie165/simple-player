export type LyricsVisibilityListener = () => void;

/**
 * Keeps the spatial row set outside React's parent tree. The animator can
 * publish a new set without scheduling a render of the whole lyrics panel;
 * only the imperative row host subscribes to this store.
 */
export class LyricsVisibilityStore {
    private indices: readonly number[] = [];
    private items: object | null = null;
    private readonly listeners = new Set<LyricsVisibilityListener>();

    getSnapshot = (): readonly number[] => this.indices;

    subscribe = (listener: LyricsVisibilityListener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    set(items: object, indices: readonly number[]) {
        if (
            this.items === items &&
            this.indices.length === indices.length &&
            this.indices.every((value, index) => value === indices[index])
        ) return;

        this.items = items;
        this.indices = [...indices];
        this.listeners.forEach(listener => listener());
    }

    reset(items: object) {
        this.set(items, []);
    }
}
