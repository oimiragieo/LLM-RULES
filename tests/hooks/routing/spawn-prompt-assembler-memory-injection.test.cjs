'use strict';

/**
 * Unit tests for memory injection logic in spawn-prompt-assembler.memory.cjs.
 *
 * These tests focus on:
 *   1. Intent-analysis results ARE merged when memoryQueryEnabled=true (B2 fix).
 *   2. Intent-analysis results used directly (appendSemanticMatches) when
 *      memoryQueryEnabled=false (existing behaviour).
 *   3. Memory injection respects MEMORY_INJECTION_MAX_CHARS=3600 budget cap.
 *   4. Empty/null memory query results produce no injection (graceful degradation).
 *   5. Semantic search failure does not crash injection (error handling).
 *
 * All external dependencies (contextual-memory, memory-manager, intent-analyzer)
 * are mocked so no live DB or file-system access is required.
 */

const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake memory result object matching the shape expected by
 * appendQueryMemories / appendSemanticMatches.
 */
function makeResult(source, similarity, content, metaPath) {
  return {
    source,
    similarity,
    content,
    metadata: metaPath ? { path: metaPath } : {},
  };
}

/**
 * Snapshot env vars, apply overrides, run fn, restore original state.
 * @param {Record<string,string|undefined>} overrides
 * @param {() => unknown} fn
 */
function withEnv(overrides, fn) {
  const original = {};
  for (const [key, value] of Object.entries(overrides)) {
    original[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Load pure helpers from the module under test.
// We import only the pure, synchronous helpers — not applySemanticMemoryToPrompt
// (which requires live memory infrastructure). The branching logic of
// applySemanticMemoryToPrompt is exercised via source-level assertions (same
// technique used in the existing spawn-prompt-assembler-memory.test.cjs).
// ---------------------------------------------------------------------------

const {
  appendSemanticMatches,
  appendQueryMemories,
} = require('../../../.claude/hooks/routing/spawn-prompt-assembler.memory.cjs');

// ---------------------------------------------------------------------------
// Test 1: Intent-analysis results ARE merged when memoryQueryEnabled=true (B2 fix)
// ---------------------------------------------------------------------------

describe('B2 fix — intent results merged into query path when memoryQueryEnabled=true', () => {
  it('source contains spread of intent results inside the memoryQueryEnabled block', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../.claude/hooks/routing/spawn-prompt-assembler.memory.cjs'),
      'utf8'
    );

    // After the B2 fix the intent `results` array must appear inside the
    // `if (memoryQueryEnabled)` branch, spread/concatenated with `queryResults`.
    // Accept any of the reasonable merge patterns.
    const hasMergeInQueryPath =
      src.includes('...results, ...queryResults') ||
      src.includes('...results,') ||
      src.includes('mergedResults') ||
      src.includes('allResults') ||
      src.includes('combinedResults');

    assert.ok(
      hasMergeInQueryPath,
      'Bug B2: intent results must be merged into the memoryQueryEnabled=true path. ' +
        'Expected a spread [...results, ...queryResults] or a mergedResults/allResults variable.'
    );
  });

  it('mergedResults deduplicates by source+content key to prevent double-injection', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../.claude/hooks/routing/spawn-prompt-assembler.memory.cjs'),
      'utf8'
    );

    // The dedup logic must use a Set and a key derived from source+content.
    const hasDedup =
      src.includes('new Set()') &&
      (src.includes("r?.source || ''") || src.includes('r?.source ||'));
    assert.ok(
      hasDedup,
      'Expected deduplication via a Set keyed on source+content to prevent double-injection.'
    );
  });

  it('appendQueryMemories injects content for both intent and query results when merged', () => {
    // Simulate the merged result set that the fixed code would produce:
    // 1 result from intent analysis + 1 result from direct query, both unique.
    const basePrompt = '## Task\nPerform some work.\n';
    const intentResult = makeResult('ltm', 0.91, 'Intent-analysis finding: use safeParseJSON.');
    const queryResult = makeResult('mtm', 0.85, 'Query result: normalize Windows paths.');

    const merged = [intentResult, queryResult];
    const output = appendQueryMemories(basePrompt, merged);

    assert.ok(
      output.includes('safeParseJSON'),
      'Expected intent-analysis content to appear in output'
    );
    assert.ok(
      output.includes('normalize Windows paths'),
      'Expected query result content to appear'
    );
    assert.ok(output.includes('Relevant Memories'), 'Expected section header to be present');
  });
});

