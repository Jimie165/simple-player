const fs = require('fs');
const path = require('path');

const rawVersion = process.argv[2];

if (!rawVersion) {
    console.error('Please provide a version number. Usage: node scripts/bump-version.js <version>');
    process.exit(1);
}

const version = rawVersion.trim().replace(/^v/, '');
const semverRegex = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!semverRegex.test(version)) {
    console.error(`Invalid version "${rawVersion}". Expected SemVer like 1.2.3, optionally with -pre or +build.`);
    process.exit(1);
}

const files = [
    'package.json',
    'frontend/package.json',
    'backend/tauri/tauri.conf.json',
    'backend/tauri/Cargo.toml'
];

const rootDir = path.resolve(__dirname, '..');

files.forEach(file => {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';

        if (file.endsWith('.json')) {
            try {
                const json = JSON.parse(content);
                json.version = version;
                const indent = file === 'backend/tauri/tauri.conf.json' ? 4 : 2;
                content = JSON.stringify(json, null, indent) + '\n';
                if (lineEnding !== '\n') {
                    content = content.replace(/\n/g, lineEnding);
                }
            } catch (err) {
                console.error(`Failed to parse JSON in ${file}:`, err);
                process.exit(1);
            }
        } else if (file.endsWith('.toml')) {
            // Replace version inside [package] section only
            const lines = content.split(/\r?\n/);
            let inPackage = false;
            let updated = false;

            for (let i = 0; i < lines.length; i += 1) {
                const line = lines[i];
                const sectionMatch = line.match(/^\s*\[(.+?)\]\s*$/);
                if (sectionMatch) {
                    inPackage = sectionMatch[1] === 'package';
                }

                if (inPackage && /^\s*version\s*=/.test(line)) {
                    lines[i] = line.replace(/^\s*version\s*=\s*".*?"/, `version = "${version}"`);
                    updated = true;
                    break;
                }
            }

            if (!updated) {
                console.error(`Failed to update version in ${file}: [package] version not found.`);
                process.exit(1);
            }

            content = lines.join(lineEnding) + lineEnding;
        }

        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file} to version ${version}`);
    } else {
        console.warn(`File not found: ${file}`);
    }
});

console.log(`Successfully bumped version to ${version}`);
