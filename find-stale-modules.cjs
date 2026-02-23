const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function walk(dir, suffix, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== '_archive' && entry.name !== 'node_modules') {
                walk(full, suffix, out);
            }
        } else if (full.endsWith(suffix)) {
            out.push(full);
        }
    }
    return out;
}

const libDir = path.join(process.cwd(), '.claude', 'lib');
const allLibFiles = walk(libDir, '');
const jsLibFiles = allLibFiles.filter(f => f.endsWith('.cjs') || f.endsWith('.js') || f.endsWith('.mjs'));

const unusedFiles = [];

for (const file of jsLibFiles) {
    const baseName = path.basename(file);
    const _nameWithoutExt = path.parse(baseName).name;

    try {
        // Only search for import or require statements containing the bare filename
        // We'll use a very strict regex that must match `require(...name)` or `import...name`
        // Or just search for the exact baseName string. If no other file contains "baseName", it's unused.

        // We'll search in .claude, tests, and scripts
        const cmd = `git grep -l -F "${baseName}" .claude tests scripts package.json`;
        const res = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().split('\n');
        let hasUsage = false;
        for (const r of res) {
            if (!r) continue;
            const absPath = path.resolve(r);
            // If it's used in *another* file, it is considered used
            if (absPath !== file && !absPath.includes(file)) {
                hasUsage = true;
                break;
            }
        }

        // Fallback: search without extension, but must be accompanied by require or import
        if (!hasUsage) {
            unusedFiles.push(file);
        }
    } catch (_err) {
        // git grep returns 1 if no matches found
        unusedFiles.push(file);
    }
}

console.log('Unused files matching exact baseName:');
unusedFiles.forEach(f => console.log(path.relative(process.cwd(), f)));
console.log('Total possibly unused files:', unusedFiles.length);
