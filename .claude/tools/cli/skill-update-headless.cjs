#!/usr/bin/env node
/**
 * Headless Skill Update Pipeline
 * ===============================
 *
 * Orchestrates unattended skill updates with enterprise bundle
 * validation, scaffolding, and integration. Can optionally invoke
 * the Claude CLI for content updates.
 *
 * Usage:
 *   node skill-update-headless.cjs --skill accessibility --model sonnet
 *   node skill-update-headless.cjs --skill react-expert --dry-run
 *   node skill-update-headless.cjs --batch 5 --model sonnet
 *
 * @module skill-update-headless
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const { validateEnterpriseBundle } = require('../../lib/creators/enterprise-bundle-validator.cjs');
const {
  scaffoldMissingComponents,
} = require('../../lib/creators/enterprise-bundle-scaffolder.cjs');
const { findAssignedAgents, runPostUpdateIntegration } = require('./run-skill-updates.cjs');

// ---------------------------------------------------------------------------
// Argument Parsing
// ---------------------------------------------------------------------------

/**
 * Parse CLI arguments for the headless pipeline.
 *
 * @param {string[]} argv
 * @returns {{ skill: string|null, model: string, dryRun: boolean, batch: number, json: boolean }}
 */
function parseHeadlessArgs(argv) {
  const args = {
    skill: null,
    model: 'sonnet',
    dryRun: false,
    batch: 0,
    json: false,
    processCascades: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--skill' && argv[i + 1]) {
      args.skill = argv[++i];
    } else if (arg === '--model' && argv[i + 1]) {
      args.model = argv[++i];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--batch' && argv[i + 1]) {
      args.batch = parseInt(argv[++i], 10) || 0;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--process-cascades') {
      args.processCascades = true;
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Prompt Builder
// ---------------------------------------------------------------------------

/**
 * Build the headless update prompt for Claude CLI.
 *
 * @param {string} skillName
 * @param {Object} bundleInfo - Current bundle validation result
 * @returns {string}
 */
function buildUpdatePrompt(skillName, bundleInfo) {
  const timestamp = new Date().toISOString();
  const scoreInfo = bundleInfo.score ? ` (current bundle: ${bundleInfo.score})` : '';
  const missingInfo =
    bundleInfo.missing && bundleInfo.missing.length > 0
      ? `\nMissing components: ${bundleInfo.missing.join(', ')}`
      : '';

  return `Update the '${skillName}' skill using the skill-updater workflow${scoreInfo}:
1. Read .claude/skills/${skillName}/SKILL.md
2. Search Exa for '${skillName} best practices 2026'
3. Make targeted additive updates (DO NOT remove protected sections)
4. Update frontmatter: verified: true, lastVerifiedAt: ${timestamp}
5. Run: node .claude/tools/cli/run-skill-updates.cjs --skill ${skillName} --json
6. Report results as JSON${missingInfo}`;
}

// ---------------------------------------------------------------------------
// Debug Log Checker
// ---------------------------------------------------------------------------

/**
 * Check CLI output for guard violations.
 *
 * @param {string} output - CLI stdout/stderr
 * @param {string} [_projectRoot] - Project root (unused, for API compat)
 * @returns {string[]} Array of violation descriptions
 */
function checkDebugLogs(output, _projectRoot) {
  if (!output || typeof output !== 'string') return [];

  const violations = [];
  const lines = output.split('\n');

  for (const line of lines) {
    if (line.includes('BLOCKED by')) {
      violations.push(line.trim());
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Stale Skills Finder
// ---------------------------------------------------------------------------

/**
 * Find the N stalest skills for batch processing.
 *
 * @param {number} count - Number of skills to find
 * @param {string} projectRoot
 * @returns {string[]} Skill names sorted by staleness
 */
function findStalestSkills(count, projectRoot) {
  const skillsDir = path.join(projectRoot, '.claude', 'skills');
  if (!fs.existsSync(skillsDir)) return [];

  const skills = [];
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) continue;

      let lastVerified = 0;
      try {
        const content = fs.readFileSync(skillMdPath, 'utf8');
        const match = content.match(/lastVerifiedAt:\s*(.+)/);
        if (match) {
          lastVerified = new Date(match[1].trim()).getTime() || 0;
        }
      } catch {
        // treat as very stale
      }

      skills.push({ name: entry.name, lastVerified });
    }
  } catch {
    return [];
  }

  // Sort by lastVerified ascending (stalest first)
  skills.sort((a, b) => a.lastVerified - b.lastVerified);
  return skills.slice(0, count).map(s => s.name);
}

// ---------------------------------------------------------------------------
// Cascade Queue Consumer
// ---------------------------------------------------------------------------

const QUEUE_RELATIVE_PATH = path.join('.claude', 'context', 'runtime', 'evolution-requests.jsonl');

/**
 * Read pending skill_cascade entries from the evolution-requests queue.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {Object} [options]
 * @param {number} [options.maxCascades=20] - Maximum cascades to return
 * @returns {{ pending: Array<Object>, count: number }}
 */
function processCascadeQueue(projectRoot, options = {}) {
  const { maxCascades = 20 } = options;
  const queuePath = path.join(projectRoot, QUEUE_RELATIVE_PATH);
  if (!fs.existsSync(queuePath)) return { pending: [], count: 0 };

  const raw = fs.readFileSync(queuePath, 'utf8');
  const entries = raw
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try {
        return safeParseJSON(line, null, null, null);
      } catch {
        return null;
      }
    })
    .filter(e => e && e.trigger === 'skill_cascade' && e.status === 'proposed');

  return { pending: entries.slice(0, maxCascades), count: entries.length };
}

// ---------------------------------------------------------------------------
// Main Headless Update
// ---------------------------------------------------------------------------

