#!/usr/bin/env node
'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'run-skill-updates-'));
}

/** Scaffold a minimal project root with .claude/CLAUDE.md marker. */
function scaffoldProjectRoot(root) {
  const claudeDir = path.join(root, '.claude');
  fs.mkdirSync(path.join(claudeDir, 'context', 'runtime'), { recursive: true });
  fs.mkdirSync(path.join(claudeDir, 'config'), { recursive: true });
  fs.mkdirSync(path.join(claudeDir, 'context'), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# stub', 'utf8');
  return root;
}

/** Write JSONL entries to the evolution-requests queue file. */
function writeEvolutionRequests(root, entries) {
  const queuePath = path.join(root, '.claude', 'context', 'runtime', 'evolution-requests.jsonl');
  const content = entries.map(e => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : '');
  fs.writeFileSync(queuePath, content, 'utf8');
  return queuePath;
}

/** Create a minimal SKILL.md with frontmatter. */
function writeSkillMd(root, skillName, { tools = [], description = '' } = {}) {
  const skillDir = path.join(root, '.claude', 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  const toolsLine = `tools: [${tools.join(', ')}]`;
  const content = [
    '---',
    `name: ${skillName}`,
    `description: ${description}`,
    'version: 1.0.0',
    toolsLine,
    '---',
    '',
    `# ${skillName}`,
    '',
    description,
    '',
  ].join('\n');
  const filePath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

/** Write a minimal agent-registry.json mapping agents to skills. */
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
      capabilities: [
        {
          name: agentName,
          skills,
        },
      ],
    };
  }

  const registryPath = path.join(root, '.claude', 'context', 'agent-registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
  return registryPath;
}

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

const MODULE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'tools',
  'cli',
  'run-skill-updates.cjs'
);

