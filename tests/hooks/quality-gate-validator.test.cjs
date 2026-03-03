#!/usr/bin/env node
/**
 * Tests for quality-gate-validator.cjs
 *
 * Run with: node quality-gate-validator.test.cjs
 */

'use strict';

const assert = require('assert');
const {
  getEnforcementMode,
  detectArtifactType,
  findPlaceholders,
  findMissingSections,
  detectRoutingCollisions,
  validateQuality,
  _PLACEHOLDER_PATTERNS,
  _REQUIRED_AGENT_SECTIONS,
} = require('../../.claude/hooks/evolution/quality-gate-validator.cjs');

// Store original env
const originalEnv = { ...process.env };

// Test results tracking
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

function cleanup() {
  process.env = { ...originalEnv };
}

// ============ Tests ============

console.log('\n=== quality-gate-validator.cjs Tests ===\n');

// --- getEnforcementMode tests ---

test('getEnforcementMode returns block by default', () => {
  cleanup();
  delete process.env.QUALITY_GATE_ENFORCEMENT;
  assert.strictEqual(getEnforcementMode(), 'block');
});

test('getEnforcementMode respects warn setting', () => {
  process.env.QUALITY_GATE_ENFORCEMENT = 'warn';
  assert.strictEqual(getEnforcementMode(), 'warn');
  cleanup();
});

test('getEnforcementMode respects off setting', () => {
  process.env.QUALITY_GATE_ENFORCEMENT = 'off';
  assert.strictEqual(getEnforcementMode(), 'off');
  cleanup();
});

test('getEnforcementMode defaults to block for invalid values', () => {
  process.env.QUALITY_GATE_ENFORCEMENT = 'invalid';
  assert.strictEqual(getEnforcementMode(), 'block');
  cleanup();
});

// --- detectArtifactType tests ---

test('detectArtifactType identifies agent paths', () => {
  assert.strictEqual(detectArtifactType('.claude/agents/core/developer.md'), 'agent');
  assert.strictEqual(detectArtifactType('.claude/agents/domain/python-pro.md'), 'agent');
  assert.strictEqual(detectArtifactType('C:\\dev\\.claude\\agents\\core\\test.md'), 'agent');
});

test('detectArtifactType identifies skill paths', () => {
  assert.strictEqual(detectArtifactType('.claude/skills/tdd/SKILL.md'), 'skill');
  assert.strictEqual(detectArtifactType('.claude/skills/debugging/SKILL.md'), 'skill');
});

test('detectArtifactType identifies workflow paths', () => {
  assert.strictEqual(detectArtifactType('.claude/workflows/core/router-decision.md'), 'workflow');
});

test('detectArtifactType identifies hook paths', () => {
  assert.strictEqual(detectArtifactType('.claude/hooks/safety/validator.cjs'), 'hook');
});

test('detectArtifactType returns null for non-artifact paths', () => {
  assert.strictEqual(detectArtifactType('/some/other/path.md'), null);
  assert.strictEqual(detectArtifactType('src/components/Button.tsx'), null);
  assert.strictEqual(detectArtifactType(null), null);
  assert.strictEqual(detectArtifactType(undefined), null);
});

// --- findPlaceholders tests ---

test('findPlaceholders detects TODO', () => {
  const content = 'Some content\n// TODO: implement this\nMore content';
  const issues = findPlaceholders(content);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].line, 2);
});

test('findPlaceholders detects TBD', () => {
  const content = 'Field: TBD\n';
  const issues = findPlaceholders(content);
  assert.strictEqual(issues.length, 1);
});

test('findPlaceholders detects FIXME', () => {
  const content = '// FIXME: broken code\n';
  const issues = findPlaceholders(content);
  assert.strictEqual(issues.length, 1);
});

test('findPlaceholders detects [FILL IN]', () => {
  const content = 'Value: [FILL IN]\n';
  const issues = findPlaceholders(content);
  assert.strictEqual(issues.length, 1);
});

test('findPlaceholders detects multiple placeholders', () => {
  const content = 'TODO: first\nFIXME: second\nTBD for later';
  const issues = findPlaceholders(content);
  assert.strictEqual(issues.length, 3);
});