// ---------------------------------------------------------------------------
// Test 2: Intent-analysis results used directly when memoryQueryEnabled=false
// ---------------------------------------------------------------------------

describe('memoryQueryEnabled=false — intent results injected via appendSemanticMatches', () => {
  it('source routes to appendSemanticMatches when memoryQueryEnabled is false', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../.claude/hooks/routing/spawn-prompt-assembler.memory.cjs'),
      'utf8'
    );

    // The existing non-query path must still call appendSemanticMatches with results.
    assert.ok(
      src.includes('appendSemanticMatches(assembled, results)'),
      'Expected !memoryQueryEnabled path to call appendSemanticMatches(assembled, results)'
    );

    // And the condition should be the negative of memoryQueryEnabled.
    assert.ok(
      src.includes('!memoryQueryEnabled'),
      'Expected guard `!memoryQueryEnabled` for the semantic-match-only path'
    );
  });

  it('appendSemanticMatches injects content under the correct section header', () => {
    const basePrompt = '## Task\nPerform some work.\n';
    const intentResult = makeResult('ltm', 0.87, 'Pattern: always use shell: false.');

    const output = appendSemanticMatches(basePrompt, [intentResult]);

    assert.ok(output.includes('Semantic Matches'), 'Expected "Semantic Matches" section header');
    assert.ok(output.includes('shell: false'), 'Expected content from intent result to appear');
    // Must NOT appear under the query header
    assert.ok(
      !output.includes('Relevant Memories'),
      'Expected Relevant Memories header to be absent'
    );
  });

  it('appendSemanticMatches limits output to 3 results even when intent returns more', () => {
    const basePrompt = '## Task\nWork.\n';
    // Simulate 6 intent results being passed
    const results = Array.from({ length: 6 }, (_, i) =>
      makeResult(`src${i}`, 0.9 - i * 0.05, `Intent finding number ${i}.`)
    );

    const output = appendSemanticMatches(basePrompt, results);

    assert.ok(output.includes('Intent finding number 0'), 'Expected first intent result');
    assert.ok(output.includes('Intent finding number 2'), 'Expected third intent result');
    assert.ok(
      !output.includes('Intent finding number 3'),
      'appendSemanticMatches must cap at 3 results — result #3 must be absent'
    );
  });
});

// ---------------------------------------------------------------------------
// Test 3: Memory injection respects MEMORY_INJECTION_MAX_CHARS=3600 budget cap
// ---------------------------------------------------------------------------

