const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'verify-debug-log-remediation.mjs');

function runCli(logPath) {
  try {
    const output = execFileSync(process.execPath, [CLI, logPath], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, output };
  } catch (error) {
    return {
      status: error.status || 1,
      output: `${error.stdout || ''}${error.stderr || ''}`,
    };
  }
}

test('verify-debug-log-remediation fails on task # and numeric task ids (not only taskId=1)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-debug-log-remediation-'));
  const logPath = path.join(dir, 'debug.txt');

  fs.writeFileSync(
    logPath,
    [
      '2026-02-16T09:22:42.039Z [DEBUG] You are task #1: Code quality audit.',
      '2026-02-16T09:22:42.040Z [DEBUG] You are task #2: Architecture review.',
      '2026-02-16T09:22:42.041Z [DEBUG] FIRST: Call TaskUpdate({ taskId: "2", status: "in_progress" })',
    ].join('\n'),
    'utf8'
  );

  const result = runCli(logPath);
  assert.equal(result.status, 1);
  assert.match(result.output, /FAIL: task-id contamination patterns detected/i);

  fs.rmSync(dir, { recursive: true, force: true });
});
