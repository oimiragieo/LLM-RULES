const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.name === '_archive' || f.name === 'node_modules' || f.name.startsWith('_audit')) continue;
    if (f.isDirectory()) results = results.concat(walk(full));
    else if (/\.(cjs|mjs|js)$/.test(f.name)) results.push(full);
  }
  return results;
}

const libDir = __dirname;
const files = walk(libDir);
const broken = [];
const allModules = new Set(files.map(f => path.relative(libDir, f)));

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const re = /require\s*\(\s*['"](\.\.[^'"]+|\.\/[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const reqPath = m[1];
    const dir = path.dirname(file);
    const resolved = path.resolve(dir, reqPath);
    const candidates = [resolved, resolved + '.cjs', resolved + '.js', resolved + '.mjs'];
    const exists = candidates.some(c => fs.existsSync(c));
    if (!exists) {
      broken.push({
        file: path.relative(libDir, file),
        require: reqPath,
        resolvedTo: path.relative(libDir, resolved)
      });
    }
  }
}

console.log('=== BROKEN IMPORTS (' + broken.length + ') ===');
broken.forEach(b => console.log('  ' + b.file + '  ->  ' + b.require + '  (resolves to: ' + b.resolvedTo + ')'));
console.log('');

// Now find orphaned modules - modules that nothing else requires
const importedModules = new Set();
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const re = /require\s*\(\s*['"](\.\.[^'"]+|\.\/[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const reqPath = m[1];
    const dir = path.dirname(file);
    const resolved = path.resolve(dir, reqPath);
    const candidates = [resolved, resolved + '.cjs', resolved + '.js', resolved + '.mjs'];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        importedModules.add(path.relative(libDir, c));
        break;
      }
    }
  }
}

const orphaned = [];
for (const mod of allModules) {
  if (!importedModules.has(mod)) {
    orphaned.push(mod);
  }
}

console.log('=== ORPHANED MODULES (not imported by any other lib module) (' + orphaned.length + ') ===');
orphaned.forEach(o => console.log('  ' + o));
console.log('');
console.log('Total lib modules: ' + files.length);
