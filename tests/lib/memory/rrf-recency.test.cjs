#!/usr/bin/env node
/**
 * RRF Recency Weight Tests
 * ========================
 *
 * Tests for ContextualMemory._applyRecencyWeight():
 * 1. Recent results get higher scores than old results (same base score)
 * 2. Results with no timestamp get default weight (score unchanged or minimal)
 * 3. Very old results (365+ days) get near-zero recency boost
 * 4. Custom env vars MEMORY_RECENCY_DECAY_RATE and MEMORY_RECENCY_BOOST
 * 5. Empty results array returns empty array
 * 6. Results are re-sorted by adjusted score (highest first)
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

let TEST_DIR;
let savedEnv;

function setup() {
  TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rrf-recency-'));
  const memDir = path.join(TEST_DIR, '.claude', 'context', 'memory');
  fs.mkdirSync(path.join(memDir, 'mtm'), { recursive: true });
  fs.mkdirSync(path.join(memDir, 'ltm'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, '.claude', 'context', 'data'), { recursive: true });
  savedEnv = {
    MEMORY_RECENCY_DECAY_RATE: process.env.MEMORY_RECENCY_DECAY_RATE,
    MEMORY_RECENCY_BOOST: process.env.MEMORY_RECENCY_BOOST,
  };
  delete process.env.MEMORY_RECENCY_DECAY_RATE;
  delete process.env.MEMORY_RECENCY_BOOST;
}

function cleanup() {
  if (savedEnv) {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  if (TEST_DIR && fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function getInstance() {
  const modPath = require.resolve('../../../.claude/lib/memory/contextual-memory.cjs');
  delete require.cache[modPath];
  const { ContextualMemory } = require(modPath);
  return new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: path.join(TEST_DIR, '.claude', 'context', 'memory'),
    dbPath: path.join(TEST_DIR, '.claude', 'context', 'data', 'memory.db'),
  });
}

function makeResult(score, isoDate) {
  const meta = {};
  if (isoDate) meta.consolidated_at = isoDate;
  return { content: 'test', rrf_score: score, metadata: meta };
}

describe('_applyRecencyWeight', () => {
  beforeEach(() => setup());
  afterEach(() => cleanup());

  it('boosts recent results more than old results with same base score', () => {
    const cm = getInstance();
    const now = new Date();
    const recent = new Date(now - 1 * 86400000).toISOString();
    const old = new Date(now - 90 * 86400000).toISOString();
    const results = [makeResult(0.5, old), makeResult(0.5, recent)];
    const weighted = cm._applyRecencyWeight(results);
    assert.ok(weighted.length === 2);
    const recentItem = weighted.find(r => r.metadata.consolidated_at === recent);
    const oldItem = weighted.find(r => r.metadata.consolidated_at === old);
    assert.ok(
      recentItem.rrf_score > oldItem.rrf_score,
      `Recent score ${recentItem.rrf_score} should exceed old score ${oldItem.rrf_score}`
    );
  });

  it('applies default weight when result has no timestamp', () => {
    const cm = getInstance();
    const noTs = { content: 'no-ts', rrf_score: 0.5, metadata: {} };
    const weighted = cm._applyRecencyWeight([noTs]);
    assert.ok(weighted.length === 1);
    // With no timestamp, recencyWeight defaults to 1.0, importance defaults to 0.5
    // combinedScore = 0.5*0.6 + 1.0*0.3*0.2 + 0.5*0.2 = 0.3 + 0.06 + 0.1 = 0.46
    assert.ok(
      Math.abs(weighted[0].rrf_score - 0.46) < 0.001,
      `Expected ~0.46, got ${weighted[0].rrf_score}`
    );
  });

  it('gives near-zero recency boost for very old results (365+ days)', () => {
    const cm = getInstance();
    const now = new Date();
    const veryOld = new Date(now - 400 * 86400000).toISOString();
    const results = [makeResult(0.5, veryOld)];
    const weighted = cm._applyRecencyWeight(results);
    // recencyWeight = 1/(1 + 400*0.1) = 1/41 ~ 0.02439
    // combinedScore = 0.5*0.6 + 0.02439*0.3*0.2 + 0.5*0.2 = 0.3 + 0.001463 + 0.1 = 0.401463
    assert.ok(
      weighted[0].rrf_score < 0.41,
      `Very old result should have minimal recency contribution, got ${weighted[0].rrf_score}`
    );
    assert.ok(weighted[0].rrf_score > 0.4, `Score should be ~0.401`);
  });

  it('respects custom env vars for decay rate and boost', () => {
    process.env.MEMORY_RECENCY_DECAY_RATE = '0.5';
    process.env.MEMORY_RECENCY_BOOST = '1.0';
    const cm = getInstance();
    const now = new Date();
    const ts = new Date(now - 10 * 86400000).toISOString();
    const results = [makeResult(0.5, ts)];
    const weighted = cm._applyRecencyWeight(results);
    // recencyWeight = 1/(1 + 10*0.5) = 1/6 ~ 0.1667
    // combinedScore = 0.5*0.6 + 0.1667*1.0*0.2 + 0.5*0.2 = 0.3 + 0.03333 + 0.1 = 0.43333
    assert.ok(
      Math.abs(weighted[0].rrf_score - 0.4333) < 0.01,
      `Expected ~0.4333 with custom env, got ${weighted[0].rrf_score}`
    );
  });

  it('returns empty array unchanged', () => {
    const cm = getInstance();
    const result = cm._applyRecencyWeight([]);
    assert.deepStrictEqual(result, []);
  });

  it('re-sorts results by adjusted score descending', () => {
    const cm = getInstance();
    const now = new Date();
    const recent = new Date(now - 1 * 86400000).toISOString();
    const old = new Date(now - 200 * 86400000).toISOString();
    // Lower base score but very recent should beat higher base but old
    const results = [makeResult(0.6, old), makeResult(0.55, recent)];
    const weighted = cm._applyRecencyWeight(results);
    assert.ok(
      weighted[0].metadata.consolidated_at === recent,
      'Recent result with slightly lower base should rank first after recency boost'
    );
  });
});
