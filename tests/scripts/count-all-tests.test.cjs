'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule() {
  const filePath = path.join(__dirname, '..', '..', 'scripts', 'testing', 'count-all-tests.mjs');
  return import(pathToFileURL(filePath).href);
}

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'count-all-tests-'));
}

test('walkTests discovers nested test files recursively', async () => {
  const mod = await loadModule();
  const root = mkTmpDir();
  try {
    fs.mkdirSync(path.join(root, 'tests', 'unit', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tests', 'top.test.cjs'), 'test', 'utf8');
    fs.writeFileSync(path.join(root, 'tests', 'unit', 'deep', 'nested.test.mjs'), 'test', 'utf8');
    fs.writeFileSync(path.join(root, 'tests', 'unit', 'deep', 'not-a-test.txt'), 'ignore', 'utf8');

    const found = mod.walkTests(path.join(root, 'tests')).map(f => path.basename(f)).sort();
    assert.deepEqual(found, ['nested.test.mjs', 'top.test.cjs']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('formatPercent guards zero denominator', async () => {
  const mod = await loadModule();
  assert.equal(mod.formatPercent(0, 0), '0.0');
  assert.equal(mod.formatPercent(5, 0), '0.0');
  assert.equal(mod.formatPercent(3, 4), '75.0');
});

test('normalizeTestPath strips tests prefix and normalizes separators', async () => {
  const mod = await loadModule();
  const baseDir = path.join('C:', 'repo');
  const winPath = path.join(baseDir, 'tests', 'foo', 'bar.test.cjs');
  assert.equal(mod.normalizeTestPath(winPath, baseDir), 'foo/bar.test.cjs');
});

test('isDirectRun resolves relative argv paths before comparison', async () => {
  const mod = await loadModule();
  const modulePath = path.join(__dirname, '..', '..', 'scripts', 'testing', 'count-all-tests.mjs');
  const moduleUrl = pathToFileURL(modulePath).href;
  const relativeArg = path.relative(process.cwd(), modulePath);
  assert.equal(mod.isDirectRun(relativeArg, moduleUrl), true);
});
