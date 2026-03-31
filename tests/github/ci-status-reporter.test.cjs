'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { CIStatusReporter } = require('../../.claude/lib/github/ci-status-reporter.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock GitHubCLI that records commentOnPR calls.
 *
 * @returns {{ mock: object, calls: Array<{prNumber: number, body: string}> }}
 */
function makeGitHubCLIMock() {
  const calls = [];
  const mock = {
    commentOnPR(prNumber, body) {
      calls.push({ prNumber, body });
    },
  };
  return { mock, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CIStatusReporter', () => {
  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('instantiates without arguments', () => {
      assert.doesNotThrow(() => new CIStatusReporter());
    });

    it('instantiates with empty object', () => {
      assert.doesNotThrow(() => new CIStatusReporter({}));
    });

    it('accepts a githubCLI dependency', () => {
      const { mock } = makeGitHubCLIMock();
      assert.doesNotThrow(() => new CIStatusReporter({ githubCLI: mock }));
    });
  });

  // -------------------------------------------------------------------------
  // reportToPR
  // -------------------------------------------------------------------------
  describe('reportToPR', () => {
    it('calls githubCLI.commentOnPR with the PR number', () => {
      const { mock, calls } = makeGitHubCLIMock();
      const reporter = new CIStatusReporter({ githubCLI: mock });

      reporter.reportToPR(42, { status: 'success', summary: 'All tests passed.' });

      assert.equal(calls.length, 1, 'commentOnPR should be called once');
      assert.equal(calls[0].prNumber, 42, 'commentOnPR should receive the correct PR number');
    });

    it('posts a formatted comment body string', () => {
      const { mock, calls } = makeGitHubCLIMock();
      const reporter = new CIStatusReporter({ githubCLI: mock });

      reporter.reportToPR(1, { status: 'success', summary: 'Build passed.' });

      assert.equal(typeof calls[0].body, 'string', 'comment body must be a string');
      assert.ok(calls[0].body.length > 0, 'comment body must not be empty');
    });

    it('includes success emoji (✅) for status=success', () => {
      const { mock, calls } = makeGitHubCLIMock();
      const reporter = new CIStatusReporter({ githubCLI: mock });

      reporter.reportToPR(1, { status: 'success', summary: 'All green.' });

      assert.ok(calls[0].body.includes('✅'), 'comment must contain ✅ for success status');
    });

    it('includes failure emoji (❌) for status=failure', () => {
      const { mock, calls } = makeGitHubCLIMock();
      const reporter = new CIStatusReporter({ githubCLI: mock });

      reporter.reportToPR(1, { status: 'failure', summary: 'Tests failed.' });

      assert.ok(calls[0].body.includes('❌'), 'comment must contain ❌ for failure status');
    });

    it('includes pending emoji (⏰) for status=pending', () => {
      const { mock, calls } = makeGitHubCLIMock();
      const reporter = new CIStatusReporter({ githubCLI: mock });

      reporter.reportToPR(1, { status: 'pending', summary: 'Running tests...' });

      assert.ok(calls[0].body.includes('⏰'), 'comment must contain ⏰ for pending status');
    });

    it('includes the summary in the comment body', () => {
      const { mock, calls } = makeGitHubCLIMock();
      const reporter = new CIStatusReporter({ githubCLI: mock });

      reporter.reportToPR(7, { status: 'success', summary: 'All 42 tests passed.' });

      assert.ok(
        calls[0].body.includes('All 42 tests passed.'),
        'comment must include the summary text'
      );
    });

    it('includes a collapsible details section when details is provided', () => {
      const { mock, calls } = makeGitHubCLIMock();
      const reporter = new CIStatusReporter({ githubCLI: mock });

      reporter.reportToPR(3, {
        status: 'success',
        summary: 'Passed.',
        details: 'Here are the details.',
      });

      const body = calls[0].body;
      assert.ok(body.includes('<details>'), 'comment must contain <details> element');
      assert.ok(body.includes('</details>'), 'comment must contain </details> element');
      assert.ok(body.includes('<summary>'), 'comment must contain <summary> element');
      assert.ok(body.includes('Here are the details.'), 'comment must contain the details content');
    });

    it('omits the collapsible section when details is not provided', () => {
      const { mock, calls } = makeGitHubCLIMock();
      const reporter = new CIStatusReporter({ githubCLI: mock });

      reporter.reportToPR(2, { status: 'success', summary: 'Done.' });

      const body = calls[0].body;
      assert.ok(!body.includes('<details>'), 'comment must not contain <details> when no details');
    });

    it('includes the status value in the comment body', () => {
      const { mock, calls } = makeGitHubCLIMock();
      const reporter = new CIStatusReporter({ githubCLI: mock });

      reporter.reportToPR(5, { status: 'failure', summary: 'Something broke.' });

      assert.ok(calls[0].body.includes('failure'), 'comment must include the status value in body');
    });
  });

  // -------------------------------------------------------------------------
  // formatTestResults
  // -------------------------------------------------------------------------
  describe('formatTestResults', () => {
    it('returns a string', () => {
      const reporter = new CIStatusReporter();
      const result = reporter.formatTestResults({ passed: 5, failed: 0, skipped: 0, total: 5 });
      assert.equal(typeof result, 'string', 'formatTestResults must return a string');
    });

    it('produces a markdown table with pass/fail/skip/total counts', () => {
      const reporter = new CIStatusReporter();
      const result = reporter.formatTestResults({
        passed: 10,
        failed: 2,
        skipped: 1,
        total: 13,
      });

      assert.ok(result.includes('|'), 'result must contain markdown table pipes');
      assert.ok(result.includes('10'), 'result must include passed count');
      assert.ok(result.includes('2'), 'result must include failed count');
      assert.ok(result.includes('1'), 'result must include skipped count');
      assert.ok(result.includes('13'), 'result must include total count');
    });

    it('includes header rows with Passed, Failed, Skipped, Total', () => {
      const reporter = new CIStatusReporter();
      const result = reporter.formatTestResults({
        passed: 3,
        failed: 0,
        skipped: 0,
        total: 3,
      });

      assert.ok(result.toLowerCase().includes('pass'), 'result must contain passed label');
      assert.ok(result.toLowerCase().includes('fail'), 'result must contain failed label');
      assert.ok(result.toLowerCase().includes('total'), 'result must contain total label');
    });

    it('includes individual test rows when tests array is provided', () => {
      const reporter = new CIStatusReporter();
      const result = reporter.formatTestResults({
        passed: 2,
        failed: 1,
        skipped: 0,
        total: 3,
        tests: [
          { name: 'test A', status: 'pass' },
          { name: 'test B', status: 'pass' },
          { name: 'test C', status: 'fail' },
        ],
      });

      assert.ok(result.includes('test A'), 'result must include individual test names');
      assert.ok(result.includes('test B'), 'result must include individual test names');
      assert.ok(result.includes('test C'), 'result must include individual test names');
    });

    it('handles empty/missing results gracefully', () => {
      const reporter = new CIStatusReporter();
      assert.doesNotThrow(() => reporter.formatTestResults({}));
      assert.doesNotThrow(() => reporter.formatTestResults(null));
    });
  });

  // -------------------------------------------------------------------------
  // formatReviewFindings
  // -------------------------------------------------------------------------
  describe('formatReviewFindings', () => {
    it('returns a string', () => {
      const reporter = new CIStatusReporter();
      const result = reporter.formatReviewFindings([]);
      assert.equal(typeof result, 'string', 'formatReviewFindings must return a string');
    });

    it('returns a no-findings message for empty array', () => {
      const reporter = new CIStatusReporter();
      const result = reporter.formatReviewFindings([]);
      assert.ok(result.length > 0, 'result must not be empty string');
    });

    it('returns a no-findings message for null/undefined', () => {
      const reporter = new CIStatusReporter();
      assert.doesNotThrow(() => reporter.formatReviewFindings(null));
      assert.doesNotThrow(() => reporter.formatReviewFindings(undefined));
      assert.equal(typeof reporter.formatReviewFindings(null), 'string');
    });

    it('formats findings into a markdown table', () => {
      const reporter = new CIStatusReporter();
      const findings = [
        {
          severity: 'blocking',
          description: 'SQL injection vulnerability',
          file: 'db.js',
          line: 42,
        },
        { severity: 'non_blocking', description: 'Unused variable', file: 'util.js' },
      ];

      const result = reporter.formatReviewFindings(findings);

      assert.ok(result.includes('|'), 'result must contain markdown table pipes');
      assert.ok(result.includes('blocking'), 'result must include severity');
      assert.ok(result.includes('SQL injection vulnerability'), 'result must include description');
      assert.ok(result.includes('db.js'), 'result must include file name');
    });

    it('includes line number when provided', () => {
      const reporter = new CIStatusReporter();
      const findings = [{ severity: 'blocking', description: 'Issue', file: 'foo.js', line: 10 }];

      const result = reporter.formatReviewFindings(findings);

      assert.ok(result.includes('10'), 'result must include line number when provided');
      assert.ok(result.includes('foo.js'), 'result must include file name');
    });

    it('handles missing file/line gracefully', () => {
      const reporter = new CIStatusReporter();
      const findings = [{ severity: 'suggestion', description: 'Consider refactoring' }];

      assert.doesNotThrow(() => reporter.formatReviewFindings(findings));
      const result = reporter.formatReviewFindings(findings);
      assert.ok(result.includes('Consider refactoring'), 'result must include description');
    });

    it('includes a header row', () => {
      const reporter = new CIStatusReporter();
      const findings = [{ severity: 'blocking', description: 'A problem', file: 'a.js' }];
      const result = reporter.formatReviewFindings(findings);

      // table should have at least a separator row
      assert.ok(result.includes('---'), 'result must have table separator');
    });
  });

  // -------------------------------------------------------------------------
  // formatMissionStatus
  // -------------------------------------------------------------------------
  describe('formatMissionStatus', () => {
    it('returns a string', () => {
      const reporter = new CIStatusReporter();
      const result = reporter.formatMissionStatus({ overall: 'in_progress', progress: '2/5' });
      assert.equal(typeof result, 'string', 'formatMissionStatus must return a string');
    });

    it('handles null/undefined gracefully', () => {
      const reporter = new CIStatusReporter();
      assert.doesNotThrow(() => reporter.formatMissionStatus(null));
      assert.doesNotThrow(() => reporter.formatMissionStatus(undefined));
      assert.equal(typeof reporter.formatMissionStatus(null), 'string');
    });

    it('includes overall status when provided', () => {
      const reporter = new CIStatusReporter();
      const result = reporter.formatMissionStatus({ overall: 'in_progress', progress: '3/10' });

      assert.ok(result.includes('in_progress'), 'result must include overall status');
    });

    it('includes progress information when provided', () => {
      const reporter = new CIStatusReporter();
      const result = reporter.formatMissionStatus({ overall: 'in_progress', progress: '3/10' });

      assert.ok(result.includes('3/10'), 'result must include progress value');
    });

    it('formats milestone list into a markdown table', () => {
      const reporter = new CIStatusReporter();
      const status = {
        overall: 'in_progress',
        progress: '2/4',
        milestones: [
          { name: 'github-integration', status: 'completed', features: 4 },
          { name: 'nomenclature-cleanup', status: 'pending', features: 3 },
        ],
      };

      const result = reporter.formatMissionStatus(status);

      assert.ok(result.includes('|'), 'result must contain markdown table pipes');
      assert.ok(result.includes('github-integration'), 'result must include milestone name');
      assert.ok(result.includes('completed'), 'result must include milestone status');
      assert.ok(result.includes('nomenclature-cleanup'), 'result must include second milestone');
    });

    it('handles milestones array gracefully', () => {
      const reporter = new CIStatusReporter();
      assert.doesNotThrow(() => reporter.formatMissionStatus({ overall: 'done', milestones: [] }));
    });
  });
});
