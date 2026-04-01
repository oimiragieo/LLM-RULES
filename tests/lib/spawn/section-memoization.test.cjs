#!/usr/bin/env node
/**
 * Section Memoization Tests
 * ==========================
 *
 * Verifies:
 * 1. Memoization hits on identical inputs (call-counter spy via _getSectionBuildCounts)
 * 2. Memoization misses on changed inputs produce fresh results (VAL-PC-008)
 * 3. _clearSectionCache() resets all caches and build counters
 * 4. Safety/protocol blocks (FORBIDDEN COMMANDS, SPAWNED AGENT PROTOCOL) appear before
 *    the volatile basePrompt content in assembled output (VAL-PC-003, VAL-PC-004)
 *
 * @module section-memoization.test
 */

'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const SECTIONS_MODULE_PATH = require.resolve(
  path.join(__dirname, '../../../.claude/lib/spawn/prompt-assembler-sections.cjs')
);
const ASSEMBLER_MODULE_PATH = require.resolve(
  path.join(__dirname, '../../../.claude/lib/spawn/prompt-assembler.cjs')
);

// ======================================================================
// Helpers
// ======================================================================

/**
 * Run a callback with a completely fresh instance of prompt-assembler-sections.cjs.
 * The fresh instance has its own empty caches and zero build counts.
 * The module is evicted from cache before and after the call.
 *
 * @template T
 * @param {(sections: object) => T} fn
 * @returns {T}
 */
function withFreshSections(fn) {
  delete require.cache[SECTIONS_MODULE_PATH];
  try {
    const sections = require(SECTIONS_MODULE_PATH);
    return fn(sections);
  } finally {
    delete require.cache[SECTIONS_MODULE_PATH];
  }
}

/** Build a minimal array of described tool objects. */
function makeTools(names) {
  return (names || ['Alpha', 'Beta']).map(name => ({
    name,
    description: `${name} tool`,
    status: 'available',
    category: 'Test',
  }));
}

/** Build a minimal array of described skill objects. */
function makeSkills(names) {
  return (names || ['skill-a', 'skill-b']).map(name => ({
    name,
    description: `${name} skill`,
    category: 'Test',
    requiredTools: [],
  }));
}

// ======================================================================
// 1. Memoization hits on identical inputs (call-counter spy)
// ======================================================================

describe('buildToolsSection() memoization — hits on identical inputs', () => {
  it('build count stays at 1 after two calls with structurally identical inputs', () => {
    withFreshSections(sections => {
      sections._clearSectionCache();

      const tools = makeTools(['Alpha', 'Beta']);
      const result1 = sections.buildToolsSection(tools);
      const count1 = sections._getSectionBuildCounts().toolsSection;
      assert.strictEqual(count1, 1, 'First call should compute (count=1)');

      // Different object reference but same content — should hit the cache.
      const tools2 = makeTools(['Alpha', 'Beta']);
      const result2 = sections.buildToolsSection(tools2);
      const count2 = sections._getSectionBuildCounts().toolsSection;

      assert.strictEqual(count2, 1, 'Second call with identical content must be a cache hit (count still 1)');
      assert.strictEqual(result1, result2, 'Cached result must equal original result');
    });
  });

  it('build count stays at 1 after repeated calls with the same object reference', () => {
    withFreshSections(sections => {
      sections._clearSectionCache();
      const tools = makeTools(['Gamma', 'Delta']);

      const result1 = sections.buildToolsSection(tools);
      const result2 = sections.buildToolsSection(tools);
      const result3 = sections.buildToolsSection(tools);

      assert.strictEqual(
        sections._getSectionBuildCounts().toolsSection,
        1,
        'Three calls with same reference must produce only one computation'
      );
      assert.strictEqual(result1, result2);
      assert.strictEqual(result2, result3);
    });
  });
});

describe('buildSkillsSection() memoization — hits on identical inputs', () => {
  it('build count stays at 1 after two calls with identical skills and mode', () => {
    withFreshSections(sections => {
      sections._clearSectionCache();
      const skills = makeSkills(['skill-a', 'skill-b']);

      const result1 = sections.buildSkillsSection(skills, { skillSectionMode: 'full' });
      assert.strictEqual(sections._getSectionBuildCounts().skillsSection, 1, 'First call computes');

      // New object references, same content.
      const skills2 = makeSkills(['skill-a', 'skill-b']);
      const result2 = sections.buildSkillsSection(skills2, { skillSectionMode: 'full' });

      assert.strictEqual(
        sections._getSectionBuildCounts().skillsSection,
        1,
        'Second call with identical content must be a cache hit'
      );
      assert.strictEqual(result1, result2, 'Cached result equals original');
    });
  });
});

