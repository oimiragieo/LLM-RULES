'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadBaseline,
  lookupBaselineSize,
} = require('../../../scripts/validation/validate-module-size-guardrail.cjs');

test('lookupBaselineSize matches the same path across slash styles', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'module-size-guardrail-'));
  try {
    const baselinePath = path.join(root, 'module-size-baseline.json');
    fs.writeFileSync(
      baselinePath,
      JSON.stringify(
        {
          '.claude\\hooks\\routing\\user-prompt-unified.core.cjs': 2419,
        },
        null,
        2
      ),
      'utf8'
    );

    const baseline = loadBaseline(baselinePath);

    assert.equal(
      lookupBaselineSize(baseline, '.claude/hooks/routing/user-prompt-unified.core.cjs'),
      2419
    );
    assert.equal(
      lookupBaselineSize(baseline, '.claude\\hooks\\routing\\user-prompt-unified.core.cjs'),
      2419
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
