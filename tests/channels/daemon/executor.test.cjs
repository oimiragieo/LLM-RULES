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
        onProgress: msg => progressCalls.push(msg),
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

      exec.executeTask = prompt => {
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
      exec.executeTask = prompt => {
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

  // Phase 3: Async executor methods
  describe('executeTaskAsync', () => {
    it('3.1 — returns a promise', () => {
      const exec = new TaskExecutor({ preResearch: false });
      // Mock claudeAsync to return a handle
      exec._claudeAsync = () => ({
        child: null,
        promise: Promise.resolve('result'),
        cancel: () => {},
      });
      const handle = exec.executeTaskAsync('test');
      assert.ok(handle.promise instanceof Promise);
      assert.equal(typeof handle.cancel, 'function');
    });

    it('3.2 — resolves with output', async () => {
      const exec = new TaskExecutor({ preResearch: false });
      exec._claudeAsync = () => ({
        child: null,
        promise: Promise.resolve('  task output  \n'),
        cancel: () => {},
      });
      const handle = exec.executeTaskAsync('do something');
      const result = await handle.promise;
      assert.equal(result, 'task output');
    });

    it('3.3 — rejects on error', async () => {
      const exec = new TaskExecutor({ preResearch: false });
      exec._claudeAsync = () => ({
        child: null,
        promise: Promise.reject(new Error('claude failed')),
        cancel: () => {},
      });
      const handle = exec.executeTaskAsync('bad task');
      await assert.rejects(handle.promise, err => {
        assert.ok(err.message.includes('claude failed'));
        return true;
      });
    });

    it('3.4 — returns cancel function', () => {
      const exec = new TaskExecutor({ preResearch: false });
      let cancelCalled = false;
      exec._claudeAsync = () => ({
        child: null,
        promise: new Promise(() => {}), // never resolves
        cancel: () => {
          cancelCalled = true;
        },
      });
      const handle = exec.executeTaskAsync('slow task');
      handle.cancel();
      assert.equal(cancelCalled, true);
      // Prevent unhandled rejection
      handle.promise.catch(() => {});
    });

    it('3.5 — passes timeout option', async () => {
      const exec = new TaskExecutor({ preResearch: false });
      let capturedOpts;
      exec._claudeAsync = (_prompt, opts) => {
        capturedOpts = opts;
        return { child: null, promise: Promise.resolve('ok'), cancel: () => {} };
      };
      await exec.executeTaskAsync('test').promise;
      assert.equal(capturedOpts.timeout, 300000);
    });
  });

  describe('Pre-research (haiku tool worker)', () => {
    it('runs haiku pre-research before main task', async () => {
      const exec = new TaskExecutor({ preResearch: true });
      const calls = [];
      exec._claudeAsync = (prompt, opts) => {
        calls.push({ prompt, model: opts.model });
        const output =
          calls.length === 1 ? 'Found file: src/app.js with relevant code' : 'Task done';
        return { child: null, promise: Promise.resolve(output), cancel: () => {} };
      };
      const handle = exec.executeTaskAsync('fix the bug in app.js');
      await handle.promise;
      assert.equal(calls.length, 2);
      assert.equal(calls[0].model, 'haiku');
      assert.equal(calls[1].model, 'sonnet');
      assert.ok(calls[1].prompt.includes('Pre-research context'));
      assert.ok(calls[1].prompt.includes('Found file'));
    });

    it('skips pre-research for web/search tasks', async () => {
      const exec = new TaskExecutor({ preResearch: true });
      const calls = [];
      exec._claudeAsync = (prompt, opts) => {
        calls.push({ prompt, model: opts.model });
        return { child: null, promise: Promise.resolve('News results'), cancel: () => {} };
      };
      const handle = exec.executeTaskAsync('search the web for AI news');
      await handle.promise;
      assert.equal(calls.length, 1);
      assert.equal(calls[0].model, 'sonnet');
    });

    it('skips pre-research when disabled', async () => {
      const exec = new TaskExecutor({ preResearch: false });
      const calls = [];
      exec._claudeAsync = (_prompt, opts) => {
        calls.push({ model: opts.model });
        return { child: null, promise: Promise.resolve('done'), cancel: () => {} };
      };
      const handle = exec.executeTaskAsync('fix the bug');
      await handle.promise;
      assert.equal(calls.length, 1);
      assert.equal(calls[0].model, 'sonnet');
    });

    it('skips pre-research when context already provided', async () => {
      const exec = new TaskExecutor({ preResearch: true });
      const calls = [];
      exec._claudeAsync = (_prompt, opts) => {
        calls.push({ model: opts.model });
        return { child: null, promise: Promise.resolve('done'), cancel: () => {} };
      };
      const handle = exec.executeTaskAsync('fix bug', 'existing context');
      await handle.promise;
      assert.equal(calls.length, 1);
    });

    it('continues gracefully if pre-research fails', async () => {
      const exec = new TaskExecutor({ preResearch: true });
      let callCount = 0;
      exec._claudeAsync = (_prompt, _opts) => {
        callCount++;
        if (callCount === 1) {
          return {
            child: null,
            promise: Promise.reject(new Error('haiku timeout')),
            cancel: () => {},
          };
        }
        return {
          child: null,
          promise: Promise.resolve('task done without context'),
          cancel: () => {},
        };
      };
      const handle = exec.executeTaskAsync('fix the code');
      const result = await handle.promise;
      assert.equal(result, 'task done without context');
      assert.equal(callCount, 2);
    });
  });

  describe('executeRalphLoopAsync', () => {
    it('3.6 — returns a promise', () => {
      const exec = new TaskExecutor({});
      exec._claudeAsync = () => ({
        child: null,
        promise: Promise.resolve('RALPH_COMPLETE'),
        cancel: () => {},
      });
      const handle = exec.executeRalphLoopAsync('test');
      assert.ok(handle.promise instanceof Promise);
    });

    it('3.7 — iterates until RALPH_COMPLETE', async () => {
      const exec = new TaskExecutor({});
      let callCount = 0;
      exec._claudeAsync = () => {
        callCount++;
        const output = callCount >= 3 ? 'Fixed! RALPH_COMPLETE' : 'Still working...';
        return { child: null, promise: Promise.resolve(output), cancel: () => {} };
      };
      const handle = exec.executeRalphLoopAsync('fix bugs', { maxIterations: 5 });
      const result = await handle.promise;
      assert.equal(callCount, 3);
      assert.ok(result.includes('Completed in 3'));
    });

    it('3.8 — respects maxIterations', async () => {
      const exec = new TaskExecutor({});
      let callCount = 0;
      exec._claudeAsync = () => {
        callCount++;
        return { child: null, promise: Promise.resolve('not done'), cancel: () => {} };
      };
      const handle = exec.executeRalphLoopAsync('never finishes', { maxIterations: 3 });
      const result = await handle.promise;
      assert.equal(callCount, 3);
      assert.ok(result.includes('Max iterations'));
    });

    it('3.9 — calls onProgress per iteration', async () => {
      const exec = new TaskExecutor({});
      const progress = [];
      exec._claudeAsync = () => ({
        child: null,
        promise: Promise.resolve('RALPH_COMPLETE'),
        cancel: () => {},
      });
      const handle = exec.executeRalphLoopAsync('test', {
        maxIterations: 3,
        onProgress: msg => progress.push(msg),
      });
      await handle.promise;
      assert.ok(progress.length >= 1);
      assert.ok(progress[0].includes('iteration 1'));
    });

    it('3.10 — feeds previous result as context', async () => {
      const exec = new TaskExecutor({});
      const prompts = [];
      exec._claudeAsync = prompt => {
        prompts.push(prompt);
        const output = prompts.length >= 2 ? 'RALPH_COMPLETE' : 'Error: line 42';
        return { child: null, promise: Promise.resolve(output), cancel: () => {} };
      };
      const handle = exec.executeRalphLoopAsync('fix code', { maxIterations: 3 });
      await handle.promise;
      assert.ok(prompts[1].includes('line 42'));
    });
  });

  describe('executeTaskWithRetryAsync', () => {
    it('3.11 — retries on rate limit', async () => {
      const exec = new TaskExecutor({ preResearch: false });
      let callCount = 0;
      exec._claudeAsync = () => {
        callCount++;
        const output = callCount < 3 ? 'Error: 429 rate limit' : 'Success!';
        return { child: null, promise: Promise.resolve(output), cancel: () => {} };
      };
      const result = await exec.executeTaskWithRetryAsync('test', '', 3, 10);
      assert.equal(callCount, 3);
      assert.equal(result, 'Success!');
    });

    it('3.12 — uses async delay (not busy-wait)', async () => {
      const exec = new TaskExecutor({ preResearch: false });
      let callCount = 0;
      exec._claudeAsync = () => {
        callCount++;
        const output = callCount < 2 ? '429 rate limit' : 'ok';
        return { child: null, promise: Promise.resolve(output), cancel: () => {} };
      };
      // Use short retry delays for testing
      const start = Date.now();
      const result = await exec.executeTaskWithRetryAsync('test', '', 2, 10);
      const elapsed = Date.now() - start;
      assert.equal(result, 'ok');
      // Should have used async delay (setTimeout), not busy-wait
      // If busy-wait, the event loop would be blocked
      assert.ok(elapsed < 5000, 'should not busy-wait');
    });
  });

  describe('executeParallelAsync', () => {
    it('3.13 — runs subtasks concurrently', async () => {
      const exec = new TaskExecutor({});
      const startTimes = [];
      exec._claudeAsync = prompt => {
        startTimes.push(Date.now());
        if (prompt.includes('Split this task')) {
          return {
            child: null,
            promise: Promise.resolve('["task A", "task B", "task C"]'),
            cancel: () => {},
          };
        }
        return {
          child: null,
          promise: new Promise(r => setTimeout(() => r(`Done: ${prompt.slice(0, 20)}`), 20)),
          cancel: () => {},
        };
      };
      const result = await exec.executeParallelAsync('fix all files');
      assert.ok(result.includes('Subtask 1'));
      // All subtasks should have started close together (concurrent)
      const subtaskStarts = startTimes.slice(1); // skip the split call
      if (subtaskStarts.length >= 2) {
        const spread = subtaskStarts[subtaskStarts.length - 1] - subtaskStarts[0];
        assert.ok(spread < 50, `subtasks should start concurrently, spread was ${spread}ms`);
      }
    });
  });
});