describe('buildDiscoverySection() memoization — hits on identical inputs', () => {
  it('build count stays at 1 across multiple calls (discovery section has no inputs)', () => {
    withFreshSections(sections => {
      sections._clearSectionCache();

      const result1 = sections.buildDiscoverySection();
      assert.strictEqual(sections._getSectionBuildCounts().discoverySection, 1, 'First call computes');

      const result2 = sections.buildDiscoverySection();
      const result3 = sections.buildDiscoverySection();

      assert.strictEqual(
        sections._getSectionBuildCounts().discoverySection,
        1,
        'Repeated calls must all be cache hits'
      );
      assert.strictEqual(result1, result2);
      assert.strictEqual(result2, result3);
    });
  });
});

// ======================================================================
// 2. Memoization misses on changed inputs (VAL-PC-008)
// ======================================================================

describe('Memoization misses on changed inputs (VAL-PC-008)', () => {
  it('buildToolsSection increments build count when tool list changes', () => {
    withFreshSections(sections => {
      sections._clearSectionCache();

      const result1 = sections.buildToolsSection(makeTools(['Alpha', 'Beta']));
      assert.strictEqual(sections._getSectionBuildCounts().toolsSection, 1);

      const result2 = sections.buildToolsSection(makeTools(['Gamma', 'Delta']));
      assert.strictEqual(
        sections._getSectionBuildCounts().toolsSection,
        2,
        'Changed inputs must trigger recomputation'
      );

      assert.notStrictEqual(result1, result2, 'Results must differ for different inputs');
      assert.ok(result2.includes('Gamma'), 'New result must contain new tool name');
      assert.ok(!result2.includes('Alpha'), 'New result must not contain old tool name');
    });
  });

  it('buildSkillsSection increments build count when mode changes', () => {
    withFreshSections(sections => {
      sections._clearSectionCache();
      const skills = makeSkills(['skill-a']);

      const result1 = sections.buildSkillsSection(skills, { skillSectionMode: 'full' });
      const result2 = sections.buildSkillsSection(skills, { skillSectionMode: 'names_only' });

      assert.strictEqual(
        sections._getSectionBuildCounts().skillsSection,
        2,
        'Different mode must be a cache miss'
      );
      assert.notStrictEqual(result1, result2, 'Full vs names-only output must differ');
    });
  });

  it('buildSkillsSection increments build count when skills array changes', () => {
    withFreshSections(sections => {
      sections._clearSectionCache();

      const result1 = sections.buildSkillsSection(makeSkills(['skill-x']));
      const result2 = sections.buildSkillsSection(makeSkills(['skill-y']));

      assert.strictEqual(sections._getSectionBuildCounts().skillsSection, 2);
      assert.ok(result2.includes('skill-y'), 'New result must contain new skill name');
      assert.ok(!result2.includes('skill-x'), 'New result must not contain old skill name');
    });
  });

  it('buildToolsSection uses key that distinguishes different tool attributes', () => {
    withFreshSections(sections => {
      sections._clearSectionCache();

      const toolAvailable = [{ name: 'Alpha', description: 'A', status: 'available', category: 'T' }];
      const toolUnavailable = [{ name: 'Alpha', description: 'A', status: 'unavailable', category: 'T' }];

      const result1 = sections.buildToolsSection(toolAvailable);
      const result2 = sections.buildToolsSection(toolUnavailable);

      assert.strictEqual(sections._getSectionBuildCounts().toolsSection, 2, 'Status change must be a cache miss');
      assert.notStrictEqual(result1, result2, 'Available vs unavailable must produce different output');
    });
  });
});

// ======================================================================
// 3. _clearSectionCache() resets all caches
// ======================================================================

