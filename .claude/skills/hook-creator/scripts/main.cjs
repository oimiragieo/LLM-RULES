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
const HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');

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

function registerHookInSettings(name, category, type) {
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  if (!fs.existsSync(settingsPath)) return;

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (_err) {
    return;
  }

  const hookPath = `.claude/hooks/${category}/${name}.cjs`;
  if (!settings.hooks) settings.hooks = {};

  let targetArray;
  if (type.toLowerCase().includes('pre')) {
    if (!settings.hooks['pre-tool']) settings.hooks['pre-tool'] = [];
    targetArray = settings.hooks['pre-tool'];
  } else if (type.toLowerCase().includes('post')) {
    if (!settings.hooks['post-tool']) settings.hooks['post-tool'] = [];
    targetArray = settings.hooks['post-tool'];
  }

  if (targetArray && !targetArray.includes(hookPath)) {
    targetArray.push(hookPath);
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  }
}

function updateHooksReadme(name, category, description) {
  const readmePath = path.join(HOOKS_DIR, 'README.md');
  if (!fs.existsSync(readmePath)) return;
  const content = fs.readFileSync(readmePath, 'utf8');
  if (content.includes(name)) return;

  const entry = `\n#### ${name
    .split('-')
    .map(p => p[0].toUpperCase() + p.slice(1))
    .join(' ')} (\`${name}.cjs\`)\n\n${description}\n`;
  fs.appendFileSync(readmePath, entry, 'utf8');
}

function createHook(options) {
  const name = String(options.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  if (!name) throw new Error('Missing required --name');
  const category = String(options.category || 'safety').trim();
  const type = String(options.type || 'PreToolUse').trim();
  const description = String(options.description || 'New framework hook').trim();

  const hookDir = path.join(HOOKS_DIR, category);
  const hookPath = path.join(hookDir, `${name}.cjs`);

  if (fs.existsSync(hookPath)) {
    return { ok: true, status: 'exists', path: hookPath };
  }

  const content = `'use strict';

/**
 * ${name}
 *
 * Type: ${type}
 * Purpose: ${description}
 */

function validate(context) {
  // const { tool, parameters } = context;
  return { valid: true, error: '' };
}

function main() {
  const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');
  let input;
  try {
    input = process.argv[2] ? JSON.parse(process.argv[2]) : null;
  } catch (e) {
    process.exit(0);
  }
  
  if (!input) process.exit(0);
  
  const result = validate({ 
    tool: input.tool_name || input.tool, 
    parameters: input.tool_input || input.input || {} 
  });

  if (!result.valid) {
    console.error('BLOCKED: ' + result.error);
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { validate };
`;

  if (!fs.existsSync(hookDir)) fs.mkdirSync(hookDir, { recursive: true });
  fs.writeFileSync(hookPath, content, 'utf8');

  // POST-CREATION INTEGRATION
  try {
    registerHookInSettings(name, category, type);
    updateHooksReadme(name, category, description);
    const learningsPath = path.join(CLAUDE_DIR, 'context', 'memory', 'learnings.md');
    if (fs.existsSync(learningsPath)) {
      fs.appendFileSync(
        learningsPath,
        `\n- Created new hook: ${name} in ${category} (${new Date().toISOString().split('T')[0]})\n`,
        'utf8'
      );
    }
  } catch (err) {
    console.error(`Warning: Integration partial: ${err.message}`);
  }

  return { ok: true, action: 'create', path: hookPath };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || Object.keys(options).length === 0) {
    console.log(
      'Hook Creator CLI\nUsage: --name <name> --category <cat> --type <type> [--description <desc>]'
    );
    return;
  }

  const result = createHook(options);
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
