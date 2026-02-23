'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let preExecuteFn;
let postExecuteFn;

try {
  const hooks = require('../hooks/pre-execute.cjs');
  preExecuteFn = hooks.preExecute;
  const postHooks = require('../hooks/post-execute.cjs');
  postExecuteFn = postHooks.postExecute;
} catch (_e) {
  preExecuteFn = () => ({ continue: true });
  postExecuteFn = () => {};
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '_archive' && entry.name !== 'node_modules' && entry.name !== '.git') {
        walk(full, out);
      }
    } else {
      out.push(full);
    }
  }
  return out;
}

function main(args = {}) {
  // 1. Hook Gate
  preExecuteFn(args);

  const targetDir = args.targetDir || '.claude/lib';
  const extensions = args.extensions || ['.cjs', '.mjs', '.js'];
  const searchDirs = args.searchDirs || ['.claude', 'tests', 'scripts', 'package.json'];
  const doDelete = !!args.delete;

  console.log(`Pruning stale modules in ${targetDir}...`);
  if (doDelete) {
    console.log('WARNING: DELETION IS ENABLED.');
  }

  const targetAbsDir = path.resolve(process.cwd(), targetDir);
  if (!fs.existsSync(targetAbsDir)) {
    console.log(`Target directory ${targetDir} does not exist. Skipping.`);
    postExecuteFn({ skillName: 'stale-module-pruner', success: true });
    return;
  }

  const files = walk(targetAbsDir);
  const targetFiles = files.filter(f => extensions.some(ext => f.endsWith(ext)));

  let unusedCount = 0;

  const searchStr = dirs => dirs.map(d => `"${d}"`).join(' ');
  const sDirsCmdStr = searchStr(searchDirs);

  for (const file of targetFiles) {
    const nameWithoutExt = path.parse(file).name;
    try {
      const cmd = `rg -lF "${nameWithoutExt}" ${sDirsCmdStr}`;

      const res = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
        .trim()
        .split('\n');

      let hasUsage = false;
      for (const r of res) {
        if (!r) continue;
        const absPath = path.resolve(process.cwd(), r.trim().replace(/\\/g, '/'));
        const fileAbs = path.resolve(process.cwd(), file.replace(/\\/g, '/'));

        if (absPath !== fileAbs && !absPath.endsWith('.json') && !absPath.endsWith('.md')) {
          hasUsage = true;
          break;
        }
      }

      if (!hasUsage) {
        unusedCount += 1;
        if (doDelete) {
          console.log(`DELETED (NO VALID REFERENCES): ${path.relative(process.cwd(), file)}`);
          fs.unlinkSync(file);
        } else {
          console.log(`STALE: ${path.relative(process.cwd(), file)}`);
        }
      }
    } catch (_e) {
      unusedCount += 1;
      if (doDelete) {
        console.log(`DELETED (NO REFERENCES AT ALL): ${path.relative(process.cwd(), file)}`);
        fs.unlinkSync(file);
      } else {
        console.log(`STALE: ${path.relative(process.cwd(), file)}`);
      }
    }
  }

  console.log(`\nTotal stale items processed: ${unusedCount}`);

  // 3. Post Execute Gate
  postExecuteFn({ skillName: 'stale-module-pruner', success: true });
}

module.exports = { main };

if (require.main === module) {
  const args = {
    targetDir: '.claude/lib',
    extensions: ['.cjs', '.mjs', '.js'],
    searchDirs: ['.claude', 'tests', 'scripts', 'package.json'],
    delete: false,
  };

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '--targetDir') {
      i += 1;
      args.targetDir = process.argv[i];
    } else if (arg === '--searchDirs') {
      i += 1;
      args.searchDirs = process.argv[i].split(',');
    } else if (arg === '--extensions') {
      i += 1;
      args.extensions = process.argv[i].split(',');
    } else if (arg === '--delete') {
      args.delete = true;
    }
  }

  main(args);
}
