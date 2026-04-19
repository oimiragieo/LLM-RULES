'use strict';

// ARCHIVED — F7: skill-auto-creator archived due to GATE 4 violation.
// Original tests preserved here for reference. Not run as part of pnpm test.

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  analyzeTranscript,
  _extractToolSequence,
  _hasErrorRecoveryPattern,
  _jaccard,
  _parseFrontmatter,
  _generateSkillName,
  _generateSkillContent,
  _containsSecrets,
  _containsInjection,
} = require('../../../.claude/lib/evolution/_archive/skill-auto-creator.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid 5-step transcript with one error-recovery pair.
 * Mimics a debugging workflow: Read → Read → Edit (fails) → Edit (succeeds) → Execute
 */
function makeDebuggingTranscript() {
  return [
    { toolName: 'Read', success: true },
    { toolName: 'Read', success: true },
    { toolName: 'Edit', success: false, error: 'Parse error: unexpected token' },
    { toolName: 'Edit', success: true },
    { toolName: 'Execute', success: true },
  ];
}

/** Build a short transcript (fewer than 5 calls). */
function makeShortTranscript() {
  return [
    { toolName: 'Read', success: true },
    { toolName: 'Edit', success: true },
  ];
}

/** Build a valid transcript WITHOUT any error-recovery. */
function makeNoRecoveryTranscript() {
  return [
    { toolName: 'Read', success: true },
    { toolName: 'Grep', success: true },
    { toolName: 'Edit', success: true },
    { toolName: 'Execute', success: true },
    { toolName: 'Read', success: true },
  ];
}

// ---------------------------------------------------------------------------
// Internal unit tests
// ---------------------------------------------------------------------------

describe('_extractToolSequence', () => {
  it('returns empty array for non-array input', () => {
    assert.deepEqual(_extractToolSequence(null), []);
    assert.deepEqual(_extractToolSequence(undefined), []);
    assert.deepEqual(_extractToolSequence('string'), []);
  });

  it('filters out entries with missing toolName', () => {
    const result = _extractToolSequence([{ toolName: 'Read' }, { success: true }, null]);
    assert.equal(result.length, 1);
    assert.equal(result[0].toolName, 'Read');
  });

  it('normalises success to true when not explicitly false and no error', () => {
    const result = _extractToolSequence([{ toolName: 'Read' }]);
    assert.equal(result[0].success, true);
    assert.equal(result[0].error, null);
  });

  it('sets success=false and captures error string', () => {
    const result = _extractToolSequence([
      { toolName: 'Edit', success: false, error: 'File not found' },
    ]);
    assert.equal(result[0].success, false);
    assert.equal(result[0].error, 'File not found');
  });

  it('treats success=false with no error as failure', () => {
    const result = _extractToolSequence([{ toolName: 'Read', success: false }]);
    assert.equal(result[0].success, false);
  });
});

describe('_hasErrorRecoveryPattern', () => {
  it('returns false for empty sequence', () => {
    assert.equal(_hasErrorRecoveryPattern([]), false);
  });

  it('returns false when all calls succeed', () => {
    const seq = [
      { toolName: 'A', success: true },
      { toolName: 'B', success: true },
    ];
    assert.equal(_hasErrorRecoveryPattern(seq), false);
  });

  it('returns false when last call fails (no recovery follows)', () => {
    const seq = [
      { toolName: 'A', success: true },
      { toolName: 'B', success: false },
    ];
    assert.equal(_hasErrorRecoveryPattern(seq), false);
  });

  it('returns true when a failure is followed by a success', () => {
    const seq = [
      { toolName: 'A', success: false },
      { toolName: 'B', success: true },
    ];
    assert.equal(_hasErrorRecoveryPattern(seq), true);
  });

  it('returns true when recovery is in the middle of the sequence', () => {
    const seq = makeDebuggingTranscript();
    assert.equal(_hasErrorRecoveryPattern(seq), true);
  });
});

describe('_jaccard', () => {
  it('returns 0 for two empty arrays', () => {
    assert.equal(_jaccard([], []), 0);
  });

  it('returns 1 for identical arrays', () => {
    assert.equal(_jaccard(['A', 'B'], ['A', 'B']), 1);
  });

  it('returns 0 for completely disjoint arrays', () => {
    assert.equal(_jaccard(['A'], ['B']), 0);
  });

  it('returns 1/3 for two arrays sharing one element out of three unique', () => {
    // {A,B} ∩ {B,C} = {B} (1), {A,B} ∪ {B,C} = {A,B,C} (3) → 1/3
    const result = _jaccard(['A', 'B'], ['B', 'C']);
    assert.ok(Math.abs(result - 1 / 3) < 1e-9, `expected ~0.333, got ${result}`);
  });

  it('handles duplicates in input by treating as sets', () => {
    // {A, B} ∩ {A, B} = {A, B}, |union| = 2, similarity = 1
    assert.equal(_jaccard(['A', 'A', 'B'], ['A', 'B', 'B']), 1);
  });
});

describe('_parseFrontmatter', () => {
  it('returns null for non-string input', () => {
    assert.equal(_parseFrontmatter(null), null);
    assert.equal(_parseFrontmatter(42), null);
  });

  it('returns null when content does not start with ---', () => {
    assert.equal(_parseFrontmatter('name: foo'), null);
  });

  it('returns null when closing --- delimiter is absent', () => {
    assert.equal(_parseFrontmatter('---\nname: foo\n'), null);
  });

  it('parses valid frontmatter correctly', () => {
    const content = '---\nname: test-skill\ndescription: A test description here\n---\n# Body';
    const fm = _parseFrontmatter(content);
    assert.equal(fm.name, 'test-skill');
    assert.equal(fm.description, 'A test description here');
  });

  it('returns null for invalid YAML frontmatter', () => {
    const content = '---\n: invalid: yaml: [unclosed\n---\n# Body';
    assert.equal(_parseFrontmatter(content), null);
  });
});

describe('_generateSkillName', () => {
  it('returns a lowercase-with-hyphens name', () => {
    const seq = [
      { toolName: 'Read', success: true },
      { toolName: 'Edit', success: true },
    ];
    const name = _generateSkillName(seq);
    assert.match(name, /^[a-z][a-z0-9-]*$/);
  });

  it('incorporates dominant tool names', () => {
    const seq = [
      { toolName: 'Read', success: true },
      { toolName: 'Read', success: true },
      { toolName: 'Edit', success: true },
    ];
    const name = _generateSkillName(seq);
    assert.ok(name.includes('read'), `Expected 'read' in "${name}"`);
  });
});

describe('_containsSecrets', () => {
  it('returns false for safe content', () => {
    assert.equal(_containsSecrets('name: my-skill\ndescription: safe content'), false);
  });

  it('returns true for content with OpenAI-style key', () => {
    // OpenAI keys match sk-[...20+chars...] — build dynamically to avoid static scanners
    const fakeKey = 'sk-' + 'a'.repeat(25);
    assert.equal(_containsSecrets(`apiKey: ${fakeKey}`), true);
  });
});

describe('_containsInjection', () => {
  it('returns false for safe YAML content', () => {
    assert.equal(_containsInjection('name: my-skill\ndescription: ok'), false);
  });

  it('returns true for YAML type injection pattern', () => {
    assert.equal(_containsInjection('!!python/object:subprocess.Popen'), true);
  });
});

// ---------------------------------------------------------------------------
// VAL-AS-001: Novel procedure detection and SKILL.md creation
// ---------------------------------------------------------------------------

describe('VAL-AS-001: analyzeTranscript — novel procedure creates SKILL.md', () => {
  let rootTmpDir;
  let testDir;

  before(() => {
    rootTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-auto-creator-val001-'));
  });

  after(() => {
    if (fs.existsSync(rootTmpDir)) fs.rmSync(rootTmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Each test gets its own isolated output directory to avoid conflicts
    testDir = fs.mkdtempSync(path.join(rootTmpDir, 'case-'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('writes a SKILL.md for a novel 5-step debugging workflow', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, [], { outputDir: testDir });

    assert.equal(result.written, true, 'expected written: true');
    assert.ok(result.path, 'expected a path in result');
    assert.ok(fs.existsSync(result.path), `SKILL.md should exist at ${result.path}`);
  });

  it('generated SKILL.md has valid YAML frontmatter with name, description, version, triggers', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, [], { outputDir: testDir });

    assert.equal(result.written, true);
    const content = fs.readFileSync(result.path, 'utf8');

    // Frontmatter parsing
    const fm = _parseFrontmatter(content);
    assert.ok(fm, 'frontmatter should parse');
    assert.ok(typeof fm.name === 'string' && fm.name.length > 0, 'frontmatter.name should be set');
    assert.ok(
      typeof fm.description === 'string' && fm.description.length >= 10,
      'frontmatter.description >= 10 chars'
    );
    assert.ok(fm.version, 'frontmatter.version should be set');
    assert.ok(
      Array.isArray(fm.triggers) && fm.triggers.length > 0,
      'frontmatter.triggers should be a non-empty array'
    );
  });

  it('generated SKILL.md name matches ^[a-z][a-z0-9-]*$ pattern', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, [], { outputDir: testDir });

    assert.equal(result.written, true);
    const content = fs.readFileSync(result.path, 'utf8');
    const fm = _parseFrontmatter(content);
    assert.match(fm.name, /^[a-z][a-z0-9-]*$/, 'name must be lowercase-with-hyphens');
  });

  it('generated SKILL.md has a non-empty ## Rules section', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, [], { outputDir: testDir });

    assert.equal(result.written, true);
    const content = fs.readFileSync(result.path, 'utf8');
    assert.ok(content.includes('## Rules'), 'should contain ## Rules section');

    const rulesMatch = content.match(/##\s+Rules\s*\n([\s\S]*?)(?:\n##|$)/);
    const rulesBody = rulesMatch ? rulesMatch[1].trim() : '';
    assert.ok(rulesBody.length > 0, '## Rules section must not be empty');
  });

  it('generated SKILL.md references tool names from transcript', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, [], { outputDir: testDir });

    assert.equal(result.written, true);
    const content = fs.readFileSync(result.path, 'utf8');
    // Should reference Read, Edit, Execute from the transcript
    assert.ok(content.includes('Read'), 'should reference Read tool');
    assert.ok(content.includes('Edit'), 'should reference Edit tool');
    assert.ok(content.includes('Execute'), 'should reference Execute tool');
  });

  it('returns { skipped: true } for fewer than 5 tool calls', () => {
    const result = analyzeTranscript(makeShortTranscript(), [], { outputDir: testDir });
    assert.equal(result.written, false);
    assert.equal(result.skipped, true);
    assert.ok(result.reason, 'reason should be provided');
  });

  it('returns { skipped: true } when no error-recovery pattern is present', () => {
    const result = analyzeTranscript(makeNoRecoveryTranscript(), [], { outputDir: testDir });
    assert.equal(result.written, false);
    assert.equal(result.skipped, true);
    assert.match(result.reason, /error-recovery/i);
  });

  it('allows custom skillName via options', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, [], {
      outputDir: testDir,
      skillName: 'custom-debug-flow',
    });
    assert.equal(result.written, true);
    const fm = _parseFrontmatter(fs.readFileSync(result.path, 'utf8'));
    assert.equal(fm.name, 'custom-debug-flow');
  });
});

