'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const INSTALLER_PATH = path.join(PROJECT_ROOT, 'scripts', 'installation', 'install.mjs');

test('installer copies and runs the canonical validation script path', () => {
  const source = fs.readFileSync(INSTALLER_PATH, 'utf8');

  assert.match(source, /scripts['"],\s*['"]validation['"],\s*['"]validate-config\.mjs/);
  assert.match(source, /node scripts\/validation\/validate-config\.mjs/);
  assert.doesNotMatch(source, /node scripts\/validate-config\.mjs/);
});
