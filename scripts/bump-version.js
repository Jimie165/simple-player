const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const jsonFiles = [
    ['package.json', 2],
    ['frontend/package.json', 2],
    ['backend/tauri/tauri.conf.json', 4],
];

function normalizeVersion(value) {
    const version = value.trim().replace(/^v/, '');
    if (!semverPattern.test(version)) {
        throw new Error(`Invalid SemVer "${value}".`);
    }
    return version;
}

function parseVersion(value) {
    const version = normalizeVersion(value);
    const match = version.match(semverPattern);
    return {
        version,
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] ? match[4].split('.') : [],
    };
}

function nextPrerelease(current, preid) {
    if (current.prerelease.length === 0) {
        return `${current.major}.${current.minor}.${current.patch + 1}-${preid}.0`;
    }
    if (current.prerelease[0] !== preid) {
        return `${current.major}.${current.minor}.${current.patch}-${preid}.0`;
    }

    const identifiers = [...current.prerelease];
    const numericIndex = identifiers.findLastIndex(identifier => /^\d+$/.test(identifier));
    if (numericIndex < 0) identifiers.push('0');
    else identifiers[numericIndex] = String(Number(identifiers[numericIndex]) + 1);
    return `${current.major}.${current.minor}.${current.patch}-${identifiers.join('.')}`;
}

function resolveVersion(currentValue, request, preid) {
    const current = parseVersion(currentValue);
    switch (request) {
        case 'major': return `${current.major + 1}.0.0`;
        case 'minor': return `${current.major}.${current.minor + 1}.0`;
        case 'patch': return `${current.major}.${current.minor}.${current.patch + 1}`;
        case 'premajor': return `${current.major + 1}.0.0-${preid}.0`;
        case 'preminor': return `${current.major}.${current.minor + 1}.0-${preid}.0`;
        case 'prepatch': return `${current.major}.${current.minor}.${current.patch + 1}-${preid}.0`;
        case 'prerelease': return nextPrerelease(current, preid);
        default: return normalizeVersion(request);
    }
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function writeJson(file, indent, version) {
    const filePath = path.join(root, file);
    const original = fs.readFileSync(filePath, 'utf8');
    const lineEnding = original.includes('\r\n') ? '\r\n' : '\n';
    const content = `${JSON.stringify({ ...JSON.parse(original), version }, null, indent)}\n`;
    fs.writeFileSync(filePath, lineEnding === '\n' ? content : content.replace(/\n/g, lineEnding));
}

try {
    const args = process.argv.slice(2);
    const checkOnly = args.includes('--check');
    const request = args.find(arg => !arg.startsWith('--'));
    const preid = args.find(arg => arg.startsWith('--preid='))?.slice(8) || 'alpha';
    if (!/^[0-9A-Za-z-]+$/.test(preid)) throw new Error(`Invalid prerelease identifier "${preid}".`);

    const rootVersion = normalizeVersion(readJson('package.json').version);
    const versions = jsonFiles.slice(1).map(([file]) => [file, normalizeVersion(readJson(file).version)]);
    const mismatches = versions.filter(([, version]) => version !== rootVersion);

    if (checkOnly) {
        if (mismatches.length > 0) {
            mismatches.forEach(([file, version]) => console.error(`${file}: ${version} (expected ${rootVersion})`));
            process.exit(1);
        }
        console.log(`All project versions are synchronized at ${rootVersion}.`);
        process.exit(0);
    }
    if (!request) {
        throw new Error('Usage: pnpm bump <major|minor|patch|premajor|preminor|prepatch|prerelease|semver> [--preid=alpha]');
    }

    const version = resolveVersion(rootVersion, request.replace(/^v/, ''), preid);
    jsonFiles.forEach(([file, indent]) => writeJson(file, indent, version));
    console.log(`Updated project version: ${rootVersion} -> ${version}`);
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}
