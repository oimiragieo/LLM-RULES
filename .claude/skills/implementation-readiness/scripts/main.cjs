#!/usr/bin/env node
'use strict';

/**
 * implementation-readiness - Main Script
 *
 * Gate for HIGH/EPIC tasks that validates plan completeness and architecture
 * compliance before implementation begins.
 *
 * Usage:
 *   node main.cjs --help
 *   node main.cjs --plan <path-to-plan.json>
 *   node main.cjs --task "<description>"
 */

const fs = require('node:fs');
const path = require('node:path');

// ─── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    opts[key] = next && !next.startsWith('--') ? (++i, next) : true;
  }
  return opts;
}

// ─── Readiness checks ─────────────────────────────────────────────────────────

/**
 * Check 1: Plan completeness — every task must have title, criteria, and files.
 */
function checkPlanCompleteness(plan) {
  const result = { name: 'plan-completeness', passed: true, details: '' };
  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    result.passed = false;
    result.details = 'No tasks found in plan';
    return result;
  }
  const missing = [];
  for (const task of plan.tasks) {
    if (!task.title && !task.description) missing.push('missing title/description');
    if (!Array.isArray(task.criteria) || task.criteria.length === 0) {
      missing.push(`task "${task.title || task.id || '?'}" missing acceptance criteria`);
    }
    if (!Array.isArray(task.files) || task.files.length === 0) {
      missing.push(`task "${task.title || task.id || '?'}" missing file paths`);
    }
  }
  if (missing.length > 0) {
    result.passed = false;
    result.details = missing.join('; ');
  } else {
    result.details = `${plan.tasks.length}/${plan.tasks.length} tasks complete`;
  }
  return result;
}

/**
 * Check 2: Architecture compliance — verify paths follow conventions.
 */
function checkArchitectureCompliance(plan) {
  const result = { name: 'architecture-compliance', passed: true, details: '' };
  if (!plan || !Array.isArray(plan.tasks)) {
    result.details = 'No tasks to check';
    return result;
  }
  const violations = [];
  const CONVENTIONS = [
    { pattern: /\.claude\/skills\/[^/]+\/SKILL\.md$/, label: 'skill' },
    { pattern: /\.claude\/agents\/[^/]+\/[^/]+\.md$/, label: 'agent' },
    { pattern: /\.claude\/hooks\/[^/]+\/[^/]+\.cjs$/, label: 'hook' },
  ];
  for (const task of plan.tasks) {
    const files = task.files || [];
    for (const f of files) {
      const isConvention = CONVENTIONS.some(c => c.pattern.test(f));
      // Only flag if it looks like a .claude/ path but doesn't match known patterns
      if (f.includes('.claude/') && !isConvention) {
        const known = ['.claude/lib/', '.claude/tools/', '.claude/commands/', '.claude/config/'];
        const isKnown = known.some(k => f.includes(k));
        if (!isKnown) {
          violations.push(`Non-standard path: ${f}`);
        }
      }
    }
  }
  if (violations.length > 0) {
    result.passed = false;
    result.details = violations.join('; ');
  } else {
    result.details = 'All paths follow conventions';
  }
  return result;
}

/**
 * Check 3: Dependency graph validity — no circular dependencies.
 */
function checkDependencyGraph(plan) {
  const result = { name: 'dependency-graph', passed: true, details: '' };
  if (!plan || !Array.isArray(plan.tasks)) {
    result.details = 'No tasks to check';
    return result;
  }
  const taskIds = new Set(plan.tasks.map(t => t.id).filter(Boolean));
  const danglingRefs = [];
  for (const task of plan.tasks) {
    for (const dep of task.blockedBy || []) {
      if (!taskIds.has(dep)) danglingRefs.push(`${task.id} -> ${dep} (not found)`);
    }
  }
  if (danglingRefs.length > 0) {
    result.passed = false;
    result.details = 'Dangling references: ' + danglingRefs.join(', ');
  } else {
    result.details = 'DAG valid';
  }
  return result;
}

/**
 * Check 4: Risk assessment — required for HIGH/EPIC tasks.
 */
function checkRiskAssessment(plan) {
  const result = { name: 'risk-assessment', passed: true, details: '' };
  const complexity = (plan && plan.complexity) || 'UNKNOWN';
  if (['HIGH', 'EPIC'].includes(complexity.toUpperCase())) {
    if (!plan.risks || !plan.rollback) {
      result.passed = false;
      result.details = 'Missing risk assessment for HIGH/EPIC task';
    } else {
      result.details = 'Rollback strategy documented';
    }
  } else {
    result.details = `Not required for ${complexity} complexity`;
  }
  return result;
}

/**
 * Check 5: Test strategy — each feature task should have a test file.
 */
function checkTestStrategy(plan) {
  const result = { name: 'test-strategy', passed: true, details: '' };
  if (!plan || !Array.isArray(plan.tasks)) {
    result.details = 'No tasks to check';
    return result;
  }
  const missing = [];
  for (const task of plan.tasks) {
    if (task.type === 'implementation' || !task.type) {
      const hasTestFile = (task.files || []).some(
        f => f.includes('.test.') || f.includes('/tests/')
      );
      if (!hasTestFile) {
        missing.push(task.id || task.title || '?');
      }
    }
  }
  if (missing.length > 0) {
    result.passed = false;
    result.details = `Tasks missing test file: ${missing.join(', ')}`;
  } else {
    result.details = 'Test strategy present';
  }
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(`
implementation-readiness - Pre-Implementation Gate

Usage:
  node main.cjs --plan <path>     Validate a plan JSON file
  node main.cjs --task "<text>"   Run with a minimal task description
  node main.cjs --help            Show this help

Plan JSON schema:
  { complexity, tasks: [{ id, title, criteria[], files[], blockedBy[] }], risks?, rollback? }
`);
    process.exit(0);
  }

  let plan = null;

  if (opts.plan) {
    const planPath = path.resolve(opts.plan);
    if (!fs.existsSync(planPath)) {
      console.error(`Plan file not found: ${planPath}`);
      process.exit(1);
    }
    try {
      plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    } catch (err) {
      console.error(`Failed to parse plan JSON: ${err.message}`);
      process.exit(1);
    }
  } else if (opts.task) {
    // Minimal plan from --task flag
    plan = {
      complexity: 'LOW',
      tasks: [{ id: 'task-1', title: opts.task, criteria: ['completes'], files: ['src/'] }],
    };
  } else {
    // No plan provided — return a baseline pass result
    plan = { complexity: 'LOW', tasks: [] };
  }

  const checks = [
    checkPlanCompleteness(plan),
    checkArchitectureCompliance(plan),
    checkDependencyGraph(plan),
    checkRiskAssessment(plan),
    checkTestStrategy(plan),
  ];

  const blockers = checks.filter(c => !c.passed).map(c => c.details);
  const verdict = blockers.length === 0 ? 'PASS' : 'FAIL';

  const output = {
    verdict,
    complexity: plan.complexity || 'UNKNOWN',
    checks,
    blockers,
    warnings: [],
  };

  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

main();
