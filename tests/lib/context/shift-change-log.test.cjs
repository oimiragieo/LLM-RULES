const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const schemaPath = path.join(process.cwd(), '.claude/schemas/shift-change-log.schema.json');

test('shift-change-log schema > validates a well-formed handover log', () => {
  assert.ok(fs.existsSync(schemaPath), 'Schema file should exist');

  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv();
  addFormats(ajv);
  const validate = ajv.compile(schema);

  // Valid log object
  const validLog = {
    schemaVersion: '1.0.0',
    handoffId: '123e4567-e89b-12d3-a456-426614174000',
    generation: 1,
    status: 'READY',
    sessionId: 'abc-123',
    timestamp: '2026-03-10T22:33:08.000Z',
    activePid: 12345,
    currentObjective: 'Finish Phase 1',
    contextPercent: 0.82,
    contextSummary: 'Completed M1.1',
    memoryPointers: [{ file: 'learnings.md', key: 'schema', summary: 'Added schema validation' }],
    pendingActions: [{ taskId: 'M1.2', description: 'Write atomic log writer', priority: 'high' }],
    subagentStates: [
      { taskId: 'M1.1', agentType: 'nodejs-pro', status: 'completed', outputFile: 'schema.json' },
    ],
    resumeInstructions: 'Run tests and resume M1.2',
    pendingMemoryWrites: ['Updated schema successfully'],
    drainDeadline: '2026-03-11T00:00:00.000Z',
  };

  // 1. Assert validation passes for completely valid log
  const isValid = validate(validLog);
  assert.ok(isValid, `Valid log should pass validation: ${ajv.errorsText(validate.errors)}`);

  // 2. Assert validation FAILS when schemaVersion is missing
  const missingVersion = { ...validLog };
  delete missingVersion.schemaVersion;
  assert.strictEqual(validate(missingVersion), false, 'Should fail without schemaVersion');

  // 3. Assert validation FAILS when status is not one of the enum values
  const invalidStatus = { ...validLog, status: 'INVALID_STATUS' };
  assert.strictEqual(validate(invalidStatus), false, 'Should fail with invalid status');

  // 4. Assert validation FAILS when generation is negative
  const negativeGen = { ...validLog, generation: -1 };
  assert.strictEqual(validate(negativeGen), false, 'Should fail with negative generation');
});

const { writeHandoverLog } = require('../../../.claude/lib/context/shift-change-log-writer.cjs');

