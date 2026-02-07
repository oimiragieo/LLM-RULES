'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEMPLATES_DIR = path.join(PROJECT_ROOT, '.claude', 'templates', 'spawn');

// Will be required after module is created
let resolveSpawnTemplate, ORCHESTRATOR_IDS;

test('spawn-template-resolver', async (t) => {
  await t.test('setup - require module', () => {
    const module = require(path.join(PROJECT_ROOT, '.claude', 'lib', 'spawn', 'spawn-template-resolver.cjs'));
    resolveSpawnTemplate = module.resolveSpawnTemplate;
    ORCHESTRATOR_IDS = module.ORCHESTRATOR_IDS;
  });

  await t.test('1. Explicit templateName override (file exists) returns that template', () => {
    const result = resolveSpawnTemplate('developer', {
      templateName: 'universal-agent-spawn.md',
    });

    assert.strictEqual(result.templateName, 'universal-agent-spawn.md');
    assert.strictEqual(result.templatePath, path.join(TEMPLATES_DIR, 'universal-agent-spawn.md'));
    assert.strictEqual(result.reason, 'explicit_override');
  });

  await t.test('2. Explicit templateName override (file missing) falls through to next priority', () => {
    const result = resolveSpawnTemplate('developer', {
      templateName: 'nonexistent-template.md',
      oneShot: true,
    });

    // Should fall through to oneShot priority
    assert.strictEqual(result.templateName, 'subordinate-once.md');
    assert.strictEqual(result.reason, 'one_shot_mode');
  });

  await t.test('3. oneShot: true returns subordinate-once.md', () => {
    const result = resolveSpawnTemplate('developer', { oneShot: true });

    assert.strictEqual(result.templateName, 'subordinate-once.md');
    assert.strictEqual(result.templatePath, path.join(TEMPLATES_DIR, 'subordinate-once.md'));
    assert.strictEqual(result.reason, 'one_shot_mode');
  });

  await t.test('4. Known orchestrator subagent_type: "master-orchestrator" returns orchestrator-spawn.md', () => {
    const result = resolveSpawnTemplate('master-orchestrator');

    assert.strictEqual(result.templateName, 'orchestrator-spawn.md');
    assert.strictEqual(result.templatePath, path.join(TEMPLATES_DIR, 'orchestrator-spawn.md'));
    assert.strictEqual(result.reason, 'orchestrator_agent');
  });

  await t.test('5. Known orchestrator subagent_type: "router" returns orchestrator-spawn.md', () => {
    const result = resolveSpawnTemplate('router');

    assert.strictEqual(result.templateName, 'orchestrator-spawn.md');
    assert.strictEqual(result.templatePath, path.join(TEMPLATES_DIR, 'orchestrator-spawn.md'));
    assert.strictEqual(result.reason, 'orchestrator_agent');
  });

  await t.test('6. category: "orchestrator" returns orchestrator-spawn.md', () => {
    const result = resolveSpawnTemplate('custom-agent', {
      category: 'orchestrator',
    });

    assert.strictEqual(result.templateName, 'orchestrator-spawn.md');
    assert.strictEqual(result.reason, 'orchestrator_agent');
  });

  await t.test('7. hasIdentity: true returns agent-identity-integration.md', () => {
    const result = resolveSpawnTemplate('developer', { hasIdentity: true });

    assert.strictEqual(result.templateName, 'agent-identity-integration.md');
    assert.strictEqual(result.templatePath, path.join(TEMPLATES_DIR, 'agent-identity-integration.md'));
    assert.strictEqual(result.reason, 'identity_frontmatter');
  });

  await t.test('8. Default (no options) returns universal-agent-spawn.md', () => {
    const result = resolveSpawnTemplate('developer');

    assert.strictEqual(result.templateName, 'universal-agent-spawn.md');
    assert.strictEqual(result.templatePath, path.join(TEMPLATES_DIR, 'universal-agent-spawn.md'));
    assert.strictEqual(result.reason, 'default');
  });

  await t.test('9. Priority: oneShot beats orchestrator', () => {
    const result = resolveSpawnTemplate('master-orchestrator', {
      oneShot: true,
    });

    // oneShot should win (higher priority)
    assert.strictEqual(result.templateName, 'subordinate-once.md');
    assert.strictEqual(result.reason, 'one_shot_mode');
  });

  await t.test('10. Priority: orchestrator beats identity', () => {
    const result = resolveSpawnTemplate('router', { hasIdentity: true });

    // orchestrator should win (higher priority)
    assert.strictEqual(result.templateName, 'orchestrator-spawn.md');
    assert.strictEqual(result.reason, 'orchestrator_agent');
  });

  await t.test('11. Null/undefined agentType returns universal (default)', () => {
    const resultNull = resolveSpawnTemplate(null);
    const resultUndefined = resolveSpawnTemplate(undefined);
    const resultEmpty = resolveSpawnTemplate('');

    assert.strictEqual(resultNull.templateName, 'universal-agent-spawn.md');
    assert.strictEqual(resultNull.reason, 'default');

    assert.strictEqual(resultUndefined.templateName, 'universal-agent-spawn.md');
    assert.strictEqual(resultUndefined.reason, 'default');

    assert.strictEqual(resultEmpty.templateName, 'universal-agent-spawn.md');
    assert.strictEqual(resultEmpty.reason, 'default');
  });

  await t.test('12. Case insensitive: "MASTER-ORCHESTRATOR" returns orchestrator-spawn.md', () => {
    const result = resolveSpawnTemplate('MASTER-ORCHESTRATOR');

    assert.strictEqual(result.templateName, 'orchestrator-spawn.md');
    assert.strictEqual(result.reason, 'orchestrator_agent');
  });

  await t.test('13. ORCHESTRATOR_IDS export contains all 5 types', () => {
    const expectedIds = [
      'router',
      'master-orchestrator',
      'evolution-orchestrator',
      'swarm-coordinator',
      'party-orchestrator',
    ];

    assert.ok(ORCHESTRATOR_IDS instanceof Set, 'ORCHESTRATOR_IDS should be a Set');
    assert.strictEqual(ORCHESTRATOR_IDS.size, 5, 'Should have exactly 5 orchestrator types');

    for (const id of expectedIds) {
      assert.ok(ORCHESTRATOR_IDS.has(id), `Should contain "${id}"`);
    }
  });
});
