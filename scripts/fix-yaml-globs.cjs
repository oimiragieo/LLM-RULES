const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const skillsDir = path.join(projectRoot, '.claude', 'skills');

function walk(dir) {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            walk(fullPath);
        } else if (file === 'SKILL.md') {
            fixSkill(fullPath);
        }
    }
}

function fixSkill(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Fix 1: Unquoted globs starting with *
    // globs: **/*.py -> globs: "**/*.py"
    // We match `globs: ` followed by `*` and then anything until end of line
    const globRegex = /^globs:\s+(\*.*)$/gm;
    if (globRegex.test(content)) {
        content = content.replace(globRegex, 'globs: "$1"');
        changed = true;
    }

    // Fix 2: Unquoted globs starting with * in arrays (if any simple ones exist)
    // Not common in this error set, but good to be aware.

    if (changed) {
        fs.writeFileSync(filePath, content);
        console.log(`Fixed: ${filePath}`);
    }
}

console.log('Scanning for unquoted globs in SKILL.md files...');
walk(skillsDir);
console.log('Done.');
