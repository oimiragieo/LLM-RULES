'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadAuditModule() {
  const modulePath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '.claude',
    'tools',
    'maintenance',
    'memory-write-audit.mjs'
  );
  return import(pathToFileURL(modulePath).href);
}

function setupTempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-write-audit-'));
  const memoryDir = path.join(root, '.claude', 'context', 'memory');
  fs.mkdirSync(memoryDir, { recursive: true });
  return { root, memoryDir };
}

test('audit reports violations using project-relative normalized paths', async () => {
  const { root, memoryDir } = setupTempProject();
  try {
    fs.writeFileSync(
      path.join(memoryDir, 'gotchas.json'),
      JSON.stringify([{ issue: 'missing write source' }], null, 2),
      'utf8'
    );
    fs.writeFileSync(path.join(memoryDir, 'patterns.json'), JSON.stringify([], null, 2), 'utf8');

    const mod = await loadAuditModule();
    const result = mod.auditMemoryWriteSources(root);

    assert.equal(result.ok, false);
    assert.equal(result.violationCount, 1);
    assert.equal(result.violations[0].file, '.claude/context/memory/gotchas.json');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
