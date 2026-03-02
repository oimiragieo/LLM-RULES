const fs = require('fs');
const path = require('path');

function walk(dir, exclude = []) {
  let results = [];
  try {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.name === 'node_modules' || f.name === '.git' || f.name === '_archive' || f.name.startsWith('_audit')) continue;
      if (exclude.some(e => full.includes(e))) continue;
      if (f.isDirectory()) results = results.concat(walk(full, exclude));
      else if (/\.(cjs|mjs|js)$/.test(f.name)) results.push(full);
    }
  } catch(e) {}
  return results;
}

const claudeDir = path.resolve(__dirname, '..');
const libDir = __dirname;

// Get all lib module basenames for matching
const libFiles = walk(libDir);
const libRelPaths = libFiles.map(f => path.relative(claudeDir, f).replace(/\\/g, '/'));

// Get all non-lib files that might import lib modules
const hooksDir = path.join(claudeDir, 'hooks');
const toolsDir = path.join(claudeDir, 'tools');
const scriptsDir = path.resolve(claudeDir, '..', 'scripts');
const testsDir = path.resolve(claudeDir, '..', 'tests');
const skillsDir = path.join(claudeDir, 'skills');

const categories = {
  hooks: walk(hooksDir),
  tools: walk(toolsDir),
  scripts: walk(scriptsDir),
  tests: walk(testsDir),
  skills: walk(skillsDir),
};

// Track which lib modules are imported by external consumers
const importedBy = {};
libRelPaths.forEach(p => importedBy[p] = { hooks: false, tools: false, scripts: false, tests: false, skills: false });

for (const [category, files] of Object.entries(categories)) {
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const re = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const reqPath = m[1];
      if (!reqPath.startsWith('.')) continue;
      const dir = path.dirname(file);
      const resolved = path.resolve(dir, reqPath);
      const candidates = [resolved, resolved + '.cjs', resolved + '.js', resolved + '.mjs'];
      for (const c of candidates) {
        const rel = path.relative(claudeDir, c).replace(/\\/g, '/');
        if (importedBy[rel] !== undefined) {
          importedBy[rel][category] = true;
        }
      }
    }
  }
}

// Also check lib-internal imports
for (const file of libFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const re = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const reqPath = m[1];
    if (!reqPath.startsWith('.')) continue;
    const dir = path.dirname(file);
    const resolved = path.resolve(dir, reqPath);
    const candidates = [resolved, resolved + '.cjs', resolved + '.js', resolved + '.mjs'];
    for (const c of candidates) {
      const rel = path.relative(claudeDir, c).replace(/\\/g, '/');
      if (importedBy[rel] !== undefined) {
        if (!importedBy[rel].lib) importedBy[rel].lib = false;
        importedBy[rel].lib = true;
      }
    }
  }
}

// Find truly orphaned modules (nothing imports them)
const trulyOrphaned = [];
const importedByHooks = [];
const importedByTools = [];
const importedByScripts = [];
const importedByTests = [];
const importedBySkills = [];
const importedByLibOnly = [];

for (const [mod, consumers] of Object.entries(importedBy)) {
  const anyExternal = consumers.hooks || consumers.tools || consumers.scripts || consumers.tests || consumers.skills;
  const anyInternal = consumers.lib;
  if (!anyExternal && !anyInternal) trulyOrphaned.push(mod);
  if (consumers.hooks) importedByHooks.push(mod);
  if (consumers.tools) importedByTools.push(mod);
  if (consumers.scripts) importedByScripts.push(mod);
  if (consumers.skills) importedBySkills.push(mod);
  if (anyInternal && !anyExternal) importedByLibOnly.push(mod);
}

console.log('=== CROSS-REFERENCE SUMMARY ===');
console.log('Total lib modules: ' + libRelPaths.length);
console.log('Imported by hooks: ' + importedByHooks.length);
console.log('Imported by tools: ' + importedByTools.length);
console.log('Imported by scripts: ' + importedByScripts.length);
console.log('Imported by tests: ' + importedByTests.length);
console.log('Imported by skills: ' + importedBySkills.length);
console.log('Imported by lib only (no external consumer): ' + importedByLibOnly.length);
console.log('');

console.log('=== TRULY ORPHANED (imported by NOTHING) (' + trulyOrphaned.length + ') ===');
trulyOrphaned.forEach(o => console.log('  ' + o));
console.log('');

console.log('=== IMPORTED BY HOOKS ===');
importedByHooks.forEach(o => console.log('  ' + o));
console.log('');

console.log('=== IMPORTED BY TOOLS ===');
importedByTools.forEach(o => console.log('  ' + o));
console.log('');

console.log('=== IMPORTED BY SCRIPTS ===');
importedByScripts.forEach(o => console.log('  ' + o));
console.log('');

console.log('=== IMPORTED BY LIB-ONLY (no hooks/tools/scripts/tests/skills consumer) ===');
importedByLibOnly.forEach(o => console.log('  ' + o));