// ---------------------------------------------------------------------------
// VAL-AS-002: Idempotency — duplicate procedures are skipped
// ---------------------------------------------------------------------------

describe('VAL-AS-002: analyzeTranscript — idempotency for duplicate procedures', () => {
  let rootTmpDir;
  let testDir;

  before(() => {
    rootTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-auto-creator-val002-'));
  });

  after(() => {
    if (fs.existsSync(rootTmpDir)) fs.rmSync(rootTmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(rootTmpDir, 'case-'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('second call with identical transcript returns { skipped: true } after first write', () => {
    const transcript = makeDebuggingTranscript();

    const first = analyzeTranscript(transcript, [], { outputDir: testDir });
    assert.equal(first.written, true, 'first call should write');

    const second = analyzeTranscript(transcript, [], { outputDir: testDir });
    assert.equal(second.written, false, 'second call should not write');
    assert.equal(second.skipped, true, 'second call should be skipped');
    assert.ok(second.reason, 'reason should be provided for skip');
  });

  it('skill directory contains exactly one SKILL.md after two identical runs', () => {
    const transcript = makeDebuggingTranscript();

    analyzeTranscript(transcript, [], { outputDir: testDir });
    analyzeTranscript(transcript, [], { outputDir: testDir });

    // Walk the skill dirs and count SKILL.md files
    const skillMdFiles = [];
    for (const entry of fs.readdirSync(testDir)) {
      const candidate = path.join(testDir, entry, 'SKILL.md');
      if (fs.existsSync(candidate)) skillMdFiles.push(candidate);
    }
    assert.equal(skillMdFiles.length, 1, 'exactly one SKILL.md should exist after two runs');
  });

  it('returns { skipped: true, reason } when existingSkills has a matching step sequence', () => {
    const transcript = makeDebuggingTranscript();
    const toolNames = _extractToolSequence(transcript).map(t => t.toolName);

    const existingSkills = [{ name: 'existing-debug-skill', steps: toolNames }];
    const result = analyzeTranscript(transcript, existingSkills, { outputDir: testDir });

    assert.equal(result.written, false);
    assert.equal(result.skipped, true);
    assert.ok(result.reason, 'reason should explain the skip');
    assert.match(result.reason, /similarity/i);
  });

  it('does NOT skip when existingSkills steps are completely different', () => {
    const transcript = makeDebuggingTranscript();
    // Existing skill uses completely different tools
    const existingSkills = [
      { name: 'web-skill', steps: ['WebSearch', 'WebFetch', 'Create', 'Glob', 'Write'] },
    ];
    const result = analyzeTranscript(transcript, existingSkills, { outputDir: testDir });

    assert.equal(result.written, true, 'should write when no skill overlap');
  });
});

// ---------------------------------------------------------------------------
// VAL-AS-003: Schema validation — malformed SKILL.md is caught
// ---------------------------------------------------------------------------

describe('VAL-AS-003: analyzeTranscript — schema validation catches malformed output', () => {
  let rootTmpDir;
  let testDir;

  before(() => {
    rootTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-auto-creator-val003-'));
  });

  after(() => {
    if (fs.existsSync(rootTmpDir)) fs.rmSync(rootTmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(rootTmpDir, 'case-'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('returns { written: false, error } when generated frontmatter has invalid name (capital letters)', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, [], {
      outputDir: testDir,
      _contentGenerator: () =>
        '---\nname: InvalidCapitalizedName\ndescription: A sufficiently long description here.\nversion: "1.0.0"\ntriggers:\n  - debug\n---\n\n# Skill\n\n## Rules\n\n1. Do something.\n',
    });

    assert.equal(result.written, false, 'should not write');
    assert.ok(result.error, 'error should be set');
    // No file should exist for this skill name
    const badPath = path.join(testDir, 'InvalidCapitalizedName', 'SKILL.md');
    assert.equal(fs.existsSync(badPath), false, 'no SKILL.md file should be written');
  });

  it('returns { written: false, error } when generated description is too short (minLength)', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, [], {
      outputDir: testDir,
      _contentGenerator: () =>
        '---\nname: valid-name\ndescription: "short"\nversion: "1.0.0"\n---\n\n# Skill\n\n## Rules\n\n1. Do something.\n',
    });

    assert.equal(result.written, false, 'should not write');
    assert.ok(result.error, 'error should be set');
  });

  it('returns { written: false, error } when YAML frontmatter is entirely absent', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, [], {
      outputDir: testDir,
      _contentGenerator: () => '# No Frontmatter Skill\n\n## Rules\n\n1. Do something.\n',
    });

    assert.equal(result.written, false, 'should not write');
    assert.ok(result.error, 'error should be set');
  });

  it('returns { written: false, error } when Rules section is missing', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, [], {
      outputDir: testDir,
      _contentGenerator: () =>
        '---\nname: valid-skill-name\ndescription: "A sufficiently long description here."\nversion: "1.0.0"\n---\n\n# Skill\n\n## Usage\n\nSome usage.\n',
    });

    assert.equal(result.written, false, 'should not write');
    assert.ok(result.error, 'error should mention Rules');
  });

  it('returns { written: false, error } when Rules section is empty', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, [], {
      outputDir: testDir,
      _contentGenerator: () =>
        '---\nname: valid-skill-name\ndescription: "A sufficiently long description here."\nversion: "1.0.0"\n---\n\n# Skill\n\n## Rules\n\n',
    });

    assert.equal(result.written, false, 'should not write');
    assert.ok(result.error, 'error should be set');
  });

  it('returns { written: false, error } when content contains embedded secret', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, [], {
      outputDir: testDir,
      _contentGenerator: () => {
        // Build fake key dynamically to avoid triggering static secret scanners
        const fakeKey = 'sk-' + 'x'.repeat(25);
        return (
          '---\nname: valid-skill-name\ndescription: "A sufficiently long description here."\nversion: "1.0.0"\ntriggers:\n  - read\n---\n\n# Skill\n\n## Rules\n\n' +
          `1. Use API key ${fakeKey} to authenticate.\n`
        );
      },
    });

    assert.equal(result.written, false, 'should not write when secrets detected');
    assert.ok(result.error, 'error should be set');
    assert.match(result.error, /secret/i);
  });

  it('returns { written: false, error } when content contains YAML injection', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, [], {
      outputDir: testDir,
      _contentGenerator: () =>
        '---\nname: valid-skill-name\ndescription: "A sufficiently long description here."\nversion: "1.0.0"\ntriggers:\n  - !!python/object:subprocess.call [ls]\n---\n\n# Skill\n\n## Rules\n\n1. Do something.\n',
    });

    assert.equal(result.written, false, 'should not write when injection detected');
    assert.ok(result.error, 'error should be set');
  });

  it('does NOT write any file when schema validation fails', () => {
    const transcript = makeDebuggingTranscript();
    const dirBefore = fs.readdirSync(testDir);

    analyzeTranscript(transcript, [], {
      outputDir: testDir,
      _contentGenerator: () =>
        '---\nname: INVALID_NAME\ndescription: "desc"\nversion: 1\n---\n\n## Rules\n\n1. Step.',
    });

    const dirAfter = fs.readdirSync(testDir);
    assert.deepEqual(
      dirAfter.sort(),
      dirBefore.sort(),
      'directory contents should not change on validation failure'
    );
  });
});

