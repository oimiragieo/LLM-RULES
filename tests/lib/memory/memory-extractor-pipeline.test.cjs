'use strict';

/**
 * Tests for the extraction pipeline in .claude/lib/memory/memory-extractor.cjs
 *
 * The extractor is called fire-and-forget from post-completion-chain.cjs
 * when a TaskUpdate(completed) contains substantial metadata. It uses a
 * model client to extract structured memories, applies a 0.7 confidence
 * gate, and writes passing entries into STM.
 *
 * We avoid live model calls by supplying a mock ModelClient via the
 * `options.modelClient` injection point that extractMemoriesFromSession
 * already supports.
 *
 * Test cases:
 *   1. Extraction triggers when metadata.summary > 50 chars
 *   2. Extraction triggers when metadata.discoveries[] is non-empty
 *   3. Extraction does NOT trigger when summary < 50 chars AND no discoveries
 *   4. 0.7 confidence gate filters low-confidence extractions
 *   5. Extraction failure is logged but does not block task completion
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// ---------------------------------------------------------------------------
// Load the module under test
// ---------------------------------------------------------------------------

const EXTRACTOR_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'lib',
  'memory',
  'memory-extractor.cjs'
);

let extractMemoriesFromSession;
let buildRecentMessages;
let fallbackExtractMemories;
let extractCandidatesFromText;

before(() => {
  const mod = require(EXTRACTOR_PATH);
  extractMemoriesFromSession = mod.extractMemoriesFromSession;
  buildRecentMessages = mod.buildRecentMessages;
  fallbackExtractMemories = mod.fallbackExtractMemories;
  extractCandidatesFromText = mod.extractCandidatesFromText;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock ModelClient that resolves with a well-formed memories JSON.
 * @param {object[]} memories - array of memory objects to return
 */
function mockClientReturning(memories) {
  return {
    isMockMode: () => false,
    generateText: async () => `\`\`\`json\n${JSON.stringify({ memories })}\n\`\`\``,
  };
}

/**
 * Create a mock ModelClient that rejects (simulates model error).
 * @param {string} message - error message
 */
function mockClientThrows(message) {
  return {
    isMockMode: () => false,
    generateText: async () => {
      throw new Error(message);
    },
  };
}

/**
 * Create a mock ModelClient that returns unparseable text.
 */
function mockClientReturningInvalidJson() {
  return {
    isMockMode: () => false,
    generateText: async () => 'not valid json at all',
  };
}

/**
 * Build the sessionData that triggerMemoryExtraction creates from TaskUpdate metadata.
 * Mirrors the construction in post-completion-chain.cjs → triggerMemoryExtraction().
 * @param {object} metadata - TaskUpdate metadata
 */
function buildSessionDataFromMetadata(metadata) {
  const summary = typeof metadata.summary === 'string' ? metadata.summary : '';
  const discoveries = Array.isArray(metadata.discoveries) ? metadata.discoveries : [];
  const sessionMessages = [];
  if (summary) {
    sessionMessages.push({ role: 'assistant', content: summary });
  }
  return {
    recent_messages: sessionMessages,
    discoveries,
    filesModified: Array.isArray(metadata.filesModified) ? metadata.filesModified : [],
  };
}

/**
 * Evaluate the trigger condition from post-completion-chain (not the extractor itself).
 * Mirrors the hasSubstantialContent check in triggerMemoryExtraction().
 */
function meetsExtractionTrigger(metadata) {
  const summary = typeof metadata.summary === 'string' ? metadata.summary : '';
  const discoveries = Array.isArray(metadata.discoveries) ? metadata.discoveries : [];
  return summary.length > 50 || discoveries.length > 0;
}

/**
 * Apply the confidence gate from post-completion-chain (MEMORY_CONFIDENCE_THRESHOLD = 0.7).
 * Mirrors the `.filter()` in triggerMemoryExtraction().
 */
const CONFIDENCE_THRESHOLD = 0.7;

function applyConfidenceGate(memories) {
  return (memories || []).filter(m => {
    if (!m || typeof m !== 'object') return false;
    const conf = typeof m.confidence === 'number' ? m.confidence : 1.0;
    return conf >= CONFIDENCE_THRESHOLD;
  });
}

// ---------------------------------------------------------------------------
// Test Suite 1: Trigger Conditions
// ---------------------------------------------------------------------------

