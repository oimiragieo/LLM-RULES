'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const {
  isSignalContent,
  generateSessionSummary,
} = require('../../../.claude/lib/memory/memory-tiers-ltm-helpers.cjs');

// ---------------------------------------------------------------------------
// isSignalContent — unit tests
// ---------------------------------------------------------------------------

describe('isSignalContent', () => {
  // Test 1: rejects short text WITHOUT signal keywords
  it('rejects short text with no signal keywords', () => {
    assert.strictEqual(isSignalContent('Good morning'), false);
    assert.strictEqual(isSignalContent('Hello world'), false);
    assert.strictEqual(isSignalContent('Ok'), false);
    // Empty string
    assert.strictEqual(isSignalContent(''), false);
    // Non-string
    assert.strictEqual(isSignalContent(null), false);
    assert.strictEqual(isSignalContent(42), false);
  });

  // Test 2: accepts short text WITH signal keywords (no length minimum when signal present)
  it('accepts short text that contains a signal keyword', () => {
    // 43 chars but has "root cause" signal
    assert.strictEqual(isSignalContent('Root cause: race condition in EventBus.js'), true);
    // Contains a .cjs extension
    assert.strictEqual(isSignalContent('Fix in memory-tiers.cjs'), true);
    // Contains "hook" keyword
    assert.strictEqual(isSignalContent('Hook path changed'), true);
    // Contains .claude/ path
    assert.strictEqual(isSignalContent('Path: .claude/lib'), true);
  });

  // Test 3: rejects user-prompt noise patterns
  it('rejects conversational user-intent and request phrases', () => {
    assert.strictEqual(isSignalContent('Show me all components'), false);
    assert.strictEqual(isSignalContent('I want you to review the codebase'), false);
    assert.strictEqual(isSignalContent('Can you help me with this?'), false);
    assert.strictEqual(isSignalContent('Please fix the linting errors'), false);
    assert.strictEqual(isSignalContent('Help me understand this code'), false);
    assert.strictEqual(isSignalContent('What is the best way to test this?'), false);
    assert.strictEqual(isSignalContent('How do I configure the hook?'), false);
    assert.strictEqual(isSignalContent('I would like to refactor the agent'), false);
    assert.strictEqual(isSignalContent('I need you to create a new skill'), false);
    assert.strictEqual(isSignalContent('User prompt submitted: fix all linting'), false);
    assert.strictEqual(isSignalContent('Say hello to the user'), false);
  });

  // Test 4: accepts first-person agent findings (not noise)
  it('accepts first-person agent findings', () => {
    assert.strictEqual(isSignalContent('I found that the routing table needs updating'), true);
    assert.strictEqual(
      isSignalContent('I confirmed the hook exits with code 0 on error'),
      true
    );
    assert.strictEqual(
      isSignalContent('I discovered a bug in the spawn-prompt-assembler'),
      true
    );
    assert.strictEqual(
      isSignalContent('I verified the test passes after reverting the change'),
      true
    );
    assert.strictEqual(
      isSignalContent('I identified a race condition in memory-tiers.cjs'),
      true
    );
    assert.strictEqual(
      isSignalContent('I noticed that session.summary is not filtered'),
      true
    );
    assert.strictEqual(
      isSignalContent('I observed the agent skipping TaskUpdate in 3 sessions'),
      true
    );
  });

  // Test 5: accepts technical summaries with file references
  it('accepts technical summaries with file references and keywords', () => {
    assert.strictEqual(
      isSignalContent(
        'Delegation chain flattened: 4-hop to 2-hop in memory-manager.cjs'
      ),
      true
    );
    assert.strictEqual(
      isSignalContent('ADR-102: memory system refactored to use STM/MTM/LTM tiers'),
      true
    );
    assert.strictEqual(
      isSignalContent(
        'spawn-prompt-assembler.cjs now injects memory context via .claude/hooks/'
      ),
      true
    );
    assert.strictEqual(
      isSignalContent('function generateSessionSummary now filters noise via isSignalContent'),
      true
    );
    assert.strictEqual(
      isSignalContent(
        'Implementation: LTM eviction uses utility = access_count * decay formula'
      ),
      true
    );
  });

  // Test 6: rejects "User prompt submitted" prefix (including compound case)
  it('rejects "User prompt submitted" prefix in all forms', () => {
    assert.strictEqual(isSignalContent('User prompt submitted'), false);
    assert.strictEqual(
      isSignalContent('User prompt submitted: I want you to review the codebase'),
      false
    );
    assert.strictEqual(
      isSignalContent('User prompt submitted: fix all linting errors in .claude/hooks/'),
      false
    );
    // Compound: even though the body contains signal keywords, the prefix matches noise
    assert.strictEqual(
      isSignalContent('User prompt submitted: agent.cjs has a bug in the hook'),
      false
    );
  });
});

