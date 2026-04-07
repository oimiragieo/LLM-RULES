'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { generateMissionStatus } = require(
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    '.claude',
    'lib',
    'mission',
    'mission-status-generator.cjs'
  )
);

let tmpDir;

function scaffoldMission(features, assertions = {}) {
  const missionDir = path.join(tmpDir, 'mission');
  fs.mkdirSync(missionDir, { recursive: true });

  fs.writeFileSync(
    path.join(missionDir, 'state.json'),
    JSON.stringify(
      {
        missionId: 'test-mission',
        baseSessionId: 'test-session',
        state: 'running',
        workingDirectory: '/tmp/test',
        currentFeatureId: null,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );

  fs.writeFileSync(
    path.join(missionDir, 'features.json'),
    JSON.stringify({ features }, null, 2),
    'utf8'
  );

  fs.writeFileSync(
    path.join(missionDir, 'validation-state.json'),
    JSON.stringify({ assertions }, null, 2),
    'utf8'
  );

  return missionDir;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateMissionStatus', () => {
  it('generates a markdown report', () => {
    const missionDir = scaffoldMission(
      [
        { id: 'f1', status: 'completed', milestone: 'ms1', fulfills: ['VAL-TST-001'] },
        { id: 'f2', status: 'pending', milestone: 'ms1', fulfills: [] },
      ],
      {
        'VAL-TST-001': { status: 'passed', validatedAtMilestone: 'ms1' },
      }
    );

    const { report, summary } = generateMissionStatus({ missionDir });
    assert.ok(report.includes('Mission Status'));
    assert.ok(report.includes('Progress Summary'));
    assert.equal(summary.features.total, 2);
    assert.equal(summary.features.completed, 1);
    assert.equal(summary.assertions.total, 1);
    assert.equal(summary.assertions.passed, 1);
  });

  it('detects feature ≠ assertion mismatches', () => {
    const missionDir = scaffoldMission(
      [
        {
          id: 'f1',
          status: 'completed',
          milestone: 'ms1',
          fulfills: ['VAL-TST-001', 'VAL-TST-002'],
        },
      ],
      {
        'VAL-TST-001': { status: 'passed' },
        'VAL-TST-002': { status: 'pending' },
      }
    );

    const { mismatches, report } = generateMissionStatus({ missionDir });
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].valId, 'VAL-TST-002');
    assert.ok(report.includes('Mismatches'));
  });

  it('writes to specified output path', () => {
    const missionDir = scaffoldMission([]);
    const outputPath = path.join(tmpDir, 'custom-status.md');

    generateMissionStatus({ missionDir, outputPath });
    assert.ok(fs.existsSync(outputPath));
  });

  it('handles empty mission gracefully', () => {
    const missionDir = scaffoldMission([]);
    const { summary } = generateMissionStatus({ missionDir });
    assert.equal(summary.features.total, 0);
    assert.equal(summary.assertions.total, 0);
    assert.equal(summary.mismatches, 0);
  });
});
