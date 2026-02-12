#!/usr/bin/env node
/**
 * Tests for post-task-unified.cjs
 *
 * Consolidated PostToolUse(Task) hook that combines:
 * 1. agent-context-tracker.cjs - Agent mode tracking
 * 2. session-memory-extractor.cjs - Session memory extraction
 * 3. task-completion-guard.cjs - Task completion warning
 * 4. evolution-audit.cjs - Evolution auditing
 */

'use strict';

const { describe, it, beforeEach, afterEach, _mock } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Store original functions before importing module
const originalExit = process.exit;
const originalArgv = [...process.argv];

// Mock process.exit to prevent test termination
let exitCode = null;
process.exit = code => {
  exitCode = code;
};

// Import the module under test
const unifiedHook = require('../../.claude/hooks/routing/post-task-unified.cjs');

// Restore after import
process.exit = originalExit;

describe('post-task-unified.cjs', () => {
  let recoveryQueueBackup = null;

  beforeEach(() => {
    // Reset exit code
    exitCode = null;
    // Reset argv
    process.argv = [...originalArgv];
    // Clear environment variables
    delete process.env.ROUTER_DEBUG;
    delete process.env.DEBUG_HOOKS;
    delete process.env.TASK_COMPLETION_GUARD;
    delete process.env.EVOLUTION_AUDIT;

    // Backup and clear recovery queue
    if (fs.existsSync(unifiedHook.TASKUPDATE_RECOVERY_QUEUE_PATH)) {
      recoveryQueueBackup = fs.readFileSync(unifiedHook.TASKUPDATE_RECOVERY_QUEUE_PATH, 'utf8');
      fs.unlinkSync(unifiedHook.TASKUPDATE_RECOVERY_QUEUE_PATH);
    } else {
      recoveryQueueBackup = null;
    }
  });

  afterEach(() => {
    // Restore argv
    process.argv = [...originalArgv];

    // Restore recovery queue
    if (recoveryQueueBackup === null) {
      if (fs.existsSync(unifiedHook.TASKUPDATE_RECOVERY_QUEUE_PATH)) {
        fs.unlinkSync(unifiedHook.TASKUPDATE_RECOVERY_QUEUE_PATH);
      }
    } else {
      const dir = path.dirname(unifiedHook.TASKUPDATE_RECOVERY_QUEUE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(unifiedHook.TASKUPDATE_RECOVERY_QUEUE_PATH, recoveryQueueBackup, 'utf8');
    }
  });

  describe('Module exports', () => {
    it('should export all required functions', () => {
      // From agent-context-tracker
      assert.strictEqual(typeof unifiedHook.extractTaskDescription, 'function');
      assert.strictEqual(typeof unifiedHook.isPlannerSpawn, 'function');
      assert.strictEqual(typeof unifiedHook.isSecuritySpawn, 'function');

      // From extract-workflow-learnings
      assert.strictEqual(typeof unifiedHook.isWorkflowComplete, 'function');
      assert.strictEqual(typeof unifiedHook.extractLearnings, 'function');
      assert.strictEqual(typeof unifiedHook.appendLearnings, 'function');
      assert.ok(Array.isArray(unifiedHook.WORKFLOW_COMPLETE_MARKERS));
      assert.ok(Array.isArray(unifiedHook.LEARNING_PATTERNS));

      // From session-memory-extractor
      assert.strictEqual(typeof unifiedHook.extractPatterns, 'function');
      assert.strictEqual(typeof unifiedHook.extractGotchas, 'function');
      assert.strictEqual(typeof unifiedHook.extractDiscoveries, 'function');

      // From task-completion-guard
      assert.strictEqual(typeof unifiedHook.detectsCompletion, 'function');
      assert.strictEqual(typeof unifiedHook.extractExpectedArtifactPaths, 'function');
      assert.strictEqual(typeof unifiedHook.getMissingArtifacts, 'function');
      assert.strictEqual(typeof unifiedHook.synthesizeRecoveryTaskUpdate, 'function');
      assert.ok(Array.isArray(unifiedHook.COMPLETION_INDICATORS));

      // From evolution-audit
      assert.strictEqual(typeof unifiedHook.isEvolutionCompletion, 'function');
      assert.strictEqual(typeof unifiedHook.getLatestEvolution, 'function');
      assert.strictEqual(typeof unifiedHook.formatAuditEntry, 'function');
    });

    it('should export PROJECT_ROOT', () => {
      assert.ok(unifiedHook.PROJECT_ROOT);
      assert.strictEqual(typeof unifiedHook.PROJECT_ROOT, 'string');
    });
  });

  describe('Agent Context Tracking', () => {
    describe('extractTaskDescription', () => {
      it('should return description if provided', () => {
        const input = { description: 'Test task description' };
        assert.strictEqual(unifiedHook.extractTaskDescription(input), 'Test task description');
      });

      it('should extract first line from prompt if no description', () => {
        const input = { prompt: 'First line\nSecond line' };
        assert.strictEqual(unifiedHook.extractTaskDescription(input), 'First line');
      });

      it('should truncate long prompts', () => {
        const longPrompt = 'A'.repeat(150);
        const input = { prompt: longPrompt };
        const result = unifiedHook.extractTaskDescription(input);
        assert.ok(result.length <= 103); // 100 chars + "..."
        assert.ok(result.endsWith('...'));
      });

      it('should use subagent_type as fallback', () => {
        const input = { subagent_type: 'developer' };
        assert.strictEqual(unifiedHook.extractTaskDescription(input), 'developer agent');
      });

      it('should return default for empty input', () => {
        assert.strictEqual(unifiedHook.extractTaskDescription(null), 'Task spawned');
        assert.strictEqual(unifiedHook.extractTaskDescription({}), 'Task spawned');
      });
    });

    describe('isPlannerSpawn', () => {
      it('should detect planner by subagent_type', () => {
        assert.strictEqual(unifiedHook.isPlannerSpawn({ subagent_type: 'planner' }), true);
        assert.strictEqual(unifiedHook.isPlannerSpawn({ subagent_type: 'plan' }), true);
      });

      it('should detect planner by description', () => {
        assert.strictEqual(
          unifiedHook.isPlannerSpawn({ description: 'Planner designing feature' }),
          true
        );
      });

      it('should detect planner by prompt', () => {
        assert.strictEqual(
          unifiedHook.isPlannerSpawn({ prompt: 'You are PLANNER. Design...' }),
          true
        );
        assert.strictEqual(
          unifiedHook.isPlannerSpawn({ prompt: 'You are the PLANNER agent.' }),
          true
        );
      });

      it('should return false for non-planner', () => {
        assert.strictEqual(unifiedHook.isPlannerSpawn({ subagent_type: 'developer' }), false);
        assert.strictEqual(unifiedHook.isPlannerSpawn(null), false);
      });
    });

    describe('isSecuritySpawn', () => {
      it('should detect security by subagent_type', () => {
        assert.strictEqual(unifiedHook.isSecuritySpawn({ subagent_type: 'security' }), true);
        assert.strictEqual(
          unifiedHook.isSecuritySpawn({ subagent_type: 'security-architect' }),
          true
        );
      });

      it('should detect security by description', () => {
        assert.strictEqual(
          unifiedHook.isSecuritySpawn({ description: 'Security reviewing auth' }),
          true
        );
      });

      it('should detect security by prompt', () => {
        assert.strictEqual(
          unifiedHook.isSecuritySpawn({ prompt: 'You are SECURITY-ARCHITECT.' }),
          true
        );
      });

      it('should return false for non-security', () => {
        assert.strictEqual(unifiedHook.isSecuritySpawn({ subagent_type: 'developer' }), false);
        assert.strictEqual(unifiedHook.isSecuritySpawn(null), false);
      });
    });
  });

  describe('Workflow Learning Extraction', () => {
    describe('isWorkflowComplete', () => {
      it('should detect workflow completion markers', () => {
        assert.strictEqual(unifiedHook.isWorkflowComplete('workflow complete'), true);
        assert.strictEqual(unifiedHook.isWorkflowComplete('All phases complete'), true);
        assert.strictEqual(unifiedHook.isWorkflowComplete('implementation complete'), true);
      });

      it('should be case-insensitive', () => {
        assert.strictEqual(unifiedHook.isWorkflowComplete('WORKFLOW COMPLETE'), true);
        assert.strictEqual(unifiedHook.isWorkflowComplete('Workflow Complete'), true);
      });

      it('should return false for non-completion text', () => {
        assert.strictEqual(unifiedHook.isWorkflowComplete('starting workflow'), false);
        assert.strictEqual(unifiedHook.isWorkflowComplete(''), false);
        assert.strictEqual(unifiedHook.isWorkflowComplete(null), false);
      });
    });

    describe('extractLearnings', () => {
      it('should extract learnings from text', () => {
        const text = 'Learned: always use atomic writes for state files';
        const learnings = unifiedHook.extractLearnings(text);
        assert.ok(learnings.length > 0);
        assert.ok(learnings.some(l => l.includes('atomic writes')));
      });

      it('should extract multiple learning types', () => {
        const text = `
          Discovered: shared utilities reduce code duplication
          Pattern: use TTL caching for state files
          Best practice: validate input before processing
        `;
        const learnings = unifiedHook.extractLearnings(text);
        assert.ok(learnings.length >= 2);
      });

      it('should return empty array for no learnings', () => {
        const learnings = unifiedHook.extractLearnings('just some random text');
        assert.ok(Array.isArray(learnings));
      });

      it('should handle null/empty input', () => {
        assert.deepStrictEqual(unifiedHook.extractLearnings(null), []);
        assert.deepStrictEqual(unifiedHook.extractLearnings(''), []);
      });
    });
  });

  describe('Session Memory Extraction', () => {
    describe('extractPatterns', () => {
      it('should extract patterns from text', () => {
        const text = 'Pattern: use dependency injection for testability';
        const patterns = unifiedHook.extractPatterns(text);
        assert.ok(patterns.length > 0);
      });

      it('should limit to 3 patterns', () => {
        const text = `
          Pattern: one
          Pattern: two that is long enough
          Pattern: three that is also long
          Pattern: four that should be ignored
          Pattern: five that should also be ignored
        `;
        const patterns = unifiedHook.extractPatterns(text);
        assert.ok(patterns.length <= 3);
      });
    });

    describe('extractGotchas', () => {
      it('should extract gotchas from text', () => {
        const text = 'Gotcha: null check before accessing properties';
        const gotchas = unifiedHook.extractGotchas(text);
        assert.ok(gotchas.length > 0);
      });

      it('should extract bug fixes', () => {
        const text = 'Bug: off-by-one error in loop iteration';
        const gotchas = unifiedHook.extractGotchas(text);
        assert.ok(gotchas.length > 0);
      });
    });

    describe('extractDiscoveries', () => {
      it('should extract file discoveries', () => {
        const text = '`router-state.cjs`: handles router mode state management';
        const discoveries = unifiedHook.extractDiscoveries(text);
        assert.ok(discoveries.length > 0);
        assert.ok(discoveries[0].path);
        assert.ok(discoveries[0].description);
      });
    });
  });

  describe('Task Completion Detection', () => {
    describe('detectsCompletion', () => {
      it('should detect completion phrases', () => {
        assert.strictEqual(unifiedHook.detectsCompletion('Task completed successfully'), true);
        assert.strictEqual(unifiedHook.detectsCompletion('All tests pass'), true);
        assert.strictEqual(unifiedHook.detectsCompletion('## Summary'), true);
        assert.strictEqual(
          unifiedHook.detectsCompletion('I have successfully completed the task'),
          true
        );
      });

      it('should not detect non-completion text', () => {
        assert.strictEqual(unifiedHook.detectsCompletion('starting work'), false);
        assert.strictEqual(unifiedHook.detectsCompletion(''), false);
      });

      it('should handle non-string input', () => {
        assert.strictEqual(unifiedHook.detectsCompletion(null), false);
        assert.strictEqual(unifiedHook.detectsCompletion(123), false);
        assert.strictEqual(unifiedHook.detectsCompletion({}), false);
      });
    });
  });

  describe('Task Completion Guard Enforcement', () => {
    it('should block by default when completion detected without matching TaskUpdate(completed)', () => {
      const routerState = require('../../.claude/lib/routing/router-state.cjs');
      const originalGetLast = routerState.getLastTaskUpdate;
      routerState.getLastTaskUpdate = () => ({
        timestamp: Date.now(),
        taskId: 'task-other',
        status: 'in_progress',
        count: 1,
      });

      const result = unifiedHook.runTaskCompletionGuard('Task completed successfully', 'task-123');
      assert.strictEqual(result.pass, false);
      assert.strictEqual(result.result, 'block');
      assert.ok(String(result.message || '').includes('TaskUpdate'));

      const queueContent = fs.readFileSync(unifiedHook.TASKUPDATE_RECOVERY_QUEUE_PATH, 'utf8');
      assert.ok(queueContent.includes('missing_taskupdate_completed'));

      routerState.getLastTaskUpdate = originalGetLast;
    });

    it('should pass when matching TaskUpdate(completed) exists', () => {
      const routerState = require('../../.claude/lib/routing/router-state.cjs');
      const originalGetLast = routerState.getLastTaskUpdate;
      routerState.getLastTaskUpdate = () => ({
        timestamp: Date.now(),
        taskId: 'task-123',
        status: 'completed',
        count: 2,
      });

      const result = unifiedHook.runTaskCompletionGuard('Task completed successfully', 'task-123');
      assert.strictEqual(result.pass, true);

      routerState.getLastTaskUpdate = originalGetLast;
    });

    it('should warn (not block) when TASK_COMPLETION_GUARD=warn', () => {
      const routerState = require('../../.claude/lib/routing/router-state.cjs');
      const originalGetLast = routerState.getLastTaskUpdate;
      routerState.getLastTaskUpdate = () => ({
        timestamp: Date.now() - 5 * 60 * 1000,
        taskId: 'task-123',
        status: 'completed',
        count: 2,
      });
      process.env.TASK_COMPLETION_GUARD = 'warn';

      const result = unifiedHook.runTaskCompletionGuard('Task completed successfully', 'task-123');
      assert.strictEqual(result.pass, true);
      assert.strictEqual(result.result, 'warn');

      routerState.getLastTaskUpdate = originalGetLast;
    });

    it('should block when expected report artifact is missing', () => {
      const routerState = require('../../.claude/lib/routing/router-state.cjs');
      const originalGetLast = routerState.getLastTaskUpdate;
      routerState.getLastTaskUpdate = () => ({
        timestamp: Date.now(),
        taskId: 'task-123',
        status: 'completed',
        count: 2,
      });

      const toolInput = {
        prompt:
          'Write a detailed report to: `.claude/context/reports/code-quality-scan-2026-02-11.md`',
      };
      const result = unifiedHook.runTaskCompletionGuard(
        'Task completed successfully',
        'task-123',
        toolInput
      );
      assert.strictEqual(result.pass, false);
      assert.ok(String(result.message || '').includes('missing'));
      assert.ok(String(result.message || '').includes('.claude/context/reports/'));

      const queueContent = fs.readFileSync(unifiedHook.TASKUPDATE_RECOVERY_QUEUE_PATH, 'utf8');
      assert.ok(queueContent.includes('missing_expected_artifact'));

      routerState.getLastTaskUpdate = originalGetLast;
    });
  });

  describe('Artifact Contract Helpers', () => {
    it('extractExpectedArtifactPaths reads report paths from prompt', () => {
      const paths = unifiedHook.extractExpectedArtifactPaths({
        prompt:
          'Write report to: `.claude/context/reports/test-coverage-scan-2026-02-11.md` and include summary.',
      });
      assert.ok(paths.includes('.claude/context/reports/test-coverage-scan-2026-02-11.md'));
    });

    it('getMissingArtifacts returns only missing paths', () => {
      const rel = '.claude/context/reports/tmp-post-task-unified-artifact.md';
      const abs = path.join(unifiedHook.PROJECT_ROOT, rel);
      const dir = path.dirname(abs);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(abs, 'ok', 'utf8');
      try {
        const missing = unifiedHook.getMissingArtifacts([
          rel,
          '.claude/context/reports/does-not-exist.md',
        ]);
        assert.ok(!missing.includes(rel));
        assert.ok(missing.includes('.claude/context/reports/does-not-exist.md'));
      } finally {
        fs.unlinkSync(abs);
      }
    });

    it('synthesizeRecoveryTaskUpdate appends queue entry', () => {
      const ok = unifiedHook.synthesizeRecoveryTaskUpdate(
        'task-42',
        'missing_taskupdate_completed',
        'retry',
        { test: true }
      );
      assert.strictEqual(ok, true);
      const queueContent = fs.readFileSync(unifiedHook.TASKUPDATE_RECOVERY_QUEUE_PATH, 'utf8');
      assert.ok(queueContent.includes('task-42'));
      assert.ok(queueContent.includes('missing_taskupdate_completed'));
    });

    it('ingestExpectedReportFindings parses and stores unresolved findings from completed report artifacts', () => {
      const rel = '.claude/context/reports/tmp-post-task-unified-findings.md';
      const abs = path.join(unifiedHook.PROJECT_ROOT, rel);
      const dir = path.dirname(abs);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        abs,
        ['# Audit', 'P0 — Critical', '1. Command injection bypass in validator'].join('\n'),
        'utf8'
      );

      try {
        const result = unifiedHook.ingestExpectedReportFindings([rel], {
          taskId: 'task-991',
          agentType: 'code-reviewer',
        });
        assert.equal(typeof result.ingested, 'number');
        assert.equal(result.errors.length, 0);

        const findingsPath = path.join(
          unifiedHook.PROJECT_ROOT,
          '.claude',
          'context',
          'memory',
          'open-findings.json'
        );
        assert.equal(fs.existsSync(findingsPath), true);
        const payload = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
        assert.equal(Array.isArray(payload.findings), true);
        assert.equal(
          payload.findings.some(f => String(f.summary).includes('Command injection')),
          true
        );
      } finally {
        fs.unlinkSync(abs);
      }
    });

    it('resolveFindingsFromTaskCompletion marks matching findings as resolved from completion output', () => {
      const findingsPath = path.join(
        unifiedHook.PROJECT_ROOT,
        '.claude',
        'context',
        'memory',
        'open-findings.json'
      );
      const findingsDir = path.dirname(findingsPath);
      if (!fs.existsSync(findingsDir)) fs.mkdirSync(findingsDir, { recursive: true });

      const original = fs.existsSync(findingsPath) ? fs.readFileSync(findingsPath, 'utf8') : null;
      fs.writeFileSync(
        findingsPath,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            findings: [
              {
                fingerprint: 'xyz123',
                summary: 'Command injection gap in shell validator',
                severity: 'critical',
                status: 'open',
                lastSeenAt: new Date().toISOString(),
              },
            ],
          },
          null,
          2
        ),
        'utf8'
      );

      try {
        const result = unifiedHook.resolveFindingsFromTaskCompletion(
          'Fixed and patched shell validator command injection gap, added regression tests.',
          {
            taskId: 'task-2001',
            agentType: 'developer',
          }
        );
        assert.equal(result.resolved, 1);

        const payload = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
        assert.equal(payload.findings[0].status, 'resolved');
      } finally {
        if (original === null) fs.unlinkSync(findingsPath);
        else fs.writeFileSync(findingsPath, original, 'utf8');
      }
    });
  });

  describe('Evolution Audit', () => {
    describe('isEvolutionCompletion', () => {
      it('should detect enable phase', () => {
        const state = {
          currentEvolution: { phase: 'enable' },
        };
        assert.strictEqual(unifiedHook.isEvolutionCompletion(state), true);
      });

      it('should detect recently completed evolution', () => {
        const state = {
          evolutions: [
            {
              createdAt: new Date().toISOString(),
            },
          ],
        };
        assert.strictEqual(unifiedHook.isEvolutionCompletion(state), true);
      });

      it('should return false for null state', () => {
        assert.strictEqual(unifiedHook.isEvolutionCompletion(null), false);
      });

      it('should return false for old evolutions', () => {
        const oldDate = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 mins ago
        const state = {
          evolutions: [
            {
              createdAt: oldDate,
            },
          ],
        };
        assert.strictEqual(unifiedHook.isEvolutionCompletion(state), false);
      });
    });

    describe('getLatestEvolution', () => {
      it('should get last evolution from array', () => {
        const state = {
          evolutions: [{ name: 'first' }, { name: 'second' }],
        };
        const latest = unifiedHook.getLatestEvolution(state);
        assert.strictEqual(latest.name, 'second');
      });

      it('should fall back to currentEvolution', () => {
        const state = {
          currentEvolution: { name: 'current' },
        };
        const latest = unifiedHook.getLatestEvolution(state);
        assert.strictEqual(latest.name, 'current');
      });

      it('should return null for empty state', () => {
        assert.strictEqual(unifiedHook.getLatestEvolution(null), null);
        assert.strictEqual(unifiedHook.getLatestEvolution({}), null);
      });
    });

    describe('formatAuditEntry', () => {
      it('should format evolution data', () => {
        const evolution = {
          type: 'agent',
          name: 'test-agent',
          path: '.claude/agents/test.md',
          researchReport: 'research.md',
        };
        const entry = unifiedHook.formatAuditEntry(evolution);
        assert.ok(entry.includes('[EVOLUTION]'));
        assert.ok(entry.includes('type=agent'));
        assert.ok(entry.includes('name=test-agent'));
        assert.ok(entry.includes('status=completed'));
      });

      it('should handle null evolution', () => {
        const entry = unifiedHook.formatAuditEntry(null);
        assert.ok(entry.includes('[EVOLUTION]'));
        assert.ok(entry.includes('type=unknown'));
      });
    });
  });

  describe('Unified main function', () => {
    it('should export main function', () => {
      assert.strictEqual(typeof unifiedHook.main, 'function');
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running post-task-unified tests...');
}
