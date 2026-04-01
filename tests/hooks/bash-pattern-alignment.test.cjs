'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'safety',
  'bash-command-validator.cjs'
);

const {
  CLAUDE_CODE_DANGEROUS_PATTERNS,
  analyzeClaudeCodeDangerousPatterns,
  splitCompoundCommand,
} = require('../../.claude/hooks/safety/bash-command-validator.cjs');

function runHook(command) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command },
    }),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    shell: false,
    windowsHide: true,
  });

  const stdout = (result.stdout || '').trim();
  let parsed = null;
  if (stdout) {
    parsed = JSON.parse(stdout);
  }

  return {
    status: result.status,
    stdout,
    stderr: result.stderr || '',
    parsed,
  };
}

function assertWarningOrBlock(command, patternLabel) {
  const result = runHook(command);
  const warned =
    result.status === 0 &&
    result.parsed &&
    typeof result.parsed.additionalContext === 'string' &&
    result.parsed.additionalContext.includes(patternLabel);
  const blocked =
    result.status === 2 &&
    new RegExp(patternLabel.replace(/\s+/g, '\\s+'), 'i').test(
      `${result.stdout}\n${result.stderr}`
    );

  assert.ok(
    warned || blocked,
    `Expected "${command}" to warn or block for ${patternLabel}. ` +
      `status=${result.status} stdout=${result.stdout} stderr=${result.stderr}`
  );
}

test('each Claude Code dangerous pattern triggers a warning or block when used as a command', async t => {
  const commandsByPattern = {
    python: 'python script.py',
    python3: 'python3 script.py',
    node: 'node app.js',
    deno: 'deno run app.ts',
    tsx: 'tsx app.ts',
    ruby: 'ruby script.rb',
    perl: 'perl script.pl',
    php: 'php script.php',
    lua: 'lua script.lua',
    npx: 'npx prettier --check package.json',
    bunx: 'bunx prettier --check package.json',
    'npm run': 'npm run lint',
    'yarn run': 'yarn run lint',
    'pnpm run': 'pnpm run lint',
    'bun run': 'bun run lint',
    bash: 'bash script.sh',
    sh: 'sh script.sh',
    zsh: 'zsh script.sh',
    fish: 'fish script.fish',
    eval: 'eval "echo hi"',
    exec: 'exec node app.js',
    env: 'env NODE_ENV=test node app.js',
    xargs: 'printf "file.js" | xargs cat',
    sudo: 'sudo whoami',
    ssh: 'ssh user@example.com',
  };

  for (const pattern of CLAUDE_CODE_DANGEROUS_PATTERNS) {
    await t.test(pattern.label, () => {
      assertWarningOrBlock(commandsByPattern[pattern.label], pattern.label);
    });
  }
});

test('safe substring usage passes without warnings or blocks', async t => {
  const safeCommands = [
    'echo "python is great"',
    'cat nodejs.txt',
    'printf "shellfish and xargs-like words"',
    'git log --oneline',
    'echo "npm runner docs"',
  ];

  for (const command of safeCommands) {
    await t.test(command, () => {
      const result = runHook(command);
      assert.equal(result.status, 0, `Expected "${command}" to pass`);
      assert.ok(
        !result.parsed || !result.parsed.additionalContext,
        `Expected no warning output for "${command}", got ${result.stdout}`
      );
    });
  }
});

test('compound commands are checked per segment for warnings and blocks', async t => {
  await t.test('blocks dangerous chained segment', () => {
    const result = runHook('echo ready && sudo whoami');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /segment 2|sudo|privilege/i);
  });

  await t.test('warns on dangerous piped segment', () => {
    const result = runHook('echo ready | node app.js');
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.parsed, 'Expected warning JSON output');
    assert.match(result.parsed.additionalContext, /segment 2 \(node\)/i);
  });

  await t.test('warns on dangerous semicolon-separated segment', () => {
    const result = runHook('git status; npm run lint');
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.parsed, 'Expected warning JSON output');
    assert.match(result.parsed.additionalContext, /segment 2 \(npm run\)/i);
  });
});

test('compound command parser preserves quoted substrings while splitting', () => {
  const segments = splitCompoundCommand('echo "python | node" && npm run lint; cat nodejs.txt');
  assert.deepEqual(segments, ['echo "python | node"', 'npm run lint', 'cat nodejs.txt']);
});

test('segment analysis only warns for command-position matches, not substrings', () => {
  const safeAnalysis = analyzeClaudeCodeDangerousPatterns(
    'echo "python is great" && cat nodejs.txt'
  );
  assert.equal(safeAnalysis.blocked, null);
  assert.equal(safeAnalysis.matches.length, 0);

  const warningAnalysis = analyzeClaudeCodeDangerousPatterns('git status && node app.js');
  assert.equal(warningAnalysis.blocked, null);
  assert.deepEqual(
    warningAnalysis.matches.map(match => [match.segmentIndex, match.pattern.label]),
    [[2, 'node']]
  );
});
