'use strict';

const { afterEach, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const reader = require(
  path.resolve(__dirname, '../../../.claude/lib/utils/knowledge-base-reader.cjs')
);

let previousProjectRoot;
let tempRoot;

const headers = [
  'name',
  'path',
  'description',
  'domain',
  'complexity',
  'use_cases',
  'tools',
  'deprecated',
  'alias',
  'usage_count',
  'last_used',
];

beforeEach(async () => {
  previousProjectRoot = process.env.PROJECT_ROOT;
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-reader-'));
  process.env.PROJECT_ROOT = tempRoot;
  reader.clearCache();
});

afterEach(async () => {
  reader.clearCache();
  if (previousProjectRoot === undefined) {
    delete process.env.PROJECT_ROOT;
  } else {
    process.env.PROJECT_ROOT = previousProjectRoot;
  }
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function writeIndex(rows) {
  const indexPath = path.join(
    tempRoot,
    '.claude',
    'context',
    'artifacts',
    'knowledge-base-index.csv'
  );
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, [headers.join(','), ...rows.map(toCsvRow)].join('\n'));
}

function toCsvRow(row) {
  return row
    .map(value => {
      const text = String(value);
      if (!/[",\r\n]/.test(text)) {
        return text;
      }
      return `"${text.replace(/"/g, '""')}"`;
    })
    .join(',');
}

test('search, tag filtering, and exact lookup use cached index rows', async () => {
  await writeIndex([
    [
      'alpha-skill',
      '.claude/skills/alpha/SKILL.md',
      'Handles testing workflows',
      'skill',
      'LOW',
      'testing,validation',
      '',
      'false',
      '',
      '0',
      '',
    ],
    [
      'bravo-agent',
      '.claude/agents/bravo.md',
      'Coordinates release work',
      'agent',
      'MEDIUM',
      'release',
      '',
      'false',
      '',
      '0',
      '',
    ],
  ]);

  assert.deepEqual(
    reader.search('Testing').map(result => result.name),
    ['alpha-skill']
  );
  assert.deepEqual(
    reader.filterByTags(['testing', 'valid']).map(result => result.name),
    ['alpha-skill']
  );
  assert.equal(reader.get('bravo-agent')?.domain, 'agent');
});

test('search tolerates blank optional fields', async () => {
  await writeIndex([
    [
      'minimal-skill',
      '.claude/skills/minimal/SKILL.md',
      '',
      'skill',
      'LOW',
      '',
      '',
      'false',
      '',
      '0',
      '',
    ],
  ]);

  assert.deepEqual(
    reader.search('minimal').map(result => result.name),
    ['minimal-skill']
  );
  assert.deepEqual(reader.filterByTags(['testing']), []);
});
