# Phase 2: Hybrid Search - Detailed Implementation Plan

**Version:** 1.0
**Status:** READY FOR IMPLEMENTATION
**Author:** Planner Agent (Task #44)
**Date:** 2026-01-31
**Parent Document:** `PHASE_2_HYBRID_SEARCH_DESIGN.md`

---

## Executive Summary

This plan breaks down Phase 2 (Hybrid Search) into **68 atomic subtasks** across **13 main tasks**. Each subtask is designed to be completed in under 2 hours, with clear dependencies, verification commands, and success criteria.

| Metric | Value |
|--------|-------|
| **Total Tasks** | 68 atomic subtasks |
| **Total Effort** | ~85-100 hours |
| **Timeline** | ~12-15 work days |
| **Critical Path** | ast-grep Setup -> Wrapper -> Hybrid Engine -> CLI -> Skills -> Advanced Features |

### Sprint Overview

| Sprint | Days | Focus | Tasks |
|--------|------|-------|-------|
| Sprint 1 | 1-3 | ast-grep Integration | #45-#47 |
| Sprint 2 | 4-7 | Hybrid Orchestration | #48-#51 |
| Sprint 3 | 8-10 | CLI & Skills | #52-#54 |
| Sprint 4 | 11-15 | Advanced Features & QA | #55-#57 |

---

## Timeline Gantt Chart (ASCII)

```
Day:  1    2    3    4    5    6    7    8    9   10   11   12   13   14   15
      |----|----|----|----|----|----|----|----|----|----|----|----|----|----|----
#45 Setup      [===]
               |
#46 Wrapper         [======]
                    |
#47 Tests                [===]
                         |
#48 Analyzer                  [====]
                              |
#49 Ranker                         [====]
                                   |
#50 Hybrid                              [========]
                                        |
#51 Int.Tests                                [===]
                                             |
#52 CLI                                           [=====]
                                                  |
#53 Skills                                             [====]
                                                       |
#54 Skill Tests                                             [==]
                                                            |
#55 Merkle                                                      [====]
                                                                |
#56 Watcher                                                          [===]
                                                                     |
#57 Persist                                                               [====]

LEGEND:
[===] = Task duration
   |  = Dependency flow
```

---

## Detailed Task Breakdown

---

## Task #45: Set Up ast-grep Binary and Environment

**Estimated Total Effort:** 4-5 hours
**Dependencies:** Phase 1 Complete
**Blocks:** Tasks #46, #47, #48, #49, #50

### 45.1: Install ast-grep binary (1 hour)

**Description:** Download and install the ast-grep (sg) binary for the current platform.

**Subtasks:**
- [ ] Check current platform (Windows/macOS/Linux)
- [ ] Download pre-built binary from GitHub releases
- [ ] Verify binary is executable

**Command (Windows):**
```powershell
# Download ast-grep for Windows
$version = "0.35.0"
$url = "https://github.com/ast-grep/ast-grep/releases/download/$version/sg-x86_64-pc-windows-msvc.exe"
$outPath = ".claude/bin/sg.exe"
mkdir -Force .claude/bin
Invoke-WebRequest -Uri $url -OutFile $outPath
```

**Command (macOS/Linux via npm):**
```bash
npm install -g @ast-grep/cli
# OR
brew install ast-grep
```

**Verify:**
```bash
sg --version
# Expected: ast-grep 0.35.0
```

**Rollback:**
```bash
rm -f .claude/bin/sg.exe
# OR
npm uninstall -g @ast-grep/cli
```

**Success Criteria:**
- [ ] `sg --version` returns version number
- [ ] Binary accessible in PATH or known location

---

### 45.2: Verify ast-grep with test patterns (30 min)

**Description:** Test ast-grep with basic patterns to ensure it works correctly.

**Command:**
```bash
# Create a test file
echo 'function hello(name) { return "Hello, " + name; }' > /tmp/test.js

# Run ast-grep pattern
sg -p 'function $NAME($ARGS) { $BODY }' /tmp/test.js --json

# Clean up
rm /tmp/test.js
```

**Expected Output (JSON):**
```json
[{
  "text": "function hello(name) { return \"Hello, \" + name; }",
  "range": {"start": {"line": 0, "column": 0}, "end": {"line": 0, "column": 50}},
  "file": "/tmp/test.js",
  "language": "javascript"
}]
```

**Success Criteria:**
- [ ] Pattern matching works
- [ ] JSON output parseable
- [ ] Metavariables captured correctly

---

### 45.3: Test ast-grep multi-language support (45 min)

**Description:** Verify ast-grep works with all Phase 1 languages.

**Command:**
```bash
# Create test files for each language
mkdir -p /tmp/ast-grep-test

# JavaScript
echo 'function test() { return 42; }' > /tmp/ast-grep-test/test.js

# TypeScript
echo 'function typed(x: number): number { return x * 2; }' > /tmp/ast-grep-test/test.ts

# Python
echo 'def hello(name):
    return f"Hello, {name}"' > /tmp/ast-grep-test/test.py

# Go
echo 'package main
func hello(name string) string {
    return "Hello, " + name
}' > /tmp/ast-grep-test/test.go

# Rust
echo 'fn hello(name: &str) -> String {
    format!("Hello, {}", name)
}' > /tmp/ast-grep-test/test.rs

# Test each language
sg -p 'function $NAME($$$) { $$$ }' /tmp/ast-grep-test/test.js --json
sg -p 'function $NAME($$$) { $$$ }' /tmp/ast-grep-test/test.ts --json
sg -p 'def $NAME($$$): $$$' /tmp/ast-grep-test/test.py --json
sg -p 'func $NAME($$$) $$$ { $$$ }' /tmp/ast-grep-test/test.go --json
sg -p 'fn $NAME($$$) -> $$$ { $$$ }' /tmp/ast-grep-test/test.rs --json

# Clean up
rm -rf /tmp/ast-grep-test
```

**Success Criteria:**
- [ ] JavaScript patterns work
- [ ] TypeScript patterns work
- [ ] Python patterns work
- [ ] Go patterns work
- [ ] Rust patterns work

---

### 45.4: Document ast-grep binary location (30 min)

**Description:** Add ast-grep binary path to configuration.

**File:** `.claude/config/code-index-config.json`

**Update:**
```json
{
  "astGrep": {
    "binPath": "sg",
    "timeout": 30000,
    "maxResults": 1000
  }
}
```

**Verify:**
```bash
node -e "const cfg = require('./.claude/config/code-index-config.json'); console.log(cfg.astGrep.binPath)"
```

**Success Criteria:**
- [ ] Config updated with ast-grep section
- [ ] Binary path configurable

---

### 45.5: Create module stub for ast-grep wrapper (30 min)

**Description:** Create the ast-grep-wrapper.cjs module stub.

**File:** `.claude/lib/code-indexing/ast-grep-wrapper.cjs`

**Content:**
```javascript
/**
 * ast-grep wrapper - Structural code search using AST patterns
 *
 * @module code-indexing/ast-grep-wrapper
 * @see {@link .claude/docs/PHASE_2_HYBRID_SEARCH_DESIGN.md}
 */

'use strict';

// TODO: Implement AstGrepSearch class

class AstGrepSearch {
  constructor(options = {}) {
    this.binPath = options.binPath || 'sg';
    this.projectRoot = options.projectRoot || process.cwd();
    this.timeout = options.timeout || 30000;
  }

  async isAvailable() {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  async search(pattern, language, options = {}) {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  async refine(semanticResults, pattern, language) {
    // TODO: Implement
    throw new Error('Not implemented');
  }

  async getVersion() {
    // TODO: Implement
    throw new Error('Not implemented');
  }
}

module.exports = { AstGrepSearch };
```

**Verify:**
```bash
node -e "const { AstGrepSearch } = require('./.claude/lib/code-indexing/ast-grep-wrapper.cjs'); console.log('OK')"
```

**Success Criteria:**
- [ ] Module file exists
- [ ] Class can be imported
- [ ] No syntax errors

---

### Task #45 Summary

| Subtask | Effort | Dependencies |
|---------|--------|--------------|
| 45.1 Install binary | 1h | None |
| 45.2 Test patterns | 30m | 45.1 |
| 45.3 Multi-language | 45m | 45.2 |
| 45.4 Config update | 30m | 45.2 |
| 45.5 Module stub | 30m | None |
| **Total** | **3.5h** | |

**Verification Gate:**
```bash
sg --version && \
node -e "require('./.claude/lib/code-indexing/ast-grep-wrapper.cjs')" && \
echo "GATE PASSED: Task #45 complete"
```

---

## Task #46: Implement ast-grep-wrapper.cjs

**Estimated Total Effort:** 8-10 hours
**Dependencies:** Task #45 complete
**Blocks:** Task #47, #50

### 46.1: Implement isAvailable() method (1 hour)

**Description:** Check if ast-grep binary is available and working.

**Implementation:**
```javascript
const { spawn } = require('child_process');

async isAvailable() {
  return new Promise((resolve) => {
    const proc = spawn(this.binPath, ['--version']);
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}
```

**Test:**
```bash
node -e "
const { AstGrepSearch } = require('./.claude/lib/code-indexing/ast-grep-wrapper.cjs');
const sg = new AstGrepSearch();
sg.isAvailable().then(r => console.log('Available:', r));
"
```

**Success Criteria:**
- [ ] Returns true when sg installed
- [ ] Returns false when sg missing
- [ ] No exceptions thrown

---

### 46.2: Implement getVersion() method (30 min)

**Description:** Get ast-grep version string.

**Implementation:**
```javascript
async getVersion() {
  return new Promise((resolve, reject) => {
    const proc = spawn(this.binPath, ['--version']);
    let stdout = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        const match = stdout.match(/ast-grep (\d+\.\d+\.\d+)/);
        resolve(match ? match[1] : stdout.trim());
      } else {
        reject(new Error('ast-grep version check failed'));
      }
    });
  });
}
```

**Test:**
```bash
node -e "
const { AstGrepSearch } = require('./.claude/lib/code-indexing/ast-grep-wrapper.cjs');
const sg = new AstGrepSearch();
sg.getVersion().then(v => console.log('Version:', v));
"
```

**Success Criteria:**
- [ ] Returns version string (e.g., '0.35.0')
- [ ] Handles errors gracefully

---

### 46.3: Implement search() method - basic (2 hours)

**Description:** Implement basic pattern search using ast-grep CLI.

**Implementation:**
```javascript
async search(pattern, language, options = {}) {
  const args = [
    '-p', pattern,
    '--lang', language,
    '--json'
  ];

  if (options.include && options.include.length > 0) {
    for (const glob of options.include) {
      args.push('--glob', glob);
    }
  }

  if (options.exclude && options.exclude.length > 0) {
    for (const glob of options.exclude) {
      args.push('--glob', `!${glob}`);
    }
  }

  args.push(this.projectRoot);

  return new Promise((resolve, reject) => {
    const proc = spawn(this.binPath, args, {
      timeout: this.timeout
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 || stdout.trim()) {
        try {
          const results = JSON.parse(stdout || '[]');
          resolve(this._formatResults(results, options.maxResults));
        } catch (e) {
          reject(new Error(`Failed to parse ast-grep output: ${e.message}`));
        }
      } else {
        reject(new Error(`ast-grep failed: ${stderr}`));
      }
    });
  });
}

_formatResults(results, maxResults = 100) {
  return results.slice(0, maxResults).map(r => ({
    filePath: r.file,
    lineStart: r.range.start.line + 1,
    lineEnd: r.range.end.line + 1,
    colStart: r.range.start.column,
    colEnd: r.range.end.column,
    code: r.text,
    matches: r.metaVariables || {},
    language: r.language
  }));
}
```

**Test:**
```bash
# Create test file first
mkdir -p /tmp/test-project
echo 'function hello(name) { return "Hello, " + name; }
function goodbye(name) { return "Bye, " + name; }' > /tmp/test-project/test.js

# Run test
node -e "
const { AstGrepSearch } = require('./.claude/lib/code-indexing/ast-grep-wrapper.cjs');
const sg = new AstGrepSearch({ projectRoot: '/tmp/test-project' });
sg.search('function \$NAME(\$\$\$) { \$\$\$ }', 'javascript')
  .then(results => {
    console.log('Found:', results.length, 'matches');
    results.forEach(r => console.log(' -', r.filePath, r.lineStart));
  })
  .catch(e => console.error(e));
"
```

**Success Criteria:**
- [ ] Returns array of results
- [ ] Results include file path, line numbers, code
- [ ] Language parameter works
- [ ] Include/exclude globs work

---

### 46.4: Implement search() method - error handling (1.5 hours)

**Description:** Add robust error handling and timeout support.

**Updates:**
```javascript
// Add timeout handling
const AbortController = require('abort-controller');

async search(pattern, language, options = {}) {
  // Validate inputs
  if (!pattern || typeof pattern !== 'string') {
    throw new Error('Pattern must be a non-empty string');
  }
  if (!language || typeof language !== 'string') {
    throw new Error('Language must be a non-empty string');
  }

  // Check availability
  if (!await this.isAvailable()) {
    throw new Error('ast-grep binary not available');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), this.timeout);

  try {
    // ... existing implementation ...
  } finally {
    clearTimeout(timeout);
  }
}
```

**Test Error Cases:**
```bash
node -e "
const { AstGrepSearch } = require('./.claude/lib/code-indexing/ast-grep-wrapper.cjs');
const sg = new AstGrepSearch();

// Test invalid pattern
sg.search('', 'javascript').catch(e => console.log('Empty pattern:', e.message));

// Test invalid language
sg.search('function $NAME() {}', '').catch(e => console.log('Empty lang:', e.message));
"
```

**Success Criteria:**
- [ ] Empty pattern throws error
- [ ] Empty language throws error
- [ ] Timeout aborts search
- [ ] Binary unavailable handled gracefully

---

### 46.5: Implement refine() method (2 hours)

**Description:** Filter semantic search results using structural patterns.

**Implementation:**
```javascript
async refine(semanticResults, pattern, language) {
  // Extract file paths from semantic results
  const filePaths = [...new Set(semanticResults.map(r => r.filePath))];

  // Search with pattern in those files only
  const structuralResults = await this.search(pattern, language, {
    include: filePaths.map(f => path.relative(this.projectRoot, f))
  });

  // Create lookup map for structural matches
  const structuralMap = new Map();
  for (const sr of structuralResults) {
    const key = `${sr.filePath}:${sr.lineStart}`;
    structuralMap.set(key, sr);
  }

  // Enhance semantic results with structural scores
  return semanticResults.map(sr => {
    // Check for exact structural match
    const key = `${sr.filePath}:${sr.lineRange[0]}`;
    const structuralMatch = structuralMap.get(key);

    // Check for overlapping line ranges
    let overlaps = false;
    for (const [_, strResult] of structuralMap) {
      if (strResult.filePath === sr.filePath) {
        if (sr.lineRange[0] <= strResult.lineEnd && sr.lineRange[1] >= strResult.lineStart) {
          overlaps = true;
          break;
        }
      }
    }

    return {
      ...sr,
      structuralScore: structuralMatch ? 1.0 : (overlaps ? 0.5 : 0.0),
      structuralMatch: structuralMatch || null
    };
  });
}
```

**Test:**
```bash
node -e "
const { AstGrepSearch } = require('./.claude/lib/code-indexing/ast-grep-wrapper.cjs');
const sg = new AstGrepSearch({ projectRoot: '/tmp/test-project' });

// Mock semantic results
const semanticResults = [
  { filePath: '/tmp/test-project/test.js', lineRange: [1, 1], code: 'function hello...' },
  { filePath: '/tmp/test-project/test.js', lineRange: [2, 2], code: 'function goodbye...' }
];

sg.refine(semanticResults, 'function hello(\$\$\$) { \$\$\$ }', 'javascript')
  .then(results => {
    console.log('Refined results:');
    results.forEach(r => console.log(' -', r.code.slice(0, 30), 'structural:', r.structuralScore));
  })
  .catch(e => console.error(e));
"
```

**Success Criteria:**
- [ ] Returns enhanced semantic results
- [ ] Structural score 1.0 for exact matches
- [ ] Structural score 0.5 for overlapping matches
- [ ] Structural score 0.0 for no match

---

### 46.6: Add language mapping (1 hour)

**Description:** Map file extensions and Phase 1 language names to ast-grep language names.

**Implementation:**
```javascript
const LANGUAGE_MAP = {
  // Phase 1 names -> ast-grep names
  'javascript': 'javascript',
  'js': 'javascript',
  'typescript': 'typescript',
  'ts': 'typescript',
  'python': 'python',
  'py': 'python',
  'go': 'go',
  'rust': 'rust',
  'rs': 'rust',
  'java': 'java',
  'c': 'c',
  'cpp': 'cpp',
  'csharp': 'c-sharp',
  'cs': 'c-sharp',
  'ruby': 'ruby',
  'rb': 'ruby',
  'kotlin': 'kotlin',
  'kt': 'kotlin',
  'swift': 'swift',
};

const EXTENSION_TO_LANGUAGE = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cs': 'c-sharp',
  '.rb': 'ruby',
  '.kt': 'kotlin',
  '.swift': 'swift',
};

mapLanguage(lang) {
  return LANGUAGE_MAP[lang.toLowerCase()] || lang.toLowerCase();
}

detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] || null;
}
```

**Success Criteria:**
- [ ] Phase 1 language names map correctly
- [ ] File extensions detected correctly
- [ ] Unknown languages passed through

---

### Task #46 Summary

| Subtask | Effort | Dependencies |
|---------|--------|--------------|
| 46.1 isAvailable() | 1h | 45 |
| 46.2 getVersion() | 30m | 46.1 |
| 46.3 search() basic | 2h | 46.1 |
| 46.4 search() errors | 1.5h | 46.3 |
| 46.5 refine() | 2h | 46.3 |
| 46.6 Language mapping | 1h | 46.3 |
| **Total** | **8h** | |

**Verification Gate:**
```bash
node -e "
const { AstGrepSearch } = require('./.claude/lib/code-indexing/ast-grep-wrapper.cjs');
const sg = new AstGrepSearch();
Promise.all([
  sg.isAvailable().then(a => console.log('isAvailable:', a)),
  sg.getVersion().then(v => console.log('getVersion:', v)),
]).then(() => console.log('GATE PASSED: Task #46 complete'));
" || echo "GATE FAILED"
```

---

## Task #47: Write ast-grep Wrapper Unit Tests

**Estimated Total Effort:** 4-5 hours
**Dependencies:** Task #46 complete
**Blocks:** Task #50

### 47.1: Create test file and fixtures (1 hour)

**File:** `tests/code-indexing/ast-grep-wrapper.test.cjs`

**Test Fixtures:**
```javascript
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const path = require('path');
const { AstGrepSearch } = require('../../.claude/lib/code-indexing/ast-grep-wrapper.cjs');

const TEST_DIR = path.join(__dirname, 'fixtures', 'ast-grep-test');

// Test fixtures
const FIXTURES = {
  'test.js': `
function hello(name) {
  return "Hello, " + name;
}

function goodbye(name) {
  return "Bye, " + name;
}

async function fetchData(url) {
  return await fetch(url);
}
`,
  'test.ts': `
function typed(x: number): number {
  return x * 2;
}

async function asyncTyped(x: number): Promise<number> {
  return x * 2;
}
`,
  'test.py': `
def hello(name):
    return f"Hello, {name}"

def goodbye(name):
    return f"Bye, {name}"
`
};

describe('AstGrepSearch', () => {
  before(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    for (const [name, content] of Object.entries(FIXTURES)) {
      await fs.writeFile(path.join(TEST_DIR, name), content);
    }
  });

  after(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  // Tests go here
});
```

**Success Criteria:**
- [ ] Test file created
- [ ] Fixtures created in before()
- [ ] Fixtures cleaned up in after()

---

### 47.2: Write isAvailable() tests (30 min)

**Tests:**
```javascript
describe('isAvailable()', () => {
  test('returns true when sg binary exists', async () => {
    const sg = new AstGrepSearch();
    const available = await sg.isAvailable();
    // This test depends on sg being installed
    assert.strictEqual(typeof available, 'boolean');
  });

  test('returns false with invalid binPath', async () => {
    const sg = new AstGrepSearch({ binPath: '/nonexistent/sg' });
    const available = await sg.isAvailable();
    assert.strictEqual(available, false);
  });
});
```

**Success Criteria:**
- [ ] Tests for valid binary
- [ ] Tests for invalid binary

---

### 47.3: Write search() tests (1.5 hours)

**Tests:**
```javascript
describe('search()', () => {
  test('finds JavaScript functions', async () => {
    const sg = new AstGrepSearch({ projectRoot: TEST_DIR });
    const results = await sg.search('function $NAME($$$) { $$$ }', 'javascript');

    assert.ok(Array.isArray(results));
    assert.ok(results.length >= 3, `Expected at least 3 results, got ${results.length}`);

    // Check result structure
    const first = results[0];
    assert.ok(first.filePath);
    assert.ok(typeof first.lineStart === 'number');
    assert.ok(typeof first.lineEnd === 'number');
    assert.ok(first.code);
  });

  test('finds async functions', async () => {
    const sg = new AstGrepSearch({ projectRoot: TEST_DIR });
    const results = await sg.search('async function $NAME($$$) { $$$ }', 'javascript');

    assert.ok(results.length >= 1);
    assert.ok(results[0].code.includes('async'));
  });

  test('respects include patterns', async () => {
    const sg = new AstGrepSearch({ projectRoot: TEST_DIR });
    const results = await sg.search('function $NAME($$$) { $$$ }', 'javascript', {
      include: ['test.js']
    });

    assert.ok(results.every(r => r.filePath.endsWith('test.js')));
  });

  test('respects exclude patterns', async () => {
    const sg = new AstGrepSearch({ projectRoot: TEST_DIR });
    const results = await sg.search('function $NAME($$$) { $$$ }', 'typescript', {
      exclude: ['test.js']
    });

    assert.ok(results.every(r => !r.filePath.endsWith('test.js')));
  });

  test('throws on empty pattern', async () => {
    const sg = new AstGrepSearch({ projectRoot: TEST_DIR });
    await assert.rejects(
      () => sg.search('', 'javascript'),
      /Pattern must be a non-empty string/
    );
  });

  test('handles no matches gracefully', async () => {
    const sg = new AstGrepSearch({ projectRoot: TEST_DIR });
    const results = await sg.search('function nonExistentFunctionName() {}', 'javascript');

    assert.ok(Array.isArray(results));
    assert.strictEqual(results.length, 0);
  });
});
```

**Success Criteria:**
- [ ] Basic search works
- [ ] Async pattern works
- [ ] Include/exclude works
- [ ] Error cases handled
- [ ] Empty results handled

---

### 47.4: Write refine() tests (1 hour)

**Tests:**
```javascript
describe('refine()', () => {
  test('adds structural scores to semantic results', async () => {
    const sg = new AstGrepSearch({ projectRoot: TEST_DIR });

    const semanticResults = [
      {
        filePath: path.join(TEST_DIR, 'test.js'),
        lineRange: [2, 4],
        code: 'function hello(name) { return "Hello, " + name; }',
        semanticScore: 0.9
      },
      {
        filePath: path.join(TEST_DIR, 'test.js'),
        lineRange: [6, 8],
        code: 'function goodbye(name) { return "Bye, " + name; }',
        semanticScore: 0.8
      }
    ];

    const refined = await sg.refine(
      semanticResults,
      'function hello($$$) { $$$ }',
      'javascript'
    );

    assert.strictEqual(refined.length, 2);

    // First should have high structural score (exact match)
    assert.ok(refined[0].structuralScore >= 0.5);

    // Second should have lower structural score (different function name)
    assert.strictEqual(refined[1].structuralScore, 0.0);
  });

  test('handles empty semantic results', async () => {
    const sg = new AstGrepSearch({ projectRoot: TEST_DIR });
    const refined = await sg.refine([], 'function $NAME() {}', 'javascript');

    assert.ok(Array.isArray(refined));
    assert.strictEqual(refined.length, 0);
  });
});
```

**Success Criteria:**
- [ ] Structural scores added correctly
- [ ] Exact matches get 1.0
- [ ] Overlaps get 0.5
- [ ] Non-matches get 0.0

---

### 47.5: Run and verify all tests (30 min)

**Command:**
```bash
node --test tests/code-indexing/ast-grep-wrapper.test.cjs
```

**Success Criteria:**
- [ ] All tests pass
- [ ] No memory leaks
- [ ] Test coverage adequate

---

### Task #47 Summary

| Subtask | Effort | Dependencies |
|---------|--------|--------------|
| 47.1 Setup fixtures | 1h | 46 |
| 47.2 isAvailable tests | 30m | 47.1 |
| 47.3 search tests | 1.5h | 47.1 |
| 47.4 refine tests | 1h | 47.1 |
| 47.5 Run all tests | 30m | 47.2-47.4 |
| **Total** | **4.5h** | |

---

## Task #48: Implement query-analyzer.cjs

**Estimated Total Effort:** 6-7 hours
**Dependencies:** Task #45 complete
**Blocks:** Task #50

### 48.1: Create query-analyzer.cjs with detectType() (1.5 hours)

**File:** `.claude/lib/code-indexing/query-analyzer.cjs`

**Implementation:**
```javascript
/**
 * Query Analyzer - Analyzes queries to determine search strategy
 *
 * @module code-indexing/query-analyzer
 */

'use strict';

// Structural keywords that suggest ast-grep patterns
const STRUCTURAL_KEYWORDS = [
  'function', 'method', 'class', 'interface', 'type',
  'async', 'await', 'export', 'import', 'const', 'let', 'var',
  'arrow', 'lambda', 'closure', 'callback',
  'try', 'catch', 'throw', 'finally',
  'for', 'while', 'if', 'else', 'switch', 'case',
  'return', 'yield', 'generator',
  'pattern', 'structure', 'syntax', 'AST'
];

// Semantic keywords that suggest embedding search
const SEMANTIC_KEYWORDS = [
  'find', 'search', 'locate', 'where', 'what', 'how',
  'related', 'similar', 'like', 'about', 'handles', 'implements',
  'authentication', 'authorization', 'validation', 'error handling',
  'database', 'api', 'endpoint', 'middleware', 'service'
];

class QueryAnalyzer {
  /**
   * Analyze a query to determine search strategy
   * @param {string} query - User query
   * @returns {QueryAnalysis}
   */
  analyze(query) {
    const normalizedQuery = query.toLowerCase();
    const type = this.detectType(query);
    const keywords = this.extractKeywords(query);
    const concepts = this.extractConcepts(query);
    const detectedLanguage = this.detectLanguage(query);
    const generatedPattern = this.generatePattern(query, detectedLanguage);

    return {
      type,
      keywords,
      concepts,
      generatedPattern,
      detectedLanguage,
      confidence: this._calculateConfidence(type, keywords, concepts)
    };
  }

  /**
   * Detect query type: semantic, structural, or hybrid
   */
  detectType(query) {
    const normalized = query.toLowerCase();

    let structuralScore = 0;
    let semanticScore = 0;

    // Check for structural keywords
    for (const kw of STRUCTURAL_KEYWORDS) {
      if (normalized.includes(kw)) structuralScore++;
    }

    // Check for semantic keywords
    for (const kw of SEMANTIC_KEYWORDS) {
      if (normalized.includes(kw)) semanticScore++;
    }

    // Check for explicit pattern syntax
    if (query.includes('$') || query.includes('$$$')) {
      return 'structural';
    }

    // Determine type based on scores
    if (structuralScore > 0 && semanticScore > 0) {
      return 'hybrid';
    } else if (structuralScore > semanticScore) {
      return 'structural';
    } else {
      return 'semantic';
    }
  }

  // Additional methods...
}

module.exports = { QueryAnalyzer };
```

**Test:**
```bash
node -e "
const { QueryAnalyzer } = require('./.claude/lib/code-indexing/query-analyzer.cjs');
const qa = new QueryAnalyzer();

console.log(qa.detectType('find authentication functions')); // semantic
console.log(qa.detectType('async function with 2 parameters')); // structural
console.log(qa.detectType('find all async functions that handle errors')); // hybrid
"
```

**Success Criteria:**
- [ ] Correctly identifies semantic queries
- [ ] Correctly identifies structural queries
- [ ] Correctly identifies hybrid queries

---

### 48.2: Implement extractKeywords() (1 hour)

**Implementation:**
```javascript
/**
 * Extract keywords for ripgrep pre-filtering
 */
extractKeywords(query) {
  // Remove common stop words
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'can',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'all', 'find', 'search', 'locate', 'get', 'show', 'list'
  ]);

  // Tokenize
  const tokens = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));

  // Score and sort by relevance
  return [...new Set(tokens)].slice(0, 5);
}
```

**Test:**
```bash
node -e "
const { QueryAnalyzer } = require('./.claude/lib/code-indexing/query-analyzer.cjs');
const qa = new QueryAnalyzer();

console.log(qa.extractKeywords('find all authentication functions'));
// Expected: ['authentication', 'functions']

console.log(qa.extractKeywords('search for database connection pooling'));
// Expected: ['database', 'connection', 'pooling']
"
```

---

### 48.3: Implement generatePattern() (2 hours)

**Implementation:**
```javascript
/**
 * Generate ast-grep pattern from natural language query
 */
generatePattern(query, language = 'javascript') {
  const normalized = query.toLowerCase();

  // Pattern templates
  const PATTERN_TEMPLATES = {
    // Function patterns
    'async function': 'async function $NAME($$$) { $$$ }',
    'arrow function': 'const $NAME = ($$$) => $BODY',
    'function': 'function $NAME($$$) { $$$ }',
    'method': '$NAME($$$) { $$$ }',

    // Class patterns
    'class extends': 'class $NAME extends $PARENT { $$$ }',
    'class': 'class $NAME { $$$ }',

    // Error handling
    'try catch': 'try { $$$ } catch ($E) { $$$ }',
    'throw error': 'throw new Error($MSG)',
    'error handling': 'catch ($E) { $$$ }',

    // Control flow
    'if else': 'if ($COND) { $$$ } else { $$$ }',
    'for loop': 'for ($INIT; $COND; $UPDATE) { $$$ }',
    'for of': 'for (const $VAR of $ITER) { $$$ }',
    'while loop': 'while ($COND) { $$$ }',

    // Imports/Exports
    'import from': 'import $X from $PATH',
    'export function': 'export function $NAME($$$) { $$$ }',
    'require': 'const $NAME = require($PATH)',

    // React patterns
    'usestate': 'const [$STATE, $SETTER] = useState($INIT)',
    'useeffect': 'useEffect(() => { $$$ }, [$$$])',

    // Testing
    'describe': 'describe($DESC, () => { $$$ })',
    'test': 'test($DESC, () => { $$$ })',
    'it should': 'it($DESC, () => { $$$ })',
  };

  // Find best matching pattern
  for (const [trigger, pattern] of Object.entries(PATTERN_TEMPLATES)) {
    if (normalized.includes(trigger)) {
      return pattern;
    }
  }

  // No pattern match
  return null;
}
```

**Test:**
```bash
node -e "
const { QueryAnalyzer } = require('./.claude/lib/code-indexing/query-analyzer.cjs');
const qa = new QueryAnalyzer();

console.log(qa.generatePattern('find all async functions'));
// Expected: 'async function \$NAME(\$\$\$) { \$\$\$ }'

console.log(qa.generatePattern('search for try catch blocks'));
// Expected: 'try { \$\$\$ } catch (\$E) { \$\$\$ }'
"
```

---

### 48.4: Implement detectLanguage() (1 hour)

**Implementation:**
```javascript
/**
 * Detect target programming language from query
 */
detectLanguage(query) {
  const normalized = query.toLowerCase();

  const LANGUAGE_INDICATORS = {
    'javascript': ['javascript', 'js', 'node', 'nodejs', 'express', 'react'],
    'typescript': ['typescript', 'ts', 'tsx', 'angular', 'nestjs'],
    'python': ['python', 'py', 'django', 'flask', 'fastapi', 'pandas'],
    'go': ['go', 'golang', 'goroutine'],
    'rust': ['rust', 'rs', 'cargo', 'tokio'],
    'java': ['java', 'spring', 'springboot', 'maven', 'gradle'],
  };

  for (const [lang, indicators] of Object.entries(LANGUAGE_INDICATORS)) {
    for (const indicator of indicators) {
      if (normalized.includes(indicator)) {
        return lang;
      }
    }
  }

  return null; // No specific language detected
}
```

---

### 48.5: Write unit tests (1 hour)

**File:** `tests/code-indexing/query-analyzer.test.cjs`

**Success Criteria:**
- [ ] detectType() tests pass
- [ ] extractKeywords() tests pass
- [ ] generatePattern() tests pass
- [ ] detectLanguage() tests pass

---

### Task #48 Summary

| Subtask | Effort | Dependencies |
|---------|--------|--------------|
| 48.1 detectType() | 1.5h | 45 |
| 48.2 extractKeywords() | 1h | 48.1 |
| 48.3 generatePattern() | 2h | 48.1 |
| 48.4 detectLanguage() | 1h | 48.1 |
| 48.5 Unit tests | 1h | 48.1-48.4 |
| **Total** | **6.5h** | |

---

## Task #49: Implement result-ranker.cjs

**Estimated Total Effort:** 4-5 hours
**Dependencies:** Task #48 complete
**Blocks:** Task #50

### 49.1: Create result-ranker.cjs with calculateScore() (1.5 hours)

**File:** `.claude/lib/code-indexing/result-ranker.cjs`

**Implementation:**
```javascript
/**
 * Result Ranker - Combines and ranks hybrid search results
 *
 * @module code-indexing/result-ranker
 */

'use strict';

class ResultRanker {
  constructor(weights = {}) {
    this.weights = {
      semantic: weights.semantic ?? 0.7,
      structural: weights.structural ?? 0.3,
      recency: weights.recency ?? 0.0
    };
  }

  /**
   * Calculate combined score
   */
  calculateScore(semanticScore, structuralScore, recencyBoost = 0) {
    const baseScore = (
      this.weights.semantic * (semanticScore || 0) +
      this.weights.structural * (structuralScore || 0) +
      this.weights.recency * (recencyBoost || 0)
    );

    // Normalize to 0-1
    const maxPossible = this.weights.semantic + this.weights.structural + this.weights.recency;
    return maxPossible > 0 ? baseScore / maxPossible : 0;
  }

  /**
   * Combine semantic and structural results
   */
  combine(semanticResults, structuralResults) {
    // Create map for structural results by location
    const structuralMap = new Map();
    for (const sr of structuralResults) {
      const key = `${sr.filePath}:${sr.lineStart}-${sr.lineEnd}`;
      structuralMap.set(key, sr);
    }

    // Enhance semantic results
    const combined = semanticResults.map(semResult => {
      const key = `${semResult.filePath}:${semResult.lineRange[0]}-${semResult.lineRange[1]}`;
      const strResult = structuralMap.get(key);

      // Calculate structural score based on match
      let structuralScore = 0;
      if (strResult) {
        structuralScore = 1.0;
        structuralMap.delete(key); // Remove to avoid duplicates
      } else {
        // Check for overlapping ranges
        for (const [k, v] of structuralMap) {
          if (v.filePath === semResult.filePath) {
            if (this._rangesOverlap(semResult.lineRange, [v.lineStart, v.lineEnd])) {
              structuralScore = 0.5;
              break;
            }
          }
        }
      }

      const combinedScore = this.calculateScore(
        semResult.similarity || semResult.semanticScore || 0,
        structuralScore
      );

      return {
        ...semResult,
        semanticScore: semResult.similarity || semResult.semanticScore || 0,
        structuralScore,
        combinedScore,
        explanation: this._generateExplanation(semResult.similarity, structuralScore)
      };
    });

    // Add structural-only results (not matched with semantic)
    for (const [_, strResult] of structuralMap) {
      combined.push({
        code: strResult.code,
        filePath: strResult.filePath,
        lineRange: [strResult.lineStart, strResult.lineEnd],
        semanticScore: 0,
        structuralScore: 1.0,
        combinedScore: this.calculateScore(0, 1.0),
        explanation: 'Exact structural pattern match (no semantic match)'
      });
    }

    return combined;
  }

  _rangesOverlap(range1, range2) {
    return range1[0] <= range2[1] && range1[1] >= range2[0];
  }

  _generateExplanation(semanticScore, structuralScore) {
    if (semanticScore >= 0.8 && structuralScore >= 1.0) {
      return 'Excellent match: High semantic similarity + exact structural pattern';
    } else if (semanticScore >= 0.8) {
      return 'Strong semantic match: Conceptually similar code';
    } else if (structuralScore >= 1.0) {
      return 'Exact structural match: Pattern found';
    } else if (structuralScore >= 0.5) {
      return 'Partial structural match: Overlapping code region';
    } else {
      return 'Semantic match only';
    }
  }

  /**
   * Deduplicate results by file:line
   */
  deduplicate(results) {
    const seen = new Map();

    for (const result of results) {
      const key = `${result.filePath}:${result.lineRange[0]}`;
      const existing = seen.get(key);

      if (!existing || result.combinedScore > existing.combinedScore) {
        seen.set(key, result);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Sort results by combined score (descending)
   */
  sort(results) {
    return [...results].sort((a, b) => b.combinedScore - a.combinedScore);
  }
}

module.exports = { ResultRanker };
```

---

### 49.2: Write unit tests (1.5 hours)

**Success Criteria:**
- [ ] calculateScore() tests pass
- [ ] combine() tests pass
- [ ] deduplicate() tests pass
- [ ] sort() tests pass

---

### 49.3: Integration with IndexManager preview (1 hour)

**Success Criteria:**
- [ ] ResultRanker can be used with Phase 1 results

---

### Task #49 Summary

| Subtask | Effort | Dependencies |
|---------|--------|--------------|
| 49.1 ResultRanker class | 1.5h | 48 |
| 49.2 Unit tests | 1.5h | 49.1 |
| 49.3 Integration preview | 1h | 49.1 |
| **Total** | **4h** | |

---

## Task #50: Implement hybrid-search.cjs

**Estimated Total Effort:** 10-12 hours
**Dependencies:** Tasks #46, #48, #49 complete
**Blocks:** Tasks #51, #52

### 50.1: Create hybrid-search.cjs skeleton (1 hour)

**File:** `.claude/lib/code-indexing/hybrid-search.cjs`

**Content:** Class skeleton with all method signatures.

---

### 50.2: Implement search() - stage orchestration (3 hours)

**Description:** Main search method coordinating all three stages.

---

### 50.3: Implement ripgrepPrefilter() (2 hours)

**Description:** Use ripgrep to pre-filter candidate files.

---

### 50.4: Implement analyzeQuery() (1 hour)

**Description:** Wrapper for QueryAnalyzer.

---

### 50.5: Implement combineAndRank() (2 hours)

**Description:** Wrapper for ResultRanker.

---

### 50.6: Add timing and logging (1 hour)

**Description:** Track timing per stage, add debug logging.

---

### 50.7: Write integration tests (2 hours)

---

### Task #50 Summary

| Subtask | Effort | Dependencies |
|---------|--------|--------------|
| 50.1 Skeleton | 1h | 46, 48, 49 |
| 50.2 search() | 3h | 50.1 |
| 50.3 ripgrepPrefilter() | 2h | 50.1 |
| 50.4 analyzeQuery() | 1h | 50.1 |
| 50.5 combineAndRank() | 2h | 50.1 |
| 50.6 Timing/logging | 1h | 50.2-50.5 |
| 50.7 Integration tests | 2h | 50.2-50.6 |
| **Total** | **12h** | |

---

## Task #51: Integration Testing

**Estimated Total Effort:** 4-5 hours
**Dependencies:** Task #50 complete
**Blocks:** Tasks #52, #53

### 51.1: End-to-end hybrid search test (2 hours)

---

### 51.2: Performance benchmarking (1.5 hours)

---

### 51.3: Edge case testing (1 hour)

---

---

## Task #52: CLI Commands (hybrid-search, structural-search)

**Estimated Total Effort:** 6-7 hours
**Dependencies:** Task #50, #51 complete
**Blocks:** Task #53

### 52.1: Add hybrid-search command (2 hours)

---

### 52.2: Add structural-search command (1.5 hours)

---

### 52.3: Add refine command (1.5 hours)

---

### 52.4: CLI tests (1.5 hours)

---

---

## Task #53: Agent Skills

**Estimated Total Effort:** 6-7 hours
**Dependencies:** Task #52 complete
**Blocks:** Task #54

### 53.1: Create code-structural-search skill (2 hours)

---

### 53.2: Create code-hybrid-search skill (2 hours)

---

### 53.3: Update code-semantic-search skill (1 hour)

---

### 53.4: Skill documentation (1 hour)

---

---

## Task #54: Skill Testing and Verification

**Estimated Total Effort:** 3-4 hours
**Dependencies:** Task #53 complete
**Blocks:** None

---

## Task #55: Merkle Tree Implementation

**Estimated Total Effort:** 6-7 hours
**Dependencies:** Task #50 complete
**Blocks:** Task #56, #57

---

## Task #56: File Watcher Implementation

**Estimated Total Effort:** 4-5 hours
**Dependencies:** Task #55 complete
**Blocks:** Task #57

---

## Task #57: Persistent Storage (ChromaDB)

**Estimated Total Effort:** 6-7 hours
**Dependencies:** Task #55, #56 complete
**Blocks:** None

---

## Summary: All Tasks

| Task | Description | Effort | Sprint |
|------|-------------|--------|--------|
| #45 | ast-grep Setup | 3.5h | 1 |
| #46 | ast-grep Wrapper | 8h | 1 |
| #47 | Wrapper Tests | 4.5h | 1 |
| #48 | Query Analyzer | 6.5h | 2 |
| #49 | Result Ranker | 4h | 2 |
| #50 | Hybrid Search | 12h | 2 |
| #51 | Integration Tests | 4.5h | 2 |
| #52 | CLI Commands | 6.5h | 3 |
| #53 | Agent Skills | 6h | 3 |
| #54 | Skill Tests | 3.5h | 3 |
| #55 | Merkle Tree | 6.5h | 4 |
| #56 | File Watcher | 4.5h | 4 |
| #57 | Persistent Storage | 6.5h | 4 |
| **TOTAL** | | **~77h** | |

---

## Verification Gates

### Gate 1: ast-grep Integration (After Task #47)
```bash
node -e "
const { AstGrepSearch } = require('./.claude/lib/code-indexing/ast-grep-wrapper.cjs');
const sg = new AstGrepSearch();
sg.isAvailable().then(a => {
  if (!a) throw new Error('ast-grep not available');
  console.log('GATE 1 PASSED');
});
"
```

### Gate 2: Hybrid Search Core (After Task #51)
```bash
node -e "
const { HybridSearchEngine } = require('./.claude/lib/code-indexing/hybrid-search.cjs');
const { IndexManager } = require('./.claude/lib/code-indexing/index-manager.cjs');
console.log('GATE 2 PASSED: Hybrid search modules load');
"
```

### Gate 3: CLI Integration (After Task #52)
```bash
node .claude/tools/cli/index-codebase.cjs hybrid-search --help && \
node .claude/tools/cli/index-codebase.cjs structural-search --help && \
echo "GATE 3 PASSED"
```

### Gate 4: Skills Ready (After Task #54)
```bash
ls .claude/skills/code-hybrid-search/SKILL.md && \
ls .claude/skills/code-structural-search/SKILL.md && \
echo "GATE 4 PASSED"
```

### Gate 5: Phase 2 Complete (After Task #57)
```bash
node --test tests/code-indexing/*.test.cjs && \
echo "GATE 5 PASSED: Phase 2 Complete"
```