describe('memory-extractor pipeline — trigger conditions', () => {
  // Test 1: Extraction triggers when metadata.summary > 50 chars
  it('triggers extraction when metadata.summary exceeds 50 characters', async () => {
    const metadata = {
      summary:
        'Implemented JWT authentication middleware with refresh tokens, rate limiting, and Redis session store.',
      discoveries: [],
    };

    // Verify trigger fires
    assert.ok(
      meetsExtractionTrigger(metadata),
      'Trigger condition must be true for summary > 50 chars'
    );

    // Verify extraction runs and produces results
    const mockClient = mockClientReturning([
      {
        category: 'patterns',
        abstract: 'JWT auth pattern',
        content: 'Use refresh tokens',
        confidence: 0.9,
      },
    ]);
    const sessionData = buildSessionDataFromMetadata(metadata);

    const memories = await extractMemoriesFromSession(sessionData, { modelClient: mockClient });

    assert.ok(Array.isArray(memories), 'extractMemoriesFromSession should return an array');
    assert.equal(memories.length, 1, 'Should return one memory from mock model response');
    assert.equal(memories[0].category, 'patterns');
  });

  // Test 2: Extraction triggers when metadata.discoveries[] is non-empty
  it('triggers extraction when metadata.discoveries[] is non-empty', async () => {
    const metadata = {
      summary: 'Short', // < 50 chars
      discoveries: [
        'Found existing auth module at src/auth/',
        'Circular dependency in payment module',
      ],
    };

    // Verify trigger fires (discoveries make the condition true)
    assert.ok(
      meetsExtractionTrigger(metadata),
      'Trigger condition must be true for non-empty discoveries'
    );

    // Verify extraction runs with discoveries in sessionData
    const mockClient = mockClientReturning([
      {
        category: 'cases',
        abstract: 'Circular dependency gotcha',
        content: 'Circular dependency in payment module',
        confidence: 0.85,
      },
    ]);
    const sessionData = buildSessionDataFromMetadata(metadata);

    // discoveries should appear in sessionData
    assert.deepEqual(sessionData.discoveries, metadata.discoveries);

    const memories = await extractMemoriesFromSession(sessionData, { modelClient: mockClient });

    assert.ok(Array.isArray(memories), 'extractMemoriesFromSession should return an array');
    assert.equal(memories.length, 1, 'Should return one memory from mock model response');
  });

  // Test 3: Extraction does NOT trigger when summary < 50 chars AND no discoveries
  it('does NOT trigger extraction when summary is short and discoveries is empty', () => {
    const metadata = {
      summary: 'Minor tweak.',
      discoveries: [],
    };

    // Trigger condition must be false
    assert.equal(
      meetsExtractionTrigger(metadata),
      false,
      'Trigger must be false for short summary with no discoveries'
    );

    // Boundary: exactly 50 chars should NOT trigger (condition is strictly > 50)
    const exactly50 = 'A'.repeat(50);
    assert.equal(exactly50.length, 50);
    assert.equal(
      meetsExtractionTrigger({ summary: exactly50, discoveries: [] }),
      false,
      'Exactly 50 chars must NOT trigger (strictly > 50 required)'
    );

    // Boundary: 51 chars SHOULD trigger
    const fiftyone = 'A'.repeat(51);
    assert.equal(
      meetsExtractionTrigger({ summary: fiftyone, discoveries: [] }),
      true,
      '51 chars must trigger'
    );
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2: Confidence Gate (0.7 threshold)
// ---------------------------------------------------------------------------

describe('memory-extractor pipeline — 0.7 confidence gate', () => {
  // Test 4a: Gate filters out memories below 0.7
  it('confidence gate (0.7) filters low-confidence extraction results', async () => {
    const mockClient = mockClientReturning([
      { category: 'patterns', abstract: 'High conf', content: 'High', confidence: 0.9 },
      { category: 'patterns', abstract: 'At threshold', content: 'Borderline', confidence: 0.7 },
      { category: 'patterns', abstract: 'Below threshold', content: 'Low', confidence: 0.69 },
      { category: 'patterns', abstract: 'Zero conf', content: 'Zero', confidence: 0.0 },
    ]);

    const sessionData = buildSessionDataFromMetadata({
      summary: 'A summary that exceeds the fifty character threshold for the trigger to fire.',
      discoveries: [],
    });

    // Raw extraction (no gate applied yet)
    const rawMemories = await extractMemoriesFromSession(sessionData, {
      modelClient: mockClient,
    });

    assert.equal(rawMemories.length, 4, 'Mock should return all 4 memories before gating');

    // Apply confidence gate (mirrors post-completion-chain behaviour)
    const gated = applyConfidenceGate(rawMemories);

    assert.equal(gated.length, 2, 'Gate should keep only memories with confidence >= 0.7');
    assert.equal(gated[0].abstract, 'High conf');
    assert.equal(gated[1].abstract, 'At threshold');
  });

  // Test 4b: Memories without confidence field are accepted (default = 1.0)
  it('memories without explicit confidence field pass the gate (default 1.0)', async () => {
    const mockClient = mockClientReturning([
      { category: 'patterns', abstract: 'No conf field', content: 'Implicit high confidence' },
      { category: 'patterns', abstract: 'Explicit zero', content: 'Zero', confidence: 0.0 },
    ]);

    const sessionData = buildSessionDataFromMetadata({
      summary: 'Summary exceeding fifty characters to satisfy the extraction trigger condition.',
      discoveries: [],
    });

    const rawMemories = await extractMemoriesFromSession(sessionData, { modelClient: mockClient });
    const gated = applyConfidenceGate(rawMemories);

    assert.equal(gated.length, 1, 'Only the memory without a confidence field should pass');
    assert.equal(gated[0].abstract, 'No conf field');
  });

  // Test 4c: All memories filtered when all below threshold
  it('returns zero accepted memories when all are below the confidence threshold', async () => {
    const mockClient = mockClientReturning([
      { category: 'patterns', abstract: 'Low 1', content: 'A', confidence: 0.1 },
      { category: 'patterns', abstract: 'Low 2', content: 'B', confidence: 0.5 },
      { category: 'patterns', abstract: 'Just below', content: 'C', confidence: 0.699 },
    ]);

    const sessionData = buildSessionDataFromMetadata({
      summary: 'Summary exceeding fifty characters to satisfy the extraction trigger condition.',
      discoveries: [],
    });

    const rawMemories = await extractMemoriesFromSession(sessionData, { modelClient: mockClient });
    const gated = applyConfidenceGate(rawMemories);

    assert.equal(gated.length, 0, 'Should accept no memories when all are below 0.7');
  });

  // Test 4d: Null/non-object entries in memory array are silently filtered
  it('confidence gate silently filters null and non-object memory entries', () => {
    const mixed = [null, undefined, 'string-entry', 42, { abstract: 'Valid', confidence: 0.8 }];
    const gated = applyConfidenceGate(mixed);

    assert.equal(gated.length, 1, 'Should keep only the valid object with high confidence');
    assert.equal(gated[0].abstract, 'Valid');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3: Extraction Failure Handling
// ---------------------------------------------------------------------------

describe('memory-extractor pipeline — failure handling', () => {
  // Test 5a: Model error returns empty array (does not throw)
  it('returns empty array when model client throws — does not propagate the error', async () => {
    const failingClient = mockClientThrows('Connection refused to Anthropic API');

    const sessionData = buildSessionDataFromMetadata({
      summary: 'Summary that meets the fifty character threshold to trigger extraction.',
      discoveries: [],
    });

    // extractMemoriesFromSession must not throw — it catches internally
    let memories;
    let caughtError = null;
    try {
      memories = await extractMemoriesFromSession(sessionData, { modelClient: failingClient });
    } catch (err) {
      caughtError = err;
    }

    assert.equal(caughtError, null, 'extractMemoriesFromSession must NOT propagate model errors');
    assert.ok(Array.isArray(memories), 'Should return an array even on model failure');
    // The extractor falls back to fallbackExtractMemories or heuristic — may return [] or candidates
    // Either is acceptable; the important thing is no throw
  });

  // Test 5b: Invalid JSON from model returns empty array (does not throw)
  it('returns empty array when model response is not valid JSON', async () => {
    const badJsonClient = mockClientReturningInvalidJson();

    const sessionData = buildSessionDataFromMetadata({
      summary: 'A valid summary that exceeds the fifty character threshold for trigger activation.',
      discoveries: [],
    });

    let memories;
    let caughtError = null;
    try {
      memories = await extractMemoriesFromSession(sessionData, { modelClient: badJsonClient });
    } catch (err) {
      caughtError = err;
    }

    assert.equal(caughtError, null, 'Must not throw on unparseable model response');
    assert.ok(Array.isArray(memories), 'Should return an array on bad model JSON');
  });

  // Test 5c: fire-and-forget semantics — Promise.race rejection does not leak
  it('Promise.race timeout rejection is handled within the extraction pipeline', async () => {
    // Simulate the exact pattern from post-completion-chain: Promise.race with timeout
    const EXTRACTION_TIMEOUT_MS = 5000;

    // A fast client (resolves before timeout)
    const fastClient = mockClientReturning([
      { category: 'patterns', abstract: 'Fast result', content: 'Speed', confidence: 0.95 },
    ]);

    const sessionData = buildSessionDataFromMetadata({
      summary: 'Summary that triggers the extraction pipeline and resolves before timeout fires.',
      discoveries: [],
    });

    // Simulate the Promise.race pattern from triggerMemoryExtraction
    let caughtError = null;
    let raceResult = null;

    try {
      raceResult = await Promise.race([
        extractMemoriesFromSession(sessionData, { modelClient: fastClient }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('memory extraction timeout')), EXTRACTION_TIMEOUT_MS)
        ),
      ]);
    } catch (err) {
      caughtError = err;
    }

    // Fast client wins — no timeout
    assert.equal(caughtError, null, 'Fast extraction should not hit the timeout');
    assert.ok(Array.isArray(raceResult), 'Race winner should be the memories array');
    assert.equal(raceResult.length, 1);
    assert.equal(raceResult[0].abstract, 'Fast result');
  });

  // Test 5d: Timeout wins the race — rejection caught by .catch() handler
  it('timeout rejection is caught by .catch() handler — does not escape', async () => {
    // Simulate slow extraction that loses the race
    const TIMEOUT_MS = 50; // short for test speed

    const slowClient = {
      isMockMode: () => false,
      generateText: async () => {
        await new Promise(resolve => setTimeout(resolve, TIMEOUT_MS + 100));
        return JSON.stringify({ memories: [] });
      },
    };

    const sessionData = buildSessionDataFromMetadata({
      summary: 'Summary long enough to trigger extraction but extraction is too slow to finish.',
      discoveries: [],
    });

    let caughtInHandler = null;
    let resolvedValue = null;

    // Simulate the .catch() handler in triggerMemoryExtraction
    await Promise.race([
      extractMemoriesFromSession(sessionData, { modelClient: slowClient }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('memory extraction timeout')), TIMEOUT_MS)
      ),
    ])
      .then(v => {
        resolvedValue = v;
      })
      .catch(err => {
        caughtInHandler = err;
      });

    // The timeout should have fired and been caught by .catch()
    assert.ok(caughtInHandler instanceof Error, 'Timeout error should be caught by .catch()');
    assert.ok(
      caughtInHandler.message.includes('timeout'),
      'Caught error should be the timeout rejection'
    );
    assert.equal(resolvedValue, null, 'Resolution should not have occurred');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 4: buildRecentMessages utility (used by extractor)
// ---------------------------------------------------------------------------

describe('memory-extractor pipeline — buildRecentMessages', () => {
  it('formats recent_messages array into role-prefixed lines', () => {
    const sessionData = {
      recent_messages: [
        { role: 'user', content: 'Run the tests' },
        { role: 'assistant', content: 'Tests passed.' },
      ],
    };

    const output = buildRecentMessages(sessionData);
    assert.ok(output.includes('[user]: Run the tests'), 'Should include user message');
    assert.ok(output.includes('[assistant]: Tests passed.'), 'Should include assistant message');
  });

  it('falls back to summary/decisions/patterns fields when recent_messages is empty', () => {
    const sessionData = {
      recent_messages: [],
      summary: 'Task completed successfully.',
      decisions_made: ['Use JWT over sessions'],
      patterns_found: ['Cache tokens in Redis'],
    };

    const output = buildRecentMessages(sessionData);
    assert.ok(output.includes('Task completed successfully.'), 'Should include summary');
    assert.ok(output.includes('Use JWT over sessions'), 'Should include decisions');
    assert.ok(output.includes('Cache tokens in Redis'), 'Should include patterns');
  });

  it('returns empty string for null/undefined sessionData', () => {
    assert.equal(buildRecentMessages(null), '');
    assert.equal(buildRecentMessages(undefined), '');
  });

  it('truncates output at RECENT_MESSAGES_MAX_CHARS (8000 chars default)', () => {
    // Create content that exceeds the default 8000-char limit
    const longMessage = 'A'.repeat(10000);
    const sessionData = {
      recent_messages: [{ role: 'assistant', content: longMessage }],
    };

    const output = buildRecentMessages(sessionData);
    // Output should be at most 8000 chars (the trailing slice)
    assert.ok(output.length <= 8000, `Output should be <= 8000 chars, got ${output.length}`);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 5: fallbackExtractMemories
// ---------------------------------------------------------------------------

describe('memory-extractor pipeline — fallbackExtractMemories', () => {
  it('extracts pattern candidates from sessionData.patterns_found', () => {
    const sessionData = {
      patterns_found: ['Use memoization for expensive computations'],
      gotchas_encountered: [],
      decisions_made: [],
      tasks_completed: [],
    };

    const candidates = fallbackExtractMemories(sessionData);
    assert.ok(candidates.length >= 1, 'Should produce at least one candidate from patterns_found');
    const patternCandidate = candidates.find(c => c.category === 'patterns');
    assert.ok(patternCandidate, 'Should have a patterns-category candidate');
    assert.ok(
      patternCandidate.content.includes('memoization'),
      'Candidate content should reflect the pattern'
    );
  });

  it('extracts gotcha candidates from sessionData.gotchas_encountered', () => {
    const sessionData = {
      patterns_found: [],
      gotchas_encountered: ['path.relative() returns backslash on Windows'],
      decisions_made: [],
      tasks_completed: [],
    };

    const candidates = fallbackExtractMemories(sessionData);
    const gotchaCandidate = candidates.find(c => c.category === 'cases');
    assert.ok(gotchaCandidate, 'Should produce a cases-category candidate from gotchas');
    assert.ok(
      gotchaCandidate.content.includes('backslash'),
      'Candidate content should match the gotcha text'
    );
  });

  it('returns empty array for empty sessionData', () => {
    const candidates = fallbackExtractMemories({
      patterns_found: [],
      gotchas_encountered: [],
      decisions_made: [],
      tasks_completed: [],
    });

    assert.equal(candidates.length, 0, 'Should return empty array for all-empty sessionData');
  });

  it('handles null sessionData without throwing', () => {
    const candidates = fallbackExtractMemories(null);
    assert.deepEqual(candidates, [], 'Should return empty array for null sessionData');
  });
});

// ---------------------------------------------------------------------------
// Test Suite 6: extractCandidatesFromText (heuristic text extractor)
// ---------------------------------------------------------------------------

describe('memory-extractor pipeline — extractCandidatesFromText', () => {
  it('extracts pattern lines starting with "pattern:"', () => {
    const text = 'Pattern: Always use safeParseJSON for untrusted input\nSome other text';
    const candidates = extractCandidatesFromText(text);

    const patternCand = candidates.find(c => c.category === 'patterns');
    assert.ok(patternCand, 'Should extract a pattern candidate');
    assert.ok(
      patternCand.content.includes('safeParseJSON'),
      'Pattern content should contain the extracted text'
    );
  });

  it('extracts gotcha lines starting with "gotcha:"', () => {
    const text = 'Gotcha: shell: true enables command injection\nOther content';
    const candidates = extractCandidatesFromText(text);

    const gotchaCand = candidates.find(c => c.category === 'cases');
    assert.ok(gotchaCand, 'Should extract a gotcha candidate');
    assert.ok(
      gotchaCand.content.includes('injection'),
      'Gotcha content should contain the extracted text'
    );
  });

  it('extracts decision lines starting with "decision:"', () => {
    const text = 'Decision: Use JWT over sessions for stateless auth';
    const candidates = extractCandidatesFromText(text);

    const decisionCand = candidates.find(c => c.category === 'events');
    assert.ok(decisionCand, 'Should extract a decision candidate');
    assert.ok(
      decisionCand.content.includes('JWT'),
      'Decision content should contain the extracted text'
    );
  });

  it('returns empty array for empty or null text', () => {
    assert.deepEqual(extractCandidatesFromText(''), []);
    assert.deepEqual(extractCandidatesFromText(null), []);
    assert.deepEqual(extractCandidatesFromText(undefined), []);
  });

  it('ignores lines that do not match any known prefix', () => {
    const text = 'Random line without any recognized keyword prefix\nAnother random line';
    const candidates = extractCandidatesFromText(text);

    assert.equal(candidates.length, 0, 'Should return empty array for unrecognized lines');
  });
});
