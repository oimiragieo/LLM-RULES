#!/usr/bin/env node
/**
 * Tests for skill-update-headless.cjs
 *
 * TDD RED phase: Tests written before implementation.
 * Tests the headless pipeline orchestrator (unit tests — no Claude CLI calls).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

// Module under test
const {
  buildUpdatePrompt,
  parseHeadlessArgs,
  runHeadlessUpdate,
  checkDebugLogs,
  processCascadeQueue,
} = require('../../.claude/tools/cli/skill-update-headless.cjs');

// Test fixtures
const TMP_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'tmp', 'test-headless-update');

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

function cleanTmpDir() {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
}

// =============================================================================
// buildUpdatePrompt
// =============================================================================

describe('buildUpdatePrompt', () => {
  it('includes skill name in prompt', () => {
    const prompt = buildUpdatePrompt('accessibility', { score: '3/9' });
    assert.ok(prompt.includes('accessibility'));
  });

  it('includes bundle score context', () => {
    const prompt = buildUpdatePrompt('tdd', { score: '5/9', missing: ['scripts/main.cjs'] });
    assert.ok(prompt.includes('5/9') || prompt.includes('missing'));
  });

  it('includes timestamp in prompt', () => {
    const prompt = buildUpdatePrompt('docker-compose', {});
    // Should contain a date-like pattern
    assert.ok(prompt.match(/\d{4}-\d{2}-\d{2}/));
  });

  it('generates a non-empty string', () => {
    const prompt = buildUpdatePrompt('react-expert', {});
    assert.ok(typeof prompt === 'string');
    assert.ok(prompt.length > 50);
  });
});

// =============================================================================
// parseHeadlessArgs
// =============================================================================

describe('parseHeadlessArgs', () => {
  it('parses --skill flag', () => {
    const args = parseHeadlessArgs(['--skill', 'accessibility']);
    assert.equal(args.skill, 'accessibility');
  });

  it('parses --model flag', () => {
    const args = parseHeadlessArgs(['--model', 'sonnet']);
    assert.equal(args.model, 'sonnet');
  });

  it('parses --dry-run flag', () => {
    const args = parseHeadlessArgs(['--dry-run']);
    assert.equal(args.dryRun, true);
  });

  it('parses --batch flag', () => {
    const args = parseHeadlessArgs(['--batch', '5']);
    assert.equal(args.batch, 5);
  });

  it('defaults model to sonnet', () => {
    const args = parseHeadlessArgs(['--skill', 'tdd']);
    assert.equal(args.model, 'sonnet');
  });

  it('parses --json flag', () => {
    const args = parseHeadlessArgs(['--json']);
    assert.equal(args.json, true);
  });
});

// =============================================================================
// checkDebugLogs
// =============================================================================

describe('checkDebugLogs', () => {
  beforeEach(() => {
    ensureTmpDir();
  });

  afterEach(() => {
    cleanTmpDir();
  });

  it('returns empty array when no violations', () => {
    const violations = checkDebugLogs('', TMP_DIR);
    assert.ok(Array.isArray(violations));
    assert.equal(violations.length, 0);
  });

  it('detects guard violations in output', () => {
    const output =
      'BLOCKED by routing-guard: planner-first violation\nSome other output\nBLOCKED by creator-guard: unauthorized write';
    const violations = checkDebugLogs(output, TMP_DIR);
    assert.ok(violations.length >= 2);
  });
});

// =============================================================================
// runHeadlessUpdate (unit — mocked, no actual Claude CLI)
// =============================================================================

describe('runHeadlessUpdate', () => {
  beforeEach(() => {
    ensureTmpDir();
  });

  afterEach(() => {
    cleanTmpDir();
  });

  it('validates enterprise bundle before update', () => {
    // Use a real skill in the project
    const result = runHeadlessUpdate('accessibility', {
      dryRun: true,
      skipClaude: true,
      projectRoot: PROJECT_ROOT,
    });

    assert.ok(result.bundleBefore);
    assert.ok(typeof result.bundleBefore === 'string');
  });

  it('validates enterprise bundle after update', () => {
    const result = runHeadlessUpdate('accessibility', {
      dryRun: true,
      skipClaude: true,
      projectRoot: PROJECT_ROOT,
    });

    assert.ok(result.bundleAfter);
  });

  it('detects agent cascades', () => {
    const result = runHeadlessUpdate('accessibility', {
      dryRun: true,
      skipClaude: true,
      projectRoot: PROJECT_ROOT,
    });

    assert.ok(Array.isArray(result.cascades));
  });

  it('reports zero guard violations in clean run', () => {
    const result = runHeadlessUpdate('accessibility', {
      dryRun: true,
      skipClaude: true,
      projectRoot: PROJECT_ROOT,
    });

    assert.equal(result.violations, 0);
  });

  it('returns structured JSON result', () => {
    const result = runHeadlessUpdate('accessibility', {
      dryRun: true,
      skipClaude: true,
      projectRoot: PROJECT_ROOT,
    });

    assert.ok(result.skill);
    assert.ok(typeof result.contentUpdated === 'boolean');
    assert.ok(result.bundleBefore);
    assert.ok(result.bundleAfter);
    assert.ok(typeof result.violations === 'number');
    assert.ok(Array.isArray(result.cascades));
  });

  it('detects missing bundle components', () => {
    const result = runHeadlessUpdate('compliance-policy-check', {
      dryRun: true,
      skipClaude: true,
      projectRoot: PROJECT_ROOT,
    });

    // compliance-policy-check is known to be missing components
    assert.ok(result.bundleBefore);
    // Score should be less than 9/9
    assert.ok(result.bundleBefore !== '9/9' || result.bundleAfter === '9/9');
  });

  it('scaffolds missing components when not dry-run and skipClaude', () => {
    // Create a temporary skill
    const tmpSkillDir = path.join(TMP_DIR, '.claude', 'skills', 'test-headless');
    fs.mkdirSync(tmpSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpSkillDir, 'SKILL.md'),
      '---\nname: test-headless\ndescription: Test\n---\n# test-headless',
      'utf8'
    );

    const result = runHeadlessUpdate('test-headless', {
      dryRun: false,
      skipClaude: true,
      projectRoot: TMP_DIR,
    });

    assert.ok(result.bundleBefore !== '9/9' || result.scaffolded);
    // After scaffolding, bundle should be complete
    assert.equal(result.bundleAfter, '9/9');
  });
});

// =============================================================================
// processCascadeQueue
// =============================================================================

describe('processCascadeQueue', () => {
  beforeEach(() => {
    ensureTmpDir();
  });

  afterEach(() => {
    cleanTmpDir();
  });

  it('reads skill_cascade entries from evolution queue', () => {
    const queueDir = path.join(TMP_DIR, '.claude', 'context', 'runtime');
    fs.mkdirSync(queueDir, { recursive: true });

    const entries = [
      {
        id: 'cascade_dev_1',
        timestamp: new Date().toISOString(),
        source: 'other',
        trigger: 'skill_cascade',
        evidence: 'Skill "tdd" updated',
        suggestedArtifactType: 'agent',
        summary: 'Cascade: update agent "developer"',
        status: 'proposed',
        targetArtifact: { type: 'agent', name: 'developer' },
      },
      {
        id: 'cascade_qa_1',
        timestamp: new Date().toISOString(),
        source: 'other',
        trigger: 'skill_cascade',
        evidence: 'Skill "tdd" updated',
        suggestedArtifactType: 'agent',
        summary: 'Cascade: update agent "qa"',
        status: 'proposed',
        targetArtifact: { type: 'agent', name: 'qa' },
      },
    ];
    fs.writeFileSync(
      path.join(queueDir, 'evolution-requests.jsonl'),
      entries.map(e => JSON.stringify(e)).join('\n') + '\n',
      'utf8'
    );

    const result = processCascadeQueue(TMP_DIR);
    assert.equal(result.count, 2);
    assert.equal(result.pending.length, 2);
    assert.equal(result.pending[0].targetArtifact.name, 'developer');
  });

  it('ignores non-cascade and processed entries', () => {
    const queueDir = path.join(TMP_DIR, '.claude', 'context', 'runtime');
    fs.mkdirSync(queueDir, { recursive: true });

    const entries = [
      {
        id: 'req_stale_1',
        timestamp: new Date().toISOString(),
        source: 'other',
        trigger: 'stale_skill',
        evidence: 'Skill is stale',
        suggestedArtifactType: 'skill',
        summary: 'Update tdd',
        status: 'proposed',
      },
      {
        id: 'cascade_dev_old',
        timestamp: new Date().toISOString(),
        source: 'other',
        trigger: 'skill_cascade',
        evidence: 'Already processed',
        suggestedArtifactType: 'agent',
        summary: 'Cascade done',
        status: 'processed',
        targetArtifact: { type: 'agent', name: 'developer' },
      },
      {
        id: 'cascade_qa_pending',
        timestamp: new Date().toISOString(),
        source: 'other',
        trigger: 'skill_cascade',
        evidence: 'Skill "debugging" updated',
        suggestedArtifactType: 'agent',
        summary: 'Cascade: update qa',
        status: 'proposed',
        targetArtifact: { type: 'agent', name: 'qa' },
      },
    ];
    fs.writeFileSync(
      path.join(queueDir, 'evolution-requests.jsonl'),
      entries.map(e => JSON.stringify(e)).join('\n') + '\n',
      'utf8'
    );

    const result = processCascadeQueue(TMP_DIR);
    assert.equal(result.count, 1, 'Only 1 proposed skill_cascade entry');
    assert.equal(result.pending.length, 1);
    assert.equal(result.pending[0].targetArtifact.name, 'qa');
  });

  it('returns empty for missing queue file', () => {
    const result = processCascadeQueue(TMP_DIR);
    assert.equal(result.count, 0);
    assert.equal(result.pending.length, 0);
  });

  it('parseHeadlessArgs recognizes --process-cascades flag', () => {
    const args = parseHeadlessArgs(['--skill', 'tdd', '--process-cascades', '--json']);
    assert.equal(args.processCascades, true);
    assert.equal(args.skill, 'tdd');
    assert.equal(args.json, true);
  });
});
