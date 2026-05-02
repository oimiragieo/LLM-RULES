'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

async function loadModule() {
  const filePath = path.join(__dirname, '..', '..', 'scripts', 'agents', 'run-cursor-worker.mjs');
  return import(pathToFileURL(filePath).href);
}

const CLI_PATH = path.join(__dirname, '..', '..', 'scripts', 'agents', 'run-cursor-worker.mjs');

test('parseArgs requires --prompt', async () => {
  const mod = await loadModule();
  assert.throws(() => mod.parseArgs(['node', 'script.mjs']), /prompt|--prompt/i);
});

test('parseArgs rejects unknown flags and missing flag values', async () => {
  const mod = await loadModule();
  assert.throws(() => mod.parseArgs(['node', 'script.mjs', '--prompt']), /missing value|--prompt/i);
  assert.throws(
    () => mod.parseArgs(['node', 'script.mjs', '--prompt', 'task.md', '--bogus']),
    /unknown argument|--bogus/i
  );
});

test('parseArgs defaults model to auto, trust/force to false, workspace to cwd', async () => {
  const mod = await loadModule();
  const cwd = path.join(os.tmpdir(), 'cursor-worker-parse');
  fs.mkdirSync(cwd, { recursive: true });
  try {
    const promptFile = path.join(cwd, 'p.md');
    fs.writeFileSync(promptFile, 'x', 'utf8');
    const rel = path.relative(process.cwd(), promptFile);
    const argv = ['node', 'script.mjs', '--prompt', rel.startsWith('..') ? promptFile : rel];
    const prev = process.cwd();
    process.chdir(cwd);
    try {
      const parsed = mod.parseArgs(argv);
      assert.equal(parsed.model, 'auto');
      assert.equal(parsed.trust, false);
      assert.equal(parsed.force, false);
      assert.equal(parsed.workspace, cwd);
    } finally {
      process.chdir(prev);
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('parseArgs accepts explicit --trust and --force flags', async () => {
  const mod = await loadModule();
  const parsed = mod.parseArgs(['node', 'script.mjs', '--prompt', 'task.md', '--trust', '--force']);
  assert.equal(parsed.trust, true);
  assert.equal(parsed.force, true);
});

test('resolvePromptPath accepts a prompt inside cwd', async () => {
  const mod = await loadModule();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rcw-in-'));
  try {
    const p = path.join(root, 'task.md');
    fs.writeFileSync(p, 'go', 'utf8');
    const resolved = mod.resolvePromptPath('task.md', root);
    assert.equal(path.normalize(resolved), path.normalize(p));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolvePromptPath rejects traversal and outside paths', async () => {
  const mod = await loadModule();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rcw-out-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rcw-outside-'));
  try {
    const inner = path.join(root, 'inner');
    fs.mkdirSync(inner, { recursive: true });
    const outsideFile = path.join(outside, 'secret.md');
    fs.writeFileSync(outsideFile, 'no', 'utf8');
    const relUp = path.relative(inner, outsideFile);
    assert.ok(relUp.startsWith('..'), relUp);
    assert.throws(() => mod.resolvePromptPath(relUp, inner), /outside|traversal|invalid/i);
    assert.throws(() => mod.resolvePromptPath(outsideFile, root), /outside|invalid/i);

    fs.mkdirSync(path.join(root, 'dironly'), { recursive: true });
    assert.throws(() => mod.resolvePromptPath('dironly', root), /directory|file/i);

    assert.throws(() => mod.resolvePromptPath('missing.md', root), /exist|not found|enoent/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('toWslPath converts Windows paths to /mnt/<drive>/...', async () => {
  const mod = await loadModule();
  assert.equal(
    mod.toWslPath('C:\\dev\\projects\\agent-studio\\file.md'),
    '/mnt/c/dev/projects/agent-studio/file.md'
  );
});

test('buildCursorAgentInvocation shape and cursor-agent flags', async () => {
  const mod = await loadModule();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rcw-build-'));
  const prompt = path.join(root, 'docs', 'task.md');
  fs.mkdirSync(path.dirname(prompt), { recursive: true });
  fs.writeFileSync(prompt, 'GOAL: no-op', 'utf8');
  try {
    const inv = mod.buildCursorAgentInvocation({
      model: 'auto',
      force: true,
      trust: true,
      workspaceWinPath: root,
      promptWinPath: prompt,
    });
    assert.equal(inv.command, 'wsl');
    assert.equal(inv.args[0], 'bash');
    assert.match(inv.args[1], /run-cursor-worker\.sh$/);
    assert.ok(inv.args.includes('--trust'));
    assert.ok(inv.args.includes('--force'));
    assert.deepEqual(inv.args.slice(-2), [
      inv.args.at(-2).replace(/\/docs\/task\.md$/, ''),
      inv.args.at(-1),
    ]);
    assert.match(inv.args.at(-1), /\/docs\/task\.md$/);
    assert.ok(
      !inv.args.join('\n').includes('GOAL:'),
      'prompt content must not be interpolated into the Windows command line'
    );
    assert.equal(inv.args.includes('-lc'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildCursorAgentInvocation omits trust and force unless explicitly enabled', async () => {
  const mod = await loadModule();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rcw-no-force-'));
  const prompt = path.join(root, 'task.md');
  fs.writeFileSync(prompt, 'GOAL: no-op', 'utf8');
  try {
    const inv = mod.buildCursorAgentInvocation({
      model: 'auto',
      workspaceWinPath: root,
      promptWinPath: prompt,
    });
    assert.equal(inv.args.includes('--trust'), false);
    assert.equal(inv.args.includes('--force'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildCursorAgentInvocation validates prompt is inside workspace', async () => {
  const mod = await loadModule();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rcw-build-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rcw-build-out-'));
  const outsidePrompt = path.join(outside, 'task.md');
  fs.writeFileSync(outsidePrompt, 'GOAL: no-op', 'utf8');
  try {
    assert.throws(
      () =>
        mod.buildCursorAgentInvocation({
          model: 'auto',
          workspaceWinPath: root,
          promptWinPath: outsidePrompt,
        }),
      /outside/i
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('buildCursorAgentInvocation shell-quotes WSL paths with spaces and single quotes', async () => {
  const mod = await loadModule();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rcw quote ' "));
  const prompt = path.join(root, 'folder with space', "task's.md");
  fs.mkdirSync(path.dirname(prompt), { recursive: true });
  fs.writeFileSync(prompt, 'GOAL: no-op', 'utf8');
  try {
    const inv = mod.buildCursorAgentInvocation({
      model: 'auto',
      workspaceWinPath: root,
      promptWinPath: prompt,
    });
    const joined = inv.args.join('\n');
    assert.match(joined, /folder with space/);
    assert.ok(
      !joined.includes('GOAL:'),
      'prompt content must not be interpolated into the Windows command line'
    );
    assert.equal(joined.includes('$(cat'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildCursorAgentInvocation does not expose markdown command substitutions to bash -lc', async () => {
  const mod = await loadModule();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rcw-md-'));
  const prompt = path.join(root, 'task.md');
  fs.writeFileSync(prompt, 'Run `git status --short` and write `.tmp/out.md`', 'utf8');
  try {
    const inv = mod.buildCursorAgentInvocation({
      model: 'auto',
      workspaceWinPath: root,
      promptWinPath: prompt,
    });
    const joined = inv.args.join('\n');
    assert.equal(inv.args.includes('-lc'), false);
    assert.equal(joined.includes('`git status --short`'), false);
    assert.equal(joined.includes('$(cat'), false);
    assert.match(inv.args.at(-1), /task\.md$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('model names with shell metacharacters are rejected', async () => {
  const mod = await loadModule();
  assert.throws(
    () =>
      mod.buildCursorAgentInvocation({
        model: 'auto;rm -rf /',
        force: true,
        workspaceWinPath: 'C:\\a',
        promptWinPath: 'C:\\a\\p.md',
      }),
    /model|invalid|metachar/i
  );
  assert.throws(
    () =>
      mod.buildCursorAgentInvocation({
        model: '--workspace',
        force: true,
        workspaceWinPath: 'C:\\a',
        promptWinPath: 'C:\\a\\p.md',
      }),
    /model|invalid|metachar/i
  );
  assert.throws(
    () => mod.parseArgs(['node', 'x', '--prompt', 'p.md', '--model', 'x;y']),
    /model|invalid|metachar/i
  );
});

test('runCursorWorker requires explicit promptPath even for dry-run json mode', async () => {
  const mod = await loadModule();
  await assert.rejects(
    () => mod.runCursorWorker({ dryRun: true, json: true }),
    /promptPath|required/i
  );
});

test('runCursorWorker dry-run with promptPath does not spawn and returns invocation data', async () => {
  const mod = await loadModule();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rcw-dry-'));
  try {
    const p = path.join(root, 'task.md');
    fs.writeFileSync(p, 'Goal: no-op', 'utf8');
    const out = await mod.runCursorWorker({
      dryRun: true,
      json: true,
      promptPath: 'task.md',
      workspace: root,
    });
    assert.ok(out && typeof out === 'object');
    assert.ok(out.invocation);
    assert.equal(out.invocation.command, 'wsl');
    assert.ok(Array.isArray(out.invocation.args));
    assert.equal(path.normalize(out.resolvedPrompt), path.normalize(p));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runCursorWorker json mode reports spawn errors with normalized exit code', async () => {
  const mod = await loadModule();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rcw-spawn-'));
  try {
    const p = path.join(root, 'task.md');
    fs.writeFileSync(p, 'Goal: no-op', 'utf8');
    const out = await mod.runCursorWorker({
      json: true,
      promptPath: 'task.md',
      workspace: root,
      spawnSyncImpl: () => ({
        error: Object.assign(new Error('spawn wsl ENOENT'), { code: 'ENOENT' }),
        status: null,
        signal: null,
        stdout: '',
        stderr: '',
      }),
    });
    assert.equal(out.exitCode, 1);
    assert.equal(out.spawnError.code, 'ENOENT');
    assert.match(out.spawnError.message, /ENOENT/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI --dry-run --json emits parseable invocation without trust/force by default', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rcw-cli-'));
  try {
    const p = path.join(root, 'task.md');
    fs.writeFileSync(p, 'Goal: no-op', 'utf8');
    const result = spawnSync(
      process.execPath,
      [CLI_PATH, '--dry-run', '--json', '--workspace', root, '--prompt', 'task.md'],
      { encoding: 'utf8', shell: false, windowsHide: true }
    );
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.trust, false);
    assert.equal(parsed.force, false);
    assert.equal(parsed.invocation.args.includes('--trust'), false);
    assert.equal(parsed.invocation.args.includes('--force'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI dry-run includes trust and force only when explicitly requested', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rcw-cli-force-'));
  try {
    const p = path.join(root, 'task.md');
    fs.writeFileSync(p, 'Goal: no-op', 'utf8');
    const result = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        '--dry-run',
        '--json',
        '--workspace',
        root,
        '--prompt',
        'task.md',
        '--trust',
        '--force',
      ],
      { encoding: 'utf8', shell: false, windowsHide: true }
    );
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.trust, true);
    assert.equal(parsed.force, true);
    assert.ok(parsed.invocation.args.includes('--trust'));
    assert.ok(parsed.invocation.args.includes('--force'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI rejects unknown flags before building invocation', () => {
  const result = spawnSync(process.execPath, [CLI_PATH, '--prompt', 'task.md', '--bogus'], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown argument|--bogus/i);
});
