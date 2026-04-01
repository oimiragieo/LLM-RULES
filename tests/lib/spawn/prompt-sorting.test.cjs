#!/usr/bin/env node
/**
 * Prompt Sorting & Deduplication Tests
 * ======================================
 *
 * Verifies:
 * 1. filterAndDescribeTools() returns tools sorted alphabetically by name,
 *    regardless of input order (VAL-PC-001)
 * 2. getSkillsByAgent() returns skills sorted alphabetically within each
 *    priority tier (primary, supporting, generic) (VAL-PC-002)
 * 3. Two consecutive getSkillsByAgent() calls with same inputs return
 *    identical arrays (VAL-PC-002 determinism)
 * 4. TaskUpdate contract appears exactly once in assembled prompt (VAL-PC-005)
 *
 * @module prompt-sorting.test
 */

'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const DATA_MODULE_PATH = require.resolve(
  path.join(__dirname, '../../../.claude/lib/spawn/prompt-assembler-data.cjs')
);
const ASSEMBLER_MODULE_PATH = require.resolve(
  path.join(__dirname, '../../../.claude/lib/spawn/prompt-assembler.cjs')
);

// ======================================================================
// Mock helpers
// ======================================================================

/**
 * Runs a test function with a fresh instance of prompt-assembler-data.cjs
 * that reads from mock tool-manifest and skill-index fixtures instead of disk.
 *
 * Cleans up (restores fs, removes fresh module from cache) in all cases.
 *
 * @param {object} mockToolManifest
 * @param {object} mockSkillIndex
 * @param {function} fn  Receives the fresh data module; may return a value.
 * @returns {*} Whatever fn returns.
 */
function withMockData(mockToolManifest, mockSkillIndex, fn) {
  const originalReadFileSync = fs.readFileSync;

  // Patch fs.readFileSync to intercept manifest/index reads.
  fs.readFileSync = (filePath, encoding) => {
    const normalized = String(filePath).replace(/\\/g, '/');
    if (normalized.endsWith('tool-manifest.json')) {
      return JSON.stringify(mockToolManifest);
    }
    if (normalized.endsWith('skill-index.json')) {
      return JSON.stringify(mockSkillIndex);
    }
    return originalReadFileSync(filePath, encoding);
  };

  // Remove the cached module so a fresh instance is created with our patched fs.
  delete require.cache[DATA_MODULE_PATH];

  let freshData;
  try {
    freshData = require(DATA_MODULE_PATH);
    return fn(freshData);
  } finally {
    // Always restore fs and evict the mock module from cache.
    fs.readFileSync = originalReadFileSync;
    delete require.cache[DATA_MODULE_PATH];
  }
}

// Minimal tool manifest fixture.
function makeToolManifest(coreTools = []) {
  return {
    version: '1.0.0',
    tools: {
      core: coreTools,
      mcp: [],
    },
    validation: { agentDefaults: {} },
  };
}

// Minimal skill index fixture.
function makeSkillIndex(skills = {}) {
  return {
    version: '1.0.0',
    skills,
  };
}

// Helper to build a minimal skill entry.
function primarySkill(agentType = 'developer') {
  return {
    agentPrimary: [agentType],
    agentSupporting: [],
    description: 'Test skill',
    category: 'Test',
    requiredTools: [],
  };
}

function supportingSkill(agentType = 'developer') {
  return {
    agentPrimary: [],
    agentSupporting: [agentType],
    description: 'Test supporting skill',
    category: 'Test',
    requiredTools: [],
  };
}

// ======================================================================
// 1. filterAndDescribeTools() alphabetical sorting
// ======================================================================

