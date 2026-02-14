'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hook = require('../../.claude/hooks/validation/pre-completion-validation.cjs');

test('isEcosystemCreatorAction returns true when creator keyword appears in summary', () => {
  const params = {
    metadata: {
      summary: 'Run skill-creator to update tool scaffolding',
      filesModified: [],
      filesCreated: [],
    },
  };

  assert.equal(hook.isEcosystemCreatorAction(params), true);
});

test('isEcosystemCreatorAction returns false for non-creator task metadata', () => {
  const params = {
    metadata: {
      summary: 'Refactor logging utility and add tests',
      filesModified: ['src/logging/logger.cjs'],
      filesCreated: [],
    },
  };

  assert.equal(hook.isEcosystemCreatorAction(params), false);
});

test('validateCreatorEcosystem honors validator path override', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-ecosystem-'));
  const validatorPath = path.join(tmpDir, 'validator.cjs');

  fs.writeFileSync(validatorPath, 'process.exit(1);\n', 'utf8');
  process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH = validatorPath;

  // Re-require hook module to pick up env-based constant
  delete require.cache[
    require.resolve('../../.claude/hooks/validation/pre-completion-validation.cjs')
  ];
  const freshHook = require('../../.claude/hooks/validation/pre-completion-validation.cjs');

  const result = freshHook.validateCreatorEcosystem();
  assert.equal(result.passed, false);
  assert.ok(result.issues.length >= 1);

  delete process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH;
  delete require.cache[
    require.resolve('../../.claude/hooks/validation/pre-completion-validation.cjs')
  ];
});
