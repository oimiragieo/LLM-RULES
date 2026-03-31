'use strict';

/**
 * Tests for ProcessRegistry
 * Covers VAL-EI-001, VAL-EI-002, VAL-EI-003
 */

const assert = require('node:assert/strict');
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { ProcessRegistry } = require('../../.claude/lib/workers/process-registry.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for a predicate to become truthy, polling every `interval` ms.
 * Rejects with a timeout error if not satisfied within `timeout` ms.
 */
async function waitFor(predicate, { timeout = 5000, interval = 50 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('waitFor timeout exceeded');
}

function makeTempDir(prefix = 'pr-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_e) {
    // ignore EBUSY on Windows
  }
}

// ---------------------------------------------------------------------------
// VAL-EI-001: spawn, list, stop lifecycle
// ---------------------------------------------------------------------------

describe('ProcessRegistry — spawn / list / stop (VAL-EI-001)', () => {
  let registry;

  beforeEach(() => {
    registry = new ProcessRegistry();
  });

  afterEach(async () => {
    for (const proc of registry.list()) {
      if (proc.status === 'running') {
        registry.stop(proc.pid);
      }
    }
    await new Promise(r => setTimeout(r, 200));
  });

  it('spawn() returns a handle with pid, status running, command, args, startedAt', () => {
    const handle = registry.spawn('node', ['-e', 'setInterval(()=>{},1000)']);

    assert.ok(typeof handle.pid === 'number', 'pid should be a number');
    assert.ok(handle.pid > 0, 'pid should be positive');
    assert.strictEqual(handle.status, 'running', 'status should be running');
    assert.strictEqual(handle.command, 'node', 'command should be set');
    assert.deepEqual(handle.args, ['-e', 'setInterval(()=>{},1000)'], 'args should match');
    assert.ok(
      typeof handle.startedAt === 'string' || handle.startedAt instanceof Date,
      'startedAt should be set'
    );

    registry.stop(handle.pid);
  });

  it('list() includes the spawned process with status running', () => {
    const handle = registry.spawn('node', ['-e', 'setInterval(()=>{},1000)']);

    const processes = registry.list();
    const proc = processes.find(p => p.pid === handle.pid);

    assert.ok(proc, 'spawned process should appear in list()');
    assert.strictEqual(proc.status, 'running', 'listed process should have status running');

    registry.stop(handle.pid);
  });

  it('stop(pid) terminates the process and updates status to stopped', async () => {
    const handle = registry.spawn('node', ['-e', 'setInterval(()=>{},1000)']);

    registry.stop(handle.pid);

    await waitFor(() => {
      const proc = registry.list().find(p => p.pid === handle.pid);
      return proc && proc.status === 'stopped';
    });

    const proc = registry.list().find(p => p.pid === handle.pid);
    assert.strictEqual(proc.status, 'stopped', 'status should be stopped after stop()');
  });

  it('list() returns multiple tracked processes', () => {
    const h1 = registry.spawn('node', ['-e', 'setInterval(()=>{},1000)']);
    const h2 = registry.spawn('node', ['-e', 'setInterval(()=>{},1000)']);

    const processes = registry.list();
    assert.ok(processes.length >= 2, 'should track at least 2 processes');

    const pids = processes.map(p => p.pid);
    assert.ok(pids.includes(h1.pid), 'h1 pid should be in list');
    assert.ok(pids.includes(h2.pid), 'h2 pid should be in list');

    registry.stop(h1.pid);
    registry.stop(h2.pid);
  });

  it('stop() is idempotent — calling stop twice does not throw', () => {
    const handle = registry.spawn('node', ['-e', 'setInterval(()=>{},1000)']);

    assert.doesNotThrow(() => registry.stop(handle.pid));
    assert.doesNotThrow(() => registry.stop(handle.pid));
  });

  it('stop() on unknown pid does not throw', () => {
    assert.doesNotThrow(() => registry.stop(99999999));
  });
});

// ---------------------------------------------------------------------------
// VAL-EI-002: stdout capture and crash detection
// ---------------------------------------------------------------------------

describe('ProcessRegistry — stdout capture and crash detection (VAL-EI-002)', () => {
  let registry;

  beforeEach(() => {
    registry = new ProcessRegistry();
  });

  afterEach(async () => {
    for (const proc of registry.list()) {
      if (proc.status === 'running') {
        registry.stop(proc.pid);
      }
    }
    await new Promise(r => setTimeout(r, 200));
  });

  it('captures stdout lines in a ring buffer', async () => {
    const script = [
      "process.stdout.write('line1\\n');",
      "process.stdout.write('line2\\n');",
      "process.stdout.write('line3\\n');",
      'process.exit(0);',
    ].join(' ');

    const handle = registry.spawn('node', ['-e', script]);

    await waitFor(() => {
      const proc = registry.list().find(p => p.pid === handle.pid);
      return proc && proc.status !== 'running';
    });

    const output = registry.getOutput(handle.pid);
    assert.ok(output.includes('line1'), 'output should include line1');
    assert.ok(output.includes('line2'), 'output should include line2');
    assert.ok(output.includes('line3'), 'output should include line3');
  });

  it('records status crashed and exitCode when process exits non-zero', async () => {
    const script = [
      "process.stdout.write('line1\\n');",
      "process.stdout.write('line2\\n');",
      "process.stdout.write('line3\\n');",
      "process.stdout.write('line4\\n');",
      "process.stdout.write('line5\\n');",
      'process.exit(1);',
    ].join(' ');

    const handle = registry.spawn('node', ['-e', script]);

    await waitFor(
      () => {
        const proc = registry.list().find(p => p.pid === handle.pid);
        return proc && proc.status === 'crashed';
      },
      { timeout: 6000 }
    );

    const proc = registry.list().find(p => p.pid === handle.pid);
    assert.strictEqual(proc.status, 'crashed', 'status should be crashed');
    assert.strictEqual(proc.exitCode, 1, 'exitCode should be 1');

    const output = registry.getOutput(handle.pid);
    for (let i = 1; i <= 5; i++) {
      assert.ok(output.includes(`line${i}`), `output should contain line${i}`);
    }
  });

  it('process exiting with code 0 does NOT mark as crashed', async () => {
    const script = 'process.exit(0);';
    const handle = registry.spawn('node', ['-e', script]);

    await waitFor(
      () => {
        const proc = registry.list().find(p => p.pid === handle.pid);
        return proc && proc.status !== 'running';
      },
      { timeout: 5000 }
    );

    const proc = registry.list().find(p => p.pid === handle.pid);
    assert.notStrictEqual(
      proc.status,
      'crashed',
      'exit code 0 should not result in crashed status'
    );
  });

  it('getOutput() returns empty string for unknown pid', () => {
    const output = registry.getOutput(99999999);
    assert.strictEqual(typeof output, 'string', 'should return a string');
    assert.strictEqual(output, '', 'should return empty string for unknown pid');
  });

  it('getOutput() returns captured stdout as a string', async () => {
    const script = "process.stdout.write('hello world\\n'); setInterval(()=>{},1000);";
    const handle = registry.spawn('node', ['-e', script]);

    await waitFor(
      () => {
        const output = registry.getOutput(handle.pid);
        return output.includes('hello world');
      },
      { timeout: 4000 }
    );

    const output = registry.getOutput(handle.pid);
    assert.ok(output.includes('hello world'), 'should include written output');

    registry.stop(handle.pid);
  });

  it('getOutput() with tail option returns only last N lines', async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
    // Use actual newline characters so the ring buffer splits lines correctly
    const script =
      lines.map(l => `process.stdout.write(${JSON.stringify(l + '\n')});`).join(' ') +
      ' process.exit(0);';

    const handle = registry.spawn('node', ['-e', script]);

    await waitFor(
      () => {
        const proc = registry.list().find(p => p.pid === handle.pid);
        return proc && proc.status !== 'running';
      },
      { timeout: 5000 }
    );

    const tail5 = registry.getOutput(handle.pid, { tail: 5 });
    // Should contain lines 16-20 (last 5) but not lines 1-15
    const tailLines = tail5.split('\n').filter(Boolean);
    assert.ok(tailLines.includes('line20'), 'tail should include line20');
    // line1 is a whole-line entry that should not appear (lines 16+ are in tail, not line1)
    assert.ok(
      !tailLines.includes('line1'),
      'line1 should not be in tail (checking whole line match)'
    );
  });
});