let mod;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('run-skill-updates orchestrator', () => {
  before(() => {
    mod = require(MODULE_PATH);
  });

  // Test 1
  describe('reads evolution requests from JSONL file', () => {
    it('should read all 3 stale_skill entries', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        const entries = [
          {
            id: 'req_1',
            trigger: 'stale_skill',
            targetArtifact: { name: 'tdd' },
            status: 'proposed',
          },
          {
            id: 'req_2',
            trigger: 'stale_skill',
            targetArtifact: { name: 'debugging' },
            status: 'proposed',
          },
          {
            id: 'req_3',
            trigger: 'stale_skill',
            targetArtifact: { name: 'verification-before-completion' },
            status: 'proposed',
          },
        ];
        writeEvolutionRequests(root, entries);

        const requests = mod.readEvolutionRequests(root);
        assert.equal(requests.length, 3, 'Should read all 3 entries');
        assert.equal(requests[0].id, 'req_1');
        assert.equal(requests[2].id, 'req_3');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  // Test 2
  describe('filters requests by trigger type', () => {
    it('should return only stale_skill requests when filtering', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        const entries = [
          {
            id: 'req_1',
            trigger: 'stale_skill',
            targetArtifact: { name: 'tdd' },
            status: 'proposed',
          },
          {
            id: 'req_2',
            trigger: 'user_request',
            targetArtifact: { name: 'debugging' },
            status: 'proposed',
          },
          {
            id: 'req_3',
            trigger: 'stale_skill',
            targetArtifact: { name: 'research-synthesis' },
            status: 'proposed',
          },
          {
            id: 'req_4',
            trigger: 'evolve',
            targetArtifact: { name: 'assimilate' },
            status: 'proposed',
          },
        ];
        writeEvolutionRequests(root, entries);

        const filtered = mod.filterStaleSkillRequests(mod.readEvolutionRequests(root));
        assert.equal(filtered.length, 2, 'Should only include stale_skill triggers');
        assert.ok(
          filtered.every(r => r.trigger === 'stale_skill'),
          'All entries should have stale_skill trigger'
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  // Test 3
  describe('detects tool changes between before/after skill versions', () => {
    it('should detect added tool', () => {
      const beforeContent = [
        '---',
        'name: tdd',
        'description: Test-driven development',
        'tools: [Read, Write]',
        '---',
        '# TDD',
      ].join('\n');

      const afterContent = [
        '---',
        'name: tdd',
        'description: Test-driven development',
        'tools: [Read, Write, Bash]',
        '---',
        '# TDD',
      ].join('\n');

      const changes = mod.detectChanges(beforeContent, afterContent);
      assert.equal(changes.toolsChanged, true, 'Should detect tool change');
      assert.deepStrictEqual(changes.newTools, ['Bash'], 'Should identify Bash as new tool');
      assert.deepStrictEqual(changes.removedTools, [], 'No tools removed');
    });

    it('should detect removed tool', () => {
      const beforeContent = [
        '---',
        'name: tdd',
        'description: Test-driven development',
        'tools: [Read, Write, Bash]',
        '---',
      ].join('\n');

      const afterContent = [
        '---',
        'name: tdd',
        'description: Test-driven development',
        'tools: [Read, Write]',
        '---',
      ].join('\n');

      const changes = mod.detectChanges(beforeContent, afterContent);
      assert.equal(changes.toolsChanged, true, 'Should detect tool removal');
      assert.deepStrictEqual(changes.removedTools, ['Bash'], 'Should identify Bash as removed');
    });

    it('should report no change when tools are identical', () => {
      const beforeContent = [
        '---',
        'name: tdd',
        'description: Test-driven development',
        'tools: [Read, Write]',
        '---',
      ].join('\n');

      const afterContent = [
        '---',
        'name: tdd',
        'description: Test-driven development',
        'tools: [Read, Write]',
        '---',
      ].join('\n');

      const changes = mod.detectChanges(beforeContent, afterContent);
      assert.equal(changes.toolsChanged, false, 'No tool change');
      assert.deepStrictEqual(changes.newTools, []);
      assert.deepStrictEqual(changes.removedTools, []);
    });
  });

  // Test 4
  describe('detects domain changes in skill description', () => {
    it('should detect significant description change', () => {
      const beforeContent = [
        '---',
        'name: tdd',
        'description: Test-driven development workflow for writing tests first',
        'tools: [Read, Write]',
        '---',
      ].join('\n');

      const afterContent = [
        '---',
        'name: tdd',
        'description: Security-focused penetration testing and vulnerability assessment framework',
        'tools: [Read, Write]',
        '---',
      ].join('\n');

      const changes = mod.detectChanges(beforeContent, afterContent);
      assert.equal(
        changes.domainChanged,
        true,
        'Should detect domain change when description changed significantly'
      );
    });

    it('should not flag minor description edits as domain change', () => {
      const beforeContent = [
        '---',
        'name: tdd',
        'description: Test-driven development workflow for writing tests first',
        'tools: [Read, Write]',
        '---',
      ].join('\n');

      const afterContent = [
        '---',
        'name: tdd',
        'description: Test-driven development workflow for writing tests first and refactoring',
        'tools: [Read, Write]',
        '---',
      ].join('\n');

      const changes = mod.detectChanges(beforeContent, afterContent);
      assert.equal(
        changes.domainChanged,
        false,
        'Minor edits should not be flagged as domain change'
      );
    });
  });

  // Test 5
  describe('generates agent cascade list from registry', () => {
    it('should find agents assigned to a skill', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        writeAgentRegistry(root, {
          developer: ['tdd', 'debugging', 'verification-before-completion'],
          qa: ['tdd', 'qa-workflow'],
          architect: ['architecture-review', 'diagram-generator'],
        });

        const agents = mod.findAssignedAgents('tdd', root);
        assert.equal(agents.length, 2, 'tdd should be assigned to 2 agents');
        assert.ok(agents.includes('developer'), 'Should include developer');
        assert.ok(agents.includes('qa'), 'Should include qa');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('should return empty array for skill with no agents', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        writeAgentRegistry(root, {
          developer: ['tdd'],
        });

        const agents = mod.findAssignedAgents('nonexistent-skill', root);
        assert.equal(agents.length, 0, 'Should return empty for unknown skill');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  // Test 6
  describe('handles empty evolution-requests.jsonl', () => {
    it('should return 0 processed and no error', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        // Write an empty JSONL file
        writeEvolutionRequests(root, []);

        const requests = mod.readEvolutionRequests(root);
        assert.equal(requests.length, 0, 'Should return empty array');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('should handle missing file gracefully', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        // Don't create the JSONL file at all

        const requests = mod.readEvolutionRequests(root);
        assert.equal(requests.length, 0, 'Should return empty array for missing file');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('should produce summary with 0 counts from runSkillUpdates', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        writeEvolutionRequests(root, []);

        const summary = mod.runSkillUpdates(root, { dryRun: true });
        assert.equal(summary.processed, 0, 'Should process 0');
        assert.equal(summary.failed, 0, 'Should have 0 failures');
        assert.equal(summary.agentCascades.length, 0, 'No cascades');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  // Test 7
  describe('marks processed entries', () => {
    it('should add processedAt timestamp to processed entries', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        const entries = [
          {
            id: 'req_1',
            trigger: 'stale_skill',
            targetArtifact: { name: 'tdd' },
            status: 'proposed',
          },
        ];
        writeEvolutionRequests(root, entries);

        // Create the skill so it can be "processed"
        writeSkillMd(root, 'tdd', { tools: ['Read', 'Write'], description: 'TDD skill' });

        // Run in dry-run false mode to actually mark entries
        mod.runSkillUpdates(root, { dryRun: false });

        // Re-read the JSONL
        const queuePath = path.join(
          root,
          '.claude',
          'context',
          'runtime',
          'evolution-requests.jsonl'
        );
        const raw = fs.readFileSync(queuePath, 'utf8');
        const lines = raw.split('\n').filter(Boolean);
        assert.equal(lines.length, 1, 'Should still have 1 entry');

        const updated = JSON.parse(lines[0]);
        assert.ok(updated.processedAt, 'Should have processedAt timestamp');
        assert.equal(typeof updated.processedAt, 'string', 'processedAt should be a string');
        // Verify it is a valid ISO date
        assert.ok(!isNaN(Date.parse(updated.processedAt)), 'processedAt should be valid ISO date');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('should not mark entries when dryRun is true', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        const entries = [
          {
            id: 'req_1',
            trigger: 'stale_skill',
            targetArtifact: { name: 'tdd' },
            status: 'proposed',
          },
        ];
        writeEvolutionRequests(root, entries);
        writeSkillMd(root, 'tdd', { tools: ['Read', 'Write'], description: 'TDD skill' });

        mod.runSkillUpdates(root, { dryRun: true });

        const queuePath = path.join(
          root,
          '.claude',
          'context',
          'runtime',
          'evolution-requests.jsonl'
        );
        const raw = fs.readFileSync(queuePath, 'utf8');
        const lines = raw.split('\n').filter(Boolean);
        const entry = JSON.parse(lines[0]);
        assert.equal(entry.processedAt, undefined, 'Should NOT have processedAt in dry-run mode');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  // Test 8
  describe('returns summary with update and cascade counts', () => {
    it('should return correct summary shape', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        const entries = [
          {
            id: 'req_1',
            trigger: 'stale_skill',
            targetArtifact: { name: 'tdd' },
            status: 'proposed',
          },
          {
            id: 'req_2',
            trigger: 'stale_skill',
            targetArtifact: { name: 'debugging' },
            status: 'proposed',
          },
        ];
        writeEvolutionRequests(root, entries);
        writeSkillMd(root, 'tdd', {
          tools: ['Read', 'Write'],
          description: 'Test-driven development',
        });
        writeSkillMd(root, 'debugging', { tools: ['Read', 'Bash'], description: 'Debug workflow' });
        writeAgentRegistry(root, {
          developer: ['tdd', 'debugging'],
          qa: ['tdd'],
        });

        const summary = mod.runSkillUpdates(root, { dryRun: true });

        // Shape validation
        assert.equal(typeof summary.processed, 'number', 'processed should be number');
        assert.equal(typeof summary.failed, 'number', 'failed should be number');
        assert.ok(Array.isArray(summary.agentCascades), 'agentCascades should be array');
        assert.ok(
          typeof summary.summary === 'string' || typeof summary.summary === 'object',
          'summary should be string or object'
        );

        // Value checks
        assert.equal(summary.processed, 2, 'Should have processed 2 skills');
        assert.equal(summary.failed, 0, 'None should fail');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('should include agent cascades when agents are assigned', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        const entries = [
          {
            id: 'req_1',
            trigger: 'stale_skill',
            targetArtifact: { name: 'tdd' },
            status: 'proposed',
          },
        ];
        writeEvolutionRequests(root, entries);
        writeSkillMd(root, 'tdd', {
          tools: ['Read', 'Write'],
          description: 'Test-driven development',
        });
        writeAgentRegistry(root, {
          developer: ['tdd', 'debugging'],
          qa: ['tdd'],
        });

        const summary = mod.runSkillUpdates(root, { dryRun: true });

        // Agent cascades should include the agents assigned to the processed skill
        assert.ok(summary.agentCascades.length > 0, 'Should have agent cascades');
        const cascadeAgentNames = summary.agentCascades.map(c => c.agent || c);
        assert.ok(
          cascadeAgentNames.includes('developer') ||
            summary.agentCascades.some(c => c.agent === 'developer'),
          'Should include developer in cascades'
        );
        assert.ok(
          cascadeAgentNames.includes('qa') || summary.agentCascades.some(c => c.agent === 'qa'),
          'Should include qa in cascades'
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('should respect --max option to limit batch size', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        const entries = [
          {
            id: 'req_1',
            trigger: 'stale_skill',
            targetArtifact: { name: 'tdd' },
            status: 'proposed',
          },
          {
            id: 'req_2',
            trigger: 'stale_skill',
            targetArtifact: { name: 'debugging' },
            status: 'proposed',
          },
          {
            id: 'req_3',
            trigger: 'stale_skill',
            targetArtifact: { name: 'research-synthesis' },
            status: 'proposed',
          },
        ];
        writeEvolutionRequests(root, entries);
        writeSkillMd(root, 'tdd', { tools: ['Read'], description: 'TDD' });
        writeSkillMd(root, 'debugging', { tools: ['Read'], description: 'Debug' });
        writeSkillMd(root, 'research-synthesis', { tools: ['Read'], description: 'Research' });

        const summary = mod.runSkillUpdates(root, { dryRun: true, max: 2 });
        assert.equal(summary.processed, 2, 'Should process at most 2 when max=2');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('should support --skill option for single skill update', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        // Even with JSONL containing multiple entries, --skill targets one
        const entries = [
          {
            id: 'req_1',
            trigger: 'stale_skill',
            targetArtifact: { name: 'tdd' },
            status: 'proposed',
          },
          {
            id: 'req_2',
            trigger: 'stale_skill',
            targetArtifact: { name: 'debugging' },
            status: 'proposed',
          },
        ];
        writeEvolutionRequests(root, entries);
        writeSkillMd(root, 'tdd', { tools: ['Read', 'Write'], description: 'TDD' });
        writeSkillMd(root, 'debugging', { tools: ['Read'], description: 'Debug' });

        const summary = mod.runSkillUpdates(root, { dryRun: true, skill: 'tdd' });
        assert.equal(summary.processed, 1, 'Should process only the specified skill');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  // Test 9: Cascade entry propagation
  describe('cascade entry propagation to evolution queue', () => {
    it('runSkillUpdates writes cascade entries to evolution-requests.jsonl when agents assigned', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        writeSkillMd(root, 'tdd', {
          tools: ['Read', 'Write'],
          description: 'Test-driven development',
        });
        writeAgentRegistry(root, {
          developer: ['tdd', 'debugging'],
          qa: ['tdd'],
        });

        // Run with dryRun=false so entries are written
        const result = mod.runSkillUpdates(root, { dryRun: false, skill: 'tdd' });

        assert.ok(result.cascadeResult, 'Should have cascadeResult');
        assert.equal(result.cascadeResult.written, 2, 'Should write 2 cascade entries');

        // Verify JSONL file contains skill_cascade entries
        const queuePath = path.join(
          root,
          '.claude',
          'context',
          'runtime',
          'evolution-requests.jsonl'
        );
        const raw = fs.readFileSync(queuePath, 'utf8');
        const lines = raw.split('\n').filter(Boolean);
        const cascadeEntries = lines
          .map(l => {
            try {
              return JSON.parse(l);
            } catch {
              return null;
            }
          })
          .filter(e => e && e.trigger === 'skill_cascade');

        assert.equal(cascadeEntries.length, 2, 'JSONL should contain 2 skill_cascade entries');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('dry-run does not write cascade entries to file', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        writeSkillMd(root, 'tdd', {
          tools: ['Read', 'Write'],
          description: 'Test-driven development',
        });
        writeAgentRegistry(root, {
          developer: ['tdd'],
        });

        const result = mod.runSkillUpdates(root, { dryRun: true, skill: 'tdd' });

        assert.ok(result.cascadeResult, 'Should have cascadeResult');
        assert.equal(result.cascadeResult.written, 1, 'Should report 1 entry would be written');

        // Queue file should not exist (no entries were written, no prior JSONL)
        const queuePath = path.join(
          root,
          '.claude',
          'context',
          'runtime',
          'evolution-requests.jsonl'
        );
        assert.equal(fs.existsSync(queuePath), false, 'Queue file should not exist in dry-run');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    it('cascade entries reference correct agent names from registry', () => {
      const root = makeTmpDir();
      try {
        scaffoldProjectRoot(root);
        writeSkillMd(root, 'accessibility', {
          tools: ['Read'],
          description: 'Accessibility testing',
        });
        writeAgentRegistry(root, {
          'accessibility-tester': ['accessibility'],
          'frontend-pro': ['accessibility', 'react-expert'],
          developer: ['tdd', 'debugging'],
        });

        const result = mod.runSkillUpdates(root, { dryRun: false, skill: 'accessibility' });

        assert.ok(result.cascadeResult);
        assert.equal(result.cascadeResult.written, 2, 'Should write 2 cascade entries');

        // Read entries and verify agent names
        const queuePath = path.join(
          root,
          '.claude',
          'context',
          'runtime',
          'evolution-requests.jsonl'
        );
        const raw = fs.readFileSync(queuePath, 'utf8');
        const entries = raw
          .split('\n')
          .filter(Boolean)
          .map(l => {
            try {
              return JSON.parse(l);
            } catch {
              return null;
            }
          })
          .filter(e => e && e.trigger === 'skill_cascade');

        const agentNames = entries.map(e => e.targetArtifact.name).sort();
        assert.deepStrictEqual(agentNames, ['accessibility-tester', 'frontend-pro']);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
