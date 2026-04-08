'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'config',
  'code-index-config.json'
);

let config;

describe('code-index-config.json exclusion patterns', () => {
  it('exists and is valid JSON with excludePatterns array', () => {
    assert.ok(fs.existsSync(CONFIG_PATH), 'Config file should exist');
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(raw);
    assert.ok(config.indexing, 'indexing section should exist');
    assert.ok(Array.isArray(config.indexing.excludePatterns), 'excludePatterns should be an array');
    assert.ok(config.indexing.excludePatterns.length > 0, 'excludePatterns should not be empty');
  });

  it('excludes worktree directories', () => {
    const patterns = config.indexing.excludePatterns;
    assert.ok(
      patterns.some(p => p.includes('.claude/worktrees')),
      'Should exclude .claude/worktrees — worktrees contain duplicate repo copies'
    );
  });

  it('excludes tmp directories', () => {
    const patterns = config.indexing.excludePatterns;
    assert.ok(
      patterns.some(p => p.includes('.claude/context/tmp')),
      'Should exclude .claude/context/tmp — temp files and cloned external repos'
    );
  });

  it('excludes node_modules', () => {
    const patterns = config.indexing.excludePatterns;
    assert.ok(
      patterns.some(p => p.includes('node_modules')),
      'Should exclude node_modules'
    );
  });

  it('excludes code index data directory (self-indexing prevention)', () => {
    const patterns = config.indexing.excludePatterns;
    assert.ok(
      patterns.some(p => p.includes('.claude/context/code-index')),
      'Should exclude code-index — prevents indexing the index itself'
    );
  });

  it('excludes archive directory', () => {
    const patterns = config.indexing.excludePatterns;
    assert.ok(
      patterns.some(p => p.includes('.claude.archive')),
      'Should exclude .claude.archive'
    );
  });

  it('excludes JSONL files (runtime data, not code)', () => {
    const patterns = config.indexing.excludePatterns;
    assert.ok(
      patterns.some(p => p.includes('.jsonl')),
      'Should exclude *.jsonl files'
    );
  });

  it('excludes git directory', () => {
    const patterns = config.indexing.excludePatterns;
    assert.ok(
      patterns.some(p => p.includes('.git')),
      'Should exclude .git'
    );
  });
});