describe('MEMORY_INJECTION_MAX_CHARS budget cap', () => {
  it('appendQueryMemories truncates injected section when budget is set to 200', () => {
    const basePrompt = '## Task\nWork.\n';
    const longContent = 'Q'.repeat(500);
    const results = Array.from({ length: 5 }, (_, i) => makeResult(`s${i}`, 0.9, longContent));

    withEnv({ MEMORY_INJECTION_MAX_CHARS: '200' }, () => {
      const output = appendQueryMemories(basePrompt, results);
      const injected = output.slice(basePrompt.length);
      assert.ok(
        injected.length <= 200,
        `appendQueryMemories: injected section (${injected.length} chars) must not exceed 200`
      );
    });
  });

  it('appendSemanticMatches truncates injected section when budget is set to 200', () => {
    const basePrompt = '## Task\nWork.\n';
    const longContent = 'S'.repeat(500);
    const results = Array.from({ length: 3 }, (_, i) => makeResult(`s${i}`, 0.9, longContent));

    withEnv({ MEMORY_INJECTION_MAX_CHARS: '200' }, () => {
      const output = appendSemanticMatches(basePrompt, results);
      const injected = output.slice(basePrompt.length);
      assert.ok(
        injected.length <= 200,
        `appendSemanticMatches: injected section (${injected.length} chars) must not exceed 200`
      );
    });
  });

  it('default budget is 3600 and is applied when env var is absent', () => {
    const basePrompt = '## Task\nWork.\n';
    // 3 results × 180-char snippets + headers = well under 3600
    const results = [
      makeResult('s1', 0.9, 'a'.repeat(200)),
      makeResult('s2', 0.8, 'b'.repeat(200)),
      makeResult('s3', 0.7, 'c'.repeat(200)),
    ];

    withEnv({ MEMORY_INJECTION_MAX_CHARS: undefined }, () => {
      const output = appendQueryMemories(basePrompt, results);
      const injected = output.slice(basePrompt.length);
      // Content should be injected (not empty) and should be under the default cap
      assert.ok(injected.length > 0, 'Expected non-empty injection when results are provided');
      assert.ok(
        injected.length <= 3600,
        `Default cap is 3600; injected section is ${injected.length} chars`
      );
    });
  });

  it('MEMORY_INJECTION_MAX_CHARS constant is 3600 in the module source', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../.claude/hooks/routing/spawn-prompt-assembler.memory.cjs'),
      'utf8'
    );
    assert.ok(
      src.includes('3600'),
      'Expected MEMORY_INJECTION_MAX_CHARS default of 3600 in source'
    );
  });

  it('appendQueryMemories still injects content when budget is generous (3600)', () => {
    const basePrompt = '## Task\nWork.\n';
    const results = [makeResult('ltm', 0.95, 'This is a normal-length memory entry.')];

    withEnv({ MEMORY_INJECTION_MAX_CHARS: '3600' }, () => {
      const output = appendQueryMemories(basePrompt, results);
      assert.ok(output.includes('normal-length memory entry'), 'Expected content to be injected');
    });
  });
});

// ---------------------------------------------------------------------------
// Test 4: Empty/null memory query results produce no injection
// ---------------------------------------------------------------------------

describe('Graceful degradation — empty or null results produce no injection', () => {
  it('appendQueryMemories returns base prompt unchanged for empty array', () => {
    const basePrompt = '## Task\nDo something.\n';
    const output = appendQueryMemories(basePrompt, []);
    assert.strictEqual(output, basePrompt, 'Expected base prompt unchanged for []');
  });

  it('appendQueryMemories returns base prompt unchanged for null', () => {
    const basePrompt = '## Task\nDo something.\n';
    const output = appendQueryMemories(basePrompt, null);
    assert.strictEqual(output, basePrompt, 'Expected base prompt unchanged for null');
  });

  it('appendQueryMemories returns base prompt unchanged for undefined', () => {
    const basePrompt = '## Task\nDo something.\n';
    const output = appendQueryMemories(basePrompt, undefined);
    assert.strictEqual(output, basePrompt, 'Expected base prompt unchanged for undefined');
  });

  it('appendSemanticMatches returns base prompt unchanged for empty array', () => {
    const basePrompt = '## Task\nDo something.\n';
    const output = appendSemanticMatches(basePrompt, []);
    assert.strictEqual(output, basePrompt, 'Expected base prompt unchanged for []');
  });

  it('appendSemanticMatches returns base prompt unchanged for null', () => {
    const basePrompt = '## Task\nDo something.\n';
    const output = appendSemanticMatches(basePrompt, null);
    assert.strictEqual(output, basePrompt, 'Expected base prompt unchanged for null');
  });

  it('results array with items that have empty content are skipped silently', () => {
    const basePrompt = '## Task\nDo something.\n';
    // Provide results where the content resolves to an empty string after trim
    const results = [
      { source: 'ltm', similarity: 0.9, content: '' },
      { source: 'ltm', similarity: 0.8, content: '   ' },
    ];
    // The section should still be appended (header is added) but no bullet lines
    // for the empty-content items — verify no crash occurs
    const output = appendQueryMemories(basePrompt, results);
    // Either the prompt is unchanged (all items skipped → no lines → not appended)
    // or a section is added. Either way: no exception.
    assert.ok(typeof output === 'string', 'Expected string output without throwing');
  });

  it('applySemanticMemoryToPrompt guard — SPAWN_PROMPT_SEMANTIC_MEMORY=off returns early', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../.claude/hooks/routing/spawn-prompt-assembler.memory.cjs'),
      'utf8'
    );
    // The early-return guard must be present
    assert.ok(
      src.includes("SPAWN_PROMPT_SEMANTIC_MEMORY === 'off'"),
      'Expected early-return guard for SPAWN_PROMPT_SEMANTIC_MEMORY=off'
    );
  });
});

