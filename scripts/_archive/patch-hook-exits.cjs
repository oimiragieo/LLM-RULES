const fs = require('fs');
const path = require('path');

const HOOKS_DIR = path.join(process.cwd(), '.claude', 'hooks');

function walkDir(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '_archive') continue; // skip archive
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (entry.name.endsWith('.cjs')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = walkDir(HOOKS_DIR);
let count = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // 1. Normal console.log(formatResult(...)) \\n process.exit(2)
  const regex =
    /(console\.log\s*\(\s*(?:formatResult|JSON\.stringify)\s*\([^;]+;\s*(?:return;\s*)?)(?:await\s+[a-zA-Z0-9_(,)\s]+;\s*)?process\.exit\(\s*2\s*\)/g;

  content = content.replace(regex, (match, _p1) => {
    changed = true;
    return match.replace(/process\.exit\(\s*2\s*\)/, 'process.exit(0)');
  });

  // 2. We also need to fix `bash-pretool-bundle.cjs` logic explicitly.
  if (file.endsWith('bash-pretool-bundle.cjs')) {
    const bundleTarget = `    if (res.status !== 0) {
      if (res.stdout) process.stdout.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      process.exit(res.status || 2);
    }`;
    const bundleReplacement = `    if (res.status !== 0) {
      if (res.stdout) process.stderr.write(res.stdout);
      if (res.stderr) process.stderr.write(res.stderr);
      console.log(JSON.stringify({
        allow: false,
        message: \`Command blocked by safety sub-hook (\${path.basename(hookPath)}). See debug trace for details.\`
      }));
      process.exit(0);
    }`;
    if (content.includes(bundleTarget)) {
      content = content.replace(bundleTarget, bundleReplacement);
      changed = true;
    }
  }

  // 3. Fix external-content-guard.cjs which uses console.log(JSON.stringify({allow:false, ...})); process.exit(2);
  const jsonExitRegex =
    /(console\.log\s*\(\s*JSON\.stringify\s*\(\{[\s\S]*?\}\)\s*\);\s*)process\.exit\(2\)/g;
  content = content.replace(jsonExitRegex, (match, p1) => {
    changed = true;
    return p1 + 'process.exit(0)';
  });

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated: ${path.relative(process.cwd(), file)}`);
    count++;
  }
}

console.log(`\nFixed exit codes in ${count} files.`);