test('shift-change-log writer > writes a valid handover log atomically', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime/test-writer-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const data = {
    schemaVersion: '1.0.0',
    generation: 1,
    sessionId: 'test-session',
    currentObjective: 'Test Writer',
  };

  const result = writeHandoverLog(data, tmpDir);

  const finalPath = path.join(tmpDir, 'shift-change-log.json');
  assert.ok(fs.existsSync(finalPath), 'Final log file should exist');

  const content = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
  assert.strictEqual(content.status, 'READY', 'Status should be READY in the final file');
  assert.strictEqual(content.schemaVersion, '1.0.0');
  assert.ok(content.handoffId, 'handoffId should be generated');
  assert.ok(content.timestamp, 'timestamp should be generated');

  // cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('shift-change-log writer > uses atomic temp-file-then-rename pattern', () => {
  const tmpDir = path.join(
    process.cwd(),
    '.claude/context/runtime/test-writer-atomic-' + Date.now()
  );
  fs.mkdirSync(tmpDir, { recursive: true });

  // Spy on fs.renameSync
  const originalRenameSync = fs.renameSync;
  let renameCalledWith = null;
  fs.renameSync = (oldPath, newPath) => {
    renameCalledWith = { oldPath, newPath };
    return originalRenameSync(oldPath, newPath);
  };

  try {
    writeHandoverLog({ schemaVersion: '1.0.0', generation: 1, sessionId: 'abc' }, tmpDir);
    assert.ok(renameCalledWith, 'renameSync should be called');
    assert.ok(renameCalledWith.oldPath.endsWith('.tmp'), 'Should rename from a .tmp file');
    assert.ok(
      renameCalledWith.newPath.endsWith('shift-change-log.json'),
      'Should rename to final file'
    );
  } finally {
    fs.renameSync = originalRenameSync;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('shift-change-log writer > rejects invalid data (missing required fields)', () => {
  assert.throws(
    () => {
      writeHandoverLog({}, process.cwd());
    },
    /Validation failed/,
    'Should throw on invalid data'
  );
});

const {
  readHandoverLog,
  claimHandoverLog,
} = require('../../../.claude/lib/context/shift-change-log-reader.cjs');

test('shift-change-log reader > reads and parses a READY log', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime/test-reader-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  writeHandoverLog({ schemaVersion: '1.0.0', generation: 1, sessionId: 'abc' }, tmpDir);

  const log = readHandoverLog(tmpDir);
  assert.ok(log, 'Should return parsed log');
  assert.strictEqual(log.status, 'READY');
  assert.strictEqual(log.sessionId, 'abc');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('shift-change-log reader > returns null when no log exists', () => {
  const tmpDir = path.join(
    process.cwd(),
    '.claude/context/runtime/test-reader-empty-' + Date.now()
  );
  fs.mkdirSync(tmpDir, { recursive: true });

  const log = readHandoverLog(tmpDir);
  assert.strictEqual(log, null, 'Should return null for missing log');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('shift-change-log reader > returns null for corrupt JSON', () => {
  const tmpDir = path.join(
    process.cwd(),
    '.claude/context/runtime/test-reader-corrupt-' + Date.now()
  );
  fs.mkdirSync(tmpDir, { recursive: true });

  fs.writeFileSync(path.join(tmpDir, 'shift-change-log.json'), 'not json{{');

  const log = readHandoverLog(tmpDir);
  assert.strictEqual(log, null, 'Should return null for corrupt json');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('shift-change-log reader > rejects log with status WRITING (incomplete write)', () => {
  const tmpDir = path.join(
    process.cwd(),
    '.claude/context/runtime/test-reader-writing-' + Date.now()
  );
  fs.mkdirSync(tmpDir, { recursive: true });

  const validLog = writeHandoverLog(
    { schemaVersion: '1.0.0', generation: 1, sessionId: 'abc' },
    tmpDir
  );
  validLog.status = 'WRITING';
  fs.writeFileSync(path.join(tmpDir, 'shift-change-log.json'), JSON.stringify(validLog));

  const log = readHandoverLog(tmpDir);
  assert.strictEqual(log, null, 'Should return null for WRITING status');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('shift-change-log reader > rejects log with mismatched schemaVersion', () => {
  const tmpDir = path.join(
    process.cwd(),
    '.claude/context/runtime/test-reader-version-' + Date.now()
  );
  fs.mkdirSync(tmpDir, { recursive: true });

  const validLog = writeHandoverLog(
    { schemaVersion: '1.0.0', generation: 1, sessionId: 'abc' },
    tmpDir
  );
  validLog.schemaVersion = '99.0.0';
  fs.writeFileSync(path.join(tmpDir, 'shift-change-log.json'), JSON.stringify(validLog));

  const log = readHandoverLog(tmpDir);
  assert.strictEqual(log, null, 'Should return null for mismatched schemaVersion');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('shift-change-log reader > claimHandoverLog sets status to CLAIMED', () => {
  const tmpDir = path.join(
    process.cwd(),
    '.claude/context/runtime/test-reader-claim-' + Date.now()
  );
  fs.mkdirSync(tmpDir, { recursive: true });

  writeHandoverLog({ schemaVersion: '1.0.0', generation: 1, sessionId: 'abc' }, tmpDir);

  const result = claimHandoverLog(tmpDir, 'new-session-id');
  assert.ok(result, 'Should return true on successful claim');

  const content = JSON.parse(fs.readFileSync(path.join(tmpDir, 'shift-change-log.json'), 'utf8'));
  assert.strictEqual(content.status, 'CLAIMED', 'Status should be updated to CLAIMED');
  // It should probably also update sessionId, or leave it. The plan says:
  // "claimHandoverLog(dir, sessionId):
  //   1. Read log
  //   2. Set status = 'CLAIMED'
  //   3. Atomic rewrite"
  // It does not explicitly say to update the sessionId to the new session id, but maybe it should?
  // Let's just assert status is CLAIMED.

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
