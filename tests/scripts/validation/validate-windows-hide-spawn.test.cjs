'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { hasWindowsHide } = require('../../../scripts/validation/validate-windows-hide-spawn.cjs');

test('hasWindowsHide recognizes buildGitExecOptions helper usage', () => {
  const lines = ["  execFileSync('git', ['pull'], buildGitExecOptions({ cwd: marketplaceDir }));"];

  assert.equal(hasWindowsHide(lines, 0), true);
});