/**
 * Run a headless update for a single skill.
 *
 * @param {string} skillName
 * @param {Object} [options]
 * @param {string} [options.model='sonnet']
 * @param {boolean} [options.dryRun=false]
 * @param {boolean} [options.skipClaude=false] - Skip Claude CLI invocation (for testing)
 * @param {string} [options.projectRoot] - Override project root
 * @returns {{
 *   skill: string,
 *   contentUpdated: boolean,
 *   bundleBefore: string,
 *   bundleAfter: string,
 *   scaffolded: string[],
 *   integration: Object,
 *   cascades: string[],
 *   violations: number,
 *   cost: string
 * }}
 */
function runHeadlessUpdate(skillName, options = {}) {
  const { model = 'sonnet', dryRun = false, skipClaude = false } = options;

  let projectRoot;
  if (options.projectRoot) {
    projectRoot = options.projectRoot;
  } else {
    try {
      const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
      projectRoot = PROJECT_ROOT;
    } catch {
      projectRoot = process.cwd();
    }
  }

  // 1. Pre-check: validate bundle BEFORE update
  const beforeBundle = validateEnterpriseBundle(skillName, projectRoot);

  // 2. Run headless Claude CLI (unless skipped)
  let contentUpdated = false;
  let cliOutput = '';
  let cost = 'N/A';

  if (!skipClaude && !dryRun) {
    const prompt = buildUpdatePrompt(skillName, beforeBundle);
    try {
      const result = spawnSync(
        'claude',
        [
          '-p',
          prompt,
          '--dangerously-skip-permissions',
          '--model',
          model,
          '-d',
          projectRoot,
          '--output-format',
          'json',
        ],
        {
          cwd: projectRoot,
          encoding: 'utf8',
          timeout: 300000, // 5 min
          shell: false,
          windowsHide: true,
          env: { ...process.env, CLAUDECODE: '' },
        }
      );

      cliOutput = (result.stdout || '') + (result.stderr || '');
      contentUpdated = result.status === 0;

      // Try to extract cost from JSON output
      try {
        const parsed = safeParseJSON(result.stdout, null, null, null);
        cost = parsed.cost_usd ? `$${parsed.cost_usd}` : 'N/A';
      } catch {
        // cost not available
      }
    } catch (err) {
      cliOutput = err.message;
    }
  } else if (skipClaude) {
    contentUpdated = false;
    cost = '$0.00 (skipped)';
  }

  // 3. Post-check: validate bundle AFTER update
  const afterBundle = validateEnterpriseBundle(skillName, projectRoot);

  // 4. Scaffold any still-missing components
  let scaffolded = [];
  if (!afterBundle.complete && !dryRun) {
    const scaffold = scaffoldMissingComponents(skillName, projectRoot);
    scaffolded = scaffold.created;
  }

  // 5. Re-validate after scaffolding
  const finalBundle =
    scaffolded.length > 0 ? validateEnterpriseBundle(skillName, projectRoot) : afterBundle;

  // 6. Run integration (only for real project root, skip for test tmp dirs)
  let integration = { steps: [], errors: [] };
  if (!dryRun && !skipClaude) {
    integration = runPostUpdateIntegration(skillName, projectRoot, dryRun);
  }

  // 7. Check for guard violations
  const violations = checkDebugLogs(cliOutput, projectRoot);

  // 8. Find assigned agents
  const cascades = findAssignedAgents(skillName, projectRoot);

  return {
    skill: skillName,
    contentUpdated,
    bundleBefore: beforeBundle.score,
    bundleAfter: finalBundle.score,
    scaffolded,
    integration,
    cascades,
    violations: violations.length,
    cost,
  };
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

function main() {
  const args = parseHeadlessArgs(process.argv.slice(2));

  let projectRoot;
  try {
    const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
    projectRoot = PROJECT_ROOT;
  } catch {
    projectRoot = process.cwd();
  }

  let skills = [];
  if (args.skill) {
    skills = [args.skill];
  } else if (args.batch > 0) {
    skills = findStalestSkills(args.batch, projectRoot);
  }

  if (skills.length === 0) {
    console.error(
      'Usage: node skill-update-headless.cjs --skill <name> [--model sonnet] [--dry-run]'
    );
    console.error('       node skill-update-headless.cjs --batch <N> [--model sonnet]');
    process.exitCode = 1;
    return;
  }

  const results = [];
  for (const skill of skills) {
    if (!args.json) {
      process.stdout.write(`Updating ${skill}...\n`);
    }
    const result = runHeadlessUpdate(skill, {
      model: args.model,
      dryRun: args.dryRun,
      projectRoot,
    });
    results.push(result);
  }

  // Include cascade queue if requested
  let cascadeQueue = null;
  if (args.processCascades) {
    cascadeQueue = processCascadeQueue(projectRoot);
  }

  if (args.json) {
    const output = results.length === 1 ? results[0] : results;
    const finalOutput = cascadeQueue
      ? Array.isArray(output)
        ? { results: output, cascadeQueue }
        : { ...output, cascadeQueue }
      : output;
    process.stdout.write(JSON.stringify(finalOutput, null, 2) + '\n');
  } else {
    for (const r of results) {
      process.stdout.write(`\n${r.skill}: bundle ${r.bundleBefore} → ${r.bundleAfter}`);
      if (r.scaffolded.length > 0) {
        process.stdout.write(` (scaffolded: ${r.scaffolded.length})`);
      }
      if (r.cascades.length > 0) {
        process.stdout.write(` | cascades: ${r.cascades.join(', ')}`);
      }
      process.stdout.write(`\n`);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildUpdatePrompt,
  parseHeadlessArgs,
  runHeadlessUpdate,
  checkDebugLogs,
  findStalestSkills,
  processCascadeQueue,
};
