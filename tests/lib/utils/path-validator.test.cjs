/**
 * Tests for path-validator module
 * Bug 1 regression: trailing .. traversal bypass in validatePathSafety
 *
 * @see .claude/lib/utils/path-validator.cjs
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Module under test
const {
  validatePathSafety,
  validatePathContext,
  validateSidecarOwnership,
  PATH_CONTEXTS,
} = require(path.join(process.cwd(), '.claude', 'lib', 'utils', 'path-validator.cjs'));

describe('path-validator module', () => {
  describe('validatePathSafety()', () => {
    it('returns valid for a safe relative path', () => {
      const result = validatePathSafety('.claude/context/memory/learnings.md');
      assert.strictEqual(result.valid, true);
    });

    it('returns invalid for null/undefined path', () => {
      assert.strictEqual(validatePathSafety(null).valid, false);
      assert.strictEqual(validatePathSafety(undefined).valid, false);
    });

    it('returns invalid for non-string path', () => {
      assert.strictEqual(validatePathSafety(42).valid, false);
    });

    it('detects basic ../ traversal', () => {
      const result = validatePathSafety('../etc/passwd');
      assert.strictEqual(result.valid, false, '../etc/passwd should be blocked');
    });

    it('detects Windows ..\\ traversal', () => {
      const result = validatePathSafety('..\\windows\\system32');
      assert.strictEqual(result.valid, false, '..\\windows\\system32 should be blocked');
    });

    // Bug 1 regression tests — bare .. at end of path (trailing .. traversal bypass)
    it('detects bare .. at end of path (foo/bar/..)', () => {
      const result = validatePathSafety('foo/bar/..');
      assert.strictEqual(
        result.valid,
        false,
        'foo/bar/.. should be blocked (trailing .. traversal)'
      );
    });

    it('detects standalone .. segment', () => {
      const result = validatePathSafety('..');
      assert.strictEqual(result.valid, false, 'standalone .. should be blocked');
    });

    it('detects bare .. at end of path with backslash (foo\\bar\\..)', () => {
      const result = validatePathSafety('foo\\bar\\..');
      assert.strictEqual(
        result.valid,
        false,
        'foo\\bar\\.. should be blocked (Windows trailing .. traversal)'
      );
    });

    it('detects .. segment embedded in longer path (a/../../etc)', () => {
      const result = validatePathSafety('a/../../etc');
      assert.strictEqual(result.valid, false, 'a/../../etc should be blocked');
    });

    it('allows valid relative paths that do not escape project root', () => {
      const result = validatePathSafety('.claude/skills/tdd/SKILL.md');
      assert.strictEqual(result.valid, true, '.claude/skills/tdd/SKILL.md should be allowed');
    });

    it('allows paths with dots in filenames (not traversal)', () => {
      const result = validatePathSafety('src/v1.2.3/file.js');
      assert.strictEqual(
        result.valid,
        true,
        'src/v1.2.3/file.js should be allowed (dots in version string are not traversal)'
      );
    });
  });

  describe('validatePathContext()', () => {
    it('returns invalid for unknown context', () => {
      const result = validatePathContext('some/path', 'UNKNOWN_CONTEXT');
      assert.strictEqual(result.valid, false);
      assert.ok(result.reason.includes('Unknown path context'));
    });

    it('allows path matching SHARED_MEMORY context prefix', () => {
      const result = validatePathContext('.claude/context/memory/learnings.md', 'SHARED_MEMORY');
      assert.strictEqual(result.valid, true);
    });

    it('rejects path not matching SHARED_MEMORY context prefix', () => {
      const result = validatePathContext('src/file.js', 'SHARED_MEMORY');
      assert.strictEqual(result.valid, false);
      assert.ok(result.reason.includes('not in allowed prefixes'));
    });

    it('allows path matching SKILL_PATHS context prefix', () => {
      const result = validatePathContext('.claude/skills/tdd/SKILL.md', 'SKILL_PATHS');
      assert.strictEqual(result.valid, true);
    });

    // Bug 1 regression — context validation should also block traversal
    it('rejects traversal path even when context matches prefix pattern', () => {
      const result = validatePathContext(
        '.claude/context/memory/../../../etc/passwd',
        'SHARED_MEMORY'
      );
      assert.strictEqual(result.valid, false, 'traversal should be blocked by safety check');
    });

    it('rejects trailing .. traversal in context validation', () => {
      const result = validatePathContext('.claude/context/memory/..', 'SHARED_MEMORY');
      assert.strictEqual(result.valid, false, 'trailing .. should be blocked by safety check');
    });
  });

  describe('validateSidecarOwnership()', () => {
    it('returns invalid for path with wrong agent name', () => {
      const result = validateSidecarOwnership(
        '.claude/memory/agents/other-agent/state.json',
        'my-agent'
      );
      assert.strictEqual(result.valid, false);
      assert.ok(result.reason.includes('does not match'));
    });

    it('returns valid for path with matching agent name', () => {
      const result = validateSidecarOwnership(
        '.claude/memory/agents/my-agent/state.json',
        'my-agent'
      );
      assert.strictEqual(result.valid, true);
    });

    it('returns invalid for sidecar path with traversal', () => {
      const result = validateSidecarOwnership(
        '.claude/memory/agents/my-agent/../other-agent/state.json',
        'my-agent'
      );
      assert.strictEqual(result.valid, false, 'traversal in sidecar path should be blocked');
    });

    it('returns invalid for trailing .. in sidecar path', () => {
      const result = validateSidecarOwnership('.claude/memory/agents/my-agent/..', 'my-agent');
      assert.strictEqual(result.valid, false, 'trailing .. in sidecar path should be blocked');
    });
  });

  describe('PATH_CONTEXTS', () => {
    it('exports SIDECAR context', () => {
      assert.ok(PATH_CONTEXTS.SIDECAR);
      assert.ok(Array.isArray(PATH_CONTEXTS.SIDECAR.allowedPrefixes));
    });

    it('exports SHARED_MEMORY context', () => {
      assert.ok(PATH_CONTEXTS.SHARED_MEMORY);
    });

    it('exports SKILL_PATHS context', () => {
      assert.ok(PATH_CONTEXTS.SKILL_PATHS);
    });
  });
});
