'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it, beforeEach, afterEach } = require('node:test');
const { AvailableAgentsQuery } = require('../../../.claude/lib/tools/available-agents.cjs');

const FIXTURE_DIR = path.join(__dirname, '..', '..', 'fixtures');
const CONSISTENCY_DIR = path.join(FIXTURE_DIR, 'registry-consistency');
const CONSISTENCY_AGENTS_DIR = path.join(CONSISTENCY_DIR, '.claude', 'agents', 'core');
const CONSISTENCY_REGISTRY = path.join(CONSISTENCY_DIR, '.claude', 'context', 'agent-registry.json');

describe('AvailableAgents registry consistency', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    fs.mkdirSync(CONSISTENCY_AGENTS_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(CONSISTENCY_REGISTRY), { recursive: true });

    fs.writeFileSync(
      path.join(CONSISTENCY_AGENTS_DIR, 'valid-agent.md'),
      '---\nname: Valid Agent\ndescription: Valid agent for consistency tests\n---\n'
    );

    const registry = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      agents: {
        'missing-agent': {
          id: 'missing-agent',
          displayName: 'Missing Agent',
          category: 'core',
          filePath: '.claude/agents/core/missing-agent.md',
          capabilities: [],
          health: { status: 'healthy' },
        },
      },
      index: { byCapability: {}, byDomain: {}, byCategory: {} },
      health: { healthy: [], degraded: [], unavailable: [] },
      metadata: { totalAgents: 1 },
    };
    fs.writeFileSync(CONSISTENCY_REGISTRY, JSON.stringify(registry, null, 2));
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    fs.rmSync(CONSISTENCY_DIR, { recursive: true, force: true });
  });

  it('warns on registry drift by default', () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    const query = new AvailableAgentsQuery({
      registryPath: CONSISTENCY_REGISTRY,
      agentsDir: path.join(CONSISTENCY_DIR, '.claude', 'agents'),
      enableConsistencyCheck: true,
      consistencyCheckIntervalMs: 0,
    });
    const result = query.query({ minSuccessRate: 0 });

    console.warn = originalWarn;

    assert.strictEqual(result.success, true);
    assert.ok(warnings.length > 0);
    assert.ok(warnings.some(msg => msg.includes('Agent registry drift detected')));
  });

  it('blocks when REGISTRY_CONSISTENCY_GATE=block', () => {
    process.env.REGISTRY_CONSISTENCY_GATE = 'block';

    const query = new AvailableAgentsQuery({
      registryPath: CONSISTENCY_REGISTRY,
      agentsDir: path.join(CONSISTENCY_DIR, '.claude', 'agents'),
      enableConsistencyCheck: true,
      consistencyCheckIntervalMs: 0,
    });
    const result = query.query({});

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Agent registry drift detected'));
  });
});
