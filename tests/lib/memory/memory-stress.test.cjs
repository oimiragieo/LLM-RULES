#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const memoryTiers = require('../../../.claude/lib/memory/memory-tiers.cjs');
const memoryManager = require('../../../.claude/lib/memory/memory-manager.cjs');

const TEST_ROOT = path.join(__dirname, '.stress-memory');

function setupTestRoot() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  fs.mkdirSync(path.join(TEST_ROOT, '.claude', 'context', 'memory'), { recursive: true });
}

function cleanupTestRoot() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

function collectMatchingFiles(rootDir, predicate) {
  const matches = [];
  if (!fs.existsSync(rootDir)) return matches;
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (predicate(entry.name, fullPath)) {
        matches.push(fullPath);
      }
    }
  }
  return matches;
}

test(
  'stress: sustained STM->MTM consolidations enforce cap and produce observability events',
  { timeout: 90000 },
  async () => {
    setupTestRoot();
    const prevEventLog = process.env.MEMORY_TIER_EVENT_LOG;
    process.env.MEMORY_TIER_EVENT_LOG = 'on';

    try {
      for (let i = 0; i < 80; i++) {
        const sessionId = `stress-tier-${String(i).padStart(3, '0')}`;
        memoryTiers.writeSTMEntry(
          {
            session_id: sessionId,
            timestamp: new Date(Date.now() + i * 1000).toISOString(),
            summary: `Stress tier session ${i}`,
            tasks_completed: [`task-${i}`],
          },
          TEST_ROOT
        );
        const result = await memoryTiers.consolidateSession(sessionId, TEST_ROOT);
        assert.equal(result.success, true, `Consolidation failed at iteration ${i}`);
      }

      const mtmSessions = memoryTiers.getMTMSessions(TEST_ROOT);
      assert.ok(mtmSessions.length <= 10, `MTM cap violated: ${mtmSessions.length}`);

      const ltmDir = path.join(TEST_ROOT, '.claude', 'context', 'memory', 'ltm');
      const ltmSummaries = fs.existsSync(ltmDir)
        ? fs.readdirSync(ltmDir).filter(name => name.endsWith('.json'))
        : [];
      assert.ok(ltmSummaries.length > 0, 'Expected at least one LTM summary under sustained load');

      const eventsPath = path.join(
        TEST_ROOT,
        '.claude',
        'context',
        'runtime',
        'memory-tier-events.jsonl'
      );
      assert.ok(fs.existsSync(eventsPath), 'Missing memory-tier events file');
      const events = fs
        .readFileSync(eventsPath, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line));
      assert.ok(events.length >= 80, 'Expected many memory-tier events');
      assert.ok(events.some(evt => evt.event === 'consolidated_to_mtm'));
      assert.ok(events.some(evt => evt.event === 'summarized_to_ltm'));

      const memoryDir = path.join(TEST_ROOT, '.claude', 'context', 'memory');
      const tmpArtifacts = collectMatchingFiles(
        memoryDir,
        name => name.endsWith('.tmp') || name.includes('.tmp.') || name.startsWith('.tmp-')
      );
      assert.deepEqual(tmpArtifacts, [], `Unexpected tmp artifacts: ${tmpArtifacts.join(', ')}`);
    } finally {
      if (prevEventLog === undefined) {
        delete process.env.MEMORY_TIER_EVENT_LOG;
      } else {
        process.env.MEMORY_TIER_EVENT_LOG = prevEventLog;
      }
      cleanupTestRoot();
    }
  }
);

test(
  'stress: concurrent memory-manager writes keep JSON valid and leave no temp/lock residue',
  { timeout: 90000 },
  async () => {
    setupTestRoot();

    try {
      const ops = [];
      for (let i = 0; i < 240; i++) {
        const suffix = i % 120; // force some dedupe pressure + repeated keys
        if (i % 2 === 0) {
          ops.push(
            memoryManager.recordGotchaAsync(
              { text: `stress-gotcha-${suffix}`, category: 'stress' },
              TEST_ROOT
            )
          );
        } else {
          ops.push(
            memoryManager.recordPatternAsync(
              { text: `stress-pattern-${suffix}`, category: 'stress' },
              TEST_ROOT
            )
          );
        }
      }

      await Promise.all(ops);

      for (let i = 0; i < 10; i++) {
        const context = await memoryManager.loadMemoryForContextAsync(TEST_ROOT);
        assert.ok(Array.isArray(context.gotchas), 'gotchas should be array');
        assert.ok(Array.isArray(context.patterns), 'patterns should be array');
      }

      const memoryDir = path.join(TEST_ROOT, '.claude', 'context', 'memory');
      const gotchasPath = path.join(memoryDir, 'gotchas.json');
      const patternsPath = path.join(memoryDir, 'patterns.json');
      assert.ok(fs.existsSync(gotchasPath), 'gotchas.json missing');
      assert.ok(fs.existsSync(patternsPath), 'patterns.json missing');

      const gotchas = JSON.parse(fs.readFileSync(gotchasPath, 'utf8'));
      const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
      assert.ok(Array.isArray(gotchas), 'gotchas.json must be valid JSON array');
      assert.ok(Array.isArray(patterns), 'patterns.json must be valid JSON array');
      assert.ok(gotchas.length > 0, 'gotchas should contain data');
      assert.ok(patterns.length > 0, 'patterns should contain data');

      const tempArtifacts = collectMatchingFiles(
        memoryDir,
        name => name.endsWith('.tmp') || name.includes('.tmp.') || name.startsWith('.tmp-')
      );
      assert.deepEqual(tempArtifacts, [], `Unexpected temp artifacts: ${tempArtifacts.join(', ')}`);

      const lockArtifacts = collectMatchingFiles(memoryDir, name => name.endsWith('.lock'));
      assert.deepEqual(lockArtifacts, [], `Unexpected lock artifacts: ${lockArtifacts.join(', ')}`);
    } finally {
      cleanupTestRoot();
    }
  }
);
