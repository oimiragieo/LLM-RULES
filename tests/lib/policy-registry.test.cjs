#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const {
  getAgentPolicies,
  registerPolicy,
  checkAgentCompliance,
  getAllPolicyAgentIds,
  clearCustomPolicies,
  DEFAULT_POLICIES,
  REGISTRY_FILE,
} = require('../../.claude/lib/diagnostics/policy-registry.cjs');

describe('policy-registry (F9)', () => {
  beforeEach(() => {
    clearCustomPolicies();
  });

  afterEach(() => {
    try {
      fs.unlinkSync(REGISTRY_FILE);
    } catch {
      // ignore
    }
  });

  describe('getAgentPolicies', () => {
    it('returns default policy for known agents', () => {
      const policy = getAgentPolicies('router');
      assert.equal(policy.agent_id, 'router');
      assert.ok(policy.allowed_tools.includes('Task'));
      assert.ok(!policy.allowed_tools.includes('Edit'));
    });

    it('returns permissive fallback for unknown agents', () => {
      const policy = getAgentPolicies('unknown-agent');
      assert.equal(policy.agent_id, 'unknown-agent');
      assert.ok(policy.allowed_tools.length > 0);
    });

    it('returns custom policy when registered', () => {
      registerPolicy({
        agent_id: 'custom',
        allowed_tools: ['Read'],
        required_skills: [],
        invariant_ids: [],
        forbidden_paths: [],
        constraints: {},
      });
      const policy = getAgentPolicies('custom');
      assert.deepEqual(policy.allowed_tools, ['Read']);
    });
  });

  describe('checkAgentCompliance', () => {
    it('passes for allowed tools', () => {
      const result = checkAgentCompliance('developer', { tool: 'Read' });
      assert.equal(result.compliant, true);
    });

    it('fails for disallowed tools', () => {
      const result = checkAgentCompliance('router', { tool: 'Edit' });
      assert.equal(result.compliant, false);
      assert.ok(result.violations[0].includes('Edit'));
    });

    it('fails for forbidden paths', () => {
      const result = checkAgentCompliance('router', {
        filePath: '.claude/skills/tdd/SKILL.md',
      });
      assert.equal(result.compliant, false);
    });

    it('passes when no violations', () => {
      const result = checkAgentCompliance('developer', {
        tool: 'Write',
        filePath: 'src/index.js',
      });
      assert.equal(result.compliant, true);
    });
  });

  describe('getAllPolicyAgentIds', () => {
    it('includes default policy agents', () => {
      const ids = getAllPolicyAgentIds();
      assert.ok(ids.includes('router'));
      assert.ok(ids.includes('developer'));
      assert.ok(ids.includes('qa'));
    });

    it('includes custom registered agents', () => {
      registerPolicy({
        agent_id: 'my-agent',
        allowed_tools: [],
        required_skills: [],
        invariant_ids: [],
        forbidden_paths: [],
        constraints: {},
      });
      const ids = getAllPolicyAgentIds();
      assert.ok(ids.includes('my-agent'));
    });
  });

  describe('DEFAULT_POLICIES', () => {
    it('router has strict tool restrictions', () => {
      const p = DEFAULT_POLICIES.router;
      assert.ok(!p.allowed_tools.includes('Write'));
      assert.ok(!p.allowed_tools.includes('Edit'));
      assert.ok(!p.allowed_tools.includes('Bash'));
    });

    it('developer requires tdd skill', () => {
      assert.ok(DEFAULT_POLICIES.developer.required_skills.includes('tdd'));
    });
  });
});
