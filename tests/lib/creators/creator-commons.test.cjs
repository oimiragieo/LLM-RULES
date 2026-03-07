#!/usr/bin/env node
/**
 * Tests for creator-commons.cjs
 *
 * TDD RED phase: All tests written before implementation.
 * Tests cover the 5 exported functions:
 * 1. validatePostCreation
 * 2. updateCatalog
 * 3. queueCrossCreatorReview
 * 4. validateSchema
 * 5. runIntegrationChecklist
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

// Module under test
const {
  validatePostCreation,
  updateCatalog,
  queueCrossCreatorReview,
  validateSchema,
  runIntegrationChecklist,
  enhancedIntegrationChecklist,
  verifySkillCreation,
} = require('../../../.claude/lib/creators/creator-commons.cjs');

// Test fixtures
const TMP_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'tmp', 'test-creator-commons');
const QUEUE_PATH = path.join(TMP_DIR, 'integration-queue.jsonl');

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
// validatePostCreation
// =============================================================================

describe('validatePostCreation', () => {
  beforeEach(() => {
    ensureTmpDir();
  });

  afterEach(() => {
    cleanTmpDir();
  });

  it('returns passed when artifact has provenance header', () => {
    const artifactPath = path.join(TMP_DIR, 'test-skill.md');
    fs.writeFileSync(
      artifactPath,
      '<!-- Agent: developer | Task: #1 | Session: 2026-02-08 -->\n# Test Skill\n'
    );

    const result = validatePostCreation('skill', artifactPath);

    assert.ok(Array.isArray(result.passed), 'result.passed should be an array');
    assert.ok(
      result.passed.some(p => p.includes('provenance')),
      'should have provenance check in passed'
    );
  });

  it('returns failed when artifact missing provenance header', () => {
    const artifactPath = path.join(TMP_DIR, 'test-skill.md');
    fs.writeFileSync(artifactPath, '# Test Skill\nNo provenance header here\n');

    const result = validatePostCreation('skill', artifactPath);

    assert.ok(Array.isArray(result.failed), 'result.failed should be an array');
    assert.ok(
      result.failed.some(f => f.includes('provenance')),
      'should have provenance check in failed'
    );
  });

  it('returns failed when artifact file does not exist', () => {
    const artifactPath = path.join(TMP_DIR, 'nonexistent.md');

    const result = validatePostCreation('skill', artifactPath);

    assert.ok(
      result.failed.some(f => f.includes('exist')),
      'should report file does not exist'
    );
  });

  it('returns correct structure with passed, failed, warnings arrays', () => {
    const artifactPath = path.join(TMP_DIR, 'test-agent.md');
    fs.writeFileSync(
      artifactPath,
      '<!-- Agent: developer | Task: #1 | Session: 2026-02-08 -->\n# Agent\n'
    );

    const result = validatePostCreation('agent', artifactPath);

    assert.ok(Array.isArray(result.passed));
    assert.ok(Array.isArray(result.failed));
    assert.ok(Array.isArray(result.warnings));
  });
});

// =============================================================================
// updateCatalog
// =============================================================================

describe('updateCatalog', () => {
  beforeEach(() => {
    ensureTmpDir();
  });

  afterEach(() => {
    cleanTmpDir();
  });

  it('appends entry to existing catalog file', () => {
    const catalogPath = path.join(TMP_DIR, 'test-catalog.md');
    fs.writeFileSync(catalogPath, '# Test Catalog\n\n| Name | Description |\n| --- | --- |\n');

    const result = updateCatalog(catalogPath, '| new-skill | A new skill |\n');

    assert.strictEqual(result.success, true);
    const content = fs.readFileSync(catalogPath, 'utf8');
    assert.ok(content.includes('new-skill'), 'catalog should contain new entry');
  });

  it('returns error when catalog file does not exist', () => {
    const catalogPath = path.join(TMP_DIR, 'nonexistent-catalog.md');

    const result = updateCatalog(catalogPath, '| entry | desc |\n');

    assert.strictEqual(result.success, false);
    assert.ok(result.error, 'should have error message');
  });

  it('preserves existing catalog content', () => {
    const catalogPath = path.join(TMP_DIR, 'test-catalog.md');
    const existingContent = '# Catalog\n\n| existing | entry |\n';
    fs.writeFileSync(catalogPath, existingContent);

    updateCatalog(catalogPath, '| new | entry |\n');

    const content = fs.readFileSync(catalogPath, 'utf8');
    assert.ok(content.includes('existing'), 'should preserve existing content');
    assert.ok(content.includes('new'), 'should include new content');
  });
});

// =============================================================================
// queueCrossCreatorReview
// =============================================================================

describe('queueCrossCreatorReview', () => {
  beforeEach(() => {
    ensureTmpDir();
  });

  afterEach(() => {
    cleanTmpDir();
  });

  it('writes entry to integration queue file', () => {
    const result = queueCrossCreatorReview('skill', '/path/to/skill.md', { queuePath: QUEUE_PATH });

    assert.strictEqual(result.success, true);
    assert.ok(fs.existsSync(QUEUE_PATH), 'queue file should exist');
    const lines = fs.readFileSync(QUEUE_PATH, 'utf8').trim().split('\n');
    assert.ok(lines.length >= 1, 'should have at least one entry');
    const entry = JSON.parse(lines[0]);
    assert.strictEqual(entry.artifactType, 'skill');
  });

  it('appends to existing queue file', () => {
    fs.writeFileSync(QUEUE_PATH, '{"artifactType":"agent","artifactPath":"/existing"}\n');

    queueCrossCreatorReview('skill', '/path/to/skill.md', { queuePath: QUEUE_PATH });

    const lines = fs.readFileSync(QUEUE_PATH, 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 2, 'should have two entries');
  });

  it('includes timestamp in queue entry', () => {
    queueCrossCreatorReview('hook', '/path/to/hook.cjs', { queuePath: QUEUE_PATH });

    const lines = fs.readFileSync(QUEUE_PATH, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);
    assert.ok(entry.timestamp, 'should include timestamp');
    assert.ok(entry.timestamp.match(/^\d{4}-\d{2}-\d{2}/), 'timestamp should be ISO format');
  });
});

// =============================================================================
// validateSchema
// =============================================================================

describe('validateSchema', () => {
  it('validates skill content against skill-definition schema', () => {
    const content = {
      status: 'success',
      output: {
        name: 'test-skill',
        description: 'A test skill that does something useful for testing purposes',
      },
    };

    const result = validateSchema('skill', content);

    assert.strictEqual(result.valid, true);
    assert.ok(Array.isArray(result.errors));
    assert.strictEqual(result.errors.length, 0);
  });

  it('detects missing required field in skill schema', () => {
    const content = {
      status: 'success',
      // missing 'output' field
    };

    const result = validateSchema('skill', content);

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0, 'should have at least one error');
    assert.ok(
      result.errors.some(e => e.includes('output')),
      'error should mention missing output field from lightweight validator'
    );
  });

  it('returns valid:true for unknown artifact type (no schema)', () => {
    const result = validateSchema('unknown-type', { anything: 'goes' });

    assert.strictEqual(result.valid, true);
    assert.ok(
      result.warnings && result.warnings.length > 0,
      'should have warnings about missing schema'
    );
  });

  it('handles malformed content gracefully', () => {
    const result = validateSchema('skill', null);

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
  });
});

// =============================================================================
// runIntegrationChecklist
// =============================================================================

describe('runIntegrationChecklist', () => {
  beforeEach(() => {
    ensureTmpDir();
  });

  afterEach(() => {
    cleanTmpDir();
  });

  it('returns structured result with passed, failed, warnings', () => {
    const artifactPath = path.join(TMP_DIR, 'test-artifact.md');
    fs.writeFileSync(
      artifactPath,
      '<!-- Agent: dev | Task: #1 | Session: 2026-02-08 -->\n# Test\n'
    );

    const result = runIntegrationChecklist('skill', artifactPath);

    assert.ok(Array.isArray(result.passed));
    assert.ok(Array.isArray(result.failed));
    assert.ok(Array.isArray(result.warnings));
  });

  it('includes file existence check in results', () => {
    const artifactPath = path.join(TMP_DIR, 'nonexistent.md');

    const result = runIntegrationChecklist('skill', artifactPath);

    assert.ok(
      result.failed.some(f => f.includes('exist')),
      'should report missing file'
    );
  });

  it('runs all checks and aggregates results', () => {
    const artifactPath = path.join(TMP_DIR, 'good-artifact.md');
    fs.writeFileSync(
      artifactPath,
      '<!-- Agent: dev | Task: #1 | Session: 2026-02-08 -->\n# Good\n'
    );

    const result = runIntegrationChecklist('agent', artifactPath);

    const totalChecks = result.passed.length + result.failed.length + result.warnings.length;
    assert.ok(totalChecks >= 2, 'should run at least 2 checks');
  });
});

// =============================================================================
// Regression: registry.agents is an object not an array (Bug 1 + Bug 2)
// =============================================================================

describe('enhancedIntegrationChecklist — registry.agents object lookup (Bug 1 regression)', () => {
  beforeEach(() => {
    ensureTmpDir();
  });

  afterEach(() => {
    cleanTmpDir();
  });

  it('registry.agents keyed-by-id: finds an existing agent by key', () => {
    // Reproduce the exact shape of the real agent-registry.json
    const registry = {
      agents: {
        'my-agent': { id: 'my-agent', displayName: 'My Agent' },
      },
    };
    const registryPath = path.join(TMP_DIR, 'agent-registry.json');
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));

    const artifactPath = path.join(TMP_DIR, 'my-agent.md');
    fs.writeFileSync(
      artifactPath,
      '<!-- Agent: developer | Task: #1 | Session: 2026-03-07 -->\n# My Agent\n'
    );

    const result = enhancedIntegrationChecklist('agent', artifactPath, {
      artifactName: 'my-agent',
      registryPath,
    });

    // Bug 1 was: registry['my-agent'] (top-level key) instead of registry.agents['my-agent']
    // With the fix, the lookup should succeed and find the entry.
    assert.ok(
      result.passed.some(p => p.includes('registry entry found')),
      `expected "registry entry found" in passed; got: ${JSON.stringify(result.passed)}`
    );
    assert.ok(
      !result.failed.some(f => f.includes('Missing agent-registry entry')),
      `should NOT have a missing-entry failure; failed: ${JSON.stringify(result.failed)}`
    );
  });

  it('registry.agents keyed-by-id: reports missing when agent is not present', () => {
    const registry = {
      agents: {
        'other-agent': { id: 'other-agent', displayName: 'Other Agent' },
      },
    };
    const registryPath = path.join(TMP_DIR, 'agent-registry.json');
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));

    const artifactPath = path.join(TMP_DIR, 'nonexistent-agent.md');
    fs.writeFileSync(
      artifactPath,
      '<!-- Agent: developer | Task: #1 | Session: 2026-03-07 -->\n# Nonexistent Agent\n'
    );

    const result = enhancedIntegrationChecklist('agent', artifactPath, {
      artifactName: 'nonexistent-agent',
      registryPath,
    });

    assert.ok(
      result.failed.some(f => f.includes('Missing agent-registry entry')),
      `expected missing-entry failure; failed: ${JSON.stringify(result.failed)}`
    );
  });
});

describe('verifySkillCreation — Object.values(registry.agents) iteration (Bug 2 regression)', () => {
  beforeEach(() => {
    ensureTmpDir();
  });

  afterEach(() => {
    cleanTmpDir();
  });

  it('registry.agents is an object not an array', () => {
    const registry = require('../../../.claude/context/agent-registry.json');
    assert.ok(
      registry.agents && typeof registry.agents === 'object',
      'registry.agents must exist and be an object'
    );
    assert.strictEqual(
      Array.isArray(registry.agents),
      false,
      'registry.agents must NOT be an array — it is keyed by agent ID'
    );
  });

  it('Object.values(registry.agents) iterates all agents', () => {
    const registry = require('../../../.claude/context/agent-registry.json');
    const values = Object.values(registry.agents);
    assert.ok(values.length > 0, 'should have at least one agent');
    // Every value should be an object with an id field
    for (const agent of values) {
      assert.ok(
        agent && typeof agent === 'object',
        `each agent entry must be an object, got: ${typeof agent}`
      );
    }
  });

  it('agent lookup by ID works via registry.agents[id]', () => {
    const registry = require('../../../.claude/context/agent-registry.json');
    const firstKey = Object.keys(registry.agents)[0];
    const agent = registry.agents[firstKey];
    assert.ok(agent, `registry.agents['${firstKey}'] should return the agent object`);
    assert.ok(
      agent.id || agent.displayName || agent.filePath,
      'agent object should have at least one known field'
    );
  });

  it('verifySkillCreation iterates object-shaped registry without skipping agents (Bug 2 fix)', () => {
    // Build a fake registry where one agent has the skill assigned
    const skillName = 'test-regression-skill-xyz';
    const registry = {
      agents: {
        'agent-with-skill': {
          id: 'agent-with-skill',
          skills: [skillName],
        },
        'agent-without-skill': {
          id: 'agent-without-skill',
          skills: [],
        },
      },
    };
    const registryPath = path.join(TMP_DIR, 'agent-registry.json');
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));

    // Create a minimal skill directory so file-existence checks pass
    const skillsDir = path.join(TMP_DIR, 'skills');
    const skillDir = path.join(skillsDir, skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '<!-- Agent: developer | Task: #1 | Session: 2026-03-07 -->\n# Test Regression Skill\n'
    );

    const result = verifySkillCreation(skillName, {
      skillsDir,
      registryPath,
      catalogPath: path.join(TMP_DIR, 'nonexistent-catalog.md'), // skip catalog check
    });

    // Bug 2 was: Array.isArray(agents) guard always evaluated false for object-shaped registry
    // causing the for-loop to iterate [] and never find the assignment, producing a false warning.
    // With the fix, Object.values() is used and the assignment IS found.
    assert.ok(
      result.passed.some(p => p.includes('agent assignment found')),
      `expected "agent assignment found" in passed; got passed=${JSON.stringify(result.passed)}, warnings=${JSON.stringify(result.warnings)}`
    );
    assert.ok(
      !result.warnings.some(w => w.includes('No agent assignment found')),
      `should NOT warn about missing assignment when agent has the skill; warnings: ${JSON.stringify(result.warnings)}`
    );
  });
});