describe('_clearSectionCache() resets caches and build counters', () => {
  it('forces recomputation of buildToolsSection after cache clear', () => {
    withFreshSections(sections => {
      const tools = makeTools(['Alpha']);
      sections.buildToolsSection(tools);
      assert.strictEqual(sections._getSectionBuildCounts().toolsSection, 1, 'Before clear: 1 computation');

      sections._clearSectionCache();
      assert.strictEqual(sections._getSectionBuildCounts().toolsSection, 0, 'After clear: count reset to 0');

      sections.buildToolsSection(tools);
      assert.strictEqual(
        sections._getSectionBuildCounts().toolsSection,
        1,
        'After clear: first call recomputes'
      );
    });
  });

  it('forces recomputation of buildSkillsSection after cache clear', () => {
    withFreshSections(sections => {
      const skills = makeSkills(['skill-a']);
      sections.buildSkillsSection(skills);
      assert.strictEqual(sections._getSectionBuildCounts().skillsSection, 1);

      sections._clearSectionCache();
      assert.strictEqual(sections._getSectionBuildCounts().skillsSection, 0, 'Count reset after clear');

      sections.buildSkillsSection(skills);
      assert.strictEqual(sections._getSectionBuildCounts().skillsSection, 1, 'Recomputed after clear');
    });
  });

  it('forces recomputation of buildDiscoverySection after cache clear', () => {
    withFreshSections(sections => {
      sections.buildDiscoverySection();
      assert.strictEqual(sections._getSectionBuildCounts().discoverySection, 1);

      sections._clearSectionCache();
      assert.strictEqual(sections._getSectionBuildCounts().discoverySection, 0);

      sections.buildDiscoverySection();
      assert.strictEqual(sections._getSectionBuildCounts().discoverySection, 1);
    });
  });

  it('resets all three build counts simultaneously', () => {
    withFreshSections(sections => {
      sections.buildToolsSection(makeTools(['A']));
      sections.buildSkillsSection(makeSkills(['s']));
      sections.buildDiscoverySection();

      const countsBefore = sections._getSectionBuildCounts();
      assert.deepStrictEqual(
        countsBefore,
        { toolsSection: 1, skillsSection: 1, discoverySection: 1 },
        'All three sections computed once'
      );

      sections._clearSectionCache();
      const countsAfter = sections._getSectionBuildCounts();
      assert.deepStrictEqual(
        countsAfter,
        { toolsSection: 0, skillsSection: 0, discoverySection: 0 },
        'All counts reset to 0 after clear'
      );
    });
  });

  it('subsequent builds after clear use new results (not stale cache)', () => {
    withFreshSections(sections => {
      const toolsV1 = makeTools(['Alpha']);
      const resultV1 = sections.buildToolsSection(toolsV1);

      sections._clearSectionCache();

      // Build with same inputs after clear — must recompute but produce same content.
      const resultV2 = sections.buildToolsSection(toolsV1);
      assert.strictEqual(
        sections._getSectionBuildCounts().toolsSection,
        1,
        'Should have recomputed after clear'
      );
      assert.strictEqual(resultV1, resultV2, 'Content must be the same for same inputs');
    });
  });
});

// ======================================================================
// 4. Safety/protocol blocks appear before basePrompt marker (VAL-PC-004)
// ======================================================================

