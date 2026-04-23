// Agent: nodejs-pro | Task: #5 | Session: 2026-04-23
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const CLI_PATH = path.resolve(__dirname, '../../../.claude/tools/cli/mmp.cjs');

// ---------------------------------------------------------------------------
// Helper: create a tmpdir with tier subdirs and seed CAT7 records
// ---------------------------------------------------------------------------
function makeTmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmp-test-'));
  for (const tier of ['stm', 'mtm', 'ltm']) {
    fs.mkdirSync(path.join(dir, tier), { recursive: true });
  }
  return dir;
}

function writeRecord(dir, tier, record) {
  const filePath = path.join(dir, tier, `${record.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
}

function runCli(args, env) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

// ---------------------------------------------------------------------------
// Setup: seed a three-record chain: grandparent → parent → child
//   grandparent has no lineage
//   parent      lineage: ['grandparent']
//   child       lineage: ['parent']
// ---------------------------------------------------------------------------
let tmpDir;

test.before(() => {
  tmpDir = makeTmpStore();

  writeRecord(tmpDir, 'stm', {
    id: 'grandparent',
    concept: 'root concept',
    confidence: 0.3,
    lineage: [],
    attributes: {},
    temporality: {},
    provenance: {},
    embedding_refs: {},
  });

  writeRecord(tmpDir, 'mtm', {
    id: 'parent',
    concept: 'derived concept',
    confidence: 0.6,
    lineage: ['grandparent'],
    attributes: {},
    temporality: {},
    provenance: {},
    embedding_refs: {},
  });

  writeRecord(tmpDir, 'ltm', {
    id: 'child',
    concept: 'leaf concept',
    confidence: 0.9,
    lineage: ['parent'],
    attributes: {},
    temporality: {},
    provenance: {},
    embedding_refs: {},
  });
});

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test 1: lineage subcommand returns correct ancestry chain
// ---------------------------------------------------------------------------
test('lineage subcommand returns correct ancestry chain as JSON', () => {
  const result = runCli(['lineage', 'child'], { MMP_BASE_DIR: tmpDir });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}\n${result.stderr}`);

  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(result.stdout);
  }, `stdout should be valid JSON:\n${result.stdout}`);

  assert.ok(Array.isArray(parsed), 'result should be an array');
  assert.equal(parsed.length, 3, 'chain should have 3 records: child → parent → grandparent');
  assert.equal(parsed[0].id, 'child');
  assert.equal(parsed[1].id, 'parent');
  assert.equal(parsed[2].id, 'grandparent');
});

// ---------------------------------------------------------------------------
// Test 2: descendants subcommand returns correct forward chain
// ---------------------------------------------------------------------------
test('descendants subcommand returns correct forward chain as JSON', () => {
  const result = runCli(['descendants', 'grandparent'], { MMP_BASE_DIR: tmpDir });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}\n${result.stderr}`);

  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(result.stdout);
  }, `stdout should be valid JSON:\n${result.stdout}`);

  assert.ok(Array.isArray(parsed), 'result should be an array');
  const ids = parsed.map(r => r.id);
  assert.ok(ids.includes('parent'), 'parent should be a direct descendant of grandparent');
  // child.lineage = ['parent'], not ['grandparent'] — findDescendants is non-transitive
  assert.ok(!ids.includes('child'), 'child is NOT a direct descendant of grandparent');
});

// ---------------------------------------------------------------------------
// Test 3: missing subcommand → exit 2
// ---------------------------------------------------------------------------
test('missing subcommand exits with code 2', () => {
  const result = runCli([], { MMP_BASE_DIR: tmpDir });
  assert.equal(result.status, 2, `expected exit 2, got ${result.status}`);
});

// ---------------------------------------------------------------------------
// Test 4: unknown subcommand → exit 2
// ---------------------------------------------------------------------------
test('unknown subcommand exits with code 2', () => {
  const result = runCli(['frobnicate', 'something'], { MMP_BASE_DIR: tmpDir });
  assert.equal(result.status, 2, `expected exit 2, got ${result.status}`);
});

// ---------------------------------------------------------------------------
// Test 5: non-existent record → exit 1
// ---------------------------------------------------------------------------
test('non-existent record exits with code 1', () => {
  const result = runCli(['lineage', 'does-not-exist'], { MMP_BASE_DIR: tmpDir });
  assert.equal(result.status, 1, `expected exit 1, got ${result.status}`);
});

// ---------------------------------------------------------------------------
// Test 6: --json flag emits valid JSON for lineage
// ---------------------------------------------------------------------------
test('--json flag emits valid JSON for lineage subcommand', () => {
  const result = runCli(['lineage', 'parent', '--json'], { MMP_BASE_DIR: tmpDir });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}\n${result.stderr}`);

  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(result.stdout);
  }, `--json output should be valid JSON:\n${result.stdout}`);

  assert.ok(Array.isArray(parsed), 'result should be an array');
  assert.equal(parsed[0].id, 'parent');
});

// ---------------------------------------------------------------------------
// Test 7: --format=tree flag produces indented tree output
// ---------------------------------------------------------------------------
test('--format=tree produces indented tree text output', () => {
  const result = runCli(['lineage', 'child', '--format=tree'], { MMP_BASE_DIR: tmpDir });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}\n${result.stderr}`);

  const output = result.stdout;
  assert.ok(output.includes('child'), 'tree output should include child record id');
  assert.ok(output.includes('parent'), 'tree output should include parent record id');
  assert.ok(output.includes('grandparent'), 'tree output should include grandparent id');
});

// ---------------------------------------------------------------------------
// Test 8: missing record-id argument → exit 2
// ---------------------------------------------------------------------------
test('missing record-id argument exits with code 2', () => {
  const result = runCli(['lineage'], { MMP_BASE_DIR: tmpDir });
  assert.equal(result.status, 2, `expected exit 2, got ${result.status}`);
});
