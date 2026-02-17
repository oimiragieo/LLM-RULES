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
const COMMANDS_DIR = path.join(CLAUDE_DIR, 'commands');

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

function updateRoutingTableKeywords(name, description) {
  const filePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'lib',
    'routing',
    'routing-table-intent-keywords.cjs'
  );
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(`'${name}':`)) return;

  const keywords = Array.from(
    new Set([name, ...name.split('-'), ...(description.toLowerCase().match(/\b\w{4,}\b/g) || [])])
  ).slice(0, 10);

  const entry = `  '${name}': ${JSON.stringify(keywords, null, 2).replace(/\]/g, '],')},`;
  const insertionPoint = content.lastIndexOf('};');
  if (insertionPoint !== -1) {
    content = content.slice(0, insertionPoint) + entry + '\n' + content.slice(insertionPoint);
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function updateRoutingTableAgents(name, skill) {
  const filePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'lib',
    'routing',
    'routing-table-intent-agents.cjs'
  );
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(`'${name}':`)) return;

  // Commands usually route to the skill name as an intent
  const entry = `  '${name}': '${skill}',`;
  const insertionPoint = content.lastIndexOf('};');
  if (insertionPoint !== -1) {
    content = content.slice(0, insertionPoint) + entry + '\n' + content.slice(insertionPoint);
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function updateCommandCatalog(name, description, skill) {
  const catalogPath = path.join(
    CLAUDE_DIR,
    'context',
    'artifacts',
    'catalogs',
    'command-catalog.md'
  );
  if (!fs.existsSync(catalogPath)) return;
  let content = fs.readFileSync(catalogPath, 'utf8');
  if (content.includes(`/${name}`)) return;

  const entry = `| /${name} | ${description} | ${skill} |`;
  const tableHeader = '| Command | Description | Target Skill |';
  const idx = content.indexOf(tableHeader);
  if (idx !== -1) {
    const tableStart = content.indexOf('\n', idx) + 1;
    const separatorLine = content.indexOf('\n', tableStart) + 1;
    content = content.slice(0, separatorLine) + entry + '\n' + content.slice(separatorLine);
    fs.writeFileSync(catalogPath, content, 'utf8');
  }
}

function createCommand(options) {
  const name = String(options.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  if (!name) throw new Error('Missing required --name');
  const skill = String(options.skill || '').trim();
  if (!skill) throw new Error('Missing required --skill');
  const description = String(options.description || `Invoke the ${skill} skill`).trim();

  const commandPath = path.join(COMMANDS_DIR, `${name}.md`);
  if (fs.existsSync(commandPath)) {
    console.log(`Command already exists: ${commandPath}`);
    return { ok: true, status: 'exists' };
  }

  const content = `---
description: ${description}
disable-model-invocation: true
verified: true
lastVerifiedAt: ${new Date().toISOString()}
---

Invoke the ${skill} skill and follow it exactly as presented to you
`;

  if (!fs.existsSync(COMMANDS_DIR)) fs.mkdirSync(COMMANDS_DIR, { recursive: true });
  fs.writeFileSync(commandPath, content, 'utf8');

  // POST-CREATION INTEGRATION
  try {
    updateCommandCatalog(name, description, skill);
    updateRoutingTableKeywords(name, description);
    updateRoutingTableAgents(name, skill);
    const learningsPath = path.join(CLAUDE_DIR, 'context', 'memory', 'learnings.md');
    if (fs.existsSync(learningsPath)) {
      fs.appendFileSync(
        learningsPath,
        `\n- Created new command: /${name} (${new Date().toISOString().split('T')[0]})\n`,
        'utf8'
      );
    }
  } catch (err) {
    console.error(`Warning: Integration partial: ${err.message}`);
  }

  return { ok: true, action: 'create', path: commandPath };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || Object.keys(options).length === 0) {
    console.log('Command Creator CLI\nUsage: --name <name> --skill <skill> [--description <desc>]');
    return;
  }

  const result = createCommand(options);
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
