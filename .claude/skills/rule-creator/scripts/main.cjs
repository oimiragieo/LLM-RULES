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
const RULES_DIR = path.join(CLAUDE_DIR, 'rules');

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

function createRule(options) {
  const name = String(options.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  if (!name) throw new Error('Missing required --name');
  const content = String(options.content || '').trim();
  if (!content) throw new Error('Missing required --content');

  const rulePath = path.join(RULES_DIR, `${name}.md`);
  if (fs.existsSync(rulePath)) {
    return { ok: true, status: 'exists', path: rulePath };
  }

  const title = name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const finalContent = content.startsWith('#') ? content : `# ${title}\n\n${content}`;

  if (!fs.existsSync(RULES_DIR)) fs.mkdirSync(RULES_DIR, { recursive: true });
  fs.writeFileSync(rulePath, finalContent, 'utf8');

  // POST-CREATION INTEGRATION
  try {
    const learningsPath = path.join(CLAUDE_DIR, 'context', 'memory', 'learnings.md');
    if (fs.existsSync(learningsPath)) {
      fs.appendFileSync(
        learningsPath,
        `\n- Created new framework rule: ${name} (${new Date().toISOString().split('T')[0]})\n`,
        'utf8'
      );
    }
  } catch (err) {
    console.error(`Warning: Integration partial: ${err.message}`);
  }

  return { ok: true, action: 'create', path: rulePath };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || Object.keys(options).length === 0) {
    console.log('Rule Creator CLI\nUsage: --name <name> --content <markdown-content>');
    return;
  }

  const result = createRule(options);
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
