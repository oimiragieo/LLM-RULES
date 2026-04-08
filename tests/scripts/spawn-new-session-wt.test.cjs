'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SPAWN_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'spawn-new-session.cjs');

describe('spawn-new-session.cjs Windows Terminal regression guards', () => {
  let content;

  it('spawn script exists', () => {
    assert.ok(fs.existsSync(SPAWN_SCRIPT));
    content = fs.readFileSync(SPAWN_SCRIPT, 'utf8');
  });

  it('uses LOCALAPPDATA wt.exe path, NOT bare wt via cmd.exe /c start', () => {
    // The working pattern: resolve wt.exe via LOCALAPPDATA/Microsoft/WindowsApps/
    assert.ok(
      content.includes('Microsoft') && content.includes('WindowsApps') && content.includes('wt.exe'),
      'Must use full LOCALAPPDATA/Microsoft/WindowsApps/wt.exe path — bare wt breaks from Git Bash'
    );
    // Must NOT use the old broken pattern
    assert.ok(
      !content.includes("'/c', 'start', '', 'wt'"),
      'Must NOT use cmd.exe /c start wt — this breaks from Git Bash due to PATH inheritance'
    );
  });

  it('opens tab in current window (-w 0), not new window (-w new)', () => {
    assert.ok(
      content.includes("'-w', '0'") || content.includes("'-w', 0"),
      'Must use -w 0 to open in current window as tab, not -w new'
    );
  });

  it('includes --model flag to prevent 1M context extra-usage errors', () => {
    assert.ok(
      content.includes('--model'),
      'Must include --model flag — without it, spawned session inherits parent 1M model requiring extra-usage'
    );
  });

  it('strips -d flag to prevent blank window', () => {
    assert.ok(
      content.includes('-d') && content.includes('replace'),
      'Must strip -d flag from interactiveFlags — -d redirects output to debug file causing blank window'
    );
  });

  it('exports spawnTerminalWindow for testing', () => {
    const mod = require(SPAWN_SCRIPT);
    assert.ok(typeof mod.spawnTerminalWindow === 'function');
  });
});
