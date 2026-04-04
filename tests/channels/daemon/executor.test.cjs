'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { TaskExecutor } = require('../../../scripts/channels/daemon/executor.cjs');

describe('TaskExecutor', () => {
  it('module loads without error', () => {
    assert.ok(TaskExecutor);
  });

  it('constructor accepts config', () => {
    const exec = new TaskExecutor({ model: 'sonnet', projectRoot: '/tmp' });
    assert.equal(exec.model, 'sonnet');
    assert.equal(exec.projectRoot, '/tmp');
  });

  describe('executeRalphLoop', () => {
    it('method exists', () => {
      const exec = new TaskExecutor({});
      assert.equal(typeof exec.executeRalphLoop, 'function');
    });

    it('calls onProgress for each iteration', () => {
      const exec = new TaskExecutor({ model: 'sonnet' });
      const progressCalls = [];

      // Mock executeTask to return RALPH_COMPLETE on first try
      exec.executeTask = () => 'All done. RALPH_COMPLETE';

      const result = exec.executeRalphLoop('test task', {
        maxIterations: 3,
        onProgress: (msg) => progressCalls.push(msg),
      });

      assert.ok(progressCalls.length >= 1);
      assert.ok(progressCalls[0].includes('iteration 1'));
      assert.ok(result.includes('Completed in 1'));
    });

    it('loops until RALPH_COMPLETE signal', () => {
      const exec = new TaskExecutor({ model: 'sonnet' });
      let callCount = 0;

      exec.executeTask = () => {
        callCount++;
        if (callCount >= 3) return 'Fixed everything. RALPH_COMPLETE';
        return 'Still has errors, working on it...';
      };

      const result = exec.executeRalphLoop('fix bugs', { maxIterations: 5 });
      assert.equal(callCount, 3);
      assert.ok(result.includes('Completed in 3'));
    });

    it('stops at max iterations', () => {
      const exec = new TaskExecutor({ model: 'sonnet' });
      let callCount = 0;

      exec.executeTask = () => {
        callCount++;
        return 'Still not done...';
      };

      const result = exec.executeRalphLoop('never finishes', { maxIterations: 3 });
      assert.equal(callCount, 3);
      assert.ok(result.includes('Max iterations'));
    });

    it('passes previous result as context to next iteration', () => {
      const exec = new TaskExecutor({ model: 'sonnet' });
      const prompts = [];

      exec.executeTask = (prompt) => {
        prompts.push(prompt);
        if (prompts.length >= 2) return 'RALPH_COMPLETE';
        return 'Error: missing semicolon on line 42';
      };

      exec.executeRalphLoop('fix code', { maxIterations: 3 });
      assert.ok(prompts[1].includes('missing semicolon'));
      assert.ok(prompts[1].includes('Continue working'));
    });
  });

  describe('sendToRouter', () => {
    it('method exists', () => {
      const exec = new TaskExecutor({});
      assert.equal(typeof exec.sendToRouter, 'function');
    });
  });

  describe('isRouterAvailable', () => {
    it('method exists', () => {
      const exec = new TaskExecutor({});
      assert.equal(typeof exec.isRouterAvailable, 'function');
    });
  });

  describe('executeParallel (ultrawork)', () => {
    it('method exists', () => {
      const exec = new TaskExecutor({});
      assert.equal(typeof exec.executeParallel, 'function');
    });

    it('runs subtasks when split succeeds', async () => {
      const exec = new TaskExecutor({});
      let callCount = 0;
      exec.executeTask = (prompt) => {
        callCount++;
        if (prompt.includes('Split this task')) return '["fix file A", "fix file B"]';
        return `Fixed: ${prompt.slice(0, 30)}`;
      };
      const result = await exec.executeParallel('fix all files');
      assert.ok(callCount >= 3); // 1 split + 2 subtasks
      assert.ok(result.includes('Subtask 1'));
    });

    it('falls back to sequential when split fails', async () => {
      const exec = new TaskExecutor({});
      exec.executeTask = () => 'Single result';
      const result = await exec.executeParallel('simple task');
      assert.equal(result, 'Single result');
    });
  });

  describe('Rate limit handling', () => {
    it('_isRateLimitError detects rate limits', () => {
      const exec = new TaskExecutor({});
      assert.equal(exec._isRateLimitError('Error: 429 rate limit exceeded'), true);
      assert.equal(exec._isRateLimitError('too many requests'), true);
      assert.equal(exec._isRateLimitError('Extra usage is required'), true);
      assert.equal(exec._isRateLimitError('All tests pass'), false);
      assert.equal(exec._isRateLimitError(null), false);
    });

    it('executeTaskWithRetry returns on success', () => {
      const exec = new TaskExecutor({});
      exec.executeTask = () => 'Success!';
      const result = exec.executeTaskWithRetry('test', '', 1);
      assert.equal(result, 'Success!');
    });
  });
});
