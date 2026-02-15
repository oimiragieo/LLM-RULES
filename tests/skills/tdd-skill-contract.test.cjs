const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function runNode(args, options = {}) {
  return spawnSync('node', args, {
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
  });
}

test('tdd input/output schemas are valid JSON', () => {
  const input = JSON.parse(fs.readFileSync('.claude/skills/tdd/schemas/input.schema.json', 'utf8'));
  const output = JSON.parse(
    fs.readFileSync('.claude/skills/tdd/schemas/output.schema.json', 'utf8')
  );

  assert.equal(input.title, 'tdd Input Schema');
  assert.equal(output.title, 'tdd Output Schema');
});

test('tdd pre-execute hook rejects invalid repairBudget', () => {
  const result = runNode([
    '.claude/skills/tdd/hooks/pre-execute.cjs',
    '{"task":"demo","repairBudget":9}',
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /repairBudget must be an integer between 1 and 5/);
});

test('tdd pre-execute hook accepts valid payload', () => {
  const result = runNode([
    '.claude/skills/tdd/hooks/pre-execute.cjs',
    '{"task":"demo","mode":"full_task","repairBudget":3}',
  ]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Pre-execute validation passed/);
});

test('tdd post-execute hook reports success on valid evidence payload', () => {
  const result = runNode([
    '.claude/skills/tdd/hooks/post-execute.cjs',
    '{"redVerified":true,"greenVerified":true,"testHackingChecks":{"passed":true}}',
  ]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Post-execute checks passed/);
});

test('tdd post-execute hook updates bounded memory profile', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-profile-'));
  const profilePath = path.join(tempDir, 'tdd-memory-profile.json');
  const payload = JSON.stringify({
    redVerified: true,
    greenVerified: true,
    testHackingChecks: { passed: true },
    testCommand: 'pnpm test tests/skills/tdd-skill-contract.test.cjs',
    lintCommand: 'pnpm lint',
    formatCommand: 'pnpm format:check',
    failureSignature: 'TypeError: cannot read property x',
    fixSummary: 'Guard undefined value before map access',
    antiPattern: 'asserting internal mocks only',
    scenarioTemplate: 'bugfix-regression-template',
  });

  const result = runNode(['.claude/skills/tdd/hooks/post-execute.cjs', payload], {
    env: { TDD_MEMORY_PROFILE_PATH: profilePath },
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Memory profile updated/);

  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  assert.equal(
    profile.commandHints.testCommand,
    'pnpm test tests/skills/tdd-skill-contract.test.cjs'
  );
  assert.equal(profile.commandHints.lintCommand, 'pnpm lint');
  assert.equal(profile.commandHints.formatCommand, 'pnpm format:check');
  assert.equal(profile.entries.failureSignatures.length, 1);
  assert.equal(profile.entries.antiPatterns.length, 1);
  assert.equal(profile.entries.scenarioTemplates.length, 1);
  assert.ok(fs.statSync(profilePath).size <= 16 * 1024);
});

test('tdd pre-execute hook surfaces command hints from memory profile', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-profile-'));
  const profilePath = path.join(tempDir, 'tdd-memory-profile.json');
  fs.writeFileSync(
    profilePath,
    JSON.stringify({
      version: 1,
      commandHints: {
        testCommand: 'pnpm test',
        lintCommand: 'pnpm lint',
        formatCommand: 'pnpm format:check',
      },
      entries: { failureSignatures: [], antiPatterns: [], scenarioTemplates: [] },
    })
  );

  const result = runNode(
    ['.claude/skills/tdd/hooks/pre-execute.cjs', '{"task":"demo","mode":"full_task"}'],
    { env: { TDD_MEMORY_PROFILE_PATH: profilePath } }
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /memory hint: test command -> pnpm test/);
});
