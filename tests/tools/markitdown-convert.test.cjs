'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRIPT_PATH = path.resolve(__dirname, '../../.claude/tools/cli/markitdown-convert.py');

/**
 * Helper to run the markitdown-convert.py script with given args.
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

test('markitdown-convert.py: script file exists', () => {
  assert.ok(fs.existsSync(SCRIPT_PATH), `Script not found at ${SCRIPT_PATH}`);
});

test('markitdown-convert.py: --help flag returns exit code 0', () => {
  const { status, stdout } = runScript(['--help']);
  assert.equal(status, 0, 'Expected exit code 0 for --help');
  assert.ok(stdout.includes('markitdown-convert.py'), 'Help output should mention the script name');
  assert.ok(stdout.includes('Usage'), 'Help output should include Usage section');
});

test('markitdown-convert.py: -h flag also returns exit code 0', () => {
  const { status } = runScript(['-h']);
  assert.equal(status, 0, 'Expected exit code 0 for -h');
});

test('markitdown-convert.py: no arguments returns exit code 0 (shows help)', () => {
  const { status, stdout } = runScript([]);
  assert.equal(status, 0, 'Expected exit code 0 for no args (help)');
  assert.ok(stdout.includes('Usage'), 'Should show help text');
});

test('markitdown-convert.py: non-existent file returns exit code 2 with JSON error', () => {
  const fakePath = path.join(os.tmpdir(), 'nonexistent-file-abc123.xyz');
  const { status, stdout } = runScript([fakePath]);
  assert.equal(status, 2, 'Expected exit code 2 for file not found');

  const result = JSON.parse(stdout);
  assert.equal(result.success, false, 'success should be false');
  assert.ok(
    result.error.includes('File not found'),
    `Error should mention file not found, got: ${result.error}`
  );
});

test('markitdown-convert.py: conversion with a simple HTML file', () => {
  // Create a temporary HTML file
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markitdown-test-'));
  const htmlPath = path.join(tmpDir, 'test.html');
  const htmlContent = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
<h1>Hello World</h1>
<p>This is a <strong>test</strong> paragraph.</p>
<ul>
<li>Item 1</li>
<li>Item 2</li>
</ul>
</body>
</html>`;

  fs.writeFileSync(htmlPath, htmlContent, 'utf-8');

  try {
    const { status, stdout, stderr } = runScript([htmlPath]);

    if (status === 3) {
      // markitdown not installed — this is expected in environments without it
      const result = JSON.parse(stdout);
      assert.equal(result.success, false);
      assert.ok(
        result.error.includes('markitdown not installed'),
        'Should indicate markitdown is not installed'
      );
      return; // Skip remaining assertions
    }

    // If markitdown IS installed, verify successful conversion
    assert.equal(status, 0, `Expected exit code 0 on success, stderr: ${stderr}`);
    const result = JSON.parse(stdout);
    assert.equal(result.success, true, 'success should be true');
    assert.ok(result.text_content, 'text_content should be non-empty');
    assert.ok(
      result.text_content.includes('Hello World'),
      'Markdown output should contain the heading text'
    );
    assert.ok(result.char_count > 0, 'char_count should be positive');
    assert.equal(result.source_file, 'test.html');
  } finally {
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('markitdown-convert.py: conversion with output file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markitdown-out-'));
  const htmlPath = path.join(tmpDir, 'input.html');
  const outputPath = path.join(tmpDir, 'output.md');

  fs.writeFileSync(htmlPath, '<html><body><h1>Output Test</h1></body></html>', 'utf-8');

  try {
    const { status, stdout } = runScript([htmlPath, outputPath]);

    if (status === 3) {
      // markitdown not installed — skip
      return;
    }

    assert.equal(status, 0, 'Expected exit code 0');
    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.equal(result.output_file, outputPath);

    // Verify output file was written
    assert.ok(fs.existsSync(outputPath), 'Output file should exist');
    const written = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(written.includes('Output Test'), 'Written file should contain converted content');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('markitdown-convert.py: --ext flag is accepted', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markitdown-ext-'));
  const txtPath = path.join(tmpDir, 'data.txt');
  fs.writeFileSync(txtPath, '<h1>ExtTest</h1>', 'utf-8');

  try {
    const { status, stdout } = runScript([txtPath, '--ext', '.html']);

    if (status === 3) {
      // markitdown not installed — skip
      return;
    }

    // If installed, it should attempt conversion (may succeed or fail depending
    // on markitdown's handling, but should not crash)
    const result = JSON.parse(stdout);
    assert.ok(typeof result.success === 'boolean', 'Result should have boolean success field');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('markitdown-convert.py: markitdown not installed produces exit code 3', () => {
  // This test verifies the behavior when markitdown is not importable.
  // We simulate this by running Python with a modified PYTHONPATH that
  // prevents markitdown from being found.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markitdown-noimport-'));
  const htmlPath = path.join(tmpDir, 'test.html');
  fs.writeFileSync(htmlPath, '<h1>Test</h1>', 'utf-8');

  try {
    // Create a fake markitdown package that raises ImportError
    const fakeModDir = path.join(tmpDir, 'fake_site');
    const fakeMarkitdown = path.join(fakeModDir, 'markitdown');
    fs.mkdirSync(fakeMarkitdown, { recursive: true });
    fs.writeFileSync(
      path.join(fakeMarkitdown, '__init__.py'),
      'raise ImportError("simulated missing")\n',
      'utf-8'
    );

    // Run with the fake site-packages first in PYTHONPATH so it shadows real markitdown
    const env = { ...process.env };
    const sep = process.platform === 'win32' ? ';' : ':';
    env.PYTHONPATH = fakeModDir + (env.PYTHONPATH ? sep + env.PYTHONPATH : '');

    const { status, stdout } = runScript([htmlPath], { env });
    assert.equal(status, 3, 'Expected exit code 3 when markitdown cannot be imported');

    const result = JSON.parse(stdout);
    assert.equal(result.success, false);
    assert.ok(
      result.error.includes('markitdown not installed'),
      `Error should mention markitdown not installed, got: ${result.error}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('markitdown-convert.py: plain text file conversion', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'markitdown-plain-'));
  const txtPath = path.join(tmpDir, 'readme.txt');
  fs.writeFileSync(txtPath, 'Hello from a plain text file.\nSecond line.', 'utf-8');

  try {
    const { status, stdout } = runScript([txtPath]);

    if (status === 3) {
      // markitdown not installed — skip
      return;
    }

    assert.equal(status, 0, 'Expected exit code 0 for plain text');
    const result = JSON.parse(stdout);
    assert.equal(result.success, true);
    assert.ok(result.text_content.includes('Hello from a plain text file'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
