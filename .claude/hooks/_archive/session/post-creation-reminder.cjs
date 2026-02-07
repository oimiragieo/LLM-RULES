#!/usr/bin/env node
/**
 * post-creation-reminder.cjs
 *
 * Session hook that reminds agents about recently created artifacts
 * that may need integration verification.
 *
 * WHEN IT RUNS:
 * - On session start/resume (UserPrompt trigger with first prompt detection)
 * - When context is cleared or compacted
 *
 * WHAT IT DOES:
 * - Checks evolution-state.json for recent completions (last 24 hours)
 * - Runs validation checks on those artifacts
 * - Outputs reminder if any fail validation
 *
 * Part of the Post-Creation Validation Workflow.
 * @see .claude/workflows/core/post-creation-validation.md
 */

const fs = require('fs');
const path = require('path');

// Use shared utility for project root
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

// Paths
const EVOLUTION_STATE = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');
const CLAUDE_MD = path.join(PROJECT_ROOT, '.claude', 'CLAUDE.md');
const SKILL_CATALOG = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'artifacts',
  'skill-catalog.md'
);
const ROUTER_ENFORCER = path.join(PROJECT_ROOT, '.claude', 'lib', 'routing', 'routing-table.cjs');
const LAST_RUN_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  '.tmp',
  'post-creation-reminder-last-run.txt'
);

/**
 * Read file safely.
 */
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (_err) {
    return null;
  }
}

/**
 * Get artifact type from path.
 */
function getArtifactType(artifactPath) {
  const normalizedPath = artifactPath.replace(/\\/g, '/');

  if (normalizedPath.includes('/agents/')) return 'agent';
  if (normalizedPath.includes('/skills/')) return 'skill';
  if (normalizedPath.includes('/workflows/')) return 'workflow';
  if (normalizedPath.includes('/hooks/')) return 'hook';

  return 'unknown';
}

/**
 * Get artifact name from path.
 */
function getArtifactName(artifactPath) {
  const normalizedPath = artifactPath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  const filename = parts[parts.length - 1];
  return filename.replace(/\.(md|cjs|mjs|json)$/, '');
}

/**
 * Quick validation check for an artifact.
 * Returns { passed: boolean, issues: string[] }
 */
