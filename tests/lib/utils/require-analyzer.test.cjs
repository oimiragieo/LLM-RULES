'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Module under test (will fail - does not exist yet)
const {
  extractRequires,
  resolveRequirePath,
} = require('../../../.claude/lib/utils/require-analyzer.cjs');

describe('extractRequires', () => {
  let tempDir;
  let tempFile;

  before(() => {
    // Create temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'require-analyzer-test-'));
  });

  after(() => {
    // Clean up temp files
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('extracts simple require() with single quotes', () => {
    const content = "const fs = require('./foo.cjs');";
    tempFile = path.join(tempDir, 'test1.cjs');
    fs.writeFileSync(tempFile, content);

    const result = extractRequires(tempFile);

    assert.ok(result.requires);
    assert.equal(result.requires.length, 1);
    assert.equal(result.requires[0].raw, './foo.cjs');
    assert.equal(result.requires[0].line, 1);
    assert.equal(result.requires[0].isRelative, true);
  });

  it('extracts simple require() with double quotes', () => {
    const content = 'const x = require("../lib/bar.cjs");';
    tempFile = path.join(tempDir, 'test2.cjs');
    fs.writeFileSync(tempFile, content);

    const result = extractRequires(tempFile);

    assert.ok(result.requires);
    assert.equal(result.requires.length, 1);
    assert.equal(result.requires[0].raw, '../lib/bar.cjs');
    assert.equal(result.requires[0].line, 1);
    assert.equal(result.requires[0].isRelative, true);
  });

  it('extracts multiple requires from multi-line content', () => {
    const content = `const a = require('./a.cjs');
// some code
const b = require('./b.cjs');
// more code
const c = require('./c.cjs');`;
    tempFile = path.join(tempDir, 'test3.cjs');
    fs.writeFileSync(tempFile, content);

    const result = extractRequires(tempFile);

    assert.ok(result.requires);
    assert.equal(result.requires.length, 3);
    assert.equal(result.requires[0].line, 1);
    assert.equal(result.requires[1].line, 3);
    assert.equal(result.requires[2].line, 5);
  });

  it('extracts path.join requires', () => {
    const content = "const x = require(path.join('routing', 'router-state.cjs'));";
    tempFile = path.join(tempDir, 'test4.cjs');
    fs.writeFileSync(tempFile, content);

    const result = extractRequires(tempFile);

    assert.ok(result.requires);
    assert.equal(result.requires.length, 1);
    assert.equal(result.requires[0].raw, 'routing/router-state.cjs');
  });

  it('skips non-relative requires (node built-ins)', () => {
    const content = "require('fs'); require('path'); require('crypto');";
    tempFile = path.join(tempDir, 'test5.cjs');
    fs.writeFileSync(tempFile, content);

    const result = extractRequires(tempFile);

    assert.ok(result.requires);
    // Should extract all requires but mark them as non-relative
    result.requires.forEach(req => {
      assert.equal(req.isRelative, false);
    });
  });

  it('skips dynamic requires (variables)', () => {
    const content = 'require(someVar); require(`template-${x}`);';
    tempFile = path.join(tempDir, 'test6.cjs');
    fs.writeFileSync(tempFile, content);

    const result = extractRequires(tempFile);

    // Regex should not capture dynamic requires
    assert.ok(result.requires);
    assert.equal(result.requires.length, 0);
  });

  it('handles require with whitespace variations', () => {
    const content = "require(  './spaced.cjs'  );";
    tempFile = path.join(tempDir, 'test7.cjs');
    fs.writeFileSync(tempFile, content);

    const result = extractRequires(tempFile);

    assert.ok(result.requires);
    assert.equal(result.requires.length, 1);
    assert.equal(result.requires[0].raw, './spaced.cjs');
  });

  it('handles commented-out requires', () => {
    const content = "// require('./commented.cjs')";
    tempFile = path.join(tempDir, 'test8.cjs');
    fs.writeFileSync(tempFile, content);

    const result = extractRequires(tempFile);

    // Should skip commented requires
    assert.ok(result.requires);
    assert.equal(result.requires.length, 0);
  });

  it('returns errors array for malformed input', () => {
    // Non-existent file
    const result = extractRequires('/nonexistent/file.cjs');

    assert.ok(result.errors);
    assert.ok(result.errors.length > 0);
  });
});

describe('resolveRequirePath', () => {
  let tempDir;
  let hookFile;
  let targetFile;
  let escapedSiblingFile;

  before(() => {
    // Create temp directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'require-resolver-test-'));
    const hooksDir = path.join(tempDir, 'hooks', 'monitoring');
    const libDir = path.join(tempDir, 'lib', 'utils');

    fs.mkdirSync(hooksDir, { recursive: true });
    fs.mkdirSync(libDir, { recursive: true });

    hookFile = path.join(hooksDir, 'hook.cjs');
    targetFile = path.join(hooksDir, 'error-tracker.cjs');
    escapedSiblingFile = path.join(path.dirname(tempDir), `${path.basename(tempDir)}-outside.cjs`);

    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'fixture-root' }));
    fs.writeFileSync(hookFile, '// test hook');
    fs.writeFileSync(targetFile, '// test target');
    fs.writeFileSync(path.join(libDir, 'hook-input.cjs'), '// lib file');
    fs.writeFileSync(escapedSiblingFile, '// outside fixture root');
  });

  after(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (escapedSiblingFile && fs.existsSync(escapedSiblingFile)) {
      fs.rmSync(escapedSiblingFile, { force: true });
    }
  });

  it('resolves relative path from same directory', () => {
    const resolved = resolveRequirePath('./error-tracker.cjs', hookFile);

    assert.ok(resolved);
    assert.equal(path.basename(resolved), 'error-tracker.cjs');
    assert.ok(fs.existsSync(resolved));
  });

  it('resolves parent directory path', () => {
    const resolved = resolveRequirePath('../../lib/utils/hook-input.cjs', hookFile);

    assert.ok(resolved);
    assert.equal(path.basename(resolved), 'hook-input.cjs');
    assert.ok(fs.existsSync(resolved));
  });

  it('resolves path.join style paths', () => {
    // Simulating path.join('lib', 'utils', 'hook-input.cjs') from hooks/monitoring/
    const resolved = resolveRequirePath('../../lib/utils/hook-input.cjs', hookFile);

    assert.ok(resolved);
    assert.ok(fs.existsSync(resolved));
  });

  it('[SEC-CI-002] rejects paths that resolve outside PROJECT_ROOT', () => {
    // Create a path that traverses outside project root
    const maliciousPath = '../../../../../../../../../etc/passwd';

    const resolved = resolveRequirePath(maliciousPath, hookFile);

    // Should either reject or mark as not existing
    // Implementation should validate against PROJECT_ROOT
    assert.ok(resolved === null || !fs.existsSync(resolved));
  });

  it('[SEC-CI-002] validates resolved paths within project root', () => {
    // All resolved paths should pass validatePathWithinProject()
    const validPath = './error-tracker.cjs';
    const resolved = resolveRequirePath(validPath, hookFile);

    assert.ok(resolved);
    // Path should be within the temp directory (simulating PROJECT_ROOT)
    assert.ok(resolved.startsWith(tempDir));
  });

  it('[SEC-CI-002] rejects existing sibling files outside a fixture root discovered via package.json', () => {
    const maliciousPath = `../../../${path.basename(escapedSiblingFile)}`;

    const resolved = resolveRequirePath(maliciousPath, hookFile);

    assert.equal(resolved, null);
  });
});
