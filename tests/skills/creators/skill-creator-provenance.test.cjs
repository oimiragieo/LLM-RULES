'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const { generateSkillContent } = require(
  path.join(PROJECT_ROOT, '.claude', 'skills', 'skill-creator', 'scripts', 'create-templates.cjs')
);
const { validateSkillProvenance } = require(
  path.join(PROJECT_ROOT, '.claude', 'lib', 'validation', 'skill-provenance.cjs')
);

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, 'skill content should include frontmatter');

  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!field) continue;
    const [, key, value] = field;
    frontmatter[key] = /^\d+$/.test(value) ? Number(value) : value.replace(/^"|"$/g, '');
  }
  return frontmatter;
}

test('skill creator templates include provenance required by skill-index generation', () => {
  const content = generateSkillContent({
    name: 'provenance-template-test',
    description: 'Verifies generated skills satisfy provenance validation.',
  });

  const frontmatter = parseFrontmatter(content);
  const result = validateSkillProvenance(frontmatter, 'generated SKILL.md');

  assert.deepEqual(result.errors, []);
  assert.match(frontmatter.provenance_sha, /^[0-9a-f]{16}$/);
});