function quickValidate(artifactPath) {
  const issues = [];
  const artifactType = getArtifactType(artifactPath);
  const artifactName = getArtifactName(artifactPath);

  // Check if artifact file exists
  const absolutePath = path.isAbsolute(artifactPath)
    ? artifactPath
    : path.join(PROJECT_ROOT, artifactPath);

  if (!fs.existsSync(absolutePath)) {
    return { passed: false, issues: ['Artifact file not found'] };
  }

  // Check CLAUDE.md for agents/workflows
  if (['agent', 'workflow'].includes(artifactType)) {
    const claudeMd = readFileSafe(CLAUDE_MD);
    if (claudeMd && !claudeMd.toLowerCase().includes(artifactName.toLowerCase())) {
      issues.push('Missing CLAUDE.md routing entry');
    }
  }

  // Check skill catalog for skills
  if (artifactType === 'skill') {
    const catalog = readFileSafe(SKILL_CATALOG);
    if (catalog && !catalog.toLowerCase().includes(artifactName.toLowerCase())) {
      issues.push('Missing skill catalog entry');
    }
  }

  // Check routing table for agents
  if (artifactType === 'agent') {
    const enforcer = readFileSafe(ROUTER_ENFORCER);
    if (enforcer && !enforcer.toLowerCase().includes(artifactName.toLowerCase())) {
      issues.push('Missing routing-table keywords');
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

/**
 * Get recently completed evolutions from state.
 */
function getRecentEvolutions(hoursAgo = 24) {
  const stateContent = readFileSafe(EVOLUTION_STATE);
  if (!stateContent) return [];

  try {
    const state = JSON.parse(stateContent);
    const cutoff = Date.now() - hoursAgo * 60 * 60 * 1000;
    const recent = [];

    // Check completed evolutions
    if (state.evolutions) {
      for (const evolution of state.evolutions) {
        if (evolution.completedAt) {
          const completedAt = new Date(evolution.completedAt).getTime();
          if (completedAt > cutoff) {
            recent.push({
              name: evolution.name,
              type: evolution.type,
              path: evolution.path,
              completedAt: evolution.completedAt,
            });
          }
        }
      }
    }

    // Check current evolution (if in progress)
    if (state.currentEvolution?.artifacts) {
      for (const artifact of state.currentEvolution.artifacts) {
        recent.push({
          name: artifact.name,
          type: artifact.type,
          path: artifact.path,
          completedAt: null, // In progress
        });
      }
    }

    return recent;
  } catch (_err) {
    return [];
  }
}

/**
 * Format time ago string.
 */
function timeAgo(dateStr) {
  if (!dateStr) return 'in progress';

  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffHours = Math.floor((now - then) / (1000 * 60 * 60));

  if (diffHours < 1) return 'just now';
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

/**
 * Check if hook has run recently (within last 4 hours).
 * Returns true if should skip execution.
 */
function hasRunRecently() {
  try {
    if (!fs.existsSync(LAST_RUN_FILE)) {
      return false;
    }

    const lastRunTime = parseInt(fs.readFileSync(LAST_RUN_FILE, 'utf-8').trim(), 10);
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;

    return lastRunTime > fourHoursAgo;
  } catch (_err) {
    return false; // If error, run the hook
  }
}

/**
 * Record that hook has run.
 */
function recordRun() {
  try {
    const tmpDir = path.dirname(LAST_RUN_FILE);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    fs.writeFileSync(LAST_RUN_FILE, Date.now().toString(), 'utf-8');
  } catch (_err) {
    // Ignore errors (don't block on timestamp write)
  }
}

/**
 * Main execution.
 */
function main() {
  // Check if run recently (within last 4 hours)
  if (hasRunRecently()) {
    process.exit(0); // Skip - ran recently
  }

  // Record this run
  recordRun();

  // Get recent evolutions (last 24 hours)
  const recentEvolutions = getRecentEvolutions(24);

  if (recentEvolutions.length === 0) {
    // No recent artifacts, nothing to remind about
    process.exit(0);
  }

  // Check each for integration issues
  const artifactsWithIssues = [];

  for (const evolution of recentEvolutions) {
    if (evolution.path) {
      const validation = quickValidate(evolution.path);
      if (!validation.passed) {
        artifactsWithIssues.push({
          ...evolution,
          issues: validation.issues,
        });
      }
    }
  }

  if (artifactsWithIssues.length === 0) {
    // All recent artifacts are properly integrated
    process.exit(0);
  }

  // Output reminder
  console.log('\n+----------------------------------------------------------+');
  console.log('| POST-CREATION VALIDATION REMINDER                        |');
  console.log('+----------------------------------------------------------+');
  console.log('| The following recently created artifacts may have        |');
  console.log('| incomplete integration:                                  |');
  console.log('|                                                          |');

  for (const artifact of artifactsWithIssues) {
    const typeStr = artifact.type.padEnd(8);
    const nameStr = artifact.name.substring(0, 25).padEnd(25);
    const whenStr = timeAgo(artifact.completedAt);
    console.log(`|  [${typeStr}] ${nameStr} (${whenStr})`);

    for (const issue of artifact.issues) {
      console.log(`|    - ${issue}`);
    }
  }

  console.log('|                                                          |');
  console.log('| Run validation:                                          |');
  console.log('|   node .claude/tools/cli/validate-integration.cjs --recent|');
  console.log('|                                                          |');
  console.log('| See: .claude/workflows/core/post-creation-validation.md  |');
  console.log('+----------------------------------------------------------+\n');

  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main, getRecentEvolutions, quickValidate };
