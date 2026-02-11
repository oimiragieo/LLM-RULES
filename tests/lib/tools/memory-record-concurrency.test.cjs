'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runCliRecord({ type, text, projectRoot }) {
  const cliPath = path.join(process.cwd(), '.claude', 'tools', 'cli', 'memory-record.cjs');
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, '--type', type, '--text', text, '--project-root', projectRoot],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MEMORY_AUTO_SYNC: 'off',
          MEMORY_EMBED_ON_WRITE: 'off',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => {
      stdout += String(data);
    });
    child.stderr.on('data', data => {
      stderr += String(data);
    });

    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`memory-record exited ${code}: ${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

test('memory-record concurrent gotcha writes do not lose entries', async t => {
  const baseTmp = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(baseTmp, { recursive: true });
  const tmpRoot = fs.mkdtempSync(path.join(baseTmp, 'memory-record-concurrency-'));
  t.after(() => {
    if (fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  const count = 24;
  const writes = [];
  for (let i = 0; i < count; i += 1) {
    writes.push(
      runCliRecord({
        type: 'gotcha',
        text: `Concurrent gotcha #${i}`,
        projectRoot: tmpRoot,
      })
    );
  }
  await Promise.all(writes);

  const gotchasPath = path.join(tmpRoot, '.claude', 'context', 'memory', 'gotchas.json');
  assert.ok(fs.existsSync(gotchasPath), 'gotchas.json should exist');
  const gotchas = readJson(gotchasPath);
  assert.equal(gotchas.length, count, 'All concurrent gotcha writes should persist');

  const texts = new Set(gotchas.map(item => item.text));
  for (let i = 0; i < count; i += 1) {
    assert.ok(texts.has(`Concurrent gotcha #${i}`), `Missing gotcha #${i}`);
  }
});

test('memory-record concurrent pattern writes do not lose entries', async t => {
  const baseTmp = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(baseTmp, { recursive: true });
  const tmpRoot = fs.mkdtempSync(path.join(baseTmp, 'memory-record-concurrency-'));
  t.after(() => {
    if (fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  const count = 24;
  const writes = [];
  for (let i = 0; i < count; i += 1) {
    writes.push(
      runCliRecord({
        type: 'pattern',
        text: `Concurrent pattern #${i}`,
        projectRoot: tmpRoot,
      })
    );
  }
  await Promise.all(writes);

  const patternsPath = path.join(tmpRoot, '.claude', 'context', 'memory', 'patterns.json');
  assert.ok(fs.existsSync(patternsPath), 'patterns.json should exist');
  const patterns = readJson(patternsPath);
  assert.equal(patterns.length, count, 'All concurrent pattern writes should persist');

  const texts = new Set(patterns.map(item => item.text));
  for (let i = 0; i < count; i += 1) {
    assert.ok(texts.has(`Concurrent pattern #${i}`), `Missing pattern #${i}`);
  }
});
