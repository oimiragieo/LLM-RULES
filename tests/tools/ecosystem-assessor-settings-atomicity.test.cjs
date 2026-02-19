'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('CON-04: ecosystem assessor settings writes are atomic', () => {
  const file = path.join(
    process.cwd(),
    '.claude',
    'tools',
    'analysis',
    'ecosystem-assessor',
    'assess-ecosystem.mjs'
  );
  const src = fs.readFileSync(file, 'utf8');

  assert.match(src, /atomicWriteJSONSync/, 'assess-ecosystem should use atomicWriteJSONSync');
  assert.doesNotMatch(
    src,
    /writeFileSync\(SETTINGS_PATH,\s*JSON\.stringify\(/,
    'assess-ecosystem must not write settings.json via direct writeFileSync'
  );
});
