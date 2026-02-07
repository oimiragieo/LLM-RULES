#!/usr/bin/env node
/**
 * SEC-TC-002: Template Guard Regex Validation Tests
 * ==================================================
 *
 * Tests that the unified-creator-guard correctly identifies ALL template
 * paths as protected, not just specific subdirectories.
 *
 * BUG: Before fix, patterns only matched subdirectories like:
 *   (?:agents|skills|workflows|hooks|code|schemas)
 *
 * This missed:
 *   - spawn/ templates (most security-critical)
 *   - reports/ templates
 *   - code-styles/ templates
 *   - Root-level templates
 *
 * FIX: Change pattern to match ANY .claude/templates/** path,
 * with exclusions for README.md and _archive/.
 *
 * @module unified-creator-guard-templates.test
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  findRequiredCreator,
  CREATOR_CONFIGS,
} = require('../../.claude/hooks/routing/unified-creator-guard.cjs');

// =============================================================================
// TEST SUITE: Template Path Coverage
// =============================================================================

test('SEC-TC-002: Template Guard - Spawn Templates (Critical)', () => {
  // Spawn templates control agent behavior - MOST security-critical
  const spawnTemplate = '.claude/templates/spawn/evil-spawn.md';
  const result = findRequiredCreator(spawnTemplate);

  assert.notStrictEqual(result, null, 'Spawn templates MUST be protected');
  assert.strictEqual(result.creator, 'template-creator', 'Should require template-creator');
  assert.strictEqual(result.artifactType, 'template', 'Should identify as template artifact');
});

test('SEC-TC-002: Template Guard - Report Templates', () => {
  const reportTemplate = '.claude/templates/reports/fake-report.md';
  const result = findRequiredCreator(reportTemplate);

  assert.notStrictEqual(result, null, 'Report templates MUST be protected');
  assert.strictEqual(result.creator, 'template-creator', 'Should require template-creator');
  assert.strictEqual(result.artifactType, 'template', 'Should identify as template artifact');
});

test('SEC-TC-002: Template Guard - Code-Styles Templates', () => {
  const codeStyleTemplate = '.claude/templates/code-styles/malicious.md';
  const result = findRequiredCreator(codeStyleTemplate);

  assert.notStrictEqual(result, null, 'Code-styles templates MUST be protected');
  assert.strictEqual(result.creator, 'template-creator', 'Should require template-creator');
  assert.strictEqual(result.artifactType, 'template', 'Should identify as template artifact');
});

test('SEC-TC-002: Template Guard - Root-Level Templates', () => {
  const rootTemplate = '.claude/templates/new-root-template.md';
  const result = findRequiredCreator(rootTemplate);

  assert.notStrictEqual(result, null, 'Root-level templates MUST be protected');
  assert.strictEqual(result.creator, 'template-creator', 'Should require template-creator');
  assert.strictEqual(result.artifactType, 'template', 'Should identify as template artifact');
});

test('SEC-TC-002: Template Guard - README Exclusion', () => {
  // README.md files should be ALLOWED (excluded)
  const readme = '.claude/templates/README.md';
  const result = findRequiredCreator(readme);

  assert.strictEqual(result, null, 'README.md should be excluded (allowed)');
});

test('SEC-TC-002: Template Guard - Archive Exclusion', () => {
  // Archived templates should be ALLOWED (excluded)
  const archived = '.claude/templates/_archive/old-template.md';
  const result = findRequiredCreator(archived);

  assert.strictEqual(result, null, '_archive templates should be excluded (allowed)');
});

test('SEC-TC-002: Template Guard - Existing Behavior Preserved (Agents)', () => {
  // Existing behavior for existing subdirectories should still work
  const agentTemplate = '.claude/templates/agents/agent-template.md';
  const result = findRequiredCreator(agentTemplate);

  assert.notStrictEqual(result, null, 'Existing agent templates MUST remain protected');
  assert.strictEqual(result.creator, 'template-creator', 'Should require template-creator');
  assert.strictEqual(result.artifactType, 'template', 'Should identify as template artifact');
});

// =============================================================================
// VERIFICATION: Config Structure
// =============================================================================

test('SEC-TC-002: Template Creator Config Exists', () => {
  const templateConfig = CREATOR_CONFIGS.find(c => c.creator === 'template-creator');
  assert.notStrictEqual(templateConfig, undefined, 'Template creator config must exist');
  assert.ok(Array.isArray(templateConfig.patterns), 'patterns must be an array');
  assert.strictEqual(templateConfig.artifactType, 'template', 'artifactType must be "template"');
});