// ---------------------------------------------------------------------------
// Edge cases and additional coverage
// ---------------------------------------------------------------------------

describe('analyzeTranscript — edge cases', () => {
  let rootTmpDir;
  let testDir;

  before(() => {
    rootTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-auto-creator-edge-'));
  });

  after(() => {
    if (fs.existsSync(rootTmpDir)) fs.rmSync(rootTmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(rootTmpDir, 'case-'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('returns { skipped: true } in dryRun mode even for a valid transcript', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, [], { outputDir: testDir, dryRun: true });
    assert.equal(result.written, false);
    assert.equal(result.skipped, true);
    assert.match(result.reason, /dry run/i);
  });

  it('handles null existingSkills gracefully', () => {
    const transcript = makeDebuggingTranscript();
    const result = analyzeTranscript(transcript, null, { outputDir: testDir });
    // Null existingSkills should be treated as empty — procedure is novel
    assert.equal(result.written, true);
  });

  it('handles empty transcript array gracefully', () => {
    const result = analyzeTranscript([], [], { outputDir: testDir });
    assert.equal(result.written, false);
    assert.equal(result.skipped, true);
  });

  it('handles non-array transcript gracefully', () => {
    const result = analyzeTranscript('not-an-array', [], { outputDir: testDir });
    assert.equal(result.written, false);
    assert.equal(result.skipped, true);
  });

  it('handles invalid options gracefully (no crash)', () => {
    // Use a short transcript so no file is written to the default skills directory
    const shortTranscript = makeShortTranscript();
    const result = analyzeTranscript(shortTranscript, [], null);
    // Should process with defaults — no crash, returns a proper result object
    assert.equal(typeof result, 'object');
    assert.ok('written' in result);
    assert.equal(result.written, false, 'short transcript should not write');
  });
});