describe('filterAndDescribeTools() alphabetical sorting', () => {
  it('returns tools sorted alphabetically regardless of reverse input order', () => {
    const mockManifest = makeToolManifest([
      { name: 'Zebra', description: 'Zebra tool', status: 'available', category: 'Misc' },
      { name: 'Alpha', description: 'Alpha tool', status: 'available', category: 'Misc' },
      { name: 'Middle', description: 'Middle tool', status: 'available', category: 'Misc' },
    ]);

    withMockData(mockManifest, makeSkillIndex(), data => {
      // Pass tools in reverse alphabetical order.
      const result = data.filterAndDescribeTools(['Zebra', 'Middle', 'Alpha']);
      const names = result.map(t => t.name);
      assert.deepStrictEqual(
        names,
        ['Alpha', 'Middle', 'Zebra'],
        'Tools should be sorted alphabetically regardless of input order'
      );
    });
  });

  it('returns tools sorted alphabetically from shuffled input', () => {
    const mockManifest = makeToolManifest([
      { name: 'Write', description: 'Write files', status: 'available', category: 'File I/O' },
      { name: 'Read', description: 'Read files', status: 'available', category: 'File I/O' },
      { name: 'Edit', description: 'Edit files', status: 'available', category: 'File I/O' },
      { name: 'Bash', description: 'Run commands', status: 'available', category: 'Shell' },
      { name: 'Glob', description: 'Glob patterns', status: 'available', category: 'File I/O' },
    ]);

    withMockData(mockManifest, makeSkillIndex(), data => {
      // Pass in arbitrary non-alphabetical order.
      const result = data.filterAndDescribeTools(['Write', 'Glob', 'Read', 'Bash', 'Edit']);
      const names = result.map(t => t.name);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      assert.deepStrictEqual(names, sorted, 'Output must be alphabetically sorted');
    });
  });

  it('handles already-sorted input correctly', () => {
    const mockManifest = makeToolManifest([
      { name: 'Alpha', description: 'Alpha', status: 'available', category: 'Misc' },
      { name: 'Beta', description: 'Beta', status: 'available', category: 'Misc' },
      { name: 'Gamma', description: 'Gamma', status: 'available', category: 'Misc' },
    ]);

    withMockData(mockManifest, makeSkillIndex(), data => {
      const result = data.filterAndDescribeTools(['Alpha', 'Beta', 'Gamma']);
      assert.deepStrictEqual(
        result.map(t => t.name),
        ['Alpha', 'Beta', 'Gamma']
      );
    });
  });

  it('uses real tool manifest and returns sorted output', () => {
    // Load the real (cached) data module and pass known tools from the real manifest.
    // Read, Write, Edit, Bash are all core tools in tool-manifest.json.
    const data = require(DATA_MODULE_PATH);
    // Pass in reverse alphabetical order.
    const result = data.filterAndDescribeTools(['Write', 'Read', 'Edit', 'Bash']);
    const names = result.map(t => t.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    assert.deepStrictEqual(names, sorted, 'Real tool output must be alphabetically sorted');
  });
});

// ======================================================================
// 2. getSkillsByAgent() alphabetical sorting within tiers
// ======================================================================

describe('getSkillsByAgent() alphabetical sorting within tiers', () => {
  it('returns primary skills sorted alphabetically', () => {
    const mockSkillIndex = makeSkillIndex({
      'z-primary': primarySkill('developer'),
      'a-primary': primarySkill('developer'),
      'm-primary': primarySkill('developer'),
    });

    withMockData(makeToolManifest(), mockSkillIndex, data => {
      const result = data.getSkillsByAgent('developer');
      const names = result.map(s => s.name);
      // All three are primary; expect alphabetical order.
      assert.deepStrictEqual(
        names,
        ['a-primary', 'm-primary', 'z-primary'],
        'Primary skills must be sorted alphabetically'
      );
    });
  });

  it('returns supporting skills sorted alphabetically after primary tier', () => {
    const mockSkillIndex = makeSkillIndex({
      'z-primary': primarySkill('developer'),
      'a-primary': primarySkill('developer'),
      'n-supporting': supportingSkill('developer'),
      'b-supporting': supportingSkill('developer'),
    });

    withMockData(makeToolManifest(), mockSkillIndex, data => {
      const result = data.getSkillsByAgent('developer');
      const names = result.map(s => s.name);
      // Primary tier (sorted): a-primary, z-primary
      // Supporting tier (sorted): b-supporting, n-supporting
      assert.deepStrictEqual(
        names,
        ['a-primary', 'z-primary', 'b-supporting', 'n-supporting'],
        'Primary then supporting, each tier sorted alphabetically'
      );
    });
  });

  it('returns generic fallback skills sorted alphabetically after primary and supporting', () => {
    // Use generic skill names from the hardcoded list that don't coincide with
    // CORE_AGENT_SKILLS for 'developer' (['tdd','debugging','code-quality-expert']),
    // so the core-prioritization step does not reorder the output unexpectedly.
    // 'git-expert' and 'verification-before-completion' are in the generic list but
    // not in CORE_AGENT_SKILLS, so they stay in their sorted tier position.
    const mockSkillIndex = makeSkillIndex({
      'only-primary': primarySkill('developer'),
      // Generic hardcoded names (not in CORE_AGENT_SKILLS for developer):
      'verification-before-completion': {
        agentPrimary: [],
        agentSupporting: [],
        description: 'Verification skill',
        category: 'Test',
        requiredTools: [],
      },
      'git-expert': {
        agentPrimary: [],
        agentSupporting: [],
        description: 'Git expert skill',
        category: 'Test',
        requiredTools: [],
      },
    });

    withMockData(makeToolManifest(), mockSkillIndex, data => {
      const result = data.getSkillsByAgent('developer');
      const names = result.map(s => s.name);

      // 'only-primary' is the primary tier (1 entry) and comes first.
      assert.strictEqual(names[0], 'only-primary', 'Primary skill comes first');
      // Generic tier follows; 'git-expert' < 'verification-before-completion' alphabetically.
      const genericPart = names.slice(1);
      const sortedGeneric = [...genericPart].sort((a, b) => a.localeCompare(b));
      assert.deepStrictEqual(genericPart, sortedGeneric, 'Generic tier must be sorted');
    });
  });
});

// ======================================================================
// 3. getSkillsByAgent() determinism — two consecutive calls are identical
// ======================================================================

describe('getSkillsByAgent() determinism', () => {
  it('returns identical arrays on two consecutive calls with same inputs', () => {
    const data = require(DATA_MODULE_PATH);
    data.clearCaches();

    const result1 = data.getSkillsByAgent('developer');
    const result2 = data.getSkillsByAgent('developer');

    assert.deepStrictEqual(
      result1,
      result2,
      'Two consecutive getSkillsByAgent("developer") calls must return identical arrays'
    );
  });

  it('returns identical arrays on two consecutive calls for qa agent', () => {
    const data = require(DATA_MODULE_PATH);
    data.clearCaches();

    const result1 = data.getSkillsByAgent('qa');
    const result2 = data.getSkillsByAgent('qa');

    assert.deepStrictEqual(
      result1,
      result2,
      'Two consecutive getSkillsByAgent("qa") calls must return identical arrays'
    );
  });
});

// ======================================================================
// 4. TaskUpdate contract appears exactly once in assembled prompt
// ======================================================================

describe('TaskUpdate contract appears exactly once in assembled prompt', () => {
  it('TaskUpdate contract heading found exactly once in assembled prompt', () => {
    const assembler = require(ASSEMBLER_MODULE_PATH);

    const prompt = assembler.assembleSpawnPrompt({
      agentType: 'developer',
      allowedTools: ['Read', 'Write', 'Edit', 'TaskUpdate', 'TaskList'],
      basePrompt: 'Complete the assigned task.',
      includeMemory: false,
    });

    // Match any markdown heading (##–####) that contains TaskUpdate/TASKUPDATE
    // and the word Contract (with optional words in between for "Completion Contract").
    // This catches both:
    //   ## TASKUPDATE CONTRACT (MANDATORY)         — from buildToolsSection
    //   ### TaskUpdate Completion Contract          — was in buildBasePrompt (now removed)
    const matches = prompt.match(/^#{2,4}\s+\S*taskupdate\S*.*contract/gim);
    const count = matches ? matches.length : 0;

    assert.strictEqual(
      count,
      1,
      `TaskUpdate contract heading should appear exactly once, found ${count}.\n` +
        `Matches: ${JSON.stringify(matches)}`
    );
  });

  it('TaskUpdate contract code block (completedAt field) appears exactly once', () => {
    const assembler = require(ASSEMBLER_MODULE_PATH);

    const prompt = assembler.assembleSpawnPrompt({
      agentType: 'developer',
      allowedTools: ['Read', 'Write', 'Edit', 'TaskUpdate'],
      basePrompt: 'Do work.',
      includeMemory: false,
    });

    // The code block inside the contract contains completedAt: new Date().toISOString()
    // This is a unique signature for the TaskUpdate completion contract code block.
    const matches = prompt.match(/completedAt: new Date\(\)\.toISOString\(\)/g);
    const count = matches ? matches.length : 0;

    assert.strictEqual(
      count,
      1,
      `TaskUpdate contract code block (completedAt) should appear exactly once, found ${count}`
    );
  });

  it('buildBasePrompt does not inject TaskUpdate Completion Contract section', () => {
    const assembler = require(ASSEMBLER_MODULE_PATH);

    // Use SPAWN_AGENT_PROTOCOL=on explicitly to ensure protocol is injected.
    const origEnv = process.env.SPAWN_AGENT_PROTOCOL;
    process.env.SPAWN_AGENT_PROTOCOL = 'on';

    try {
      const prompt = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: ['TaskUpdate'],
        basePrompt: 'Simple task.',
        includeMemory: false,
      });

      // "TaskUpdate Completion Contract" was the heading removed from buildBasePrompt.
      const hasOldHeading = prompt.includes('TaskUpdate Completion Contract');
      assert.strictEqual(
        hasOldHeading,
        false,
        'The old "TaskUpdate Completion Contract" heading from buildBasePrompt must not appear'
      );

      // But the TASKUPDATE CONTRACT heading from buildToolsSection must still be present.
      const hasNewHeading = prompt.includes('TASKUPDATE CONTRACT');
      assert.strictEqual(
        hasNewHeading,
        true,
        'TASKUPDATE CONTRACT heading from buildToolsSection must remain'
      );
    } finally {
      if (origEnv === undefined) {
        delete process.env.SPAWN_AGENT_PROTOCOL;
      } else {
        process.env.SPAWN_AGENT_PROTOCOL = origEnv;
      }
    }
  });
});

// ======================================================================
// Cleanup: evict cached modules used in tests so later test files start fresh.
// ======================================================================
after(() => {
  delete require.cache[DATA_MODULE_PATH];
  delete require.cache[ASSEMBLER_MODULE_PATH];
});
