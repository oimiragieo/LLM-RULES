'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SKILL_PATH = path.join(PROJECT_ROOT, '.claude/skills/markitdown-converter/SKILL.md');
const SCRIPT_PATH = path.join(PROJECT_ROOT, '.claude/tools/cli/markitdown-convert.py');
const SKILL_INDEX_PATH = path.join(PROJECT_ROOT, '.claude/config/skill-index.json');

/**
 * Helper to run markitdown-convert.py with given args.
 * Returns { status, stdout, stderr }.
 */
function runScript(args = [], options = {}) {
  const result = spawnSync('python', [SCRIPT_PATH, ...args], {
    encoding: 'utf-8',
    timeout: 30000,
    shell: false,
    ...options,
  });
  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

// ---------------------------------------------------------------------------
// 1. Skill file exists
// ---------------------------------------------------------------------------
test('markitdown-converter skill: SKILL.md exists', () => {
  assert.ok(fs.existsSync(SKILL_PATH), `SKILL.md not found at ${SKILL_PATH}`);
});

// ---------------------------------------------------------------------------
// 2. Skill has required frontmatter fields
// ---------------------------------------------------------------------------
test('markitdown-converter skill: SKILL.md has required frontmatter fields', () => {
  const content = fs.readFileSync(SKILL_PATH, 'utf-8');

  // Frontmatter is delimited by --- ... ---
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(fmMatch, 'SKILL.md must have YAML frontmatter delimited by ---');
  const frontmatter = fmMatch[1];

  const requiredFields = ['name', 'version', 'description', 'category', 'tools'];
  for (const field of requiredFields) {
    const pattern = new RegExp(`^${field}:`, 'm');
    assert.ok(pattern.test(frontmatter), `Frontmatter must contain field: ${field}`);
  }
});

// ---------------------------------------------------------------------------
// 3. CLI script exists
// ---------------------------------------------------------------------------
test('markitdown-converter skill: CLI script exists at expected path', () => {
  assert.ok(fs.existsSync(SCRIPT_PATH), `CLI script not found at ${SCRIPT_PATH}`);
});

// ---------------------------------------------------------------------------
// 4. Skill appears in skill index
// ---------------------------------------------------------------------------
test('markitdown-converter skill: appears in skill-index.json', () => {
  assert.ok(fs.existsSync(SKILL_INDEX_PATH), `skill-index.json not found at ${SKILL_INDEX_PATH}`);
  const index = JSON.parse(fs.readFileSync(SKILL_INDEX_PATH, 'utf-8'));

  // The index has a "skills" key containing skill entries keyed by name
  const skills = index.skills || index;
  assert.ok(
    skills['markitdown-converter'],
    'markitdown-converter must be present in skill-index.json'
  );
  assert.equal(
    skills['markitdown-converter'].name,
    'markitdown-converter',
    'Skill entry name must match'
  );
});

// ---------------------------------------------------------------------------
// 5. --help returns exit code 0
// ---------------------------------------------------------------------------
test('markitdown-converter skill: --help returns exit code 0', () => {
  const { status, stdout } = runScript(['--help']);
  assert.equal(status, 0, 'Expected exit code 0 for --help');
  assert.ok(stdout.includes('markitdown-convert.py'), 'Help output should mention the script name');
});

// ---------------------------------------------------------------------------
// 6. Non-existent file returns exit code 2
// ---------------------------------------------------------------------------
test('markitdown-converter skill: non-existent file returns exit code 2', () => {
  const fakePath = path.join(os.tmpdir(), `nonexistent-markitdown-test-${Date.now()}.xyz`);
  const { status } = runScript([fakePath]);
  assert.equal(status, 2, 'Expected exit code 2 for file not found');
});

// ---------------------------------------------------------------------------
// 7. Returns valid JSON on all exits
// ---------------------------------------------------------------------------
test('markitdown-converter skill: returns valid JSON on file-not-found exit', () => {
  const fakePath = path.join(os.tmpdir(), `nonexistent-json-test-${Date.now()}.xyz`);
  const { stdout } = runScript([fakePath]);
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(stdout);
  }, 'Output must be valid JSON on file-not-found exit');
  assert.equal(typeof parsed, 'object', 'Parsed JSON must be an object');
});

