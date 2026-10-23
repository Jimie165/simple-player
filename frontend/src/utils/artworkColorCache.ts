import { selectArtworkColor } from '@/utils/artworkTheme';

export function sampleArtworkColor(image: HTMLImageElement): number | null {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, 32, 32);
    return selectArtworkColor(context.getImageData(0, 0, 32, 32).data, 32);
}

/** Owned by ContentTheme; idle work never delays navigation or image display. */
export class ArtworkColorCache {
    private colors = new Map<string, { version: number; color: number | null }>();
    private pending = new Map<string, { version: number; id: number }>();

    read(path: string, version?: number): number | null | undefined {
        const entry = this.colors.get(path);
        return entry && (version === undefined || entry.version === version) ? entry.color : undefined;
    }

    write(path: string, version: number, color: number | null) {
        if ((this.colors.get(path)?.version ?? -1) > version) return;
        const pending = this.pending.get(path);
        if (pending && pending.version <= version) {
            window.cancelIdleCallback(pending.id);
            this.pending.delete(path);
        }
        this.colors.delete(path);
        this.colors.set(path, { version, color });
        if (this.colors.size > 128) {
            const oldest = this.colors.keys().next().value;
            if (oldest !== undefined) this.colors.delete(oldest);
        }
    }

    prime(path: string, version: number, image: HTMLImageElement) {
        if (this.read(path, version) !== undefined || this.pending.get(path)?.version === version) return;
        const previous = this.pending.get(path);
        if (previous) window.cancelIdleCallback(previous.id);
        if (this.pending.size >= 16 && !previous) return;
        const source = image.currentSrc || image.src;
        const id = window.requestIdleCallback(() => {
            this.pending.delete(path);
            if ((image.currentSrc || image.src) !== source) return;
            if (this.read(path, version) !== undefined) return;
            try {
                this.write(path, version, sampleArtworkColor(image));
            } catch {
                // A cross-origin image may be displayable but unreadable by canvas.
            }
        });
        this.pending.set(path, { version, id });
    }

    dispose() {
        for (const task of this.pending.values()) window.cancelIdleCallback(task.id);
        this.pending.clear();
    }
}
