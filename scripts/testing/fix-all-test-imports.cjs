#!/usr/bin/env node
// fix-all-test-imports.cjs
//
// Comprehensive fix for test imports after migration.
// Updates all relative requires in migrated test files to point to correct locations.
//
// Usage:
//   node scripts/testing/fix-all-test-imports.cjs [--dry-run] [--verbose]

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Mapping of test file locations to hook source locations
const PATH_MAPPINGS = {
  // tests/hooks/* -> .claude/hooks/{category}/
  'tests/hooks': {
    // Routing hooks
    'router-state.cjs': '.claude/hooks/routing/router-state.cjs',
    'router-enforcer.cjs': '.claude/hooks/routing/router-enforcer.cjs',
    'routing-guard.cjs': '.claude/hooks/routing/routing-guard.cjs',
    'agent-context-tracker.cjs': '.claude/hooks/routing/agent-context-tracker.cjs',
    'agent-context-pre-tracker.cjs': '.claude/hooks/routing/agent-context-pre-tracker.cjs',
    'documentation-routing-guard.cjs': '.claude/hooks/routing/documentation-routing-guard.cjs',
    'config-model-validator.cjs': '.claude/hooks/routing/config-model-validator.cjs',
    'post-task-unified.cjs': '.claude/hooks/routing/post-task-unified.cjs',
    'pre-task-unified.cjs': '.claude/hooks/routing/pre-task-unified.cjs',
    'user-prompt-unified.cjs': '.claude/hooks/routing/user-prompt-unified.cjs',
    'skill-invocation-tracker.cjs': '.claude/hooks/routing/skill-invocation-tracker.cjs',
    'task-update-tracker.cjs': '.claude/hooks/routing/task-update-tracker.cjs',
    'task-completion-guard.cjs': '.claude/hooks/routing/task-completion-guard.cjs',
    'unified-creator-guard.cjs': '.claude/hooks/routing/unified-creator-guard.cjs',
    'router-mode-reset.cjs': '.claude/hooks/routing/router-mode-reset.cjs',
    'tool-availability-validator.cjs': '.claude/hooks/routing/tool-availability-validator.cjs',

    // Safety hooks
    'bash-command-validator.cjs': '.claude/hooks/safety/bash-command-validator.cjs',
    'file-placement-guard.cjs': '.claude/hooks/safety/file-placement-guard.cjs',
    'router-write-guard.cjs': '.claude/hooks/safety/router-write-guard.cjs',
    'security-trigger.cjs': '.claude/hooks/safety/security-trigger.cjs',
    'validate-skill-invocation.cjs': '.claude/hooks/safety/validate-skill-invocation.cjs',
    'spawn-prompt-validator.cjs': '.claude/hooks/safety/spawn-prompt-validator.cjs',
    'tdd-check.cjs': '.claude/hooks/safety/tdd-check.cjs',
    'enforce-claude-md-update.cjs': '.claude/hooks/safety/enforce-claude-md-update.cjs',
    'error-capture-post-tool.cjs': '.claude/hooks/safety/error-capture-post-tool.cjs',
    'windows-null-sanitizer.cjs': '.claude/hooks/safety/windows-null-sanitizer.cjs',
    'write-size-validator.cjs': '.claude/hooks/safety/write-size-validator.cjs',

    // Safety validators
    'validators/registry.cjs': '.claude/hooks/safety/validators/registry.cjs',
    'registry.cjs': '.claude/hooks/safety/validators/registry.cjs',
    'database-validators.cjs': '.claude/hooks/safety/validators/database-validators.cjs',
    'filesystem-validators.cjs': '.claude/hooks/safety/validators/filesystem-validators.cjs',
    'git-validators.cjs': '.claude/hooks/safety/validators/git-validators.cjs',
    'network-validators.cjs': '.claude/hooks/safety/validators/network-validators.cjs',
    'process-validators.cjs': '.claude/hooks/safety/validators/process-validators.cjs',
    'shell-validators.cjs': '.claude/hooks/safety/validators/shell-validators.cjs',

    // Memory hooks
    'format-memory.cjs': '.claude/hooks/memory/format-memory.cjs',
    'memory-health-check.cjs': '.claude/hooks/memory/memory-health-check.cjs',
    'session-end-recorder.cjs': '.claude/hooks/memory/session-end-recorder.cjs',
    'session-memory-extractor.cjs': '.claude/hooks/memory/session-memory-extractor.cjs',
    'extract-workflow-learnings.cjs': '.claude/hooks/memory/extract-workflow-learnings.cjs',

    // Evolution hooks
    'evolution-state-guard.cjs': '.claude/hooks/evolution/evolution-state-guard.cjs',
    'evolution-trigger-detector.cjs': '.claude/hooks/evolution/evolution-trigger-detector.cjs',
    'evolution-audit.cjs': '.claude/hooks/evolution/evolution-audit.cjs',
    'conflict-detector.cjs': '.claude/hooks/evolution/conflict-detector.cjs',
    'quality-gate-validator.cjs': '.claude/hooks/evolution/quality-gate-validator.cjs',
    'research-enforcement.cjs': '.claude/hooks/evolution/research-enforcement.cjs',
    'unified-evolution-guard.cjs': '.claude/hooks/evolution/unified-evolution-guard.cjs',

    // Reflection hooks
    'error-recovery-reflection.cjs': '.claude/hooks/reflection/error-recovery-reflection.cjs',
    'error-summary-extractor.cjs': '.claude/hooks/reflection/error-summary-extractor.cjs',
    'session-end-reflection.cjs': '.claude/hooks/reflection/session-end-reflection.cjs',
    'task-completion-reflection.cjs': '.claude/hooks/reflection/task-completion-reflection.cjs',
    'unified-reflection-handler.cjs': '.claude/hooks/reflection/unified-reflection-handler.cjs',
    'reflection-queue-processor.cjs': '.claude/hooks/reflection/reflection-queue-processor.cjs',

    // Self-healing hooks
    'anomaly-detector.cjs': '.claude/hooks/self-healing/anomaly-detector.cjs',
    'auto-rerouter.cjs': '.claude/hooks/self-healing/auto-rerouter.cjs',
    'loop-prevention.cjs': '.claude/hooks/self-healing/loop-prevention.cjs',

    // Session hooks
    'post-creation-reminder.cjs': '.claude/hooks/session/post-creation-reminder.cjs',
    'memory-reminder.cjs': '.claude/hooks/session/memory-reminder.cjs',
    'state-reset.cjs': '.claude/hooks/session/state-reset.cjs',

    // Validation hooks
    'plan-evolution-guard.cjs': '.claude/hooks/validation/plan-evolution-guard.cjs',

    // Monitoring hooks
    'metrics-collector.cjs': '.claude/hooks/monitoring/metrics-collector.cjs',

    // Cost tracking hooks
    'llm-usage-tracker.cjs': '.claude/hooks/cost-tracking/llm-usage-tracker.cjs',
  },
};

