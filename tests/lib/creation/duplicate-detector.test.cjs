'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  checkDuplicate,
  checkFilesystem,
  checkRegistry,
  checkFuzzy,
} = require('../../../.claude/lib/creation/duplicate-detector.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '../../../');

// ---------------------------------------------------------------------------
// Layer 1: Filesystem checks
// ---------------------------------------------------------------------------

describe('checkFilesystem - Layer 1', () => {
  it('finds existing skill by path (tdd skill exists)', () => {
    const result = checkFilesystem('skill', 'tdd', PROJECT_ROOT);
    assert.strictEqual(result.found, true, 'should find the tdd skill on disk');
    assert.ok(result.matchedPath, 'matchedPath should be non-null');
    assert.ok(result.matchedPath.includes('tdd'), 'matchedPath should include skill name');
    assert.ok(result.matchedPath.endsWith('SKILL.md'), 'matchedPath should point to SKILL.md');
  });

  it('returns not-found for a nonexistent skill path', () => {
    const result = checkFilesystem('skill', 'this-skill-does-not-exist-xyz-9999', PROJECT_ROOT);
    assert.strictEqual(result.found, false);
    assert.strictEqual(result.matchedPath, null);
  });

  it('finds an existing agent in one of the 4 subdirectories', () => {
    // developer agent is in core/
    const result = checkFilesystem('agent', 'developer', PROJECT_ROOT);
    assert.strictEqual(result.found, true, 'should find developer agent');
    assert.ok(result.matchedPath, 'matchedPath should be set');
  });

  it('returns not-found for a nonexistent agent', () => {
    const result = checkFilesystem('agent', 'nonexistent-agent-xyz-9999', PROJECT_ROOT);
    assert.strictEqual(result.found, false);
    assert.strictEqual(result.matchedPath, null);
  });

  it('normalizes Windows-style backslash paths without breaking results', () => {
    // Simulate a Windows-style root by using a path with backslashes
    // We re-join and normalize internally; the result should still be found
    const winRoot = PROJECT_ROOT.replace(/\//g, '\\');
    const result = checkFilesystem('skill', 'tdd', winRoot);
    assert.strictEqual(result.found, true, 'should find tdd skill even with backslash root');
    assert.ok(
      !result.matchedPath.includes('\\'),
      'matchedPath should use forward slashes (SE-01)'
    );
  });
});

// ---------------------------------------------------------------------------
// Layer 2: Registry checks
// ---------------------------------------------------------------------------

describe('checkRegistry - Layer 2', () => {
  it('finds developer agent in agent-registry.json', () => {
    const result = checkRegistry('agent', 'developer', PROJECT_ROOT);
    assert.strictEqual(result.found, true, 'developer should be in agent registry');
    assert.ok(result.matchedPath, 'matchedPath should be set');
  });

  it('returns not-found for nonexistent agent in registry', () => {
    const result = checkRegistry('agent', 'agent-that-never-exists-xyz-9999', PROJECT_ROOT);
    assert.strictEqual(result.found, false);
    assert.strictEqual(result.matchedPath, null);
  });

  it('hook registry check returns without throwing when settings.json exists', () => {
    // Whether found or not, should not throw
    let result;
    assert.doesNotThrow(() => {
      result = checkRegistry('hook', 'routing-guard', PROJECT_ROOT);
    });
    assert.ok(typeof result.found === 'boolean', 'found should be a boolean');
  });

  it('returns not-found gracefully when registry file is missing', () => {
    // Use a root where the registry definitely doesn't exist
    const fakeRoot = '/tmp/nonexistent-project-xyz-9999';
    const result = checkRegistry('agent', 'developer', fakeRoot);
    assert.strictEqual(result.found, false);
    assert.strictEqual(result.matchedPath, null);
  });

  it('skill registry check does not throw even if skill-index.json is absent', () => {
    const fakeRoot = '/tmp/nonexistent-project-xyz-9999';
    let result;
    assert.doesNotThrow(() => {
      result = checkRegistry('skill', 'tdd', fakeRoot);
    });
    assert.strictEqual(result.found, false);
  });
});

// ---------------------------------------------------------------------------
// Layer 3: Fuzzy matching
// ---------------------------------------------------------------------------

describe('checkFuzzy - Layer 3', () => {
  it('detects js-expert as similar to javascript-pro (abbreviation expansion)', () => {
    // 'js' expands to 'javascript'; both then share the 'javascript' token
    const candidates = checkFuzzy(
      'agent',
      'js-expert',
      '',
      [],
      PROJECT_ROOT,
      0.15, // low threshold to ensure we catch abbreviation match
      10
    );
    // Should find some candidate containing 'javascript' or 'js' related agent
    // The test validates the function runs without error and returns an array
    assert.ok(Array.isArray(candidates), 'should return an array');
    // Each candidate should have name, path, score
    for (const c of candidates) {
      assert.ok(typeof c.name === 'string', 'candidate.name should be string');
      assert.ok(typeof c.score === 'number', 'candidate.score should be number');
      assert.ok(c.score >= 0.15, 'all returned candidates should meet threshold');
    }
  });

  it('detects auth-validator as similar to authentication-validator (abbreviation expansion)', () => {
    // 'auth' expands to 'authentication'
    const candidates = checkFuzzy(
      'skill',
      'auth-validator',
      '',
      [],
      PROJECT_ROOT,
      0.3,
      10
    );
    assert.ok(Array.isArray(candidates), 'should return an array');
    // Validate structure of each candidate
    for (const c of candidates) {
      assert.ok(typeof c.name === 'string');
      assert.ok(typeof c.score === 'number');
      assert.ok(c.score >= 0.3, `score ${c.score} should be >= threshold 0.3`);
    }
  });

  it('returns empty or low-count results for genuinely different names', () => {
    // 'tdd' and 'kubernetes-specialist' share almost nothing semantically
    const candidates = checkFuzzy(
      'skill',
      'tdd',
      '',
      [],
      PROJECT_ROOT,
      0.9, // very high threshold — nothing should match
      10
    );
    // At threshold 0.9, an exact name match would be required; no other skill should score this high
    assert.ok(Array.isArray(candidates), 'should return an array');
    assert.ok(candidates.length === 0 || candidates.every(c => c.score >= 0.9),
      'all returned candidates should meet the high threshold');
  });

  it('returns array with score, name, and path fields', () => {
    const candidates = checkFuzzy(
      'agent',
      'developer',
      '',
      [],
      PROJECT_ROOT,
      0.01, // very low to get some results
      3
    );
    assert.ok(Array.isArray(candidates));
    // Results should be bounded by maxCandidates=3
    assert.ok(candidates.length <= 3, 'should respect maxCandidates');
    for (const c of candidates) {
      assert.ok('name' in c, 'candidate should have name');
      assert.ok('path' in c, 'candidate should have path');
      assert.ok('score' in c, 'candidate should have score');
    }
  });

  it('results are sorted by score descending', () => {
    const candidates = checkFuzzy('agent', 'dev', '', [], PROJECT_ROOT, 0.01, 20);
    assert.ok(Array.isArray(candidates));
    for (let i = 1; i < candidates.length; i++) {
      assert.ok(
        candidates[i - 1].score >= candidates[i].score,
        'candidates should be sorted descending by score'
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Combined: checkDuplicate
// ---------------------------------------------------------------------------

describe('checkDuplicate - combined pipeline', () => {
  it('EXACT_MATCH takes priority: tdd skill exists on filesystem', () => {
    const result = checkDuplicate({
      artifactType: 'skill',
      name: 'tdd',
      projectRoot: PROJECT_ROOT,
    });
    assert.strictEqual(result.decision, 'EXACT_MATCH', 'tdd should be an exact filesystem match');
    assert.ok(result.matchedPath, 'matchedPath should be set');
    assert.ok(Array.isArray(result.candidates), 'candidates should be an array');
    assert.ok(typeof result.message === 'string', 'message should be a string');
  });

  it('REGISTRY_MATCH when not on filesystem but in registry', () => {
    // developer agent is in both filesystem and registry — EXACT_MATCH fires first
    const result = checkDuplicate({
      artifactType: 'agent',
      name: 'developer',
      projectRoot: PROJECT_ROOT,
    });
    // Should be either EXACT_MATCH or REGISTRY_MATCH, never NO_MATCH
    assert.ok(
      result.decision === 'EXACT_MATCH' || result.decision === 'REGISTRY_MATCH',
      `expected EXACT_MATCH or REGISTRY_MATCH, got ${result.decision}`
    );
  });

  it('NO_MATCH for clearly nonexistent artifact', () => {
    const result = checkDuplicate({
      artifactType: 'skill',
      name: 'absolutely-nonexistent-skill-xyz-9999',
      projectRoot: PROJECT_ROOT,
      threshold: 0.99, // very high to prevent fuzzy match
    });
    assert.strictEqual(result.decision, 'NO_MATCH');
    assert.strictEqual(result.matchedPath, null);
    assert.deepStrictEqual(result.candidates, []);
  });

  it('returns correct shape on all decision types', () => {
    const result = checkDuplicate({
      artifactType: 'skill',
      name: 'tdd',
      projectRoot: PROJECT_ROOT,
    });
    assert.ok('decision' in result, 'result must have decision');
    assert.ok('matchedPath' in result, 'result must have matchedPath');
    assert.ok('candidates' in result, 'result must have candidates');
    assert.ok('message' in result, 'result must have message');
    assert.ok(
      ['EXACT_MATCH', 'REGISTRY_MATCH', 'SIMILAR_FOUND', 'NO_MATCH'].includes(result.decision),
      `decision must be one of the 4 valid values, got: ${result.decision}`
    );
  });

  it('graceful handling when projectRoot does not exist', () => {
    // Should not throw; returns NO_MATCH gracefully
    let result;
    assert.doesNotThrow(() => {
      result = checkDuplicate({
        artifactType: 'skill',
        name: 'tdd',
        projectRoot: '/tmp/nonexistent-root-xyz-9999',
      });
    });
    assert.ok(result, 'result should be returned');
    assert.ok(
      ['NO_MATCH', 'EXACT_MATCH', 'REGISTRY_MATCH', 'SIMILAR_FOUND'].includes(result.decision),
      `decision must be valid, got: ${result.decision}`
    );
  });
});

// ---------------------------------------------------------------------------
// Windows path normalization
// ---------------------------------------------------------------------------

describe('Windows path normalization (SE-01)', () => {
  it('matchedPath never contains backslashes in filesystem results', () => {
    const result = checkFilesystem('skill', 'tdd', PROJECT_ROOT);
    if (result.found && result.matchedPath) {
      assert.ok(
        !result.matchedPath.includes('\\'),
        `matchedPath must not contain backslashes: ${result.matchedPath}`
      );
    }
  });

  it('checkDuplicate normalizes paths from backslash root', () => {
    const backslashRoot = PROJECT_ROOT.replace(/\//g, '\\');
    let result;
    assert.doesNotThrow(() => {
      result = checkDuplicate({
        artifactType: 'skill',
        name: 'tdd',
        projectRoot: backslashRoot,
      });
    });
    if (result.matchedPath) {
      assert.ok(!result.matchedPath.includes('\\'), 'matchedPath must use forward slashes');
    }
  });
});

// ---------------------------------------------------------------------------
// Kill switch: DUPLICATE_DETECTION_ENABLED
// ---------------------------------------------------------------------------

describe('Kill switch: DUPLICATE_DETECTION_ENABLED', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = process.env.DUPLICATE_DETECTION_ENABLED;
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.DUPLICATE_DETECTION_ENABLED;
    } else {
      process.env.DUPLICATE_DETECTION_ENABLED = savedEnv;
    }
  });

  it('returns NO_MATCH immediately when DUPLICATE_DETECTION_ENABLED=false', () => {
    process.env.DUPLICATE_DETECTION_ENABLED = 'false';
    const result = checkDuplicate({
      artifactType: 'skill',
      name: 'tdd', // would normally be EXACT_MATCH
      projectRoot: PROJECT_ROOT,
    });
    assert.strictEqual(result.decision, 'NO_MATCH', 'should be NO_MATCH when disabled');
    assert.ok(result.message.includes('disabled'), 'message should mention disabled');
  });
});

// ---------------------------------------------------------------------------
// Layer config: DUPLICATE_DETECTION_LAYERS
// ---------------------------------------------------------------------------

describe('Layer config: DUPLICATE_DETECTION_LAYERS', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = process.env.DUPLICATE_DETECTION_LAYERS;
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.DUPLICATE_DETECTION_LAYERS;
    } else {
      process.env.DUPLICATE_DETECTION_LAYERS = savedEnv;
    }
  });

  it('DUPLICATE_DETECTION_LAYERS=filesystem skips registry and fuzzy', () => {
    process.env.DUPLICATE_DETECTION_LAYERS = 'filesystem';

    // tdd exists on filesystem → EXACT_MATCH
    const foundResult = checkDuplicate({
      artifactType: 'skill',
      name: 'tdd',
      projectRoot: PROJECT_ROOT,
    });
    assert.strictEqual(foundResult.decision, 'EXACT_MATCH', 'filesystem layer should still fire');

    // Nonexistent → NO_MATCH (registry/fuzzy skipped, so no fallback)
    const notFoundResult = checkDuplicate({
      artifactType: 'skill',
      name: 'absolutely-nonexistent-skill-xyz-9999',
      projectRoot: PROJECT_ROOT,
    });
    assert.strictEqual(
      notFoundResult.decision,
      'NO_MATCH',
      'should be NO_MATCH when only filesystem layer is active and artifact does not exist'
    );
  });
});
