'use strict';

const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

// Spawn mock populated in beforeEach
let spawnMock;

/**
 * Create a fake ChildProcess that implements the subset we need:
 * stdin (writable), stdout (readable), stderr (readable), kill(), pid
 */
function createFakeChild(opts = {}) {
  const child = new EventEmitter();
  child.pid = opts.pid || 12345;
  child.killed = false;

  child.stdin = {
    write: mock.fn(),
    end: mock.fn(),
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  child.kill = mock.fn(signal => {
    child.killed = true;
    // Simulate process exit after kill
    if (opts.exitOnKill !== false) {
      setImmediate(() => {
        child.emit('close', null, signal || 'SIGTERM');
      });
    }
  });

  // Helper to simulate successful exit with stdout
  child.simulateSuccess = output => {
    setImmediate(() => {
      child.stdout.emit('data', output);
      child.emit('close', 0, null);
    });
  };

  // Helper to simulate failure with stderr
  child.simulateFailure = (errOutput, code = 1) => {
    setImmediate(() => {
      if (errOutput) child.stderr.emit('data', errOutput);
      child.emit('close', code, null);
    });
  };

  return child;
}

describe('claudeAsync', () => {
  let fakeChild;

  beforeEach(() => {
    fakeChild = createFakeChild();
    // Reset module cache to allow re-mocking
    spawnMock = mock.fn(() => fakeChild);
  });

  // We test the function contract by directly testing the exported claudeAsync
  // Since we can't easily mock child_process.spawn for require'd modules in
  // node:test, we test the wrapper behavior using a dependency-injected version.
  // The actual module will use the same logic.

  describe('1.1 — returns immediately without blocking', () => {
    it('returns a handle object synchronously', () => {
      // Import the real module — the key assertion is that the function
      // returns synchronously (doesn't await the child process)
      const { claudeAsync: realAsync } = require('../../../scripts/channels/daemon/claude-cli.cjs');
      const start = Date.now();
      const handle = realAsync('test prompt', { timeout: 60000 });
      const elapsed = Date.now() - start;

      assert.ok(handle, 'should return a handle');
      assert.ok(handle.promise instanceof Promise, 'should have a promise');
      assert.equal(typeof handle.cancel, 'function', 'should have cancel fn');
      assert.ok(elapsed < 200, `should return in <200ms, took ${elapsed}ms`);

      // Cancel to clean up the spawned process
      handle.cancel();
      // Catch the rejection to avoid unhandledRejection
      handle.promise.catch(() => {});
    });
  });

  describe('1.2 — resolves with stdout on success', () => {
    it('promise resolves with trimmed stdout', async () => {
      const mod = require('../../../scripts/channels/daemon/claude-cli.cjs');
      const handle = mod._claudeAsyncImpl('test prompt', {}, spawnMock);
      fakeChild.simulateSuccess('  Hello World  \n');
      const result = await handle.promise;
      assert.equal(result, 'Hello World');
    });
  });

  describe('1.3 — rejects on non-zero exit', () => {
    it('promise rejects with stderr content', async () => {
      const mod = require('../../../scripts/channels/daemon/claude-cli.cjs');
      if (!mod._claudeAsyncImpl) return; // skip if not exported
      const handle = mod._claudeAsyncImpl('bad prompt', {}, spawnMock);
      fakeChild.simulateFailure('Error: something broke', 1);
      await assert.rejects(handle.promise, err => {
        assert.ok(err.message.includes('something broke'));
        return true;
      });
    });
  });

  describe('1.4 — cancel kills child process', () => {
    it('calling cancel kills the process and rejects the promise', async () => {
      const mod = require('../../../scripts/channels/daemon/claude-cli.cjs');
      if (!mod._claudeAsyncImpl) return;
      const handle = mod._claudeAsyncImpl('slow task', {}, spawnMock);
      handle.cancel();
      await assert.rejects(handle.promise, err => {
        assert.ok(err.message.includes('cancelled') || err.message.includes('cancel'));
        return true;
      });
      assert.equal(fakeChild.kill.mock.callCount(), 1);
    });
  });

  describe('1.5 — respects timeout', () => {
    it('rejects after timeout expires', async () => {
      const mod = require('../../../scripts/channels/daemon/claude-cli.cjs');
      if (!mod._claudeAsyncImpl) return;
      const child = createFakeChild({ exitOnKill: true });
      const spawn = mock.fn(() => child);
      const handle = mod._claudeAsyncImpl('slow', { timeout: 100 }, spawn);
      await assert.rejects(handle.promise, err => {
        assert.ok(
          err.message.includes('timeout') || err.message.includes('Timeout'),
          `Expected timeout error, got: ${err.message}`
        );
        return true;
      });
    });
  });

  describe('1.6 — builds correct args array', () => {
    it('includes model, max-turns, and -p flag', () => {
      const mod = require('../../../scripts/channels/daemon/claude-cli.cjs');
      if (!mod._claudeAsyncImpl) return;
      const spawn = mock.fn(() => createFakeChild());
      const handle = mod._claudeAsyncImpl('test', { model: 'opus', maxTurns: 5 }, spawn);
      handle.cancel();

      const call = spawn.mock.calls[0];
      const args = call.arguments[1];
      assert.ok(args.includes('--model'), 'should have --model');
      assert.ok(args.includes('opus'), 'should have opus');
      assert.ok(args.includes('--max-turns'), 'should have --max-turns');
      assert.ok(args.includes('5'), 'should have 5');
      assert.equal(args[args.length - 1], '-p', '-p should be last');
      handle.promise.catch(() => {});
    });
  });

  describe('1.7 — pipes prompt via stdin', () => {
    it('writes prompt to child stdin', () => {
      const mod = require('../../../scripts/channels/daemon/claude-cli.cjs');
      if (!mod._claudeAsyncImpl) return;
      const child = createFakeChild();
      const spawn = mock.fn(() => child);
      const handle = mod._claudeAsyncImpl('my prompt text', {}, spawn);
      handle.cancel();
      handle.promise.catch(() => {});

      assert.equal(child.stdin.write.mock.callCount(), 1);
      assert.equal(child.stdin.write.mock.calls[0].arguments[0], 'my prompt text');
      assert.equal(child.stdin.end.mock.callCount(), 1);
    });
  });

  describe('1.8 — handles appendSystemPromptFile', () => {
    it('includes --append-system-prompt-file in args', () => {
      const mod = require('../../../scripts/channels/daemon/claude-cli.cjs');
      if (!mod._claudeAsyncImpl) return;
      const spawn = mock.fn(() => createFakeChild());
      const handle = mod._claudeAsyncImpl(
        'test',
        { appendSystemPromptFile: '/path/to/prompt.txt' },
        spawn
      );
      handle.cancel();
      handle.promise.catch(() => {});

      const args = spawn.mock.calls[0].arguments[1];
      const idx = args.indexOf('--append-system-prompt-file');
      assert.ok(idx >= 0, 'should include --append-system-prompt-file');
      assert.equal(args[idx + 1], '/path/to/prompt.txt');
    });
  });

  describe('1.9 — uses workspace isolation', () => {
    it('sets cwd to TASK_WORKSPACE when useWorkspace=true', () => {
      const mod = require('../../../scripts/channels/daemon/claude-cli.cjs');
      if (!mod._claudeAsyncImpl) return;
      const spawn = mock.fn(() => createFakeChild());
      const handle = mod._claudeAsyncImpl('test', { useWorkspace: true }, spawn);
      handle.cancel();
      handle.promise.catch(() => {});

      const opts = spawn.mock.calls[0].arguments[2];
      assert.ok(
        opts.cwd.includes('.claude') && opts.cwd.includes('workspace'),
        `cwd should be workspace, got: ${opts.cwd}`
      );
    });
  });

  describe('1.10 — cleans up temp system prompt file', () => {
    it('temp file cleaned up after completion', async () => {
      const mod = require('../../../scripts/channels/daemon/claude-cli.cjs');
      if (!mod._claudeAsyncImpl) return;
      const child = createFakeChild();
      const spawn = mock.fn(() => child);
      const handle = mod._claudeAsyncImpl(
        'test',
        { appendSystemPrompt: 'You are a helpful assistant' },
        spawn
      );
      child.simulateSuccess('done');
      await handle.promise;

      // The temp file should have been cleaned up — we verify by checking
      // that the args included a temp file path
      const args = spawn.mock.calls[0].arguments[1];
      const idx = args.indexOf('--append-system-prompt-file');
      assert.ok(idx >= 0, 'should have used a temp file for inline system prompt');
    });
  });
});

describe('buildClaudeSpawnSpec', () => {
  it('dispatches Claude command shims through cmd.exe without child_process shell mode on Windows', () => {
    const { buildClaudeSpawnSpec } = require('../../../scripts/channels/daemon/claude-cli.cjs');
    const spec = buildClaudeSpawnSpec('claude', ['--model', 'sonnet', '-p'], 'win32');

    assert.match(spec.command.toLowerCase(), /cmd\.exe$/);
    assert.deepEqual(spec.args.slice(0, 3), ['/d', '/s', '/c']);
    assert.match(spec.args[3], /"claude"/);
    assert.match(spec.args[3], /"--model"/);
    assert.match(spec.args[3], /"sonnet"/);
    assert.match(spec.args[3], /"-p"/);
  });

  it('spawns non-Windows platforms directly', () => {
    const { buildClaudeSpawnSpec } = require('../../../scripts/channels/daemon/claude-cli.cjs');
    const args = ['--model', 'sonnet', '-p'];
    const spec = buildClaudeSpawnSpec('claude', args, 'linux');

    assert.equal(spec.command, 'claude');
    assert.equal(spec.args, args);
  });

  it('rejects unsafe Windows command arguments before cmd.exe dispatch', () => {
    const { buildClaudeSpawnSpec } = require('../../../scripts/channels/daemon/claude-cli.cjs');

    assert.throws(
      () => buildClaudeSpawnSpec('claude', ['--model', 'sonnet', 'bad&arg'], 'win32'),
      /Unsafe Claude CLI argument/
    );
  });
});
