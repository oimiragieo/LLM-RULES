'use strict';

const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');

function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}

const { atomicWriteJSONSync } = libRequire(path.join('utils', 'atomic-write.cjs'));
const { safeParseJSON } = libRequire(path.join('utils', 'safe-json.cjs'));
const { appendJsonl } = libRequire(path.join('utils', 'jsonl-utils.cjs'));
const routerState = libRequire(path.join('routing', 'router-state.cjs'));
const { canonicalizePathForPlatform } = libRequire(path.join('utils', 'path-canonicalizer.cjs'));

module.exports = {
  PROJECT_ROOT,
  libRequire,
  atomicWriteJSONSync,
  safeParseJSON,
  appendJsonl,
  routerState,
  canonicalizePathForPlatform,
};
