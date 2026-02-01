/**
 * SPEC-015: Migration Tool Validation
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { migrateState } = require('../../.claude/tools/cli/conductor-state-migrate.cjs');

const TEST_DIR = path.resolve(__dirname, '../../.claude/context/test-migration');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

describe('SPEC-015: Conductor State Migration', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
    ensureDir(TEST_DIR);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('transforms legacy state to new schema structure', () => {
    const legacy = {
      project_name: 'test-project',
      current_step: 'phase-integration',
      completed_phases: ['phase-setup', 'phase-implementation'],
      metadata: { owner: 'user1' },
    };

    const migrated = migrateState(legacy);

    assert.equal(migrated.workflowId, 'test-project');
    assert.equal(migrated.currentPhase, 'phase-integration');

    // Check completed phases
    assert.ok(migrated.phases['phase-setup']);
    assert.equal(migrated.phases['phase-setup'].status, 'completed');

    // Check active phase
    assert.ok(migrated.phases['phase-integration']);
    assert.equal(migrated.phases['phase-integration'].status, 'active');

    // Check context preservation
    assert.equal(migrated.context.legacyData.owner, 'user1');
  });

  it('CLI writes output file correctly', () => {
    // This simulates the CLI behavior (reading/writing files) but calls logic directly/via helper
    // to avoid spawning sub-processes if possible, or we can use child_process if strict CLI testing is needed.
    // For unit/integration overlap, validating the file I/O wrapper is sufficient here.

    const inputFile = path.join(TEST_DIR, 'legacy.json');
    const outputFile = path.join(TEST_DIR, 'migrated.json');

    const legacy = {
      project_name: 'cli-test',
      current_step: 'start',
      completed_phases: [],
    };

    fs.writeFileSync(inputFile, JSON.stringify(legacy));

    // Call the main logic via require (simulating CLI args parsing logic is tested implicitly if we invoke via node,
    // but let's test the programmatic flow here for speed/cleanliness).

    // Actually, let's use the spawn method to be truly integration-like for the CLI.
    const child_process = require('child_process');
    const cliPath = path.resolve(__dirname, '../../.claude/tools/cli/conductor-state-migrate.cjs');

    child_process.execSync(`node "${cliPath}" --input "${inputFile}" --output "${outputFile}"`);

    assert.ok(fs.existsSync(outputFile));
    const output = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    assert.equal(output.workflowId, 'cli-test');
  });
});
