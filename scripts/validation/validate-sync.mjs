#!/usr/bin/env node
/**
 * validate-sync.mjs - Cross-platform configuration validation
 * Validates agent counts, cross-platform sync, and documentation consistency
 *
 * Node.js equivalent of validate-sync.sh for full Windows compatibility
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');

let ERRORS = 0;
let WARNINGS = 0;

// Colors (fallback to plain if no color support)
const colors = {
  RED: '\x1b[0;31m',
  GREEN: '\x1b[0;32m',
  YELLOW: '\x1b[1;33m',
  NC: '\x1b[0m',
};

function error(msg) {
  console.log(`${colors.RED}[ERROR]${colors.NC} ${msg}`);
  ERRORS++;
}

function warning(msg) {
  console.log(`${colors.YELLOW}[WARN]${colors.NC} ${msg}`);
  WARNINGS++;
}

function success(msg) {
  console.log(`${colors.GREEN}[OK]${colors.NC} ${msg}`);
}

function info(msg) {
  console.log(`[INFO] ${msg}`);
}

function countFiles(dir, extensions) {
  try {
    const files = readdirSync(dir, { recursive: true });
    return files.filter(f => extensions.some(ext => f.endsWith(ext))).length;
  } catch (_err) {
    return 0;
  }
}

function fileExists(path) {
  return existsSync(join(PROJECT_ROOT, path));
}

function readFile(path) {
  try {
    return readFileSync(join(PROJECT_ROOT, path), 'utf-8');
  } catch {
    return null;
  }
}

console.log('==========================================');
console.log('Agent Studio Configuration Validation');
console.log('==========================================');
console.log('');

// ====================
// 1. Count Agents
// ====================
console.log('1. Validating Agent Counts');
console.log('-------------------------------------------');

const CLAUDE_AGENTS = countFiles(join(PROJECT_ROOT, '.claude', 'agents'), ['.md']);
const CURSOR_AGENTS = countFiles(join(PROJECT_ROOT, '.cursor', 'subagents'), ['.mdc']);
const FACTORY_AGENTS = countFiles(join(PROJECT_ROOT, '.factory', 'droids'), ['.md']);

info(`Claude agents: ${CLAUDE_AGENTS}`);
info(`Cursor subagents: ${CURSOR_AGENTS}`);
info(`Factory droids: ${FACTORY_AGENTS}`);

if (CLAUDE_AGENTS === CURSOR_AGENTS && CLAUDE_AGENTS === FACTORY_AGENTS) {
  success('Agent counts match across all platforms');
} else {
  warning(
    `Agent counts differ: Claude=${CLAUDE_AGENTS}, Cursor=${CURSOR_AGENTS}, Factory=${FACTORY_AGENTS}`
  );
}

// ====================
// 2. Cursor Directory/File Checks
// ====================
console.log('');
console.log('2. Validating Cursor Directory Structure');
console.log('-------------------------------------------');

if (existsSync(join(PROJECT_ROOT, '.cursor', 'plans'))) {
  info('.cursor/plans/ directory exists (runtime-created, may be empty)');
} else {
  info('.cursor/plans/ directory not found (will be created at runtime)');
}

if (existsSync(join(PROJECT_ROOT, '.cursor', 'subagents'))) {
  const CURSOR_SUBAGENTS = countFiles(join(PROJECT_ROOT, '.cursor', 'subagents'), ['.mdc']);
  info(`Cursor subagents: ${CURSOR_SUBAGENTS}`);

  if (CLAUDE_AGENTS === CURSOR_SUBAGENTS) {
    success('Cursor subagents count matches Claude agents');
  } else {
    warning(
      `Cursor subagents count (${CURSOR_SUBAGENTS}) differs from Claude agents (${CLAUDE_AGENTS})`
    );
  }
} else {
  warning('.cursor/subagents/ directory not found');
}

// ====================
// 3. Skill Parity Checks
// ====================
console.log('');
console.log('3. Validating Skill Parity');
console.log('-------------------------------------------');

const CLAUDE_SKILLS = countFiles(join(PROJECT_ROOT, '.claude', 'skills'), ['SKILL.md']);
info(`Claude skills: ${CLAUDE_SKILLS}`);

if (existsSync(join(PROJECT_ROOT, '.cursor', 'skills'))) {
  const CURSOR_SKILLS = countFiles(join(PROJECT_ROOT, '.cursor', 'skills'), [
    'SKILL.md',
    'SKILL.mdc',
  ]);

  if (CLAUDE_SKILLS === CURSOR_SKILLS) {
    success('Skill counts match between Claude and Cursor');
  } else {
    warning(`Skill counts differ: Claude=${CLAUDE_SKILLS}, Cursor=${CURSOR_SKILLS}`);
  }
} else {
  info('Skipping skill parity checks (Cursor skills directory not found)');
}

// ====================
// 4. Documentation Consistency
// ====================
console.log('');
console.log('4. Documentation Consistency');
console.log('-------------------------------------------');

const readme = readFile('README.md');
if (readme) {
  const countMatch = readme.match(/(\d+)\s+(specialized\s+)?agents/);
  if (countMatch) {
    const readmeCount = parseInt(countMatch[1]);
    if (readmeCount === CLAUDE_AGENTS) {
      success(`README.md agent count (${readmeCount}) matches actual count (${CLAUDE_AGENTS})`);
    } else {
      warning(`README.md claims ${readmeCount} agents but found ${CLAUDE_AGENTS}`);
    }
  }
}

if (fileExists('.claude/CLAUDE.md')) {
  success('.claude/CLAUDE.md exists (canonical location)');
} else {
  error('.claude/CLAUDE.md missing (required for Claude Code)');
}

if (fileExists('GETTING_STARTED.md')) {
  success('GETTING_STARTED.md quick start guide exists');
} else {
  warning('GETTING_STARTED.md missing (recommended for onboarding)');
}

// ====================
// 5. Required Files Check
// ====================
console.log('');
console.log('5. Required Files Check');
console.log('-------------------------------------------');

const requiredFiles = [
  '.claude/config.yaml',
  '.claude/settings.json',
  '.claude/CLAUDE.md',
];

for (const file of requiredFiles) {
  if (fileExists(file)) {
    success(`Required file exists: ${file}`);
  } else {
    error(`Required file missing: ${file}`);
  }
}

// ====================
// Summary
// ====================
console.log('');
console.log('==========================================');
console.log('Validation Summary');
console.log('==========================================');
console.log('');

if (ERRORS === 0 && WARNINGS === 0) {
  console.log(`${colors.GREEN}All checks passed!${colors.NC}`);
  process.exit(0);
} else if (ERRORS === 0) {
  console.log(`${colors.YELLOW}${WARNINGS} warning(s), 0 errors${colors.NC}`);
  process.exit(0);
} else {
  console.log(`${colors.RED}${ERRORS} error(s), ${WARNINGS} warning(s)${colors.NC}`);
  console.log('');
  console.log('Please fix the errors above before deploying.');
  process.exit(1);
}
