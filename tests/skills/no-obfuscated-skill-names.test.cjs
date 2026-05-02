'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  isArchivedSkillName,
  scanSkillFilesRecursively,
} = require('../../.claude/tools/cli/generate-skill-index.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

test('active skills do not include the trust-neg-xNenr8 test artifact', () => {
  const skills = scanSkillFilesRecursively(path.join(PROJECT_ROOT, '.claude', 'skills'));
  const activeSkillNames = Object.keys(skills).filter(name => !isArchivedSkillName(name));

  assert.equal(activeSkillNames.includes('trust-neg-xNenr8'), false);
});
