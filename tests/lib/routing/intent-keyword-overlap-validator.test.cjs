'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '../../..');
const validatorPath = path.join(
  projectRoot,
  'scripts',
  'validation',
  'validate-intent-keyword-overlap.cjs'
);
const { INTENT_KEYWORDS } = require(path.join(
  projectRoot,
  '.claude',
  'lib',
  'routing',
  'routing-table-intent-keywords-data.cjs'
));

test('routing intent keywords do not include tmp-routing ghost agents', () => {
  const ghostAgentIds = Object.keys(INTENT_KEYWORDS).filter(agentId => agentId.startsWith('tmp-routing-'));
  assert.deepStrictEqual(ghostAgentIds, []);
});

test('intent keyword overlap validator passes', () => {
  const result = spawnSync(process.execPath, [validatorPath], {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  assert.strictEqual(result.status, 0, result.stdout || result.stderr || 'validator should exit 0');
});
