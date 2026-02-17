#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function findProjectRoot() {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.claude'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');
const TOOLS_DIR = path.join(CLAUDE_DIR, 'tools');

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    options[key] = hasValue ? argv[++i] : true;
  }
  return options;
}

function updateToolCatalog(name, description, category) {
  const catalogPath = path.join(CLAUDE_DIR, 'context', 'artifacts', 'catalogs', 'tool-catalog.md');
  if (!fs.existsSync(catalogPath)) return;
  const content = fs.readFileSync(catalogPath, 'utf8');
  if (content.includes(name)) return;

  const entry = `| ${name} | ${description} | .claude/tools/${category}/${name}.cjs | active |`;
  // Heuristic insertion into table (very simplified)
  fs.appendFileSync(catalogPath, `\n${entry}\n`, 'utf8');
}

function createTool(options) {
  const name = String(options.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  if (!name) throw new Error('Missing required --name');
  const category = String(options.category || 'cli').trim();
  const description = String(options.description || 'CLI utility').trim();
  const implementation = String(options.implementation || '').trim();

  const categoryDir = path.join(TOOLS_DIR, category);
  const toolPath = path.join(categoryDir, `${name}.cjs`);

  if (fs.existsSync(toolPath)) {
    return { ok: true, status: 'exists', path: toolPath };
  }

  const content = `#!/usr/bin/env node
/**
 * ${name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} - ${description}
 */

const main = async () => {
  ${implementation || '// Implementation here'}
};

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
`;

  if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });
  fs.writeFileSync(toolPath, content, 'utf8');

  // POST-CREATION INTEGRATION
  try {
    updateToolCatalog(name, description, category);
    const learningsPath = path.join(CLAUDE_DIR, 'context', 'memory', 'learnings.md');
    if (fs.existsSync(learningsPath)) {
      fs.appendFileSync(
        learningsPath,
        `\n- Created new tool: ${category}/${name} (${new Date().toISOString().split('T')[0]})\n`,
        'utf8'
      );
    }
  } catch (err) {
    console.error(`Warning: Integration partial: ${err.message}`);
  }

  return { ok: true, action: 'create', path: toolPath };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || Object.keys(options).length === 0) {
    console.log(
      'Tool Creator CLI\nUsage: --name <name> --category <cat> --implementation <code> [--description <desc>]'
    );
    return;
  }

  const result = createTool(options);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
