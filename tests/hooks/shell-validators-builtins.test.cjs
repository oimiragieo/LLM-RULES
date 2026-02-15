'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');

const { DANGEROUS_BUILTINS } = require('../../.claude/hooks/safety/validators/shell-validators.cjs');
const { DANGEROUS_BUILTIN_CASES } = require('../helpers/shell-validator-cases.cjs');

describe('shell-validators dangerous builtins', () => {
  describe('DANGEROUS_BUILTINS', () => {
    for (const tc of DANGEROUS_BUILTIN_CASES) {
      test(`includes ${tc.name} pattern`, () => {
        const pattern = DANGEROUS_BUILTINS.find(p => p.name === tc.name);
        assert.ok(pattern, `${tc.name} pattern should exist`);
        tc.matchMany.forEach((candidate, index) => {
          assert.ok(pattern.pattern.test(candidate), tc.messageMany[index]);
        });
        if (tc.nonMatchMany) {
          tc.nonMatchMany.forEach((candidate, index) => {
            assert.strictEqual(pattern.pattern.test(candidate), false, tc.nonMatchMessages[index]);
          });
        }
      });
    }
  });
});
