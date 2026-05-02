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
const STRICT_WARNINGS =
  process.argv.includes('--strict') ||
  process.env.VALIDATE_SYNC_STRICT === '1' ||
  String(process.env.VALIDATE_SYNC_STRICT || '').toLowerCase() === 'true';

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

function extractCursorRoutingAgents(configText) {
  if (!configText) {
    return [];
  }

  const agents = [];
  let inRouting = false;

  for (const line of configText.split(/\r?\n/)) {
    if (/^agent_routing:\s*$/.test(line)) {
      inRouting = true;
      continue;
    }

    if (inRouting && /^[^\s#][^:]*:\s*$/.test(line)) {
      break;
    }

    if (inRouting) {
      const match = line.match(/^[ ]{2}([a-z0-9-]+):\s*$/);
      if (match) {
        agents.push(match[1]);
      }
    }
  }

  return agents;
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
// 1. Bundle Inventory
// ====================
console.log('1. Validating Bundle Inventory');
console.log('-------------------------------------------');

const CLAUDE_AGENTS = countFiles(join(PROJECT_ROOT, '.claude', 'agents'), ['.md']);
const CURSOR_AGENTS = countFiles(join(PROJECT_ROOT, '.cursor', 'subagents'), ['.mdc']);
const FACTORY_SKILLS = countFiles(join(PROJECT_ROOT, '.factory', 'skills'), ['SKILL.md']);

info(`Claude agents: ${CLAUDE_AGENTS}`);
info(`Cursor subagents: ${CURSOR_AGENTS}`);
info(`Factory worker skills: ${FACTORY_SKILLS}`);

if (CLAUDE_AGENTS > 0) {
  success('Claude canonical agent catalog is present');
} else {
  error('Claude canonical agent catalog is empty');
}

if (CURSOR_AGENTS > 0) {
  success('Cursor curated subagent bundle is present');
} else {
  error('Cursor subagent bundle is empty');
}

if (FACTORY_SKILLS > 0) {
  success('Factory worker skill bundle is present');
} else {
  error('Factory worker skill bundle is empty');
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
  const routedAgents = extractCursorRoutingAgents(readFile('.cursor/config.yaml'));
  const missingRoutedAgents = routedAgents.filter(
    agent => !fileExists(`.cursor/subagents/${agent}.mdc`)
  );

  info(`Cursor subagents: ${CURSOR_SUBAGENTS}`);

  if (missingRoutedAgents.length === 0) {
    success(`Cursor routed agents are backed by subagent files (${routedAgents.length} checked)`);
  } else {
    error(`Cursor config references missing subagents: ${missingRoutedAgents.join(', ')}`);
  }
} else {
  error('.cursor/subagents/ directory not found');
}

// ====================
// 3. Skill Parity Checks
// ====================
console.log('');
console.log('3. Validating Skill Parity');
console.log('-------------------------------------------');

const CLAUDE_SKILLS = countFiles(join(PROJECT_ROOT, '.claude', 'skills'), ['SKILL.md']);
const REQUIRED_CURSOR_SKILLS = [
  'artifact-publisher',
  'context-bridge',
  'handoff',
  'repo-index',
  'repo-rag',
  'rule-auditor',
  'rule-selector',
  'scaffolder',
];

info(`Claude skills: ${CLAUDE_SKILLS}`);

if (existsSync(join(PROJECT_ROOT, '.cursor', 'skills'))) {
  const CURSOR_SKILLS = countFiles(join(PROJECT_ROOT, '.cursor', 'skills'), ['.md', '.mdc']);
  const missingCursorSkills = REQUIRED_CURSOR_SKILLS.filter(
    skill =>
      !fileExists(`.cursor/skills/${skill}.md`) &&
      !fileExists(`.cursor/skills/${skill}/SKILL.md`) &&
      !fileExists(`.cursor/skills/${skill}/SKILL.mdc`)
  );

  info(`Cursor skills: ${CURSOR_SKILLS}`);

  if (missingCursorSkills.length === 0) {
    success('Required Cursor utility skills are present');
  } else {
    error(`Missing Cursor utility skills: ${missingCursorSkills.join(', ')}`);
  }
} else {
  error('Cursor skills directory not found');
}

if (existsSync(join(PROJECT_ROOT, '.factory', 'skills'))) {
  info(`Factory worker skills: ${FACTORY_SKILLS}`);
  success('Factory uses .factory/skills worker contracts; legacy .factory/droids is not required');
} else {
  error('Factory skills directory not found');
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

const requiredFiles = ['.claude/config.yaml', '.claude/settings.json', '.claude/CLAUDE.md'];

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
  if (STRICT_WARNINGS) {
    console.log(`${colors.RED}Strict mode: warnings treated as errors${colors.NC}`);
    process.exit(1);
  }
  process.exit(0);
} else {
  console.log(`${colors.RED}${ERRORS} error(s), ${WARNINGS} warning(s)${colors.NC}`);
  console.log('');
  console.log('Please fix the errors above before deploying.');
  process.exit(1);
}