// Find all test files
function findTestFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTestFiles(fullPath, files);
    } else if (entry.isFile() && (entry.name.endsWith('.test.cjs') || entry.name.endsWith('.test.mjs'))) {
      files.push(fullPath);
    }
  }
  return files;
}

// Fix a single file's imports
function fixFileImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Determine which mapping to use based on file location
  const relPath = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');

  // For tests/hooks/*
  if (relPath.startsWith('tests/hooks/')) {
    const mapping = PATH_MAPPINGS['tests/hooks'];

    // Fix require('./xxx.cjs') patterns
    content = content.replace(/require\(['"]\.\/([a-z0-9-]+\.cjs)['"]\)/g, (match, filename) => {
      if (mapping[filename]) {
        modified = true;
        return `require('../../${mapping[filename]}')`;
      }
      return match;
    });

    // Fix require('./validators/xxx.cjs') patterns
    content = content.replace(/require\(['"]\.\/validators\/([a-z0-9-]+\.cjs)['"]\)/g, (match, filename) => {
      const key = `validators/${filename}`;
      if (mapping[key]) {
        modified = true;
        return `require('../../${mapping[key]}')`;
      }
      return match;
    });

    // Fix require.resolve('./xxx.cjs') patterns
    content = content.replace(/require\.resolve\(['"]\.\/([a-z0-9-]+\.cjs)['"]\)/g, (match, filename) => {
      if (mapping[filename]) {
        modified = true;
        return `require.resolve('../../${mapping[filename]}')`;
      }
      return match;
    });
  }

  if (modified && !DRY_RUN) {
    fs.writeFileSync(filePath, content, 'utf8');
  }

  return modified;
}

// Main
function main() {
  console.log('='.repeat(60));
  console.log('FIX ALL TEST IMPORTS');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const hooksDir = path.join(PROJECT_ROOT, 'tests', 'hooks');
  const testFiles = findTestFiles(hooksDir);

  let fixed = 0;
  for (const filePath of testFiles) {
    const wasFixed = fixFileImports(filePath);
    if (wasFixed) {
      fixed++;
      if (VERBOSE) {
        console.log(`  Fixed: ${path.relative(PROJECT_ROOT, filePath)}`);
      }
    }
  }

  console.log(`\nFixed ${fixed} files`);
  if (DRY_RUN) {
    console.log('This was a DRY RUN.');
  }
}

main();
