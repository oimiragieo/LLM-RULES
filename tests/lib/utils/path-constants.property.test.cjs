'use strict';
// Property-based invariants for path-constants.cjs
// Run: node --test tests/lib/utils/path-constants.property.test.cjs
const { test } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const { PROJECT_ROOT, resolveProjectPath } = require('../../../.claude/lib/utils/path-constants.cjs');

test('[property] resolveProjectPath result is always under PROJECT_ROOT or throws', () => {
  fc.assert(fc.property(
    fc.string({ minLength: 1 }).filter(s => !s.includes('\0')),
    (suffix) => {
      try {
        const result = resolveProjectPath(suffix);
        return result.startsWith(PROJECT_ROOT);
      } catch (_) {
        return true; // throwing is also acceptable
      }
    }
  ));
});

test('[property] resolveProjectPath is idempotent', () => {
  fc.assert(fc.property(
    fc.constantFrom('.claude/hooks', '.claude/skills', '.claude/agents', '.claude/context'),
    (rel) => {
      const a = resolveProjectPath(rel);
      const b = resolveProjectPath(rel);
      return a === b;
    }
  ));
});

test('[property] traversal paths always throw — never silently return outside path', () => {
  fc.assert(fc.property(
    fc.nat(5).map(n => '../'.repeat(n + 1) + 'etc/passwd'),
    (traversal) => {
      try {
        resolveProjectPath(traversal);
        return false; // should have thrown
      } catch (_) {
        return true;
      }
    }
  ));
});
