'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { GitHubCLI } = require('../../.claude/lib/github/cli-client.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock _execSync that records every call and returns the given output.
 *
 * @param {string|function} outputOrFn  String to return, or a function(cmd) => string.
 * @returns {{ fn: Function, calls: string[] }}
 */
function mockExec(outputOrFn) {
  const calls = [];
  const fn = (cmd, _opts) => {
    calls.push(cmd);
    if (typeof outputOrFn === 'function') return outputOrFn(cmd);
    return outputOrFn != null ? outputOrFn : '';
  };
  return { fn, calls };
}

/**
 * Build a mock _execSync that throws a gh-style error.
 *
 * @param {object} opts
 * @param {string} opts.message
 * @param {string} [opts.stderr]
 * @param {number} [opts.status]
 * @returns {Function}
 */
function mockExecError({ message, stderr = '', status = 1 }) {
  return (_cmd, _opts) => {
    const err = new Error(message);
    err.stderr = stderr;
    err.status = status;
    throw err;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHubCLI', () => {
  // -------------------------------------------------------------------------
  // createPR
  // -------------------------------------------------------------------------
  describe('createPR', () => {
    it('shells out to gh pr create with correct flags', () => {
      const prOutput = JSON.stringify({ url: 'https://github.com/owner/repo/pull/42', number: 42 });
      const { fn, calls } = mockExec(prOutput);

      const gh = new GitHubCLI({ _execSync: fn });
      gh.createPR({ title: 'My PR', body: 'PR body text', base: 'main', head: 'feature-x' });

      assert.equal(calls.length, 1, 'execSync should be called once');
      const cmd = calls[0];
      assert.ok(cmd.includes('gh pr create'), 'command must include "gh pr create"');
      assert.ok(cmd.includes('--title'), 'command must include --title');
      assert.ok(cmd.includes('My PR'), 'command must include title value');
      assert.ok(cmd.includes('--body'), 'command must include --body');
      assert.ok(cmd.includes('PR body text'), 'command must include body value');
      assert.ok(cmd.includes('--base'), 'command must include --base');
      assert.ok(cmd.includes('main'), 'command must include base value');
      assert.ok(cmd.includes('--head'), 'command must include --head');
      assert.ok(cmd.includes('feature-x'), 'command must include head value');
      assert.ok(cmd.includes('--json'), 'command must include --json for structured output');
    });

    it('returns {url, number} parsed from JSON output', () => {
      const prOutput = JSON.stringify({ url: 'https://github.com/owner/repo/pull/7', number: 7 });
      const { fn } = mockExec(prOutput);

      const gh = new GitHubCLI({ _execSync: fn });
      const result = gh.createPR({ title: 'Test', body: 'Body', base: 'main', head: 'feat' });

      assert.equal(result.url, 'https://github.com/owner/repo/pull/7');
      assert.equal(result.number, 7);
    });

    it('uses provided cwd when calling execSync', () => {
      const prOutput = JSON.stringify({ url: 'https://github.com/x/y/pull/1', number: 1 });
      const receivedOpts = [];
      const fn = (cmd, opts) => {
        receivedOpts.push(opts);
        return prOutput;
      };

      const gh = new GitHubCLI({ cwd: '/my/repo', _execSync: fn });
      gh.createPR({ title: 'T', body: 'B', base: 'main', head: 'h' });

      assert.ok(receivedOpts.length > 0, 'execSync should be called with options');
      assert.equal(receivedOpts[0].cwd, '/my/repo', 'cwd should be passed through');
    });
  });

  // -------------------------------------------------------------------------
  // commentOnPR
  // -------------------------------------------------------------------------
  describe('commentOnPR', () => {
    it('shells out to gh pr comment with number and body', () => {
      const { fn, calls } = mockExec('');

      const gh = new GitHubCLI({ _execSync: fn });
      gh.commentOnPR(5, 'LGTM!');

      assert.equal(calls.length, 1);
      const cmd = calls[0];
      assert.ok(cmd.includes('gh pr comment'), 'command must include "gh pr comment"');
      assert.ok(cmd.includes('5'), 'command must include PR number');
      assert.ok(cmd.includes('--body'), 'command must include --body');
      assert.ok(cmd.includes('LGTM!'), 'command must include comment body');
    });

    it('does not throw on success', () => {
      const { fn } = mockExec('');
      const gh = new GitHubCLI({ _execSync: fn });
      assert.doesNotThrow(() => gh.commentOnPR(1, 'ok'));
    });
  });

  // -------------------------------------------------------------------------
  // getPRDiff
  // -------------------------------------------------------------------------
  describe('getPRDiff', () => {
    it('shells out to gh pr diff with the PR number', () => {
      const diffText = 'diff --git a/foo.js b/foo.js\n+++ b/foo.js\n+added line\n';
      const { fn, calls } = mockExec(diffText);

      const gh = new GitHubCLI({ _execSync: fn });
      gh.getPRDiff(99);

      assert.equal(calls.length, 1);
      const cmd = calls[0];
      assert.ok(cmd.includes('gh pr diff'), 'command must include "gh pr diff"');
      assert.ok(cmd.includes('99'), 'command must include PR number');
    });

    it('returns raw diff text', () => {
      const diffText = 'diff --git a/foo.js b/foo.js\n+added line\n';
      const { fn } = mockExec(diffText);

      const gh = new GitHubCLI({ _execSync: fn });
      const result = gh.getPRDiff(3);

      assert.equal(result, diffText);
    });

    it('returns empty string for empty diff', () => {
      const { fn } = mockExec('');
      const gh = new GitHubCLI({ _execSync: fn });
      const result = gh.getPRDiff(1);
      assert.equal(result, '');
    });
  });

  // -------------------------------------------------------------------------
  // listPRs
  // -------------------------------------------------------------------------
  describe('listPRs', () => {
    it('shells out to gh pr list with --json flag', () => {
      const { fn, calls } = mockExec('[]');

      const gh = new GitHubCLI({ _execSync: fn });
      gh.listPRs();

      assert.equal(calls.length, 1);
      const cmd = calls[0];
      assert.ok(cmd.includes('gh pr list'), 'command must include "gh pr list"');
      assert.ok(cmd.includes('--json'), 'command must include --json');
      assert.ok(cmd.includes('number'), 'json fields must include number');
      assert.ok(cmd.includes('title'), 'json fields must include title');
      assert.ok(cmd.includes('state'), 'json fields must include state');
      assert.ok(cmd.includes('author'), 'json fields must include author');
    });

    it('parses JSON output into structured array', () => {
      const prs = [
        { number: 1, title: 'First PR', state: 'open', author: { login: 'alice' } },
        { number: 2, title: 'Second PR', state: 'closed', author: { login: 'bob' } },
      ];
      const { fn } = mockExec(JSON.stringify(prs));

      const gh = new GitHubCLI({ _execSync: fn });
      const result = gh.listPRs();

      assert.equal(result.length, 2);
      assert.equal(result[0].number, 1);
      assert.equal(result[0].title, 'First PR');
      assert.equal(result[0].state, 'open');
      assert.equal(result[0].author.login, 'alice');
    });

    it('includes --state flag when state option provided', () => {
      const { fn, calls } = mockExec('[]');

      const gh = new GitHubCLI({ _execSync: fn });
      gh.listPRs({ state: 'open' });

      const cmd = calls[0];
      assert.ok(cmd.includes('--state'), 'command must include --state when state provided');
      assert.ok(cmd.includes('open'), 'command must include state value');
    });

    it('omits --state flag when state option not provided', () => {
      const { fn, calls } = mockExec('[]');

      const gh = new GitHubCLI({ _execSync: fn });
      gh.listPRs();

      const cmd = calls[0];
      assert.ok(!cmd.includes('--state'), 'command must not include --state when no state given');
    });

    it('returns empty array for empty list', () => {
      const { fn } = mockExec('[]');
      const gh = new GitHubCLI({ _execSync: fn });
      const result = gh.listPRs();
      assert.deepEqual(result, []);
    });
  });

  // -------------------------------------------------------------------------
  // getPR
  // -------------------------------------------------------------------------
  describe('getPR', () => {
    it('shells out to gh pr view with --json flag', () => {
      const prData = { number: 10, title: 'My PR', state: 'open' };
      const { fn, calls } = mockExec(JSON.stringify(prData));

      const gh = new GitHubCLI({ _execSync: fn });
      gh.getPR(10);

      assert.equal(calls.length, 1);
      const cmd = calls[0];
      assert.ok(cmd.includes('gh pr view'), 'command must include "gh pr view"');
      assert.ok(cmd.includes('10'), 'command must include PR number');
      assert.ok(cmd.includes('--json'), 'command must include --json');
    });

    it('parses single PR JSON into object', () => {
      const prData = {
        number: 10,
        title: 'My PR',
        state: 'open',
        author: { login: 'carol' },
        body: 'PR description',
        url: 'https://github.com/owner/repo/pull/10',
      };
      const { fn } = mockExec(JSON.stringify(prData));

      const gh = new GitHubCLI({ _execSync: fn });
      const result = gh.getPR(10);

      assert.equal(result.number, 10);
      assert.equal(result.title, 'My PR');
      assert.equal(result.state, 'open');
      assert.equal(result.body, 'PR description');
    });
  });

  // -------------------------------------------------------------------------
  // createReview
  // -------------------------------------------------------------------------
  describe('createReview', () => {
    it('shells out to gh pr review with PR number', () => {
      const { fn, calls } = mockExec('');

      const gh = new GitHubCLI({ _execSync: fn });
      gh.createReview(5, { body: 'Looks good', event: 'APPROVE' });

      assert.equal(calls.length, 1);
      const cmd = calls[0];
      assert.ok(cmd.includes('gh pr review'), 'command must include "gh pr review"');
      assert.ok(cmd.includes('5'), 'command must include PR number');
    });

    it('uses --approve flag for APPROVE event', () => {
      const { fn, calls } = mockExec('');

      const gh = new GitHubCLI({ _execSync: fn });
      gh.createReview(5, { event: 'APPROVE' });

      const cmd = calls[0];
      assert.ok(cmd.includes('--approve'), 'command must include --approve for APPROVE event');
    });

    it('uses --request-changes flag for REQUEST_CHANGES event', () => {
      const { fn, calls } = mockExec('');

      const gh = new GitHubCLI({ _execSync: fn });
      gh.createReview(5, { event: 'REQUEST_CHANGES', body: 'Needs work' });

      const cmd = calls[0];
      assert.ok(
        cmd.includes('--request-changes'),
        'command must include --request-changes for REQUEST_CHANGES event'
      );
    });

    it('uses --comment flag for COMMENT event', () => {
      const { fn, calls } = mockExec('');

      const gh = new GitHubCLI({ _execSync: fn });
      gh.createReview(5, { event: 'COMMENT', body: 'Nice work' });

      const cmd = calls[0];
      assert.ok(cmd.includes('--comment'), 'command must include --comment for COMMENT event');
    });

    it('includes --body when body is provided', () => {
      const { fn, calls } = mockExec('');

      const gh = new GitHubCLI({ _execSync: fn });
      gh.createReview(5, { body: 'Great PR!', event: 'APPROVE' });

      const cmd = calls[0];
      assert.ok(cmd.includes('--body'), 'command must include --body when body provided');
      assert.ok(cmd.includes('Great PR!'), 'command must include body text');
    });

    it('does not throw on success', () => {
      const { fn } = mockExec('');
      const gh = new GitHubCLI({ _execSync: fn });
      assert.doesNotThrow(() => gh.createReview(1, { event: 'APPROVE' }));
    });
  });

  // -------------------------------------------------------------------------
  // mergePR
  // -------------------------------------------------------------------------
  describe('mergePR', () => {
    it('shells out to gh pr merge with PR number', () => {
      const { fn, calls } = mockExec('');

      const gh = new GitHubCLI({ _execSync: fn });
      gh.mergePR(3);

      assert.equal(calls.length, 1);
      const cmd = calls[0];
      assert.ok(cmd.includes('gh pr merge'), 'command must include "gh pr merge"');
      assert.ok(cmd.includes('3'), 'command must include PR number');
    });

    it('includes --squash flag when method is squash', () => {
      const { fn, calls } = mockExec('');

      const gh = new GitHubCLI({ _execSync: fn });
      gh.mergePR(3, { method: 'squash' });

      const cmd = calls[0];
      assert.ok(cmd.includes('--squash'), 'command must include --squash for squash method');
    });

    it('includes --rebase flag when method is rebase', () => {
      const { fn, calls } = mockExec('');

      const gh = new GitHubCLI({ _execSync: fn });
      gh.mergePR(3, { method: 'rebase' });

      const cmd = calls[0];
      assert.ok(cmd.includes('--rebase'), 'command must include --rebase for rebase method');
    });

    it('includes --merge flag when method is merge', () => {
      const { fn, calls } = mockExec('');

      const gh = new GitHubCLI({ _execSync: fn });
      gh.mergePR(3, { method: 'merge' });

      const cmd = calls[0];
      assert.ok(cmd.includes('--merge'), 'command must include --merge for merge method');
    });

    it('does not throw on success', () => {
      const { fn } = mockExec('');
      const gh = new GitHubCLI({ _execSync: fn });
      assert.doesNotThrow(() => gh.mergePR(1));
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  describe('error handling', () => {
    it('throws structured error when gh CLI fails in createPR', () => {
      const errFn = mockExecError({
        message: 'gh cli failed',
        stderr: 'GraphQL: Not Found',
        status: 1,
      });

      const gh = new GitHubCLI({ _execSync: errFn });
      let thrown;
      try {
        gh.createPR({ title: 'T', body: 'B', base: 'main', head: 'h' });
      } catch (err) {
        thrown = err;
      }

      assert.ok(thrown, 'should throw an error');
      assert.ok('stderr' in thrown, 'error must have stderr field');
      assert.ok('exitCode' in thrown, 'error must have exitCode field');
      assert.ok('command' in thrown, 'error must have command field');
      assert.ok(thrown.message.length > 0, 'error must have a message');
    });

    it('throws structured error when gh CLI fails in listPRs', () => {
      const errFn = mockExecError({
        message: 'repository not found',
        stderr: 'Not Found (404)',
        status: 1,
      });

      const gh = new GitHubCLI({ _execSync: errFn });
      let thrown;
      try {
        gh.listPRs();
      } catch (err) {
        thrown = err;
      }

      assert.ok(thrown, 'should throw an error');
      assert.ok('stderr' in thrown, 'error must have stderr field');
      assert.equal(thrown.stderr, 'Not Found (404)');
      assert.equal(thrown.exitCode, 1);
    });

    it('throws structured error when gh CLI fails in commentOnPR', () => {
      const errFn = mockExecError({
        message: 'not authenticated',
        stderr: 'gh auth login required',
        status: 4,
      });

      const gh = new GitHubCLI({ _execSync: errFn });
      let thrown;
      try {
        gh.commentOnPR(1, 'hello');
      } catch (err) {
        thrown = err;
      }

      assert.ok(thrown, 'should throw an error');
      assert.equal(thrown.exitCode, 4);
      assert.ok(thrown.command.includes('gh pr comment'), 'command must be included in error');
    });

    it('throws structured error when gh CLI fails in getPRDiff', () => {
      const errFn = mockExecError({
        message: 'PR not found',
        stderr: 'no pull requests found for branch "nonexistent"',
        status: 1,
      });

      const gh = new GitHubCLI({ _execSync: errFn });
      assert.throws(
        () => gh.getPRDiff(999),
        err => {
          assert.ok('stderr' in err);
          assert.ok('exitCode' in err);
          return true;
        }
      );
    });

    it('thrown error includes the failing command', () => {
      const errFn = mockExecError({ message: 'fail', stderr: 'some error', status: 128 });
      const gh = new GitHubCLI({ _execSync: errFn });
      let thrown;
      try {
        gh.getPR(42);
      } catch (err) {
        thrown = err;
      }

      assert.ok(thrown.command.includes('gh pr view'));
      assert.ok(thrown.command.includes('42'));
    });
  });

  // -------------------------------------------------------------------------
  // _execSync injection
  // -------------------------------------------------------------------------
  describe('_execSync injection', () => {
    it('all methods use injected _execSync instead of real child_process', () => {
      let callCount = 0;
      const fn = (_cmd, _opts) => {
        callCount++;
        return '[]';
      };

      const gh = new GitHubCLI({ _execSync: fn });
      gh.listPRs();
      assert.equal(callCount, 1, '_execSync should be called once for listPRs');

      gh.listPRs({ state: 'open' });
      assert.equal(callCount, 2, '_execSync should be called again for second listPRs');
    });

    it('defaults to real execSync when _execSync not provided (module loads)', () => {
      // Just verify the constructor works without injection (no actual gh call)
      assert.doesNotThrow(() => new GitHubCLI({}));
      assert.doesNotThrow(() => new GitHubCLI());
    });
  });
});
