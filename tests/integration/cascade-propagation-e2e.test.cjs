#!/usr/bin/env node
/**
 * Integration Test: Cascade Propagation E2E
 *
 * Outer-loop test for the self-healing cascade pipeline.
 * Verifies the full flow: skill update → cascade entries written → queue consumable.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Helpers (reuse patterns from run-skill-updates.test.cjs)
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cascade-e2e-'));
}

function scaffoldProjectRoot(root) {
  const claudeDir = path.join(root, '.claude');
  fs.mkdirSync(path.join(claudeDir, 'context', 'runtime'), { recursive: true });
  fs.mkdirSync(path.join(claudeDir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# stub', 'utf8');
  return root;
}

function writeSkillMd(root, skillName, { tools = [], description = '' } = {}) {
  const skillDir = path.join(root, '.claude', 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  const content = [
    '---',
    `name: ${skillName}`,
    `description: ${description}`,
    'version: 1.0.0',
    `tools: [${tools.join(', ')}]`,
    '---',
    '',
    `# ${skillName}`,
    '',
    description,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf8');
}

function writeAgentRegistry(root, agentSkillMap) {
  const registry = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    metadata: { totalAgents: Object.keys(agentSkillMap).length },
    agents: {},
  };
  for (const [agentName, skills] of Object.entries(agentSkillMap)) {
    registry.agents[agentName] = {
      id: agentName,
      displayName: agentName,
      category: 'core',
      filePath: `.claude/agents/core/${agentName}.md`,
      capabilities: [{ name: agentName, skills }],
    };
  }
  const registryPath = path.join(root, '.claude', 'context', 'agent-registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
}

function readQueueEntries(root) {
  const queuePath = path.join(root, '.claude', 'context', 'runtime', 'evolution-requests.jsonl');
  if (!fs.existsSync(queuePath)) return [];
  return fs
    .readFileSync(queuePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Modules under test
// ---------------------------------------------------------------------------

const { runSkillUpdates } = require('../../.claude/tools/cli/run-skill-updates.cjs');
const { processCascadeQueue } = require('../../.claude/tools/cli/skill-update-headless.cjs');

// ---------------------------------------------------------------------------
// Integration Test
// ---------------------------------------------------------------------------

describe('Cascade Propagation E2E', () => {
  let root;

  beforeEach(() => {
    root = makeTmpDir();
    scaffoldProjectRoot(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('skill update writes cascade entries that are consumable by headless pipeline', () => {
    // 1. Scaffold tmp project with skill + agent-registry
    writeSkillMd(root, 'test-skill', {
      tools: ['Read', 'Write'],
      description: 'A test skill for cascade propagation',
    });
    writeAgentRegistry(root, {
      'accessibility-tester': ['test-skill', 'accessibility'],
      'frontend-pro': ['test-skill', 'react-expert'],
      developer: ['tdd', 'debugging'],
    });

    // 2. Call runSkillUpdates targeting test-skill
    const result = runSkillUpdates(root, { skill: 'test-skill', dryRun: false });

    // Verify orchestrator found cascades
    assert.ok(result.agentCascades.length >= 2, 'Should find at least 2 assigned agents');
    assert.ok(result.cascadeResult, 'Should have cascadeResult');
    assert.equal(result.cascadeResult.written, 2, 'Should write 2 cascade entries');

    // 3. Assert evolution-requests.jsonl contains skill_cascade entries
    const allEntries = readQueueEntries(root);
    const cascadeEntries = allEntries.filter(e => e.trigger === 'skill_cascade');
    assert.equal(cascadeEntries.length, 2, 'JSONL should contain 2 skill_cascade entries');

    // Verify entry shape matches schema contract
    for (const entry of cascadeEntries) {
      assert.ok(entry.id, 'entry must have id');
      assert.ok(entry.timestamp, 'entry must have timestamp');
      assert.equal(entry.source, 'other');
      assert.equal(entry.trigger, 'skill_cascade');
      assert.ok(entry.evidence.length >= 8, 'evidence must be >= 8 chars');
      assert.equal(entry.suggestedArtifactType, 'agent');
      assert.ok(entry.summary.length >= 8, 'summary must be >= 8 chars');
      assert.equal(entry.status, 'proposed');
      assert.ok(entry.targetArtifact, 'must have targetArtifact');
      assert.equal(entry.targetArtifact.type, 'agent');
      assert.ok(entry.targetArtifact.name, 'targetArtifact must have name');
    }

    // 4. Call processCascadeQueue
    const queue = processCascadeQueue(root);

    // 5. Assert returned cascades match the assigned agents
    assert.equal(queue.count, 2, 'processCascadeQueue should find 2 pending cascades');
    assert.equal(queue.pending.length, 2);

    const queueAgentNames = queue.pending.map(e => e.targetArtifact.name).sort();
    assert.deepStrictEqual(
      queueAgentNames,
      ['accessibility-tester', 'frontend-pro'],
      'Queue should contain exactly the agents assigned to test-skill'
    );
  });
});
