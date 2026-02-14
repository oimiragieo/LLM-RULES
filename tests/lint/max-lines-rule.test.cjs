const { describe, it } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');
const eslintBin = path.join(path.dirname(require.resolve('eslint/package.json')), 'bin', 'eslint.js');

describe('ESLint max-lines rule', () => {
  it('should report error for files exceeding 500 lines (skipBlankLines, skipComments)', () => {
    // Create a temp file with 501 non-blank, non-comment lines
    const tmpDir = path.join(__dirname, '../../.claude/context/tmp');
    const tmpFile = path.join(tmpDir, 'test-overlength.cjs');
    const fs = require('fs');
    fs.mkdirSync(tmpDir, { recursive: true });
    // Use valid code that doesn't trigger no-unused-vars
    const lines = ['module.exports = {'];
    for (let i = 0; i < 501; i++) {
      lines.push(`  x${i}: ${i},`);
    }
    lines.push('};');
    fs.writeFileSync(tmpFile, lines.join('\n'));

    try {
      const run = spawnSync(
        process.execPath,
        [eslintBin, tmpFile.replace(/\\/g, '/')],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const output = (run.stdout || '') + (run.stderr || '');
      assert.ok(
        output.includes('max-lines'),
        `ESLint should flag files over 500 lines with max-lines warning, got: ${output}`
      );
    } catch (err) {
      // If ESLint exits non-zero (e.g. other errors), still check for max-lines
      const output = (err.stdout || '') + (err.stderr || '');
      assert.ok(
        output.includes('max-lines'),
        `ESLint should flag files over 500 lines with max-lines rule, got: ${output}`
      );
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('should allow files with 500 or fewer non-blank non-comment lines', () => {
    const tmpDir = path.join(__dirname, '../../.claude/context/tmp');
    const tmpFile = path.join(tmpDir, 'test-underlength.cjs');
    const fs = require('fs');
    fs.mkdirSync(tmpDir, { recursive: true });
    // Use valid code that doesn't trigger no-unused-vars
    const lines = ['module.exports = {'];
    for (let i = 0; i < 498; i++) {
      lines.push(`  x${i}: ${i},`);
    }
    lines.push('};');
    fs.writeFileSync(tmpFile, lines.join('\n'));

    try {
      const run = spawnSync(
        process.execPath,
        [eslintBin, tmpFile.replace(/\\/g, '/')],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      assert.strictEqual(run.status, 0, `ESLint should succeed, got status=${run.status}`);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
