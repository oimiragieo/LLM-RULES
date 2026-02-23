'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CALCULATOR = path.join(process.cwd(), '.claude', 'tools', 'cli', 'semver-bump-calculator.cjs');
const TMP_DIR = path.join(process.cwd(), '.claude', 'context', 'tmp', 'semver-test');

test('semver-bump-calculator correctly handles diff command', () => {
    const result = spawnSync('node', [CALCULATOR, 'diff', '--from', '1.0.0', '--to', '1.1.0'], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, 'Should exit 0');
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.changeType, 'minor');
});

test('semver-bump-calculator computes frontmatter bump correctly', () => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

    const oldFile = path.join(TMP_DIR, 'old.md');
    const newFile = path.join(TMP_DIR, 'new.md');

    fs.writeFileSync(oldFile, '---\ntools: [Read, Write]\n---', 'utf8');
    fs.writeFileSync(newFile, '---\ntools: [Read, Write, Format]\n---', 'utf8'); // Added a tool = minor bump

    const result = spawnSync('node', [CALCULATOR, '--old', oldFile, '--new', newFile, '--type', 'agent'], { encoding: 'utf8' });

    fs.unlinkSync(oldFile);
    fs.unlinkSync(newFile);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout.trim(), 'minor');
});
