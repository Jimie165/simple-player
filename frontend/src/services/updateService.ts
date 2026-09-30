import { getVersion } from '@tauri-apps/api/app';

const LATEST_RELEASE_API = 'https://api.github.com/repos/Jimie165/simple-player/releases/latest';

interface GitHubReleaseResponse {
    tag_name: string;
    html_url: string;
    name: string | null;
    body: string | null;
    published_at: string | null;
}

export interface AppRelease {
    version: string;
    url: string;
    name: string;
    notes: string | null;
    publishedAt: string | null;
}

export interface UpdateCheckResult {
    currentVersion: string;
    latestRelease: AppRelease;
    updateAvailable: boolean;
}

interface ParsedVersion {
    core: [number, number, number];
    prerelease: Array<number | string>;
}

const parseVersion = (value: string): ParsedVersion | null => {
    const match = value.trim().replace(/^v/i, '').match(
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/
    );
    if (!match) return null;

    return {
        core: [Number(match[1]), Number(match[2]), Number(match[3])],
        prerelease: match[4]
            ? match[4].split('.').map(identifier => /^\d+$/.test(identifier) ? Number(identifier) : identifier)
            : [],
    };
};

const comparePrerelease = (left: ParsedVersion['prerelease'], right: ParsedVersion['prerelease']) => {
    if (left.length === 0 || right.length === 0) {
        return left.length === right.length ? 0 : left.length === 0 ? 1 : -1;
    }

    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const leftIdentifier = left[index];
        const rightIdentifier = right[index];
        if (leftIdentifier === undefined || rightIdentifier === undefined) {
            return leftIdentifier === rightIdentifier ? 0 : leftIdentifier === undefined ? -1 : 1;
        }
        if (leftIdentifier === rightIdentifier) continue;
        if (typeof leftIdentifier === 'number' && typeof rightIdentifier === 'number') {
            return leftIdentifier > rightIdentifier ? 1 : -1;
        }
        if (typeof leftIdentifier === 'number') return -1;
        if (typeof rightIdentifier === 'number') return 1;
        return leftIdentifier.localeCompare(rightIdentifier);
    }
    return 0;
};

export const compareVersions = (left: string, right: string) => {
    const parsedLeft = parseVersion(left);
    const parsedRight = parseVersion(right);
    if (!parsedLeft || !parsedRight) {
        throw new Error(`无法比较版本号：${left} / ${right}`);
    }

    for (let index = 0; index < parsedLeft.core.length; index += 1) {
        const difference = parsedLeft.core[index] - parsedRight.core[index];
        if (difference !== 0) return difference > 0 ? 1 : -1;
    }

    return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease);
};

export const checkForAppUpdate = async (): Promise<UpdateCheckResult> => {
    const [currentVersion, response] = await Promise.all([
        getVersion(),
        fetch(LATEST_RELEASE_API, {
            cache: 'no-store',
            headers: { Accept: 'application/vnd.github+json' },
        }),
    ]);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('暂时没有可用的正式版本');
        }
        throw new Error(`检查更新失败（GitHub ${response.status}）`);
    }

    const release = await response.json() as GitHubReleaseResponse;
    const latestVersion = release.tag_name.replace(/^v/i, '');
    if (!parseVersion(latestVersion)) {
        throw new Error(`GitHub Release 的版本号无效：${release.tag_name}`);
    }

    return {
        currentVersion,
        latestRelease: {
            version: latestVersion,
            url: release.html_url,
            name: release.name?.trim() || `Simple Player v${latestVersion}`,
            notes: release.body,
            publishedAt: release.published_at,
        },
        updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
    };
};
