#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

function runIntegration(type) {
  console.log(`Running integration for ${type}...`);
  if (type === 'agent') {
    const script = path.join(CLAUDE_DIR, 'tools', 'cli', 'generate-agent-registry.cjs');
    spawnSync('node', [script], { windowsHide: true });
  } else if (type === 'skill') {
    const script = path.join(CLAUDE_DIR, 'tools', 'cli', 'generate-skill-index.cjs');
    spawnSync('node', [script], { windowsHide: true });
  }
}

function updateArtifactMetadata(filePath) {
  const absolutePath = path.resolve(PROJECT_ROOT, filePath);
  if (!fs.existsSync(absolutePath)) return;
  
  let content = fs.readFileSync(absolutePath, 'utf8');
  const now = new Date().toISOString();
  
  if (content.includes('lastVerifiedAt:')) {
    content = content.replace(/lastVerifiedAt: .*/, `lastVerifiedAt: ${now}`);
  } else {
    content = content.replace(/---\n/, `---\nlastVerifiedAt: ${now}\n`);
  }
  
  if (content.includes('verified:')) {
    content = content.replace(/verified: .*/, `verified: true`);
  } else {
    content = content.replace(/---\n/, `---\nverified: true\n`);
  }
  
  fs.writeFileSync(absolutePath, content, 'utf8');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const file = options.file || options.path;
  const type = options.type;

  if (!file) {
    console.log('Artifact Updater CLI\nUsage: --file <path> [--type agent|skill|hook|workflow]');
    return;
  }

  if (!fs.existsSync(path.resolve(PROJECT_ROOT, file))) {
    console.error(`Error: File not found: ${file}`);
    process.exit(1);
  }

  const inferredType = type || (file.includes('/agents/') ? 'agent' : file.includes('/skills/') ? 'skill' : 'unknown');
  
  // Apply metadata updates
  updateArtifactMetadata(file);

  runIntegration(inferredType);
  
  const learningsPath = path.join(CLAUDE_DIR, 'context', 'memory', 'learnings.md');
  if (fs.existsSync(learningsPath)) {
    fs.appendFileSync(learningsPath, `
- Updated ${inferredType}: ${file} (${new Date().toISOString().split('T')[0]})
`, 'utf8');
  }

  console.log(JSON.stringify({ ok: true, action: 'update', file, type: inferredType }, null, 2));
}

if (require.main === module) {
  main();
}