// ---------------------------------------------------------------------------
// VAL-EI-003: checkpoint and restore
// ---------------------------------------------------------------------------

describe('ProcessRegistry — checkpoint and restore (VAL-EI-003)', () => {
  let registry;
  let tmpDir;

  before(() => {
    tmpDir = makeTempDir('pr-checkpoint-');
  });

  after(() => {
    cleanup(tmpDir);
  });

  beforeEach(() => {
    registry = new ProcessRegistry();
  });

  afterEach(async () => {
    for (const proc of registry.list()) {
      if (proc.status === 'running') {
        registry.stop(proc.pid);
      }
    }
    await new Promise(r => setTimeout(r, 200));
  });

  it('checkpoint() writes a JSON file with process metadata', () => {
    const handle = registry.spawn('node', ['-e', 'setInterval(()=>{},1000)']);

    const checkpointPath = path.join(tmpDir, 'checkpoint-basic.json');
    registry.checkpoint(checkpointPath);

    assert.ok(fs.existsSync(checkpointPath), 'checkpoint file should be created');

    const data = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    assert.ok(Array.isArray(data.processes), 'checkpoint should have a processes array');

    const saved = data.processes.find(p => p.pid === handle.pid);
    assert.ok(saved, 'spawned process should be in checkpoint data');
    assert.strictEqual(saved.command, 'node', 'command should be preserved in checkpoint');
    assert.deepEqual(saved.args, ['-e', 'setInterval(()=>{},1000)'], 'args should be preserved');

    registry.stop(handle.pid);
  });

  it('restore() reconnects to a still-running process', async () => {
    const handle = registry.spawn('node', ['-e', 'setInterval(()=>{},1000)']);

    const checkpointPath = path.join(tmpDir, 'checkpoint-restore.json');
    registry.checkpoint(checkpointPath);

    // Create a fresh registry and restore
    const registry2 = new ProcessRegistry();
    registry2.restore(checkpointPath);

    const processes = registry2.list();
    const proc = processes.find(p => p.pid === handle.pid);

    assert.ok(proc, 'restored process should appear in list()');
    assert.strictEqual(
      proc.status,
      'running',
      'still-running process should be restored as running'
    );
    assert.strictEqual(proc.command, 'node', 'command should be preserved after restore');

    registry.stop(handle.pid);
  });

  it('restore() marks non-existent PIDs as lost', () => {
    const fakePid = 999999999;
    const fakeCheckpoint = {
      processes: [
        {
          pid: fakePid,
          status: 'running',
          command: 'node',
          args: ['-e', 'fake'],
          startedAt: new Date().toISOString(),
          exitCode: null,
          stdout: [],
        },
      ],
      savedAt: new Date().toISOString(),
    };

    const checkpointPath = path.join(tmpDir, 'checkpoint-lost.json');
    fs.writeFileSync(checkpointPath, JSON.stringify(fakeCheckpoint), 'utf8');

    const registry2 = new ProcessRegistry();
    registry2.restore(checkpointPath);

    const processes = registry2.list();
    const proc = processes.find(p => p.pid === fakePid);

    assert.ok(proc, 'fake process should appear in list() after restore');
    assert.strictEqual(proc.status, 'lost', 'non-existent PID should be marked as lost');
  });

  it('restore() preserves stdout buffer from checkpoint', async () => {
    const script = [
      "process.stdout.write('saved-line1\\n');",
      "process.stdout.write('saved-line2\\n');",
      'process.exit(0);',
    ].join(' ');

    const handle = registry.spawn('node', ['-e', script]);

    // Wait for the process to finish so stdout is captured
    await waitFor(
      () => {
        const proc = registry.list().find(p => p.pid === handle.pid);
        return proc && proc.status !== 'running';
      },
      { timeout: 5000 }
    );

    const checkpointPath = path.join(tmpDir, 'checkpoint-stdout.json');
    registry.checkpoint(checkpointPath);

    // Restore into a new registry
    const registry2 = new ProcessRegistry();
    registry2.restore(checkpointPath);

    const output = registry2.getOutput(handle.pid);
    assert.ok(output.includes('saved-line1'), 'restored stdout should contain saved-line1');
    assert.ok(output.includes('saved-line2'), 'restored stdout should contain saved-line2');
  });

  it('restore() does nothing if file does not exist', () => {
    const registry2 = new ProcessRegistry();
    assert.doesNotThrow(
      () => registry2.restore(path.join(tmpDir, 'nonexistent.json')),
      'restore() should not throw for missing checkpoint file'
    );
    assert.deepEqual(
      registry2.list(),
      [],
      'list() should be empty after restore with missing file'
    );
  });

  it('checkpoint() with no args uses default path', () => {
    const handle = registry.spawn('node', ['-e', 'setInterval(()=>{},1000)']);

    // Should not throw
    assert.doesNotThrow(() => registry.checkpoint());

    registry.stop(handle.pid);
  });
});
