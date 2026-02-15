#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tokenSaver = require('../../.claude/skills/token-saver-context-compression/scripts/main.cjs');
const promptAssembler = require('../../.claude/lib/spawn/prompt-assembler.cjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('token-saver mapped records can be applied to memory files and become citation-eligible', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'token-saver-memory-'));
  const memoryDir = path.join(tmp, '.claude', 'context', 'memory');
  fs.mkdirSync(memoryDir, { recursive: true });

  fs.writeFileSync(path.join(memoryDir, 'patterns.json'), '[]\n', 'utf8');
  fs.writeFileSync(path.join(memoryDir, 'gotchas.json'), '[]\n', 'utf8');
  fs.writeFileSync(path.join(memoryDir, 'issues.md'), '# Issues\n', 'utf8');
  fs.writeFileSync(path.join(memoryDir, 'decisions.md'), '# Decisions\n', 'utf8');

  const records = tokenSaver.mapCompressionToMemoryRecords(
    {
      findings: [
        { text: 'Gotcha: never skip TaskUpdate(in_progress)' },
        { text: 'Issue: router-state cache stale after restart' },
        { text: 'Decision: choose stable task id normalization' },
        { text: 'Prefer a single canonical event contract for task lifecycle' },
      ],
    },
    { query: 'task lifecycle reliability' }
  );
  tokenSaver.applyMemoryRecordsToFiles(records, memoryDir);

  const patterns = readJson(path.join(memoryDir, 'patterns.json'));
  const gotchas = readJson(path.join(memoryDir, 'gotchas.json'));
  const issues = fs.readFileSync(path.join(memoryDir, 'issues.md'), 'utf8');
  const decisions = fs.readFileSync(path.join(memoryDir, 'decisions.md'), 'utf8');

  assert.ok(patterns.some(item => String(item.text || '').includes('canonical event contract')));
  assert.ok(gotchas.some(item => String(item.text || '').includes('never skip TaskUpdate')));
  assert.match(issues, /router-state cache stale/i);
  assert.match(decisions, /stable task id normalization/i);

  const memorySection = promptAssembler.formatMemorySection({
    patterns: patterns.map(item => item.text),
    gotchas: gotchas.map(item => item.text),
  });
  assert.match(memorySection, /\[mem:[a-f0-9]{8}\]/, 'memory entries should produce evidence ids');
});