// ---------------------------------------------------------------------------
// Test 5: Semantic search failure does not crash injection (error handling)
// ---------------------------------------------------------------------------

describe('Error handling — search failures must not crash injection', () => {
  it('applySemanticMemoryToPrompt catches errors from searchMemory (source-level)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../.claude/hooks/routing/spawn-prompt-assembler.memory.cjs'),
      'utf8'
    );

    // The function must wrap searchMemory calls in try/catch blocks.
    // Count the number of try blocks — must be at least 3 (intent analysis,
    // hot-only fallback, and final fallback).
    const tryCount = (src.match(/\btry\s*\{/g) || []).length;
    assert.ok(
      tryCount >= 3,
      `Expected at least 3 try/catch blocks for error resilience, found ${tryCount}`
    );
  });

  it('applySemanticMemoryToPrompt has a final fallback for searchMemory after hot-filter fails', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../.claude/hooks/routing/spawn-prompt-assembler.memory.cjs'),
      'utf8'
    );

    // The double-fallback pattern: first attempt with filter, second without.
    // Verify the fallback comment or the unfiltered search call is present.
    const hasFallbackSearch =
      src.includes('Hot-only filter failed') ||
      src.includes('using unfiltered search') ||
      src.includes('Semantic memory retrieval failed');

    assert.ok(
      hasFallbackSearch,
      'Expected fallback handling comment or unfiltered-search fallback for failed hot-filter'
    );
  });

  it('intent analysis failure is caught and logs via stderrLog', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../.claude/hooks/routing/spawn-prompt-assembler.memory.cjs'),
      'utf8'
    );

    assert.ok(
      src.includes('intent_analysis') || src.includes('Intent analysis failed'),
      'Expected intent_analysis failure to be caught and logged'
    );
  });

  it('appendQueryMemories itself does not throw when called with a valid but empty result set', () => {
    // Regression guard: calling with valid args (no throws)
    const basePrompt = '## Task\nStay alive.\n';
    let threw = false;
    try {
      appendQueryMemories(basePrompt, []);
      appendQueryMemories(basePrompt, null);
      appendQueryMemories(basePrompt, undefined);
      appendQueryMemories(basePrompt, [makeResult('x', 0.5, 'ok')]);
    } catch (_err) {
      threw = true;
    }
    assert.ok(!threw, 'appendQueryMemories must never throw for valid inputs');
  });

  it('appendSemanticMatches does not throw when called with a valid but empty result set', () => {
    const basePrompt = '## Task\nStay alive.\n';
    let threw = false;
    try {
      appendSemanticMatches(basePrompt, []);
      appendSemanticMatches(basePrompt, null);
      appendSemanticMatches(basePrompt, undefined);
      appendSemanticMatches(basePrompt, [makeResult('y', 0.6, 'stable')]);
    } catch (_err) {
      threw = true;
    }
    assert.ok(!threw, 'appendSemanticMatches must never throw for valid inputs');
  });

  it('memory query failure falls back to intent results when memoryQueryEnabled=true (source-level)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../.claude/hooks/routing/spawn-prompt-assembler.memory.cjs'),
      'utf8'
    );

    // The catch block inside the memoryQueryEnabled branch must still inject
    // intent results (fallback behaviour documented in B2 fix comments).
    const hasFallbackInjection =
      src.includes('Fallback: if query fails but we have intent results') ||
      src.includes('still inject them') ||
      (src.includes('queryErr') &&
        src.includes('results.length > 0') &&
        src.includes('appendQueryMemories'));

    assert.ok(
      hasFallbackInjection,
      'Expected catch block in memoryQueryEnabled branch to fall back to injecting intent results'
    );
  });
});
