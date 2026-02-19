'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_DIR = path.join(process.cwd(), '.claude', 'schemas');

const KEY_FILES = [
  'scripts/validation/validate-config.mjs',
  'scripts/validation/validate-all-references.mjs',
  '.claude/tools/run-agent-framework-integration-headless.mjs',
];

const UNDERSCORE_SCHEMA_NAMES = [
  'artifact_manifest.schema.json',
  'product_requirements.schema.json',
  'project_brief.schema.json',
  'system_architecture.schema.json',
  'test_plan.schema.json',
  'ux_spec.schema.json',
];

test('INT-05: schema directory has no underscore-vs-kebab duplicate pairs', () => {
  const names = fs.readdirSync(SCHEMA_DIR).filter(name => name.endsWith('.schema.json'));
  const byNormalized = new Map();

  for (const name of names) {
    const normalized = name.replace(/[_-]/g, '-');
    const list = byNormalized.get(normalized) || [];
    list.push(name);
    byNormalized.set(normalized, list);
  }

  const duplicates = [...byNormalized.values()].filter(
    list => list.length > 1 && list.some(n => n.includes('_')) && list.some(n => n.includes('-'))
  );

  assert.deepEqual(
    duplicates,
    [],
    `Found underscore/kebab duplicate schemas: ${JSON.stringify(duplicates)}`
  );
});

test('INT-05: key validators reference kebab-case schema filenames', () => {
  for (const file of KEY_FILES) {
    const src = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    for (const legacyName of UNDERSCORE_SCHEMA_NAMES) {
      assert.equal(
        src.includes(legacyName),
        false,
        `${file} still references legacy underscore schema ${legacyName}`
      );
    }
  }
});
