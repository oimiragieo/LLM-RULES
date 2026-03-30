'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const {
  ReviewPipeline,
  computeOverallAssessment,
} = require('../../.claude/lib/review/pipeline.cjs');

const { Finding, BUG_CRITERIA } = require('../../.claude/lib/review/severity.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a diffData object with the given list of {path, numHunks} specs. */
function buildDiffData(fileSpecs) {
  const files = fileSpecs.map(({ filePath, numHunks }) => ({
    path: filePath,
    binary: false,
    hunks: Array.from({ length: numHunks }, (_, i) => ({
      header: `@@ -${i * 10 + 1},5 +${i * 10 + 1},6 @@`,
      oldStart: i * 10 + 1,
      oldLines: 5,
      newStart: i * 10 + 1,
      newLines: 6,
      lines: ['+const x = 1;'],
    })),
    additions: numHunks,
    deletions: 0,
  }));
  return { files };
}

/** Build a Finding with all 8 criteria set to `allPass`. */
function makeFinding(priority, allPass = true, overrideCriteria = {}) {
  const criteriaResults = {};
  for (const c of BUG_CRITERIA) {
    criteriaResults[c] = allPass;
  }
  Object.assign(criteriaResults, overrideCriteria);
  return new Finding({
    title: `Test finding ${priority}`,
    explanation: 'Some explanation.',
    file: 'src/test.js',
    lineStart: 1,
    lineEnd: 5,
    priority,
    suggestedFix: 'Fix it.',
    criteriaResults,
  });
}

// ---------------------------------------------------------------------------
// ReviewPipeline constructor
// ---------------------------------------------------------------------------

describe('ReviewPipeline constructor', () => {
  it('stores mode and diffData', () => {
    const diffData = buildDiffData([]);
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData });
    assert.strictEqual(pipeline.mode, 'uncommitted');
    assert.strictEqual(pipeline.diffData, diffData);
  });

  it('stores customInstructions when provided', () => {
    const diffData = buildDiffData([]);
    const pipeline = new ReviewPipeline({
      mode: 'base-branch',
      diffData,
      customInstructions: 'Focus on security issues.',
    });
    assert.strictEqual(pipeline.customInstructions, 'Focus on security issues.');
  });

  it('works without customInstructions', () => {
    const diffData = buildDiffData([]);
    const pipeline = new ReviewPipeline({ mode: 'commit', diffData });
    assert.ok(pipeline.customInstructions === undefined || pipeline.customInstructions === null);
  });
});

// ---------------------------------------------------------------------------
// ReviewPipeline.runPass1()
// ---------------------------------------------------------------------------

describe('ReviewPipeline.runPass1()', () => {
  it('returns empty array when diffData has no files', () => {
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData: { files: [] } });
    const candidates = pipeline.runPass1();
    assert.ok(Array.isArray(candidates));
    assert.strictEqual(candidates.length, 0);
  });

  it('returns one candidate per hunk for a single file', () => {
    const diffData = buildDiffData([{ filePath: 'src/foo.js', numHunks: 3 }]);
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData });
    const candidates = pipeline.runPass1();
    assert.strictEqual(candidates.length, 3);
  });

  it('returns correct total candidates across multiple files', () => {
    const diffData = buildDiffData([
      { filePath: 'src/a.js', numHunks: 2 },
      { filePath: 'src/b.js', numHunks: 1 },
    ]);
    const pipeline = new ReviewPipeline({ mode: 'base-branch', diffData });
    const candidates = pipeline.runPass1();
    assert.strictEqual(candidates.length, 3);
  });

  it('returns Finding instances', () => {
    const diffData = buildDiffData([{ filePath: 'src/a.js', numHunks: 1 }]);
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData });
    const candidates = pipeline.runPass1();
    assert.ok(candidates[0] instanceof Finding);
  });

  it('each candidate has all 8 criteria set to true', () => {
    const diffData = buildDiffData([{ filePath: 'src/a.js', numHunks: 1 }]);
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData });
    const candidates = pipeline.runPass1();
    for (const c of BUG_CRITERIA) {
      assert.strictEqual(candidates[0].criteriaResults[c], true, `criterion ${c} should be true`);
    }
  });

  it('each candidate has pass field set to 1', () => {
    const diffData = buildDiffData([{ filePath: 'src/a.js', numHunks: 1 }]);
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData });
    const candidates = pipeline.runPass1();
    assert.strictEqual(candidates[0].pass, 1);
  });

  it('candidate file matches the source file path', () => {
    const diffData = buildDiffData([{ filePath: 'src/foo.js', numHunks: 1 }]);
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData });
    const candidates = pipeline.runPass1();
    assert.strictEqual(candidates[0].file, 'src/foo.js');
  });

  it('candidate lineStart matches hunk newStart', () => {
    const diffData = buildDiffData([{ filePath: 'src/a.js', numHunks: 1 }]);
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData });
    const candidates = pipeline.runPass1();
    assert.strictEqual(candidates[0].lineStart, diffData.files[0].hunks[0].newStart);
  });

  it('skips binary files (no candidates generated for binary)', () => {
    const diffData = {
      files: [
        {
          path: 'image.png',
          binary: true,
          hunks: [],
          additions: 0,
          deletions: 0,
        },
      ],
    };
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData });
    const candidates = pipeline.runPass1();
    assert.strictEqual(candidates.length, 0);
  });
});

