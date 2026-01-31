#!/usr/bin/env node
/**
 * Process Validators Test Suite
 * ==============================
 *
 * TDD tests for process-validators.cjs.
 * Tests cover pkill, kill, and killall validation.
 *
 * Exit codes: All validators return {valid: boolean, error: string}
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

// Import the module under test
const processValidators = require('../../.claude/hooks/safety/validators/process-validators.cjs');

describe('process-validators', () => {
  describe('module exports', () => {
    it('should export ALLOWED_PROCESS_NAMES constant', () => {
      assert.ok(processValidators.ALLOWED_PROCESS_NAMES instanceof Set);
      assert.ok(processValidators.ALLOWED_PROCESS_NAMES.has('node'));
      assert.ok(processValidators.ALLOWED_PROCESS_NAMES.has('python'));
    });

    it('should export validatePkillCommand function', () => {
      assert.strictEqual(typeof processValidators.validatePkillCommand, 'function');
    });

    it('should export validateKillCommand function', () => {
      assert.strictEqual(typeof processValidators.validateKillCommand, 'function');
    });

    it('should export validateKillallCommand function', () => {
      assert.strictEqual(typeof processValidators.validateKillallCommand, 'function');
    });
  });

  describe('ALLOWED_PROCESS_NAMES', () => {
    describe('Node.js ecosystem', () => {
      it('should include node', () => {
        assert.ok(processValidators.ALLOWED_PROCESS_NAMES.has('node'));
      });

      it('should include npm', () => {
        assert.ok(processValidators.ALLOWED_PROCESS_NAMES.has('npm'));
      });

      it('should include yarn', () => {
        assert.ok(processValidators.ALLOWED_PROCESS_NAMES.has('yarn'));
      });

      it('should include pnpm', () => {
        assert.ok(processValidators.ALLOWED_PROCESS_NAMES.has('pnpm'));
      });

      it('should include vite', () => {
        assert.ok(processValidators.ALLOWED_PROCESS_NAMES.has('vite'));
      });
    });

    describe('Python ecosystem', () => {
      it('should include python', () => {
        assert.ok(processValidators.ALLOWED_PROCESS_NAMES.has('python'));
      });

      it('should include python3', () => {
        assert.ok(processValidators.ALLOWED_PROCESS_NAMES.has('python3'));
      });

      it('should include uvicorn', () => {
        assert.ok(processValidators.ALLOWED_PROCESS_NAMES.has('uvicorn'));
      });

      it('should include gunicorn', () => {
        assert.ok(processValidators.ALLOWED_PROCESS_NAMES.has('gunicorn'));
      });
    });

    describe('Other languages', () => {
      it('should include cargo', () => {
        assert.ok(processValidators.ALLOWED_PROCESS_NAMES.has('cargo'));
      });

      it('should include go', () => {
        assert.ok(processValidators.ALLOWED_PROCESS_NAMES.has('go'));
      });

      it('should include ruby', () => {
        assert.ok(processValidators.ALLOWED_PROCESS_NAMES.has('ruby'));
      });
    });
  });

  describe('validatePkillCommand', () => {
    describe('allowed processes', () => {
      it('should allow pkill node', () => {
        const result = processValidators.validatePkillCommand('pkill node');
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.error, '');
      });

      it('should allow pkill python', () => {
        const result = processValidators.validatePkillCommand('pkill python');
        assert.strictEqual(result.valid, true);
      });

      it('should allow pkill with -f flag for node', () => {
        const result = processValidators.validatePkillCommand('pkill -f node');
        assert.strictEqual(result.valid, true);
      });

      it('should allow pkill vite', () => {
        const result = processValidators.validatePkillCommand('pkill vite');
        assert.strictEqual(result.valid, true);
      });

      it('should allow pkill next', () => {
        const result = processValidators.validatePkillCommand('pkill next');
        assert.strictEqual(result.valid, true);
      });

      it('should allow pkill cargo', () => {
        const result = processValidators.validatePkillCommand('pkill cargo');
        assert.strictEqual(result.valid, true);
      });

      it('should allow pkill postgres', () => {
        const result = processValidators.validatePkillCommand('pkill postgres');
        assert.strictEqual(result.valid, true);
      });

      it('should allow pkill redis-server', () => {
        const result = processValidators.validatePkillCommand('pkill redis-server');
        assert.strictEqual(result.valid, true);
      });
    });

    describe('blocked processes', () => {
      it('should block pkill bash', () => {
        const result = processValidators.validatePkillCommand('pkill bash');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('dev processes'));
      });

      it('should block pkill sshd', () => {
        const result = processValidators.validatePkillCommand('pkill sshd');
        assert.strictEqual(result.valid, false);
      });

      it('should block pkill systemd', () => {
        const result = processValidators.validatePkillCommand('pkill systemd');
        assert.strictEqual(result.valid, false);
      });

      it('should block pkill init', () => {
        const result = processValidators.validatePkillCommand('pkill init');
        assert.strictEqual(result.valid, false);
      });

      it('should block pkill explorer', () => {
        const result = processValidators.validatePkillCommand('pkill explorer');
        assert.strictEqual(result.valid, false);
      });

      it('should block pkill finder', () => {
        const result = processValidators.validatePkillCommand('pkill finder');
        assert.strictEqual(result.valid, false);
      });
    });

    describe('edge cases', () => {
      it('should require process name', () => {
        const result = processValidators.validatePkillCommand('pkill -9');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('requires a process name'));
      });

      it('should handle empty command', () => {
        const result = processValidators.validatePkillCommand('');
        assert.strictEqual(result.valid, false);
      });

      it('should handle unclosed quotes', () => {
        const result = processValidators.validatePkillCommand('pkill "node');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('Could not parse'));
      });

      it('should handle process with flags', () => {
        const result = processValidators.validatePkillCommand('pkill -9 -f node');
        assert.strictEqual(result.valid, true);
      });
    });
  });

  describe('validateKillCommand', () => {
    describe('allowed operations', () => {
      it('should allow kill with PID', () => {
        const result = processValidators.validateKillCommand('kill 12345');
        assert.strictEqual(result.valid, true);
      });

      it('should allow kill -9 with PID', () => {
        const result = processValidators.validateKillCommand('kill -9 12345');
        assert.strictEqual(result.valid, true);
      });

      it('should allow kill -SIGTERM with PID', () => {
        const result = processValidators.validateKillCommand('kill -SIGTERM 12345');
        assert.strictEqual(result.valid, true);
      });

      it('should allow kill multiple PIDs', () => {
        const result = processValidators.validateKillCommand('kill 12345 67890');
        assert.strictEqual(result.valid, true);
      });
    });

    describe('blocked operations', () => {
      it('should block kill -1 (all processes)', () => {
        const result = processValidators.validateKillCommand('kill -1');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('all processes'));
      });

      it('should block kill 0 (process group)', () => {
        const result = processValidators.validateKillCommand('kill 0');
        assert.strictEqual(result.valid, false);
      });

      it('should block kill -0 (signal check all)', () => {
        const result = processValidators.validateKillCommand('kill -0');
        assert.strictEqual(result.valid, false);
      });

      it('should block kill -9 -1', () => {
        const result = processValidators.validateKillCommand('kill -9 -1');
        assert.strictEqual(result.valid, false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty command (allows by default)', () => {
        // Note: Empty command has no dangerous patterns, so it passes
        // The validator only blocks specific dangerous patterns (-1, 0, -0)
        const result = processValidators.validateKillCommand('');
        assert.strictEqual(result.valid, true);
      });

      it('should handle unclosed quotes', () => {
        const result = processValidators.validateKillCommand('kill "12345');
        assert.strictEqual(result.valid, false);
      });
    });
  });

  describe('validateKillallCommand', () => {
    describe('allowed processes', () => {
      it('should allow killall node', () => {
        const result = processValidators.validateKillallCommand('killall node');
        assert.strictEqual(result.valid, true);
      });

      it('should allow killall python', () => {
        const result = processValidators.validateKillallCommand('killall python');
        assert.strictEqual(result.valid, true);
      });
    });

    describe('blocked processes', () => {
      it('should block killall bash', () => {
        const result = processValidators.validateKillallCommand('killall bash');
        assert.strictEqual(result.valid, false);
      });

      it('should block killall sshd', () => {
        const result = processValidators.validateKillallCommand('killall sshd');
        assert.strictEqual(result.valid, false);
      });
    });

    describe('edge cases', () => {
      it('should require process name', () => {
        const result = processValidators.validateKillallCommand('killall -9');
        assert.strictEqual(result.valid, false);
      });
    });
  });
});
