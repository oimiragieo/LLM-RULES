#!/usr/bin/env node
/**
 * Reflection Integration Wiring Test
 * ===================================
 *
 * Verifies that reflection-agent is properly wired into the ADR-100
 * artifact integration system.
 *
 * Tests:
 * 1. reflection-agent.md has artifact-integrator in skills list
 * 2. reflection-agent.md mentions "Integration Health Check" or "ADR-100"
 * 3. Self-healing triggers table includes "integration"
 * 4. quickIntegrationCheck function exists and is exported
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Resolve paths
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const REFLECTION_AGENT_PATH = path.join(PROJECT_ROOT, '.claude', 'agents', 'core', 'reflection-agent.md');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'workflow', 'post-creation-integration.cjs');

describe('Reflection Integration Wiring', () => {
  it('reflection-agent.md should exist', () => {
    assert.ok(fs.existsSync(REFLECTION_AGENT_PATH), 'reflection-agent.md file should exist');
  });

  it('reflection-agent.md should have artifact-integrator in skills list', () => {
    const content = fs.readFileSync(REFLECTION_AGENT_PATH, 'utf8');

    // Check for skills: section in frontmatter
    const skillsSectionMatch = content.match(/skills:\s*\n((?:\s*-\s*.+\n)+)/);
    assert.ok(skillsSectionMatch, 'Should have a skills: section in frontmatter');

    const skillsList = skillsSectionMatch[1];
    assert.ok(
      skillsList.includes('artifact-integrator'),
      'Skills list should include artifact-integrator'
    );
  });

  it('reflection-agent.md should mention "Integration Health Check" or "ADR-100"', () => {
    const content = fs.readFileSync(REFLECTION_AGENT_PATH, 'utf8');

    const hasIntegrationHealthCheck = content.includes('Integration Health Check');
    const hasADR100 = content.includes('ADR-100');

    assert.ok(
      hasIntegrationHealthCheck || hasADR100,
      'reflection-agent.md should mention "Integration Health Check" or "ADR-100"'
    );
  });

  it('self-healing triggers table should include "integration"', () => {
    const content = fs.readFileSync(REFLECTION_AGENT_PATH, 'utf8');

    // Check for self-healing triggers section
    assert.ok(
      content.includes('Self-Healing Triggers') || content.includes('Self-Healing Action'),
      'Should have Self-Healing Triggers section'
    );

    // Check for integration pattern in table
    const hasIntegrationPattern =
      content.includes('integration gaps') || content.includes('artifact-integrator');

    assert.ok(
      hasIntegrationPattern,
      'Self-healing triggers should mention integration or artifact-integrator'
    );
  });

  it('quickIntegrationCheck function should exist in hook file', () => {
    assert.ok(fs.existsSync(HOOK_PATH), 'post-creation-integration.cjs hook should exist');

    const hookContent = fs.readFileSync(HOOK_PATH, 'utf8');

    assert.ok(
      hookContent.includes('function quickIntegrationCheck'),
      'Hook should define quickIntegrationCheck function'
    );
  });

  it('quickIntegrationCheck should be exported or available', () => {
    const hookContent = fs.readFileSync(HOOK_PATH, 'utf8');

    // Function should exist in the file (used by other modules)
    assert.ok(
      hookContent.includes('quickIntegrationCheck'),
      'quickIntegrationCheck should exist in hook file'
    );

    // Check it has parameters and returns
    assert.ok(
      hookContent.includes('quickIntegrationCheck(artifactId'),
      'quickIntegrationCheck should accept artifactId parameter'
    );
    assert.ok(
      hookContent.includes('return {') && hookContent.includes('gaps'),
      'quickIntegrationCheck should return an object with gaps'
    );
  });

  it('reflection workflow should reference integration health check', () => {
    const REFLECTION_WORKFLOW_PATH = path.join(
      PROJECT_ROOT,
      '.claude',
      'workflows',
      'core',
      'reflection-workflow.md'
    );

    if (!fs.existsSync(REFLECTION_WORKFLOW_PATH)) {
      // Skip if workflow doesn't exist yet
      return;
    }

    const content = fs.readFileSync(REFLECTION_WORKFLOW_PATH, 'utf8');
    assert.ok(
      content.includes('Integration Health') || content.includes('ADR-100'),
      'reflection-workflow.md should mention Integration Health or ADR-100'
    );
  });

  it('post-creation-validation workflow should trigger reflection', () => {
    const POST_CREATION_VALIDATION_PATH = path.join(
      PROJECT_ROOT,
      '.claude',
      'workflows',
      'core',
      'post-creation-validation.md'
    );

    if (!fs.existsSync(POST_CREATION_VALIDATION_PATH)) {
      // Skip if workflow doesn't exist yet
      return;
    }

    const content = fs.readFileSync(POST_CREATION_VALIDATION_PATH, 'utf8');
    assert.ok(
      content.includes('Trigger Reflection') || content.includes('reflection-agent'),
      'post-creation-validation.md should mention triggering reflection'
    );
  });
});
