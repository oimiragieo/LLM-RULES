'use strict';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

async function main() {
  const pkgPath = path.join(PROJECT_ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error('package.json not found');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const scripts = pkg.scripts || {};
  const errors = [];

  console.log(`Validating ${Object.keys(scripts).length} scripts...`);

  for (const [name, script] of Object.entries(scripts)) {
    // Skip echo-only (archived) scripts
    if (script.startsWith('echo ')) continue;

    // Detect node commands - search for .js, .cjs, .mjs files
    // Matches: node path/to/file.js, node -e "...", pnpm script path/to/file.js
    const nodeMatch = script.match(/(?:node|pnpm|pnpm exec|npx)\s+([^\s"']+\.c?m?js)/);
    if (nodeMatch) {
      const scriptFile = nodeMatch[1];
      // Skip node flags or -e
      if (scriptFile.startsWith('-')) continue;
      
      const absPath = path.resolve(PROJECT_ROOT, scriptFile);
      if (!fs.existsSync(absPath)) {
        errors.push(`Script "${name}" references missing file: ${scriptFile}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('\nFound errors:');
    errors.forEach(err => console.error(`- ${err}`));
    process.exit(1);
  }

  console.log('✅ All executable scripts validated.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