// ---------------------------------------------------------------------------
// ReviewPipeline.runPass2()
// ---------------------------------------------------------------------------

describe('ReviewPipeline.runPass2()', () => {
  let pipeline;
  before(() => {
    pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData: { files: [] } });
  });

  it('returns empty array for empty input', () => {
    const result = pipeline.runPass2([]);
    assert.deepEqual(result, []);
  });

  it('retains candidates where all 8 criteria are true', () => {
    const passing = makeFinding('P2', true);
    const result = pipeline.runPass2([passing]);
    assert.strictEqual(result.length, 1);
  });

  it('filters out candidates where any criterion is false', () => {
    const failing = makeFinding('P1', true, { meaningful_impact: false });
    const result = pipeline.runPass2([failing]);
    assert.strictEqual(result.length, 0);
  });

  it('filters mixed list correctly', () => {
    const passing = makeFinding('P2', true);
    const failing = makeFinding('P1', true, { worth_fixing: false });
    const result = pipeline.runPass2([passing, failing]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0], passing);
  });

  it('retains all candidates when all pass criteria', () => {
    const a = makeFinding('P0', true);
    const b = makeFinding('P3', true);
    const result = pipeline.runPass2([a, b]);
    assert.strictEqual(result.length, 2);
  });

  it('removes a candidate missing any criterion key in criteriaResults', () => {
    const criteriaResults = {};
    for (const c of BUG_CRITERIA) {
      criteriaResults[c] = true;
    }
    delete criteriaResults['provably_affected'];
    const incomplete = new Finding({
      title: 'Incomplete finding',
      explanation: 'Missing provably_affected.',
      file: 'src/x.js',
      lineStart: 1,
      lineEnd: 1,
      priority: 'P1',
      criteriaResults,
    });
    const result = pipeline.runPass2([incomplete]);
    assert.strictEqual(result.length, 0);
  });
});

// ---------------------------------------------------------------------------
// ReviewPipeline.run()
// ---------------------------------------------------------------------------

