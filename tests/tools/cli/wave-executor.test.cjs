#!/usr/bin/env node
/**
 * Tests for wave-executor.mjs
 *
 * Tests pure functions only (plan parsing, inventory, prompt building, args).
 * SDK query() calls are NOT tested — they require a live Claude session.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Dynamic import helper (wave-executor.mjs is ESM)
// ---------------------------------------------------------------------------

let mod;

async function loadModule() {
  if (!mod) {
    mod = await import('../../../.claude/tools/cli/wave-executor.mjs');
  }
  return mod;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wave-executor-'));
}

function writePlanFile(dir, plan) {
  const planPath = path.join(dir, 'plan.json');
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
  return planPath;
}

function makeValidPlan(overrides = {}) {
  return {
    name: 'test-plan',
    waves: [
      { id: 1, skills: ['rust-expert', 'python-backend-expert'], domain: 'language' },
      { id: 2, skills: ['nextjs-expert', 'react-expert'], domain: 'web-framework' },
      { id: 3, skills: ['devops', 'kubernetes-flux'], domain: 'devops-cloud' },
    ],
    config: {
      model: 'claude-sonnet-4-6',
      maxTurnsPerWave: 30,
      sleepBetweenWaves: 1000,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wave-executor', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -- parseWaveArgs --

  it('parseWaveArgs parses --plan, --model, --dry-run, --json flags', async () => {
    const { parseWaveArgs } = await loadModule();
    const args = parseWaveArgs([
      '--plan',
      '/tmp/my-plan.json',
      '--model',
      'claude-opus-4-6',
      '--dry-run',
      '--json',
      '--start-from',
      '5',
      '--max-turns',
      '100',
    ]);

    assert.equal(args.plan, '/tmp/my-plan.json');
    assert.equal(args.model, 'claude-opus-4-6');
    assert.equal(args.dryRun, true);
    assert.equal(args.json, true);
    assert.equal(args.startFrom, 5);
    assert.equal(args.maxTurnsPerWave, 100);
  });

  // -- readPlanFile --

  it('readPlanFile reads and validates wave plan JSON', async () => {
    const { readPlanFile } = await loadModule();
    const plan = makeValidPlan();
    const planPath = writePlanFile(tmpDir, plan);

    const result = readPlanFile(planPath);
    assert.equal(result.ok, true);
    assert.equal(result.error, null);
    assert.equal(result.plan.name, 'test-plan');
    assert.equal(result.plan.waves.length, 3);
    assert.deepStrictEqual(result.plan.waves[0].skills, ['rust-expert', 'python-backend-expert']);
  });

  it('readPlanFile rejects invalid plan (missing waves array)', async () => {
    const { readPlanFile } = await loadModule();
    const planPath = writePlanFile(tmpDir, { name: 'bad-plan' });

    const result = readPlanFile(planPath);
    assert.equal(result.ok, false);
    assert.ok(result.error.includes('waves'));
  });

  it('readPlanFile rejects plan with empty waves', async () => {
    const { readPlanFile } = await loadModule();
    const planPath = writePlanFile(tmpDir, { name: 'empty', waves: [] });

    const result = readPlanFile(planPath);
    assert.equal(result.ok, false);
    assert.ok(result.error.includes('empty'));
  });

  it('readPlanFile rejects non-existent file', async () => {
    const { readPlanFile } = await loadModule();
    const result = readPlanFile('/tmp/nonexistent-plan-12345.json');
    assert.equal(result.ok, false);
    assert.ok(result.error.includes('not found'));
  });

  // -- readInventory / updateInventory --

  it('readInventory returns empty state for missing inventory file', async () => {
    const { readInventory } = await loadModule();
    const result = readInventory(path.join(tmpDir, 'nonexistent.json'));

    assert.deepStrictEqual(result.completedWaves, []);
    assert.deepStrictEqual(result.waveResults, {});
    assert.deepStrictEqual(result.errors, []);
    assert.equal(result.planName, '');
  });

  it('updateInventory appends completed wave to inventory', async () => {
    const { readInventory, updateInventory } = await loadModule();
    const invPath = path.join(tmpDir, 'inventory.json');

    updateInventory(invPath, 'test-plan', 1, {
      status: 'completed',
      skillsProcessed: 2,
      cost: '$0.42',
    });

    const inv = readInventory(invPath);
    assert.equal(inv.planName, 'test-plan');
    assert.ok(inv.startedAt, 'Should have startedAt timestamp');
    assert.deepStrictEqual(inv.completedWaves, [1]);
    assert.equal(inv.waveResults['1'].status, 'completed');
    assert.equal(inv.waveResults['1'].skillsProcessed, 2);
  });

  it('updateInventory preserves existing completed waves', async () => {
    const { readInventory, updateInventory } = await loadModule();
    const invPath = path.join(tmpDir, 'inventory.json');

    // Write wave 1
    updateInventory(invPath, 'test-plan', 1, {
      status: 'completed',
      skillsProcessed: 2,
      cost: '$0.40',
    });
    // Write wave 2
    updateInventory(invPath, 'test-plan', 2, {
      status: 'completed',
      skillsProcessed: 3,
      cost: '$0.55',
    });

    const inv = readInventory(invPath);
    assert.deepStrictEqual(inv.completedWaves, [1, 2]);
    assert.equal(inv.waveResults['1'].skillsProcessed, 2);
    assert.equal(inv.waveResults['2'].skillsProcessed, 3);
  });

  // -- buildWavePrompt --

  it('buildWavePrompt interpolates skills and domain into template', async () => {
    const { buildWavePrompt } = await loadModule();
    const plan = makeValidPlan();
    const wave = {
      id: 1,
      skills: ['rust-expert', 'go-expert'],
      domain: 'language',
      promptTemplate: 'Update bundles for {skills} in {domain} domain (wave {waveId}).',
    };

    const prompt = buildWavePrompt(wave, plan);
    assert.ok(prompt.includes('rust-expert, go-expert'));
    assert.ok(prompt.includes('language'));
    assert.ok(prompt.includes('wave 1'));
  });

  it('buildWavePrompt uses default template when no promptTemplate provided', async () => {
    const { buildWavePrompt } = await loadModule();
    const plan = makeValidPlan();
    const wave = { id: 2, skills: ['nextjs-expert'], domain: 'web-framework' };

    const prompt = buildWavePrompt(wave, plan);
    assert.ok(prompt.includes('wave 2'));
    assert.ok(prompt.includes('nextjs-expert'));
    assert.ok(prompt.includes('web-framework'));
    assert.ok(prompt.includes('SKILL.md'));
  });
});