// ---------------------------------------------------------------------------
// generateSessionSummary — integration tests
// ---------------------------------------------------------------------------

describe('generateSessionSummary', () => {
  // Test 7: excludes raw user prompts from key_learnings
  it('excludes raw user prompts from key_learnings', () => {
    const sessions = [
      {
        session_id: 's1',
        timestamp: '2026-03-01T10:00:00Z',
        summary: 'Show me all components in the project',
      },
      {
        session_id: 's2',
        timestamp: '2026-03-02T10:00:00Z',
        summary: 'I want you to fix the linting errors',
      },
      {
        session_id: 's3',
        timestamp: '2026-03-03T10:00:00Z',
        summary: 'User prompt submitted: run the tests please',
      },
    ];

    const result = generateSessionSummary(sessions);
    assert.ok(result, 'should return a non-null result');
    assert.deepStrictEqual(
      result.key_learnings,
      [],
      'key_learnings should be empty — all summaries are user-prompt noise'
    );
  });

  // Test 8: includes technical summaries in key_learnings
  it('includes technical summaries with signal content in key_learnings', () => {
    const sessions = [
      {
        session_id: 's1',
        timestamp: '2026-03-01T10:00:00Z',
        summary:
          'I found that memory-tiers-ltm-helpers.cjs lacked input filtering in generateSessionSummary',
      },
      {
        session_id: 's2',
        timestamp: '2026-03-02T10:00:00Z',
        summary:
          'ADR-102: LTM eviction redesigned to use cap-based approach instead of threshold-based',
      },
      {
        session_id: 's3',
        timestamp: '2026-03-03T10:00:00Z',
        summary: 'Root cause: race condition in EventBus.js handler registration order',
      },
    ];

    const result = generateSessionSummary(sessions);
    assert.ok(result, 'should return a non-null result');
    assert.strictEqual(result.key_learnings.length, 3, 'all 3 technical summaries should be included');
    assert.ok(
      result.key_learnings[0].includes('memory-tiers-ltm-helpers.cjs'),
      'first learning should reference the file'
    );
    assert.ok(
      result.key_learnings[1].includes('ADR-102'),
      'second learning should include ADR reference'
    );
    assert.ok(
      result.key_learnings[2].toLowerCase().includes('root cause'),
      'third learning should include root cause'
    );
  });

  // Test 9: returns empty key_learnings when ALL input is noise (no fallback stub)
  it('returns empty key_learnings (no stub) when all session summaries are noise', () => {
    const sessions = [
      {
        session_id: 's1',
        timestamp: '2026-03-01T10:00:00Z',
        summary: 'Please help me understand the agent routing',
      },
      {
        session_id: 's2',
        timestamp: '2026-03-02T10:00:00Z',
        summary: 'Can you show me the hook list?',
      },
      {
        session_id: 's3',
        timestamp: '2026-03-03T10:00:00Z',
        summary: 'I would like to know more about the memory system',
      },
    ];

    const result = generateSessionSummary(sessions);
    assert.ok(result, 'generateSessionSummary should still return a result object');
    // Empty is CORRECT — no stub, no fallback noise should be promoted to LTM
    assert.deepStrictEqual(result.key_learnings, [], 'key_learnings must be empty [] — no stub');
    // Verify other fields are still populated correctly
    assert.strictEqual(result.session_count, 3);
    assert.strictEqual(result.type, 'session_summary');
    assert.deepStrictEqual(result.session_ids, ['s1', 's2', 's3']);
  });
});