test('markitdown-converter skill: returns valid JSON on no-markitdown exit', () => {
  // Simulate markitdown not installed via fake PYTHONPATH
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markitdown-noimport-'));
  const htmlPath = path.join(tmpDir, 'test.html');
  fs.writeFileSync(htmlPath, '<h1>Test</h1>', 'utf-8');

  const fakeModDir = path.join(tmpDir, 'fake_site');
  const fakeMarkitdown = path.join(fakeModDir, 'markitdown');
  fs.mkdirSync(fakeMarkitdown, { recursive: true });
  fs.writeFileSync(
    path.join(fakeMarkitdown, '__init__.py'),
    'raise ImportError("simulated missing")\n',
    'utf-8'
  );

  const env = { ...process.env };
  const sep = process.platform === 'win32' ? ';' : ':';
  env.PYTHONPATH = fakeModDir + (env.PYTHONPATH ? sep + env.PYTHONPATH : '');

  try {
    const { stdout } = runScript([htmlPath], { env });
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(stdout);
    }, 'Output must be valid JSON on no-markitdown exit');
    assert.equal(typeof parsed, 'object', 'Parsed JSON must be an object');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 8. JSON output has `success` field (boolean)
// ---------------------------------------------------------------------------
test('markitdown-converter skill: JSON output has boolean success field on error', () => {
  const fakePath = path.join(os.tmpdir(), `nonexistent-success-test-${Date.now()}.xyz`);
  const { stdout } = runScript([fakePath]);
  const result = JSON.parse(stdout);
  assert.equal(typeof result.success, 'boolean', 'success field must be a boolean');
});

// ---------------------------------------------------------------------------
// 9. JSON output on error has `error` field (string)
// ---------------------------------------------------------------------------
test('markitdown-converter skill: JSON output on error has string error field', () => {
  const fakePath = path.join(os.tmpdir(), `nonexistent-error-test-${Date.now()}.xyz`);
  const { stdout } = runScript([fakePath]);
  const result = JSON.parse(stdout);
  assert.equal(result.success, false, 'success must be false on error');
  assert.equal(typeof result.error, 'string', 'error field must be a string on error');
  assert.ok(result.error.length > 0, 'error string must be non-empty');
});

// ---------------------------------------------------------------------------
// 10. JSON output on success has text_content and char_count fields
// ---------------------------------------------------------------------------
test('markitdown-converter skill: JSON output on success has text_content and char_count', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markitdown-success-'));
  const htmlPath = path.join(tmpDir, 'test.html');
  fs.writeFileSync(htmlPath, '<html><body><h1>Success Test</h1></body></html>', 'utf-8');

  try {
    const { status, stdout } = runScript([htmlPath]);

    if (status === 3) {
      // markitdown not installed -- skip but verify JSON structure
      const result = JSON.parse(stdout);
      assert.equal(result.success, false);
      assert.ok(
        result.error.includes('markitdown not installed'),
        'Should indicate markitdown is not installed'
      );
      return;
    }

    assert.equal(status, 0, 'Expected exit code 0 on success');
    const result = JSON.parse(stdout);
    assert.equal(result.success, true, 'success must be true');
    assert.ok(
      Object.prototype.hasOwnProperty.call(result, 'text_content'),
      'Result must have text_content field'
    );
    assert.equal(typeof result.text_content, 'string', 'text_content must be a string');
    assert.ok(
      Object.prototype.hasOwnProperty.call(result, 'char_count'),
      'Result must have char_count field'
    );
    assert.equal(typeof result.char_count, 'number', 'char_count must be a number');
    assert.ok(result.char_count > 0, 'char_count must be positive on success');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
