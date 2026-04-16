#!/usr/bin/env node
/**
 * has-explicit-agent-context.test.cjs
 *
 * Focused tests for CLAUDE_AGENT_ID env-var propagation through
 * hasExplicitAgentContext() and the checkRouterWrite() bypass.
 *
 * Phase 1 TDD — RED -> GREEN cycle for hook deadlock fix.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('hasExplicitAgentContext — CLAUDE_AGENT_ID primary signal', () => {
  let hasExplicitAgentContext;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.CLAUDE_AGENT_ID;

    const modPath =
      require.resolve('../../../.claude/hooks/routing/routing-guard-core.helpers.cjs');
    delete require.cache[modPath];
    hasExplicitAgentContext =
      require('../../../.claude/hooks/routing/routing-guard-core.helpers.cjs').hasExplicitAgentContext;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('returns true when CLAUDE_AGENT_ID=developer and no hookInput fields', () => {
    process.env.CLAUDE_AGENT_ID = 'developer';
    assert.equal(hasExplicitAgentContext({}), true);
  });

  it('returns false when no CLAUDE_AGENT_ID and empty payload', () => {
    assert.equal(hasExplicitAgentContext({}), false);
  });

  it('returns true when hookInput.agent_id is present (legacy path)', () => {
    assert.equal(hasExplicitAgentContext({ agent_id: 'qa' }), true);
  });
});

describe('checkRouterWrite — CLAUDE_AGENT_ID bypass', () => {
  let checkRouterWrite;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.CLAUDE_AGENT_ID;
    delete process.env.ROUTER_WRITE_GUARD;

    // Bust the module cache so env changes are picked up
    const helpersPath =
      require.resolve('../../../.claude/hooks/routing/routing-guard-core.helpers.cjs');
    const sharedPath =
      require.resolve('../../../.claude/hooks/routing/routing-guard-core.shared.cjs');
    const checksPath =
      require.resolve('../../../.claude/hooks/routing/routing-guard-core.checks-router.cjs');
    delete require.cache[helpersPath];
    delete require.cache[sharedPath];
    delete require.cache[checksPath];

    ({
      checkRouterWrite,
    } = require('../../../.claude/hooks/routing/routing-guard-core.checks-router.cjs'));
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('checkRouterWrite passes Edit when CLAUDE_AGENT_ID=developer', () => {
    process.env.CLAUDE_AGENT_ID = 'developer';
    const result = checkRouterWrite('Edit', { file_path: '/some/file.cjs' }, {});
    assert.equal(result.pass, true, 'Expected pass=true for Edit with CLAUDE_AGENT_ID=developer');
  });

  it('checkRouterWrite passes Write when CLAUDE_AGENT_ID=developer', () => {
    process.env.CLAUDE_AGENT_ID = 'developer';
    const result = checkRouterWrite('Write', { file_path: '/some/file.cjs' }, {});
    assert.equal(result.pass, true, 'Expected pass=true for Write with CLAUDE_AGENT_ID=developer');
  });
});
