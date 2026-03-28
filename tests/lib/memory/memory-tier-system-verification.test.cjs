'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('node:worker_threads');

const tiers = require('../../../.claude/lib/memory/memory-tiers.cjs');

function createProjectRoot() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-tier-system-'));
  fs.mkdirSync(path.join(projectRoot, '.claude', 'context', 'memory', 'stm'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, '.claude', 'context', 'memory', 'mtm'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, '.claude', 'context', 'memory', 'ltm'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, '.claude', 'context', 'runtime'), { recursive: true });
  return projectRoot;
}

function listJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath).filter(file => file.endsWith('.json'));
}

function runConsolidationWorker(modulePath, projectRoot, sessionId) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `
        const { parentPort, workerData } = require('node:worker_threads');

        try {
          const tiers = require(workerData.modulePath);
          const result = tiers.consolidateSession(workerData.sessionId, workerData.projectRoot);
          parentPort.postMessage({ result });
        } catch (error) {
          parentPort.postMessage({
            error: {
              message: error.message,
              stack: error.stack,
            },
          });
        }
      `,
      {
        eval: true,
        workerData: {
          modulePath,
          projectRoot,
          sessionId,
        },
      }
    );

    worker.once('message', message => {
      if (message.error) {
        reject(new Error(message.error.stack || message.error.message));
        return;
      }

      resolve(message.result);
    });

    worker.once('error', reject);
    worker.once('exit', code => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

describe('memory tier system verification', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = createProjectRoot();
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('VAL-SYS-001: writeSTMEntry/readSTMEntry round-trip persists STM data', () => {
    const sessionData = {
      session_id: 'stm-round-trip',
      summary: 'Round-trip validation',
      files_modified: ['.claude/lib/memory/memory-tiers.cjs'],
    };

    const result = tiers.writeSTMEntry(sessionData, projectRoot);
    const stmPath = path.join(projectRoot, '.claude', 'context', 'memory', 'stm', 'session_current.json');
    const stored = tiers.readSTMEntry(projectRoot);

    assert.equal(result.success, true);
    assert.equal(fs.existsSync(stmPath), true, 'STM file should exist after write');
    assert.ok(stored, 'STM entry should be readable');
    assert.equal(stored.session_id, sessionData.session_id);
    assert.equal(stored.summary, sessionData.summary);
    assert.equal(stored.tier, 'STM');
    assert.ok(stored.updated_at, 'STM entry should include updated_at metadata');
  });

  it('VAL-SYS-002: consolidateSession migrates STM to MTM with metadata and clears STM', () => {
    tiers.writeSTMEntry(
      {
        session_id: 'mtm-consolidation',
        summary: 'Move this session to MTM',
      },
      projectRoot
    );

    const result = tiers.consolidateSession('mtm-consolidation', projectRoot);
    const stmPath = path.join(projectRoot, '.claude', 'context', 'memory', 'stm', 'session_current.json');
    const mtmFiles = listJsonFiles(tiers.getTierPath('MTM', projectRoot));

    assert.equal(result.success, true);
    assert.equal(fs.existsSync(stmPath), false, 'STM file should be removed after consolidation');
    assert.equal(mtmFiles.length, 1, 'Exactly one MTM file should be created');

    const mtmData = JSON.parse(
      fs.readFileSync(path.join(tiers.getTierPath('MTM', projectRoot), mtmFiles[0]), 'utf8')
    );

    assert.equal(mtmData.session_id, 'mtm-consolidation');
    assert.equal(mtmData.tier, 'MTM');
    assert.ok(mtmData.consolidated_at, 'MTM entry should include consolidated_at metadata');
  });

  it('VAL-SYS-003: promoteToLTM migrates MTM to LTM with metadata and removes MTM source', () => {
    tiers.writeSTMEntry(
      {
        session_id: 'ltm-promotion',
        summary: 'Promote this session to LTM',
      },
      projectRoot
    );
    const consolidation = tiers.consolidateSession('ltm-promotion', projectRoot);
    assert.equal(consolidation.success, true);

    const mtmDir = tiers.getTierPath('MTM', projectRoot);
    const mtmFilesBefore = listJsonFiles(mtmDir);
    assert.equal(mtmFilesBefore.length, 1, 'Expected one MTM file before promotion');

    const promotion = tiers.promoteToLTM('ltm-promotion', projectRoot);
    const mtmFilesAfter = listJsonFiles(mtmDir);
    const ltmFiles = listJsonFiles(tiers.getTierPath('LTM', projectRoot));

    assert.equal(promotion.success, true);
    assert.equal(mtmFilesAfter.length, 0, 'MTM file should be removed after promotion');
    assert.equal(ltmFiles.length, 1, 'Exactly one LTM file should be created');

    const ltmData = JSON.parse(
      fs.readFileSync(path.join(tiers.getTierPath('LTM', projectRoot), ltmFiles[0]), 'utf8')
    );

    assert.equal(ltmData.session_id, 'ltm-promotion');
    assert.equal(ltmData.tier, 'LTM');
    assert.ok(ltmData.promoted_at, 'LTM entry should include promoted_at metadata');
  });

  it('VAL-SYS-004: MTM capacity stays capped at 10 and overflows summarize to LTM', () => {
    const mtmDir = tiers.getTierPath('MTM', projectRoot);

    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(
        path.join(mtmDir, `session_${String(i).padStart(3, '0')}.json`),
        JSON.stringify(
          {
            session_id: `existing-${i}`,
            tier: 'MTM',
            timestamp: new Date(Date.now() - (10 - i) * 60_000).toISOString(),
            summary: `Existing MTM session ${i}`,
            files_modified: [`file-${i}.cjs`],
            decisions_made: [`decision-${i}`],
            patterns_found: [`pattern-${i}`],
          },
          null,
          2
        )
      );
    }

    tiers.writeSTMEntry(
      {
        session_id: 'overflow-session',
        summary: 'This should trigger MTM overflow handling',
      },
      projectRoot
    );

    const result = tiers.consolidateSession('overflow-session', projectRoot);
    const mtmSessions = tiers.getMTMSessions(projectRoot);
    const ltmFiles = listJsonFiles(tiers.getTierPath('LTM', projectRoot));

    assert.equal(result.success, true);
    assert.ok(mtmSessions.length <= 10, `MTM should remain capped at 10, got ${mtmSessions.length}`);
    assert.ok(ltmFiles.length >= 1, 'Overflow should summarize at least one batch into LTM');
    assert.ok(
      ltmFiles.some(file => file.startsWith('summary_')),
      'Overflow should create an LTM summary file'
    );
  });

  it('VAL-SYS-015: concurrent consolidateSession calls do not create duplicate MTM files', async () => {
    const sessionId = 'concurrent-session';
    const modulePath = require.resolve('../../../.claude/lib/memory/memory-tiers.cjs');

    tiers.writeSTMEntry(
      {
        session_id: sessionId,
        summary: 'Concurrent consolidation should serialize safely',
      },
      projectRoot
    );

    const results = await Promise.all([
      runConsolidationWorker(modulePath, projectRoot, sessionId),
      runConsolidationWorker(modulePath, projectRoot, sessionId),
    ]);

    const successfulResults = results.filter(result => result && result.success);
    const failedResults = results.filter(result => result && result.success === false);
    const mtmDir = tiers.getTierPath('MTM', projectRoot);
    const mtmFiles = listJsonFiles(mtmDir);
    const stmPath = path.join(projectRoot, '.claude', 'context', 'memory', 'stm', 'session_current.json');

    assert.equal(successfulResults.length, 1, `Expected exactly one successful consolidation, got ${successfulResults.length}`);
    assert.equal(failedResults.length, 1, `Expected one serialized no-op result, got ${failedResults.length}`);
    assert.match(
      failedResults[0].error,
      /No STM session found/,
      'Second consolidation should observe the STM as already consumed'
    );
    assert.equal(mtmFiles.length, 1, 'Exactly one MTM file should exist after concurrent consolidation');
    assert.equal(fs.existsSync(stmPath), false, 'STM file should be cleared after serialized consolidation');

    const mtmData = JSON.parse(fs.readFileSync(path.join(mtmDir, mtmFiles[0]), 'utf8'));
    assert.equal(mtmData.session_id, sessionId);
    assert.equal(mtmData.tier, 'MTM');
  });
});
