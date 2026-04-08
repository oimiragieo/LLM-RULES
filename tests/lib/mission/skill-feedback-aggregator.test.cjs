'use strict';

/**
 * Tests for Skill Feedback Aggregator
 */

const fs = require('node:fs');
const path = require('node:path');
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { aggregateFeedback, checkSkillHealth } = require('../../../.claude/lib/mission/skill-feedback-aggregator.cjs');

function createTempDir() {
  const dir = path.join(__dirname, '..', '..', 'fixtures', `temp-feedback-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'handoffs'), { recursive: true });
  return dir;
}

function cleanupTempDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function writeFeatures(dir, features) {
  fs.writeFileSync(path.join(dir, 'features.json'), JSON.stringify({ features }, null, 2), 'utf8');
}

function writeHandoff(dir, handoff) {
  const name = `${handoff.timestamp.replace(/[:.]/g, '-')}__${handoff.featureId}__worker.json`;
  fs.writeFileSync(path.join(dir, 'handoffs', name), JSON.stringify(handoff, null, 2), 'utf8');
}

describe('Skill Feedback Aggregator', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('aggregates feedback by skill', () => {
    writeFeatures(tempDir, [
      { id: 'feat-a', skillName: 'rust-worker' },
      { id: 'feat-b', skillName: 'rust-worker' },
    ]);

    writeHandoff(tempDir, {
      timestamp: '2026-04-07T01:00:00Z',
      featureId: 'feat-a',
      handoff: {
        skillFeedback: {
          followedProcedure: true,
          deviations: [],
          suggestedChanges: ['Add Windows support'],
        },
      },
    });

    writeHandoff(tempDir, {
      timestamp: '2026-04-07T02:00:00Z',
      featureId: 'feat-b',
      handoff: {
        skillFeedback: {
          followedProcedure: false,
          deviations: ['Skipped TDD step'],
          suggestedChanges: [],
        },
      },
    });

    const { skillFeedback } = aggregateFeedback(tempDir);
    const rustWorker = skillFeedback.find(s => s.skillName === 'rust-worker');
    assert.ok(rustWorker);
    assert.equal(rustWorker.totalHandoffs, 2);
    assert.equal(rustWorker.procedureFollowedRate, 50);
  });

  it('detects recurring deviations', () => {
    writeFeatures(tempDir, [
      { id: 'f1', skillName: 'dev' },
      { id: 'f2', skillName: 'dev' },
      { id: 'f3', skillName: 'dev' },
    ]);

    for (const [fid, ts] of [['f1', '01'], ['f2', '02'], ['f3', '03']]) {
      writeHandoff(tempDir, {
        timestamp: `2026-04-07T${ts}:00:00Z`,
        featureId: fid,
        handoff: {
          skillFeedback: {
            followedProcedure: false,
            deviations: ['Windows path issue'],
            suggestedChanges: [],
          },
        },
      });
    }

    const { recommendations } = aggregateFeedback(tempDir);
    assert.ok(recommendations.length > 0);
    assert.ok(recommendations[0].includes('Windows path issue'));
  });

  it('checkSkillHealth flags skills needing update', () => {
    writeFeatures(tempDir, [
      { id: 'f1', skillName: 'broken-skill' },
      { id: 'f2', skillName: 'broken-skill' },
      { id: 'f3', skillName: 'broken-skill' },
    ]);

    for (const [fid, ts] of [['f1', '01'], ['f2', '02'], ['f3', '03']]) {
      writeHandoff(tempDir, {
        timestamp: `2026-04-07T${ts}:00:00Z`,
        featureId: fid,
        handoff: {
          skillFeedback: {
            followedProcedure: false,
            deviations: ['Same recurring issue'],
            suggestedChanges: [],
          },
        },
      });
    }

    const health = checkSkillHealth(tempDir, 'broken-skill');
    assert.equal(health.needsUpdate, true);
    assert.ok(health.deviations.length > 0);
  });

  it('returns empty for missing handoffs dir', () => {
    const emptyDir = createTempDir();
    fs.rmSync(path.join(emptyDir, 'handoffs'), { recursive: true, force: true });
    const { skillFeedback } = aggregateFeedback(emptyDir);
    assert.equal(skillFeedback.length, 0);
    cleanupTempDir(emptyDir);
  });

  it('writes ledger file', () => {
    writeFeatures(tempDir, [{ id: 'f1', skillName: 'test-skill' }]);
    writeHandoff(tempDir, {
      timestamp: '2026-04-07T01:00:00Z',
      featureId: 'f1',
      handoff: {
        skillFeedback: { followedProcedure: true, deviations: [] },
      },
    });

    aggregateFeedback(tempDir);

    const ledgerPath = path.join(tempDir, 'skill-feedback-ledger.jsonl');
    assert.ok(fs.existsSync(ledgerPath));
    const content = fs.readFileSync(ledgerPath, 'utf8');
    const entry = JSON.parse(content.trim());
    assert.equal(entry.skillCount, 1);
  });
});