describe('Safety/protocol blocks appear before basePrompt in assembled output (VAL-PC-004)', () => {
  it('FORBIDDEN COMMANDS appears before %%MARKER%% when SPAWN_SAFETY_PREAMBLE=on', () => {
    const origSafety = process.env.SPAWN_SAFETY_PREAMBLE;
    process.env.SPAWN_SAFETY_PREAMBLE = 'on';

    // Use module already in cache (or load fresh if needed).
    const assembler = require(ASSEMBLER_MODULE_PATH);

    try {
      const prompt = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: ['Read', 'Write'],
        basePrompt: '%%MARKER%%',
        includeMemory: false,
      });

      const forbiddenIdx = prompt.indexOf('FORBIDDEN COMMANDS');
      const markerIdx = prompt.indexOf('%%MARKER%%');

      assert.ok(forbiddenIdx !== -1, 'FORBIDDEN COMMANDS must be present in assembled prompt');
      assert.ok(markerIdx !== -1, '%%MARKER%% (basePrompt) must be present in assembled prompt');
      assert.ok(
        forbiddenIdx < markerIdx,
        `FORBIDDEN COMMANDS (index ${forbiddenIdx}) must appear BEFORE %%MARKER%% (index ${markerIdx})`
      );
    } finally {
      if (origSafety === undefined) {
        delete process.env.SPAWN_SAFETY_PREAMBLE;
      } else {
        process.env.SPAWN_SAFETY_PREAMBLE = origSafety;
      }
    }
  });

  it('SPAWNED AGENT PROTOCOL appears before %%MARKER%% when SPAWN_AGENT_PROTOCOL=on', () => {
    const origProtocol = process.env.SPAWN_AGENT_PROTOCOL;
    process.env.SPAWN_AGENT_PROTOCOL = 'on';

    const assembler = require(ASSEMBLER_MODULE_PATH);

    try {
      const prompt = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: ['Read', 'Write'],
        basePrompt: '%%MARKER%%',
        includeMemory: false,
      });

      const protocolIdx = prompt.indexOf('SPAWNED AGENT PROTOCOL');
      const markerIdx = prompt.indexOf('%%MARKER%%');

      assert.ok(protocolIdx !== -1, 'SPAWNED AGENT PROTOCOL must be present');
      assert.ok(
        protocolIdx < markerIdx,
        `SPAWNED AGENT PROTOCOL (index ${protocolIdx}) must appear BEFORE %%MARKER%% (index ${markerIdx})`
      );
    } finally {
      if (origProtocol === undefined) {
        delete process.env.SPAWN_AGENT_PROTOCOL;
      } else {
        process.env.SPAWN_AGENT_PROTOCOL = origProtocol;
      }
    }
  });

  it('TOKEN USAGE REPORTING appears before %%MARKER%% for planner agent when enabled', () => {
    const origToken = process.env.SPAWN_TOKEN_REPORTING;
    process.env.SPAWN_TOKEN_REPORTING = 'on';

    const assembler = require(ASSEMBLER_MODULE_PATH);

    try {
      const prompt = assembler.assembleSpawnPrompt({
        agentType: 'planner',
        allowedTools: ['Read', 'Write'],
        basePrompt: '%%MARKER%%',
        includeMemory: false,
      });

      const tokenIdx = prompt.indexOf('TOKEN USAGE REPORTING');
      const markerIdx = prompt.indexOf('%%MARKER%%');

      assert.ok(tokenIdx !== -1, 'TOKEN USAGE REPORTING must be present for planner agent');
      assert.ok(
        tokenIdx < markerIdx,
        `TOKEN USAGE REPORTING (index ${tokenIdx}) must appear BEFORE %%MARKER%% (index ${markerIdx})`
      );
    } finally {
      if (origToken === undefined) {
        delete process.env.SPAWN_TOKEN_REPORTING;
      } else {
        process.env.SPAWN_TOKEN_REPORTING = origToken;
      }
    }
  });

  it('FORBIDDEN COMMANDS absent when SPAWN_SAFETY_PREAMBLE=off', () => {
    const origSafety = process.env.SPAWN_SAFETY_PREAMBLE;
    process.env.SPAWN_SAFETY_PREAMBLE = 'off';

    const assembler = require(ASSEMBLER_MODULE_PATH);

    try {
      const prompt = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: ['Read'],
        basePrompt: '%%MARKER%%',
        includeMemory: false,
      });

      assert.ok(!prompt.includes('FORBIDDEN COMMANDS'), 'FORBIDDEN COMMANDS must be absent when kill switch is off');
    } finally {
      if (origSafety === undefined) {
        delete process.env.SPAWN_SAFETY_PREAMBLE;
      } else {
        process.env.SPAWN_SAFETY_PREAMBLE = origSafety;
      }
    }
  });

  it('TOKEN USAGE REPORTING absent for developer agent (not in reporting list)', () => {
    const origToken = process.env.SPAWN_TOKEN_REPORTING;
    process.env.SPAWN_TOKEN_REPORTING = 'on';

    const assembler = require(ASSEMBLER_MODULE_PATH);

    try {
      const prompt = assembler.assembleSpawnPrompt({
        agentType: 'developer',
        allowedTools: ['Read'],
        basePrompt: '%%MARKER%%',
        includeMemory: false,
      });

      assert.ok(
        !prompt.includes('TOKEN USAGE REPORTING'),
        'TOKEN USAGE REPORTING must NOT be present for developer agent'
      );
    } finally {
      if (origToken === undefined) {
        delete process.env.SPAWN_TOKEN_REPORTING;
      } else {
        process.env.SPAWN_TOKEN_REPORTING = origToken;
      }
    }
  });
});

// ======================================================================
// Cleanup: evict cached modules used in tests.
// ======================================================================
after(() => {
  delete require.cache[SECTIONS_MODULE_PATH];
  delete require.cache[ASSEMBLER_MODULE_PATH];
});
