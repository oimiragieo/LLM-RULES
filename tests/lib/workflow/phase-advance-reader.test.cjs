/**
 * Tests for Phase-Advance Reader (Task 3.3)
 * ===========================================
 *
 * Tests the phase-advance signal reader utility that Router uses
 * to detect when a workflow phase should advance.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Module under test
const phaseAdvanceReader = require('../../../.claude/lib/workflow/phase-advance-reader.cjs');

// Test fixtures directory
const TEST_DIR = path.join(__dirname, '.test-phase-advance');
const PHASE_ADVANCE_FILE = path.join(TEST_DIR, 'phase-advance.json');

test('phase-advance-reader tests', async (t) => {
  // Setup
  t.beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  // Cleanup
  t.afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  await t.test('checkForAdvance() returns null when no file exists', () => {
    const result = phaseAdvanceReader.checkForAdvance(PHASE_ADVANCE_FILE);
    assert.strictEqual(result, null);
  });

  await t.test('checkForAdvance() returns signal when file exists', () => {
    const signal = {
      workflowId: 'wf-2026-02-06-abc123',
      advanceTo: 'PHASE_2_IMPLEMENT',
      previousPhase: 'PHASE_1_DESIGN',
      gatePassed: true,
      gateResults: { passed: true, blocking: [], warnings: [] },
      timestamp: '2026-02-06T10:00:00.000Z',
    };

    fs.writeFileSync(PHASE_ADVANCE_FILE, JSON.stringify(signal, null, 2), 'utf8');

    const result = phaseAdvanceReader.checkForAdvance(PHASE_ADVANCE_FILE);
    assert.deepStrictEqual(result, signal);
  });

  await t.test('checkForAdvance() returns null for corrupted file', () => {
    fs.writeFileSync(PHASE_ADVANCE_FILE, 'invalid json{', 'utf8');
    const result = phaseAdvanceReader.checkForAdvance(PHASE_ADVANCE_FILE);
    assert.strictEqual(result, null);
  });

  await t.test('clearAdvance() deletes the phase-advance file', () => {
    const signal = { workflowId: 'wf-test', advanceTo: 'PHASE_2_IMPLEMENT' };
    fs.writeFileSync(PHASE_ADVANCE_FILE, JSON.stringify(signal), 'utf8');

    assert.strictEqual(fs.existsSync(PHASE_ADVANCE_FILE), true);
    phaseAdvanceReader.clearAdvance(PHASE_ADVANCE_FILE);
    assert.strictEqual(fs.existsSync(PHASE_ADVANCE_FILE), false);
  });

  await t.test('clearAdvance() does not throw when file does not exist', () => {
    assert.doesNotThrow(() => {
      phaseAdvanceReader.clearAdvance(PHASE_ADVANCE_FILE);
    });
  });

  await t.test('getNextPhaseAgents() returns planner+architect for PHASE_1_DESIGN LOW complexity', () => {
    const agents = phaseAdvanceReader.getNextPhaseAgents('PHASE_1_DESIGN', 'LOW');
    assert.deepStrictEqual(agents.sort(), ['architect', 'planner'].sort());
  });

  await t.test('getNextPhaseAgents() returns planner+architect+security-architect for PHASE_1_DESIGN HIGH complexity', () => {
    const agents = phaseAdvanceReader.getNextPhaseAgents('PHASE_1_DESIGN', 'HIGH');
    assert.deepStrictEqual(agents.sort(), ['architect', 'planner', 'security-architect'].sort());
  });

  await t.test('getNextPhaseAgents() returns developer for PHASE_2_IMPLEMENT', () => {
    const agents = phaseAdvanceReader.getNextPhaseAgents('PHASE_2_IMPLEMENT', 'MEDIUM');
    assert.deepStrictEqual(agents, ['developer']);
  });

  await t.test('getNextPhaseAgents() returns code-reviewer+qa for PHASE_3_REVIEW', () => {
    const agents = phaseAdvanceReader.getNextPhaseAgents('PHASE_3_REVIEW', 'MEDIUM');
    assert.deepStrictEqual(agents.sort(), ['code-reviewer', 'qa'].sort());
  });

  await t.test('getNextPhaseAgents() returns devops for PHASE_4_DEPLOY', () => {
    const agents = phaseAdvanceReader.getNextPhaseAgents('PHASE_4_DEPLOY', 'LOW');
    assert.deepStrictEqual(agents, ['devops']);
  });

  await t.test('getNextPhaseAgents() returns technical-writer for PHASE_5_DOCUMENT', () => {
    const agents = phaseAdvanceReader.getNextPhaseAgents('PHASE_5_DOCUMENT', 'HIGH');
    assert.deepStrictEqual(agents, ['technical-writer']);
  });

  await t.test('getNextPhaseAgents() returns reflection-agent for PHASE_6_REFLECT', () => {
    const agents = phaseAdvanceReader.getNextPhaseAgents('PHASE_6_REFLECT', 'EPIC');
    assert.deepStrictEqual(agents, ['reflection-agent']);
  });

  await t.test('getNextPhaseAgents() returns empty array for unknown phase', () => {
    const agents = phaseAdvanceReader.getNextPhaseAgents('PHASE_UNKNOWN', 'LOW');
    assert.deepStrictEqual(agents, []);
  });
});
