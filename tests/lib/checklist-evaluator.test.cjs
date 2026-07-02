#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('path');

const { evaluateChecklist } = require('../../.claude/lib/orchestration/checklist-evaluator.cjs');

describe('checklist-evaluator', () => {
  describe('file_exists checks', () => {
    it('passes for existing file', () => {
      const result = evaluateChecklist([
        {
          id: 'pkg',
          description: 'package.json exists',
          check_type: 'file_exists',
          check_value: path.join(process.cwd(), 'package.json'),
        },
      ]);
      assert.equal(result.passed.length, 1);
      assert.equal(result.failed.length, 0);
      assert.equal(result.halted, false);
    });

    it('fails for missing file', () => {
      const result = evaluateChecklist([
        {
          id: 'missing',
          description: 'nonexistent file',
          check_type: 'file_exists',
          check_value: '/nonexistent/file.txt',
        },
      ]);
      assert.equal(result.passed.length, 0);
      assert.equal(result.failed.length, 1);
      assert.ok(result.failed[0].message.includes('not found'));
    });
  });

  describe('grep_match checks', () => {
    it('passes when pattern found in file', () => {
      // Use package.json which has "name" field
      const result = evaluateChecklist([
        {
          id: 'name-field',
          description: 'package has name',
          check_type: 'grep_match',
          check_value: path.join(process.cwd(), 'package.json') + ':"name"',
        },
      ]);
      assert.equal(result.passed.length, 1);
    });

    it('fails when pattern not found', () => {
      const result = evaluateChecklist([
        {
          id: 'missing-pattern',
          description: 'impossible pattern',
          check_type: 'grep_match',
          check_value: path.join(process.cwd(), 'package.json') + ':ZZZYYYXXX_NONEXISTENT',
        },
      ]);
      assert.equal(result.failed.length, 1);
    });

    it('fails on invalid format (no colon)', () => {
      const result = evaluateChecklist([
        {
          id: 'bad-format',
          description: 'no colon',
          check_type: 'grep_match',
          check_value: 'no-colon-separator',
        },
      ]);
      assert.equal(result.failed.length, 1);
      assert.ok(result.failed[0].message.includes('Invalid grep_match'));
    });
  });

  describe('custom checks', () => {
    it('passes for true expression', () => {
      const result = evaluateChecklist([
        {
          id: 'true-check',
          description: 'always true',
          check_type: 'custom',
          check_value: 'true',
        },
      ]);
      assert.equal(result.passed.length, 1);
    });

    it('fails for false expression', () => {
      const result = evaluateChecklist([
        {
          id: 'false-check',
          description: 'always false',
          check_type: 'custom',
          check_value: 'false',
        },
      ]);
      assert.equal(result.failed.length, 1);
    });

    it('rejects unsafe expressions', () => {
      const result = evaluateChecklist([
        {
          id: 'unsafe',
          description: 'arbitrary code',
          check_type: 'custom',
          check_value: 'require("child_process").execSync("ls")',
        },
      ]);
      assert.equal(result.failed.length, 1);
      assert.ok(result.failed[0].message.includes('not allowed'));
    });
  });

  describe('test_passes checks', () => {
    it('runs argv-style commands without a shell', () => {
      const result = evaluateChecklist([
        {
          id: 'node-ok',
          description: 'node exits successfully',
          check_type: 'test_passes',
          check_value: {
            command: process.execPath,
            args: ['-e', 'process.exit(0)'],
          },
        },
      ]);
      assert.equal(result.passed.length, 1);
      assert.equal(result.failed.length, 0);
    });

    it('rejects legacy shell strings with metacharacters', () => {
      const marker = path.join(os.tmpdir(), `checklist-injection-${Date.now()}.txt`);
      const result = evaluateChecklist([
        {
          id: 'unsafe',
          description: 'unsafe shell string',
          check_type: 'test_passes',
          check_value: `${process.execPath} -e "process.exit(0)" && echo pwned > "${marker}"`,
        },
      ]);

      assert.equal(result.failed.length, 1);
      assert.match(result.failed[0].message, /shell metacharacters/);
      assert.equal(fs.existsSync(marker), false);
    });
  });

  describe('halt_on_fail behavior', () => {
    it('halts evaluation on critical failure', () => {
      const result = evaluateChecklist([
        {
          id: 'blocker',
          description: 'critical check',
          check_type: 'file_exists',
          check_value: path.join(os.tmpdir(), `missing-checklist-${Date.now()}-halt`),
          halt_on_fail: true,
          severity: 'critical',
        },
        {
          id: 'after-halt',
          description: 'should be skipped',
          check_type: 'custom',
          check_value: 'true',
        },
      ]);
      assert.equal(result.halted, true);
      assert.equal(result.halted_at, 'blocker');
      assert.equal(result.skipped, 1);
      assert.equal(result.failed.length, 1);
      assert.equal(result.passed.length, 0);
    });

    it('continues when non-halt item fails', () => {
      const result = evaluateChecklist([
        {
          id: 'soft-fail',
          description: 'non-critical',
          check_type: 'file_exists',
          check_value: path.join(os.tmpdir(), `missing-checklist-${Date.now()}-soft`),
          halt_on_fail: false,
          severity: 'warning',
        },
        {
          id: 'continues',
          description: 'still runs',
          check_type: 'custom',
          check_value: 'true',
        },
      ]);
      assert.equal(result.halted, false);
      assert.equal(result.skipped, 0);
      assert.equal(result.failed.length, 1);
      assert.equal(result.passed.length, 1);
    });
  });

  describe('edge cases', () => {
    it('handles empty checklist', () => {
      const result = evaluateChecklist([]);
      assert.equal(result.passed.length, 0);
      assert.equal(result.failed.length, 0);
      assert.equal(result.halted, false);
      assert.equal(result.total, 0);
    });

    it('throws on non-array input', () => {
      assert.throws(() => evaluateChecklist('not-array'), /must be an array/);
    });

    it('defaults severity to error', () => {
      const result = evaluateChecklist([
        {
          id: 'no-severity',
          description: 'test',
          check_type: 'file_exists',
          check_value: path.join(os.tmpdir(), `missing-checklist-${Date.now()}-severity`),
        },
      ]);
      assert.equal(result.failed[0].severity, 'error');
    });
  });
});
