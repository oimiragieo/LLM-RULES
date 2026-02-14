const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const {
  checkReadSafety,
  hasReadWindow,
  resolveReadPath,
  cleanupMemoryTempFiles,
  ensureReflectionReadTarget,
  ensureReportReadTarget,
  ensureTaskOutputReadTarget,
  ensureIntegrationQueueReadTarget,
  createDirectoryListingFile,
} = require('../../.claude/hooks/routing/pre-tool-unified.cjs');

describe('pre-tool-unified read safety', () => {
  const reflectionRuntimeDir = path.join(__dirname, '..', '..', '.claude', 'context', 'runtime');
  const reportsDir = path.join(__dirname, '..', '..', '.claude', 'context', 'reports');
  const defaultDirListingPath = path.join(reflectionRuntimeDir, 'read-safety-dir-listing.txt');
  const reminderPath = path.join(reflectionRuntimeDir, 'reflection-reminder.txt');
  const spawnRequestPath = path.join(reflectionRuntimeDir, 'reflection-spawn-request.json');
  const integrationQueuePath = path.join(reflectionRuntimeDir, 'integration-queue.jsonl');

  function withFileRestored(filePath, fn) {
    const existed = fs.existsSync(filePath);
    const previous = existed ? fs.readFileSync(filePath, 'utf8') : null;
    try {
      fn();
    } finally {
      if (existed) {
        fs.writeFileSync(filePath, previous, 'utf8');
      } else if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  function withPathRestored(filePath, fn) {
    const existed = fs.existsSync(filePath);
    const stats = existed ? fs.statSync(filePath) : null;
    const previous = existed && !stats.isDirectory() ? fs.readFileSync(filePath, 'utf8') : null;

    try {
      fn();
    } finally {
      try {
        if (fs.existsSync(filePath)) {
          fs.rmSync(filePath, { recursive: true, force: true });
        }
      } catch (_err) {
        // Best effort restoration.
      }

      if (existed) {
        if (stats && stats.isDirectory()) {
          fs.mkdirSync(filePath, { recursive: true });
        } else {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, previous || '', 'utf8');
        }
      }
    }
  }

  test('hasReadWindow detects offset/limit windows', () => {
    assert.strictEqual(hasReadWindow({}), false);
    assert.strictEqual(hasReadWindow({ offset: 0 }), true);
    assert.strictEqual(hasReadWindow({ limit: 2000 }), true);
    assert.strictEqual(hasReadWindow({ start_line: 1, end_line: 120 }), true);
  });

  test('resolveReadPath resolves relative project paths', () => {
    const resolved = resolveReadPath({ file_path: '.claude/README.md' });
    assert.ok(path.isAbsolute(resolved));
    assert.ok(resolved.endsWith(path.join('.claude', 'README.md')));
  });

  test('resolveReadPath normalizes /c/ style absolute paths on Windows', () => {
    const resolved = resolveReadPath({ file_path: '/c/dev/projects/agent-studio/.env.example' });
    assert.ok(path.isAbsolute(resolved));
    if (process.platform === 'win32') {
      assert.match(resolved, /^[A-Z]:\\/);
      assert.ok(resolved.toLowerCase().includes('agent-studio'));
    } else {
      assert.strictEqual(resolved, '/c/dev/projects/agent-studio/.env.example');
    }
  });

  test('checkReadSafety blocks reading a directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-dir-'));
    try {
      const result = checkReadSafety('Read', { file_path: tempDir });
      assert.strictEqual(result.action, 'block');
      assert.ok(result.message.includes('is a directory'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('checkReadSafety blocks directory reads in bypassPermissions mode', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-dir-bypass-'));
    try {
      const result = checkReadSafety(
        'Read',
        { file_path: tempDir },
        { permission_mode: 'bypassPermissions' }
      );
      assert.strictEqual(result.action, 'block');
      assert.ok(String(result.message || '').includes('[READ SAFETY][bypass]'));
      assert.ok(String(result.message || '').includes('Read requires a concrete file path'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('checkReadSafety blocks missing file paths to prevent host read errors', () => {
    const missingPath = path.join(os.tmpdir(), `read-guard-missing-${Date.now()}`, 'missing.md');
    const result = checkReadSafety('Read', { file_path: missingPath });
    assert.strictEqual(result.action, 'block');
    assert.ok(String(result.message || '').includes('does not exist'));
  });

  test('checkReadSafety suggests canonical path for known stale references', () => {
    const result = checkReadSafety('Read', {
      file_path: '.claude/lib/memory/memory-query.cjs',
    });
    assert.strictEqual(result.action, 'block');
    assert.ok(String(result.message || '').includes('Did you mean'));
    assert.match(String(result.message || ''), /memory[\\/]+core[\\/]+memory-query\.cjs/);
  });

  test('main enforces read safety when hook input is provided on stdin', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-stdin-'));
    const hookScript = path.join(
      __dirname,
      '..',
      '..',
      '.claude',
      'hooks',
      'routing',
      'pre-tool-unified.cjs'
    );

    try {
      const payload = JSON.stringify({
        tool_name: 'Read',
        tool_input: { file_path: tempDir },
      });

      const proc = spawnSync(process.execPath, [hookScript], {
        cwd: path.join(__dirname, '..', '..'),
        input: payload,
        encoding: 'utf8',
      });

      assert.strictEqual(proc.status, 2, `Expected block exit code, got: ${proc.status}`);
      assert.ok(
        (proc.stdout || '').includes('[READ SAFETY]'),
        `Expected read safety message in stdout, got: ${proc.stdout}`
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('checkReadSafety blocks large file without read window', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-file-'));
    const filePath = path.join(tempDir, 'large.txt');
    try {
      fs.writeFileSync(filePath, 'a'.repeat(130000), 'utf8');
      const result = checkReadSafety('Read', { file_path: filePath });
      assert.strictEqual(result.action, 'block');
      assert.ok(result.message.includes('requires chunked Read'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('checkReadSafety blocks large unwindowed read in bypassPermissions mode', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-file-bypass-'));
    const filePath = path.join(tempDir, 'large.txt');
    try {
      fs.writeFileSync(filePath, 'a'.repeat(130000), 'utf8');
      const result = checkReadSafety(
        'Read',
        { file_path: filePath },
        { permission_mode: 'bypassPermissions' }
      );
      assert.strictEqual(result.action, 'block');
      assert.ok(String(result.message || '').includes('[READ SAFETY][bypass]'));
      assert.ok(String(result.message || '').includes('requires chunked Read'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('checkReadSafety allows large file with read window', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-file-window-'));
    const filePath = path.join(tempDir, 'large.txt');
    try {
      fs.writeFileSync(filePath, 'b'.repeat(130000), 'utf8');
      const result = checkReadSafety('Read', { file_path: filePath, offset: 0, limit: 4000 });
      assert.strictEqual(result.action, 'allow');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('ensureReflectionReadTarget creates missing reflection reminder file', () => {
    withFileRestored(reminderPath, () => {
      fs.mkdirSync(reflectionRuntimeDir, { recursive: true });
      if (fs.existsSync(reminderPath)) fs.unlinkSync(reminderPath);

      const created = ensureReflectionReadTarget(reminderPath);
      assert.strictEqual(created, true);
      assert.strictEqual(fs.existsSync(reminderPath), true);
      assert.strictEqual(fs.readFileSync(reminderPath, 'utf8'), '');
    });
  });

  test('checkReadSafety auto-heals missing reflection spawn request file', () => {
    withFileRestored(spawnRequestPath, () => {
      fs.mkdirSync(reflectionRuntimeDir, { recursive: true });
      if (fs.existsSync(spawnRequestPath)) fs.unlinkSync(spawnRequestPath);

      const result = checkReadSafety('Read', {
        file_path: '.claude/context/runtime/reflection-spawn-request.json',
      });

      assert.strictEqual(result.action, 'allow');
      assert.strictEqual(fs.existsSync(spawnRequestPath), true);
      assert.strictEqual(fs.readFileSync(spawnRequestPath, 'utf8'), '[]\n');
    });
  });

  test('ensureReportReadTarget creates placeholder for missing report markdown under reports dir', () => {
    const missingReport = path.join(reportsDir, `missing-report-${Date.now()}.md`);
    withFileRestored(missingReport, () => {
      fs.mkdirSync(reportsDir, { recursive: true });
      if (fs.existsSync(missingReport)) fs.unlinkSync(missingReport);

      const created = ensureReportReadTarget(missingReport);
      assert.strictEqual(created, true);
      assert.strictEqual(fs.existsSync(missingReport), true);
      const content = fs.readFileSync(missingReport, 'utf8');
      assert.ok(content.includes('Missing Report Placeholder'));
    });
  });

  test('ensureReportReadTarget does not create files outside reports dir', () => {
    const outsidePath = path.join(__dirname, `not-a-report-${Date.now()}.md`);
    withFileRestored(outsidePath, () => {
      if (fs.existsSync(outsidePath)) fs.unlinkSync(outsidePath);

      const created = ensureReportReadTarget(outsidePath);
      assert.strictEqual(created, false);
      assert.strictEqual(fs.existsSync(outsidePath), false);
    });
  });

  test('ensureTaskOutputReadTarget creates placeholder under temp claude tasks dir', () => {
    const taskPath = path.join(
      os.tmpdir(),
      'claude',
      `read-safety-${Date.now()}`,
      'tasks',
      'task-output.txt'
    );
    withFileRestored(taskPath, () => {
      if (fs.existsSync(taskPath)) fs.unlinkSync(taskPath);
      const created = ensureTaskOutputReadTarget(taskPath);
      assert.strictEqual(created, true);
      assert.strictEqual(fs.existsSync(taskPath), true);
      const content = fs.readFileSync(taskPath, 'utf8');
      assert.ok(content.includes('Missing Task Output Placeholder'));
    });
  });

  test('ensureIntegrationQueueReadTarget creates optional integration queue file', () => {
    withFileRestored(integrationQueuePath, () => {
      fs.mkdirSync(reflectionRuntimeDir, { recursive: true });
      if (fs.existsSync(integrationQueuePath)) fs.unlinkSync(integrationQueuePath);
      const created = ensureIntegrationQueueReadTarget(integrationQueuePath);
      assert.strictEqual(created, true);
      assert.strictEqual(fs.existsSync(integrationQueuePath), true);
      assert.strictEqual(fs.readFileSync(integrationQueuePath, 'utf8'), '');
    });
  });

  test('checkReadSafety auto-heals missing integration queue path', () => {
    withFileRestored(integrationQueuePath, () => {
      fs.mkdirSync(reflectionRuntimeDir, { recursive: true });
      if (fs.existsSync(integrationQueuePath)) fs.unlinkSync(integrationQueuePath);

      const result = checkReadSafety('Read', {
        file_path: '.claude/context/runtime/integration-queue.jsonl',
      });

      assert.strictEqual(result.action, 'allow');
      assert.strictEqual(fs.existsSync(integrationQueuePath), true);
    });
  });

  test('createDirectoryListingFile creates readable listing content', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-listing-'));
    try {
      fs.writeFileSync(path.join(tempDir, 'a.txt'), 'a', 'utf8');
      fs.mkdirSync(path.join(tempDir, 'nested'));
      const listingPath = createDirectoryListingFile(tempDir);
      assert.ok(listingPath);
      assert.ok(fs.existsSync(listingPath));
      const content = fs.readFileSync(listingPath, 'utf8');
      assert.ok(content.includes('[FILE] a.txt'));
      assert.ok(content.includes('[DIR] nested'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('createDirectoryListingFile falls back when default listing path is a directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-listing-fallback-'));
    withPathRestored(defaultDirListingPath, () => {
      if (fs.existsSync(defaultDirListingPath)) {
        fs.rmSync(defaultDirListingPath, { recursive: true, force: true });
      }
      fs.mkdirSync(defaultDirListingPath, { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'x.txt'), 'x', 'utf8');

      const listingPath = createDirectoryListingFile(tempDir);
      assert.ok(listingPath);
      assert.notStrictEqual(path.resolve(listingPath), path.resolve(defaultDirListingPath));
      assert.strictEqual(fs.statSync(listingPath).isDirectory(), false);
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('checkReadSafety does not rewrite directory reads in bypass mode', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-rewrite-file-'));
    withPathRestored(defaultDirListingPath, () => {
      if (fs.existsSync(defaultDirListingPath)) {
        fs.rmSync(defaultDirListingPath, { recursive: true, force: true });
      }
      fs.mkdirSync(defaultDirListingPath, { recursive: true });
      const result = checkReadSafety(
        'Read',
        { file_path: tempDir },
        { permission_mode: 'bypassPermissions' }
      );

      assert.strictEqual(result.action, 'block');
      assert.strictEqual(result.rewrittenToolInput, undefined);
      assert.ok(String(result.message || '').includes('directory'));
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('cleanupMemoryTempFiles removes stale .tmp artifacts but keeps normal files', () => {
    const memoryDir = path.join(__dirname, '..', '..', '.claude', 'context', 'memory', 'named');
    fs.mkdirSync(memoryDir, { recursive: true });

    const staleTmp = path.join(memoryDir, `cleanup-test-${Date.now()}.jsonl.tmp`);
    const keepFile = path.join(memoryDir, `cleanup-test-${Date.now()}.md`);
    fs.writeFileSync(staleTmp, 'temp', 'utf8');
    fs.writeFileSync(keepFile, 'keep', 'utf8');

    const oldMs = Date.now() - 26 * 60 * 60 * 1000;
    fs.utimesSync(staleTmp, oldMs / 1000, oldMs / 1000);

    try {
      const result = cleanupMemoryTempFiles();
      assert.ok(result.deleted >= 1);
      assert.ok(!fs.existsSync(staleTmp));
      assert.ok(fs.existsSync(keepFile));
    } finally {
      try {
        fs.unlinkSync(staleTmp);
      } catch (_e) {
        // ignore if already removed
      }
      try {
        fs.unlinkSync(keepFile);
      } catch (_e) {
        // ignore if already removed
      }
    }
  });
});