test('findPlaceholders returns empty for clean content', () => {
  const content =
    '# Agent Definition\n\nThis is a complete implementation.\n\n## Features\n- Feature 1\n- Feature 2';
  const issues = findPlaceholders(content);
  assert.strictEqual(issues.length, 0);
});

// --- findMissingSections tests ---

test('findMissingSections detects missing Task Progress Protocol for agents', () => {
  const content = '# Agent\n\n## Memory Protocol\n\nIron Laws apply.';
  const missing = findMissingSections(content, 'agent');
  assert.ok(missing.includes('Task Progress Protocol'));
});

test('findMissingSections detects missing Memory Protocol for agents', () => {
  const content = '# Agent\n\n## Task Progress Protocol\n\nIron Laws apply.';
  const missing = findMissingSections(content, 'agent');
  assert.ok(missing.includes('Memory Protocol'));
});

test('findMissingSections detects missing Iron Laws for agents', () => {
  const content = '# Agent\n\n## Task Progress Protocol\n\n## Memory Protocol\n';
  const missing = findMissingSections(content, 'agent');
  assert.ok(missing.includes('Iron Laws'));
});

test('findMissingSections returns empty for complete agent', () => {
  const content = `# Agent

## Task Progress Protocol

The Iron Laws state...

## Memory Protocol

Read memory first.`;
  const missing = findMissingSections(content, 'agent');
  assert.strictEqual(missing.length, 0);
});

test('findMissingSections detects missing Purpose for skills', () => {
  const content = '# Skill\n\nSome content without purpose section.';
  const missing = findMissingSections(content, 'skill');
  assert.ok(missing.length > 0);
});

test('findMissingSections returns empty for complete skill', () => {
  const content = '# Skill\n\n## Purpose\n\nThis skill does X.';
  const missing = findMissingSections(content, 'skill');
  assert.strictEqual(missing.length, 0);
});

test('detectRoutingCollisions reports keyword collisions for wrong target agent', () => {
  const content = `
triggerPhrases: ["test", "qa"]
`;
  const collisions = detectRoutingCollisions(content, 'developer');
  assert.ok(collisions.length >= 1);
  assert.ok(collisions.some(c => c.keyword === 'test'));
});

test('detectRoutingCollisions returns empty when keywords map to target agent', () => {
  const content = `
triggerPhrases: ["test", "qa"]
`;
  const collisions = detectRoutingCollisions(content, 'qa');
  assert.strictEqual(collisions.length, 0);
});

// --- validateQuality tests ---

test('validateQuality fails for content with placeholders', () => {
  const content =
    '# Agent\n\n## Task Progress Protocol\n\nTODO: implement\n\n## Memory Protocol\n\nIron Laws apply.';
  const result = validateQuality(content.repeat(10), 'agent'); // Repeat to meet length
  assert.strictEqual(result.valid, false);
  assert.ok(result.issues.some(i => i.type === 'placeholder'));
});

test('validateQuality fails for content that is too short', () => {
  const content = '# Agent\n\nShort.';
  const result = validateQuality(content, 'agent');
  assert.strictEqual(result.valid, false);
  assert.ok(result.issues.some(i => i.type === 'too_short'));
});

test('validateQuality fails for missing sections', () => {
  const content = '# Agent\n\nThis is a long content without required sections.\n'.repeat(50);
  const result = validateQuality(content, 'agent');
  assert.strictEqual(result.valid, false);
  assert.ok(result.issues.some(i => i.type === 'missing_section'));
});

test('validateQuality passes for complete content', () => {
  const content = `# Agent

## Core Persona

Identity, Style, Approach, Values

## Task Progress Protocol

The Iron Laws:
1. Always call TaskUpdate when starting
2. Always call TaskUpdate when done
3. Always call TaskList after completion

## Memory Protocol

Before starting, read memory files.
After completing, update memory files.

## Workflow

Step 0: Load skills
Step 1: Execute task
Step 2: Update status

This is additional content to meet the length requirement.
More content here to ensure we pass the minimum length check.
`.repeat(5);

  const result = validateQuality(content, 'agent');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.issues.length, 0);
});

// --- Summary ---

console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}

console.log('\nAll tests passed!\n');
