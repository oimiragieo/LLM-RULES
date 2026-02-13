const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SETTINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'settings.json');
const SANITIZER_CLI = path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'sanitize-debug-log.cjs');

function getHookCommands(hookGroup) {
  const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
  const settings = JSON.parse(raw);
  const entries = settings?.hooks?.[hookGroup] || [];
  const commands = [];
  for (const entry of entries) {
    for (const hook of entry?.hooks || []) {
      if (typeof hook?.command === 'string') commands.push(hook.command);
    }
  }
  return commands;
}

test('sanitize-debug-log CLI sanitizes query-string secrets in-place', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanitize-debug-log-'));
  const target = path.join(dir, 'debug.txt');
  fs.writeFileSync(
    target,
    'DEBUG MCP URL https://mcp.exa.ai/mcp?exaApiKey=secret-token-123&foo=bar\n',
    'utf8'
  );

  execFileSync(process.execPath, [SANITIZER_CLI, target, '--in-place'], {
    cwd: PROJECT_ROOT,
    stdio: 'pipe',
  });

  const updated = fs.readFileSync(target, 'utf8');
  assert.match(updated, /exaApiKey=\[REDACTED\]/);
  assert.doesNotMatch(updated, /exaApiKey=secret-token-123/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('settings.json SessionEnd hooks include sanitize-debug-log command', () => {
  const commands = getHookCommands('SessionEnd');
  const hasSanitizer = commands.some(command => /sanitize-debug-log/i.test(command));
  assert.equal(hasSanitizer, true);
});

test('settings.json Stop hooks include sanitize-debug-log command', () => {
  const commands = getHookCommands('Stop');
  const hasSanitizer = commands.some(command => /sanitize-debug-log/i.test(command));
  assert.equal(hasSanitizer, true);
});
