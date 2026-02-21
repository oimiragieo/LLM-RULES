/* eslint-disable max-lines */

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
  const blockedReadPlaceholderPath = path.join(
    reflectionRuntimeDir,
    'read-safety-blocked-read.txt'
  );
  const reminderPath = path.join(reflectionRuntimeDir, 'reflection-reminder.txt');
  const spawnRequestPath = path.join(reflectionRuntimeDir, 'reflection-spawn-request.json');
  const integrationQueuePath = path.join(reflectionRuntimeDir, 'integration-queue.jsonl');
  const governanceStatePath = path.join(reflectionRuntimeDir, 'tool-governance-state.json');
  const tokenSloStatePath = path.join(reflectionRuntimeDir, 'token-slo-state.json');

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
      assert.strictEqual(result.action, 'rewrite');
      assert.ok(String(result.bypassWarning || '').includes('[READ SAFETY][bypass]'));
      assert.ok(String(result.bypassWarning || '').includes('is a directory'));
      assert.ok(fs.existsSync(result.rewrittenToolInput.file_path));
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

  test('checkReadSafety bypass rewrite uses alternate diagnostics file when default placeholder path is a directory', () => {
    const missingPath = path.join(
      os.tmpdir(),
      `read-guard-missing-bypass-${Date.now()}`,
      'missing.md'
    );
    withPathRestored(blockedReadPlaceholderPath, () => {
      fs.mkdirSync(path.dirname(blockedReadPlaceholderPath), { recursive: true });
      if (fs.existsSync(blockedReadPlaceholderPath)) {
        fs.rmSync(blockedReadPlaceholderPath, { recursive: true, force: true });
      }
      fs.mkdirSync(blockedReadPlaceholderPath, { recursive: true });

      const result = checkReadSafety(
        'Read',
        { file_path: missingPath },
        { permission_mode: 'bypassPermissions' }
      );
      assert.strictEqual(result.action, 'rewrite');
      const rewrittenPath = String(result.rewrittenToolInput?.file_path || '');
      assert.ok(rewrittenPath.length > 0);
      assert.ok(fs.existsSync(rewrittenPath));
      assert.ok(!fs.statSync(rewrittenPath).isDirectory());

      if (
        rewrittenPath &&
        rewrittenPath !== blockedReadPlaceholderPath &&
        fs.existsSync(rewrittenPath)
      ) {
        fs.unlinkSync(rewrittenPath);
      }
    });
  });

  test('checkReadSafety suggests canonical path for known stale references', () => {
    const result = checkReadSafety('Read', {
      file_path: '.claude/lib/memory/memory-query.cjs',
    });
    assert.strictEqual(result.action, 'rewrite');
    assert.ok(String(result.bypassWarning || '').includes('Rewrote stale path'));
    assert.match(
      String(result.rewrittenToolInput?.file_path || ''),
      /memory[\\/]+core[\\/]+memory-query\.cjs/
    );
  });

  test('checkReadSafety rewrites stale router path to core router agent', () => {
    const result = checkReadSafety('Read', {
      file_path: '.claude/agents/router.md',
    });
    assert.strictEqual(result.action, 'rewrite');
    assert.match(
      String(result.rewrittenToolInput?.file_path || ''),
      /agents[\\/]+core[\\/]+router\.md/
    );
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
      assert.ok(String(result.message || '').includes('Direct Read on large file'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('checkReadSafety auto-windows or blocks when token estimate would exceed host limit', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-token-estimate-'));
    const filePath = path.join(tempDir, 'token-heavy.txt');
    try {
      fs.writeFileSync(filePath, 'x'.repeat(90000), 'utf8');
      const result = checkReadSafety('Read', { file_path: filePath });
      assert.ok(result.action === 'block' || result.action === 'rewrite');
      if (result.action === 'rewrite') {
        assert.strictEqual(result.rewrittenToolInput.offset, 0);
        assert.ok(
          result.rewrittenToolInput.limit <= 4166,
          'limit must stay within host 25k token safe lines'
        );
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('checkReadSafety clamps oversized explicit read limit', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-clamp-window-'));
    const filePath = path.join(tempDir, 'small.txt');
    const priorMax = process.env.READ_SAFETY_MAX_WINDOW_LIMIT;
    process.env.READ_SAFETY_MAX_WINDOW_LIMIT = '2500';
    try {
      fs.writeFileSync(filePath, 'small', 'utf8');
      const result = checkReadSafety('Read', { file_path: filePath, offset: 0, limit: 5000 });
      assert.strictEqual(result.action, 'rewrite');
      assert.strictEqual(result.rewrittenToolInput.limit, 2500);
      assert.ok(String(result.bypassWarning || '').includes('exceeded safe max'));
    } finally {
      if (priorMax == null) delete process.env.READ_SAFETY_MAX_WINDOW_LIMIT;
      else process.env.READ_SAFETY_MAX_WINDOW_LIMIT = priorMax;
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
      assert.strictEqual(result.action, 'rewrite');
      assert.strictEqual(result.rewrittenToolInput.offset, 0);
      assert.strictEqual(result.rewrittenToolInput.limit, 4000);
      assert.ok(String(result.bypassWarning || '').includes('Direct Read on large file'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('checkReadSafety blocks large file without read window when auto-window is disabled', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-file-no-autowindow-'));
    const filePath = path.join(tempDir, 'large.txt');
    const prior = process.env.READ_SAFETY_AUTOWINDOW;
    process.env.READ_SAFETY_AUTOWINDOW = 'off';
    try {
      fs.writeFileSync(filePath, 'a'.repeat(130000), 'utf8');
      const result = checkReadSafety('Read', { file_path: filePath });
      assert.strictEqual(result.action, 'block');
      assert.ok(String(result.message || '').includes('Direct Read on large file'));
    } finally {
      if (prior == null) delete process.env.READ_SAFETY_AUTOWINDOW;
      else process.env.READ_SAFETY_AUTOWINDOW = prior;
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

  test('checkReadSafety blocks large direct project reads until search evidence exists', () => {
    const sessionId = `read-gov-${Date.now()}`;
    const targetPath = path.join(reflectionRuntimeDir, `read-governance-${Date.now()}.txt`);
    withFileRestored(governanceStatePath, () => {
      fs.mkdirSync(reflectionRuntimeDir, { recursive: true });
      fs.writeFileSync(targetPath, 'x'.repeat(60000), 'utf8');

      try {
        const blocked = checkReadSafety(
          'Read',
          { file_path: '.claude/context/runtime/' + path.basename(targetPath) },
          { session_id: sessionId }
        );
        assert.strictEqual(blocked.action, 'block');
        assert.ok(String(blocked.message || '').includes('requires search evidence first'));

        checkReadSafety(
          'Bash',
          { command: 'pnpm search:code "read governance"' },
          { session_id: sessionId }
        );
        const allowed = checkReadSafety(
          'Read',
          { file_path: '.claude/context/runtime/' + path.basename(targetPath) },
          { session_id: sessionId }
        );
        assert.strictEqual(allowed.action, 'allow');
      } finally {
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      }
    });
  });

  test('checkReadSafety requires token-saver when context pressure is high', () => {
    const sessionId = `read-pressure-${Date.now()}`;
    const targetPath = path.join(reflectionRuntimeDir, `read-pressure-${Date.now()}.txt`);
    withFileRestored(governanceStatePath, () => {
      withFileRestored(tokenSloStatePath, () => {
        fs.mkdirSync(reflectionRuntimeDir, { recursive: true });
        fs.writeFileSync(targetPath, 'y'.repeat(60000), 'utf8');

        const tokenState = {
          sessions: {
            [sessionId]: {
              breachCount: 4,
              lastBreachAt: Date.now(),
              downgradedUntil: Date.now() + 5 * 60 * 1000,
            },
          },
        };
        fs.writeFileSync(tokenSloStatePath, JSON.stringify(tokenState, null, 2) + '\n', 'utf8');

        try {
          checkReadSafety(
            'Bash',
            { command: 'pnpm search:code "context pressure"' },
            { session_id: sessionId }
          );
          const blocked = checkReadSafety(
            'Read',
            { file_path: '.claude/context/runtime/' + path.basename(targetPath) },
            { session_id: sessionId }
          );
          assert.strictEqual(blocked.action, 'block');
          assert.ok(String(blocked.message || '').includes('token-saver-context-compression'));

          checkReadSafety(
            'Skill',
            { skill: 'token-saver-context-compression' },
            { session_id: sessionId }
          );
          const allowed = checkReadSafety(
            'Read',
            { file_path: '.claude/context/runtime/' + path.basename(targetPath) },
            { session_id: sessionId }
          );
          assert.strictEqual(allowed.action, 'allow');
        } finally {
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        }
      });
    });
  });

  test('checkReadSafety records core memory read evidence for session governance', () => {
    const sessionId = `memory-core-${Date.now()}`;
    withFileRestored(governanceStatePath, () => {
      const result = checkReadSafety(
        'Read',
        { file_path: '.claude/context/memory/decisions.md', offset: 0, limit: 200 },
        { session_id: sessionId }
      );
      assert.strictEqual(result.action, 'allow');

      const governance = JSON.parse(fs.readFileSync(governanceStatePath, 'utf8'));
      const entry = governance?.sessions?.[sessionId];
      assert.ok(entry);
      assert.ok(Number(entry.lastCoreMemoryReadAt || 0) > 0);
      assert.strictEqual(entry.lastCoreMemoryReadPath, '.claude/context/memory/decisions.md');
    });
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

  test('checkReadSafety blocks directory reads in bypass mode even when default listing path is unavailable', () => {
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

      assert.strictEqual(result.action, 'rewrite');
      assert.ok(String(result.bypassWarning || '').includes('[READ SAFETY][bypass]'));
      assert.ok(fs.existsSync(result.rewrittenToolInput.file_path));
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('checkReadSafety rewrites missing path to diagnostics file in bypass mode', () => {
    const missingPath = path.join(
      os.tmpdir(),
      `read-guard-missing-bypass-${Date.now()}`,
      'missing.md'
    );
    const result = checkReadSafety(
      'Read',
      { file_path: missingPath },
      { permission_mode: 'bypassPermissions' }
    );
    assert.strictEqual(result.action, 'rewrite');
    assert.ok(String(result.bypassWarning || '').includes('does not exist'));
    assert.ok(fs.existsSync(result.rewrittenToolInput.file_path));
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
