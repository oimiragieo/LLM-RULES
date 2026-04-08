'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseHandoff,
  normalizeHandoff,
  writeHandoff,
  gradeHandoff,
  determineSuccessState,
} = require(
  path.join(__dirname, '..', '..', 'scripts', 'channels', 'daemon', 'handoff-capture.cjs')
);

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('parseHandoff()', () => {
  it('parses fenced handoff block', () => {
    const output = `I fixed the login form.

\`\`\`handoff
{
  "summary": "Fixed login form validation",
  "filesModified": ["src/LoginForm.tsx"],
  "commandsRun": [{"command": "pnpm test", "exitCode": 0, "observation": "All pass"}],
  "discoveredIssues": [],
  "skillFeedback": {"followedProcedure": true, "deviations": []}
}
\`\`\``;

    const result = parseHandoff(output);
    assert.equal(result.structured, true);
    assert.equal(result.handoff.summary, 'Fixed login form validation');
    assert.equal(result.handoff.filesModified.length, 1);
    assert.equal(result.handoff.commandsRun[0].exitCode, 0);
  });

  it('falls back to unstructured for plain text', () => {
    const output = 'I fixed the bug in src/LoginForm.tsx and ran tests.';
    const result = parseHandoff(output);
    assert.equal(result.structured, false);
    assert.ok(result.handoff.summary.length > 0);
  });

  it('handles null input', () => {
    const result = parseHandoff(null);
    assert.equal(result.structured, false);
    assert.equal(result.handoff.summary, 'No output produced.');
  });

  it('handles empty string', () => {
    const result = parseHandoff('');
    assert.equal(result.structured, false);
  });

  it('handles malformed JSON in fence block', () => {
    const output = '```handoff\n{broken json}\n```';
    const result = parseHandoff(output);
    assert.equal(result.structured, false);
  });

  it('extracts file paths from unstructured output', () => {
    const output = 'Modified src/components/Button.tsx and tests/Button.test.cjs';
    const result = parseHandoff(output);
    assert.ok(result.handoff.filesModified.length > 0);
  });
});

describe('normalizeHandoff()', () => {
  it('normalizes complete handoff', () => {
    const raw = {
      summary: 'Done',
      filesModified: ['a.js'],
      commandsRun: [{ command: 'npm test', exitCode: 0 }],
    };
    const result = normalizeHandoff(raw);
    assert.equal(result.summary, 'Done');
    assert.equal(result.commandsRun[0].command, 'npm test');
    assert.equal(result.skillFeedback.followedProcedure, true);
  });

  it('fills defaults for missing fields', () => {
    const result = normalizeHandoff({});
    assert.equal(result.summary, '');
    assert.deepEqual(result.filesModified, []);
    assert.deepEqual(result.commandsRun, []);
    assert.deepEqual(result.discoveredIssues, []);
    assert.equal(result.skillFeedback.followedProcedure, true);
  });

  it('handles salientSummary alias', () => {
    const result = normalizeHandoff({ salientSummary: 'My summary' });
    assert.equal(result.summary, 'My summary');
  });
});

describe('writeHandoff()', () => {
  it('writes handoff JSON to directory', () => {
    const handoffsDir = path.join(tmpDir, 'handoffs');
    const handoff = { summary: 'Test handoff', filesModified: [], commandsRun: [] };
    const spec = { id: 'test-feature', milestone: 'telegram' };

    const filePath = writeHandoff(handoffsDir, handoff, spec);

    assert.ok(fs.existsSync(filePath));
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(content.featureId, 'test-feature');
    assert.equal(content.milestone, 'telegram');
    assert.ok(content.timestamp);
  });

  it('creates directory if missing', () => {
    const handoffsDir = path.join(tmpDir, 'nested', 'handoffs');
    const handoff = { summary: 'Test' };
    const spec = { id: 'test' };

    writeHandoff(handoffsDir, handoff, spec);
    assert.ok(fs.existsSync(handoffsDir));
  });
});

describe('determineSuccessState()', () => {
  it('returns success for clean handoff', () => {
    assert.equal(determineSuccessState({ commandsRun: [{ exitCode: 0 }] }), 'success');
  });

  it('returns failure for blocking issues', () => {
    const handoff = { discoveredIssues: [{ severity: 'blocking', description: 'fail' }] };
    assert.equal(determineSuccessState(handoff), 'failure');
  });

  it('returns partial for failed commands', () => {
    const handoff = { commandsRun: [{ exitCode: 1 }], discoveredIssues: [] };
    assert.equal(determineSuccessState(handoff), 'partial');
  });

  it('returns success for empty handoff', () => {
    assert.equal(determineSuccessState({}), 'success');
  });
});

describe('gradeHandoff()', () => {
  it('scores a perfect handoff highly', () => {
    const handoff = {
      summary: 'Implemented the feature with full test coverage and all verifications passing.',
      filesModified: ['src/feature.cjs', 'tests/feature.test.cjs'],
      commandsRun: [
        { command: 'pnpm lint:fix', exitCode: 0, observation: 'Clean' },
        { command: 'pnpm test', exitCode: 0, observation: '42 pass' },
      ],
      discoveredIssues: [],
      skillFeedback: { followedProcedure: true, deviations: [], suggestedChanges: [] },
    };
    const spec = { verificationSteps: ['pnpm lint:fix', 'pnpm test'] };

    const result = gradeHandoff(handoff, spec);
    assert.ok(result.score >= 80, `Score ${result.score} should be >= 80`);
    assert.equal(result.passed, true);
    assert.ok(['excellent', 'good'].includes(result.grade));
  });

  it('scores a minimal handoff low', () => {
    const handoff = { summary: 'Done' };
    const spec = { verificationSteps: ['pnpm test'] };

    const result = gradeHandoff(handoff, spec);
    assert.ok(result.score < 70, `Score ${result.score} should be < 70`);
  });

  it('penalizes blocking issues', () => {
    const handoff = {
      summary: 'Partially done but blocked by a dependency issue that prevents completion.',
      filesModified: ['a.js'],
      commandsRun: [{ command: 'npm test', exitCode: 1 }],
      discoveredIssues: [{ severity: 'blocking', description: 'Missing dependency' }],
      skillFeedback: { followedProcedure: true, deviations: [] },
    };
    const spec = { verificationSteps: [] };

    const result = gradeHandoff(handoff, spec);
    assert.ok(result.score < 80);
  });

  it('returns details array', () => {
    const result = gradeHandoff({}, {});
    assert.ok(Array.isArray(result.details));
    assert.ok(result.details.length > 0);
  });
});
