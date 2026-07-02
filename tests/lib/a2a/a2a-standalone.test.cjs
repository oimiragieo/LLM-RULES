'use strict';

const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildA2aTaskProcessor,
  getDispatchConfig,
  parseA2aTaskParams,
  parseDispatchArgs,
  runConfiguredDispatcher,
} = require('../../../.claude/lib/a2a/standalone.cjs');

let tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2a-standalone-'));
  tempDirs.push(dir);
  return dir;
}

describe('A2A standalone task processor', () => {
  it('parses queued task params and falls back to raw text on invalid JSON', () => {
    const parsed = parseA2aTaskParams({ text: '{"input":"hello"}' });
    assert.equal(parsed.input, 'hello');
    assert.deepEqual(parseA2aTaskParams({ text: 'not-json' }), { raw: 'not-json' });
  });

  it('requires dispatcher args to be a JSON string array', () => {
    assert.deepEqual(parseDispatchArgs({}), []);
    assert.deepEqual(parseDispatchArgs({ A2A_TASK_DISPATCH_ARGS_JSON: '["one","two"]' }), [
      'one',
      'two',
    ]);
    assert.throws(
      () => parseDispatchArgs({ A2A_TASK_DISPATCH_ARGS_JSON: '{"bad":true}' }),
      /JSON array of strings/
    );
  });

  it('returns null dispatch config when no dispatcher binary is configured', () => {
    assert.equal(getDispatchConfig({}), null);
  });

  it('drains queue entries without execution when no dispatcher is configured', async () => {
    const processTask = buildA2aTaskProcessor({ env: {} });
    const result = await processTask({
      id: 'row-1',
      attempt_count: 1,
      text: '{"input":"hello"}',
    });

    assert.deepEqual(result, { skipped: true });
  });

  it('runs a configured dispatcher with task JSON on stdin and no shell', async () => {
    const dir = makeTempDir();
    const outputPath = path.join(dir, 'dispatch-output.json');
    const scriptPath = path.join(dir, 'dispatcher.cjs');
    fs.writeFileSync(
      scriptPath,
      `
'use strict';
const fs = require('node:fs');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
fs.writeFileSync(
  process.argv[2],
  JSON.stringify({ input, rowId: process.env.A2A_TASK_ROW_ID }, null, 2)
);
`,
      'utf8'
    );

    const result = await runConfiguredDispatcher(
      { input: 'hello', context: { source: 'test' } },
      { id: 'row-2' },
      {
        env: {
          PATH: process.env.PATH,
          A2A_TASK_DISPATCH_BIN: process.execPath,
          A2A_TASK_DISPATCH_ARGS_JSON: JSON.stringify([scriptPath, outputPath]),
          A2A_TASK_DISPATCH_TIMEOUT_MS: '5000',
        },
      }
    );

    assert.equal(result.skipped, false);
    assert.equal(result.code, 0);
    const recorded = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(recorded.rowId, 'row-2');
    assert.deepEqual(recorded.input, {
      rowId: 'row-2',
      taskParams: { input: 'hello', context: { source: 'test' } },
    });
  });
});