describe('ReviewPipeline.run()', () => {
  it('returns object with overallAssessment, findings, stats, metadata', () => {
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData: { files: [] } });
    const result = pipeline.run();
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'overallAssessment'));
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'findings'));
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'stats'));
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'metadata'));
  });

  it('returns approve when diffData has no files (no candidates)', () => {
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData: { files: [] } });
    const result = pipeline.run();
    assert.strictEqual(result.overallAssessment, 'approve');
  });

  it('returns approve when diffData has files with no hunks', () => {
    const diffData = {
      files: [{ path: 'src/a.js', binary: false, hunks: [], additions: 0, deletions: 0 }],
    };
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData });
    const result = pipeline.run();
    assert.strictEqual(result.overallAssessment, 'approve');
  });

  it('returns comment when findings are P2 only (no P0/P1)', () => {
    // runPass1 produces P2 candidates by default; with all criteria true they pass runPass2
    const diffData = buildDiffData([{ filePath: 'src/a.js', numHunks: 1 }]);
    const pipeline = new ReviewPipeline({ mode: 'base-branch', diffData });
    const result = pipeline.run();
    // Default candidates are P2, so overallAssessment should be 'comment'
    assert.strictEqual(result.overallAssessment, 'comment');
  });

  it('metadata includes mode', () => {
    const pipeline = new ReviewPipeline({ mode: 'commit', diffData: { files: [] } });
    const result = pipeline.run();
    assert.strictEqual(result.metadata.mode, 'commit');
  });

  it('metadata includes duration as a non-negative number', () => {
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData: { files: [] } });
    const result = pipeline.run();
    assert.strictEqual(typeof result.metadata.duration, 'number');
    assert.ok(result.metadata.duration >= 0);
  });

  it('stats.filesReviewed equals number of files in diffData', () => {
    const diffData = buildDiffData([
      { filePath: 'src/a.js', numHunks: 1 },
      { filePath: 'src/b.js', numHunks: 2 },
    ]);
    const pipeline = new ReviewPipeline({ mode: 'base-branch', diffData });
    const result = pipeline.run();
    assert.strictEqual(result.stats.filesReviewed, 2);
  });

  it('stats.findingsCount equals length of findings array', () => {
    const diffData = buildDiffData([{ filePath: 'src/a.js', numHunks: 2 }]);
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData });
    const result = pipeline.run();
    assert.strictEqual(result.stats.findingsCount, result.findings.length);
  });

  it('stats.severityBreakdown has P0, P1, P2, P3 keys', () => {
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData: { files: [] } });
    const result = pipeline.run();
    assert.ok(Object.prototype.hasOwnProperty.call(result.stats.severityBreakdown, 'P0'));
    assert.ok(Object.prototype.hasOwnProperty.call(result.stats.severityBreakdown, 'P1'));
    assert.ok(Object.prototype.hasOwnProperty.call(result.stats.severityBreakdown, 'P2'));
    assert.ok(Object.prototype.hasOwnProperty.call(result.stats.severityBreakdown, 'P3'));
  });

  it('stats.severityBreakdown counts are all zero for empty diffData', () => {
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData: { files: [] } });
    const result = pipeline.run();
    const sb = result.stats.severityBreakdown;
    assert.strictEqual(sb.P0, 0);
    assert.strictEqual(sb.P1, 0);
    assert.strictEqual(sb.P2, 0);
    assert.strictEqual(sb.P3, 0);
  });

  it('stats.severityBreakdown counts P2 findings when present', () => {
    const diffData = buildDiffData([{ filePath: 'src/a.js', numHunks: 2 }]);
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData });
    const result = pipeline.run();
    // Default candidates are P2, all criteria true → 2 P2 findings
    assert.strictEqual(result.stats.severityBreakdown.P2, 2);
    assert.strictEqual(result.stats.severityBreakdown.P0, 0);
    assert.strictEqual(result.stats.severityBreakdown.P1, 0);
  });

  it('findings array contains only validated candidates', () => {
    const diffData = buildDiffData([{ filePath: 'src/a.js', numHunks: 1 }]);
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData });
    const result = pipeline.run();
    assert.ok(Array.isArray(result.findings));
    // Since runPass1 produces all-criteria-true candidates, they all pass runPass2
    assert.strictEqual(result.findings.length, 1);
  });

  it('JSON.stringify(result) is valid and parseable JSON', () => {
    const diffData = buildDiffData([{ filePath: 'src/a.js', numHunks: 1 }]);
    const pipeline = new ReviewPipeline({ mode: 'base-branch', diffData });
    const result = pipeline.run();
    const json = JSON.stringify(result);
    assert.strictEqual(typeof json, 'string');
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.overallAssessment, result.overallAssessment);
    assert.strictEqual(parsed.stats.findingsCount, result.stats.findingsCount);
    assert.strictEqual(parsed.metadata.mode, result.metadata.mode);
  });

  it('findings each have a pass field indicating the pipeline pass', () => {
    const diffData = buildDiffData([{ filePath: 'src/a.js', numHunks: 1 }]);
    const pipeline = new ReviewPipeline({ mode: 'uncommitted', diffData });
    const result = pipeline.run();
    for (const f of result.findings) {
      assert.ok(f.pass === 1 || f.pass === 2, `finding pass should be 1 or 2, got: ${f.pass}`);
    }
  });
});

// ---------------------------------------------------------------------------
// computeOverallAssessment()
// ---------------------------------------------------------------------------

describe('computeOverallAssessment()', () => {
  it('returns approve for empty findings array', () => {
    assert.strictEqual(computeOverallAssessment([]), 'approve');
  });

  it('returns approve for only P3 findings', () => {
    const findings = [makeFinding('P3'), makeFinding('P3')];
    assert.strictEqual(computeOverallAssessment(findings), 'approve');
  });

  it('returns comment for P2 findings (no P0/P1)', () => {
    const findings = [makeFinding('P2')];
    assert.strictEqual(computeOverallAssessment(findings), 'comment');
  });

  it('returns comment for mixed P2 and P3 findings (no P0/P1)', () => {
    const findings = [makeFinding('P2'), makeFinding('P3')];
    assert.strictEqual(computeOverallAssessment(findings), 'comment');
  });

  it('returns request-changes when P0 finding exists', () => {
    const findings = [makeFinding('P0')];
    assert.strictEqual(computeOverallAssessment(findings), 'request-changes');
  });

  it('returns request-changes when P1 finding exists', () => {
    const findings = [makeFinding('P1')];
    assert.strictEqual(computeOverallAssessment(findings), 'request-changes');
  });

  it('returns request-changes for mixed P0, P2, P3 findings', () => {
    const findings = [makeFinding('P0'), makeFinding('P2'), makeFinding('P3')];
    assert.strictEqual(computeOverallAssessment(findings), 'request-changes');
  });

  it('returns request-changes when P1 is present alongside lower-severity findings', () => {
    const findings = [makeFinding('P1'), makeFinding('P3')];
    assert.strictEqual(computeOverallAssessment(findings), 'request-changes');
  });
});
