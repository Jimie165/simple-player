interface PlaylistDataRefreshRequest<T> {
    isVisible: boolean;
    loadedVersion: string | null;
    currentVersion: string;
    isCurrent: () => boolean;
    load: () => Promise<T>;
}

export async function runPlaylistDataRefresh<T>({
    isVisible,
    loadedVersion,
    currentVersion,
    isCurrent,
    load,
}: PlaylistDataRefreshRequest<T>): Promise<{ version: string; data: T } | null> {
    if (!isVisible || loadedVersion === currentVersion) return null;

    const data = await load();
    if (!isCurrent()) return null;
    return { version: currentVersion, data };
}
