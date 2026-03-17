'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  validateCoverage,
  parsePlanTasks,
  COVERAGE_SCORE_PERFECT,
} = require('../../.claude/lib/utils/nyquist-validator.cjs');

// Helper: write a temp plan file and return its path
function writePlan(content) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nyquist-test-'));
  const planPath = path.join(tmpDir, 'test-plan.md');
  fs.writeFileSync(planPath, content);
  return { planPath, tmpDir };
}

describe('nyquist-validator', () => {
  describe('parsePlanTasks', () => {
    it('returns empty arrays for empty file', () => {
      const { planPath, tmpDir } = writePlan('');
      try {
        const result = parsePlanTasks(planPath);
        assert.deepStrictEqual(result.tasks, []);
        assert.deepStrictEqual(result.tasksWithVerify, []);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('extracts tasks with verify fields', () => {
      const content = `
## Tasks

- [ ] Implement login endpoint
  - verify: POST /login returns 200 with valid creds
- [ ] Add password hashing
  - verify: bcrypt hash stored in DB
- [ ] Write documentation
`.trim();
      const { planPath, tmpDir } = writePlan(content);
      try {
        const result = parsePlanTasks(planPath);
        assert.strictEqual(result.tasks.length, 3);
        assert.strictEqual(result.tasksWithVerify.length, 2);
        assert.ok(result.tasksWithVerify.some(t => t.includes('login')));
        assert.ok(result.tasksWithVerify.some(t => t.includes('password')));
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('handles tasks without any verify fields', () => {
      const content = `
- [ ] Task A
- [ ] Task B
- [ ] Task C
`.trim();
      const { planPath, tmpDir } = writePlan(content);
      try {
        const result = parsePlanTasks(planPath);
        assert.strictEqual(result.tasks.length, 3);
        assert.strictEqual(result.tasksWithVerify.length, 0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('handles all tasks having verify fields', () => {
      const content = `
- [ ] Task A
  - verify: check A works
- [ ] Task B
  - verify: check B works
`.trim();
      const { planPath, tmpDir } = writePlan(content);
      try {
        const result = parsePlanTasks(planPath);
        assert.strictEqual(result.tasks.length, 2);
        assert.strictEqual(result.tasksWithVerify.length, 2);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('handles verify field with colon variations', () => {
      const content = `
- [ ] Task A
  - verify: something
- [ ] Task B
  - **verify**: something else
- [ ] Task C
`.trim();
      const { planPath, tmpDir } = writePlan(content);
      try {
        const result = parsePlanTasks(planPath);
        assert.strictEqual(result.tasks.length, 3);
        // At minimum the plain verify: must be recognized
        assert.ok(result.tasksWithVerify.length >= 1);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('throws for non-existent file', () => {
      assert.throws(
        () => parsePlanTasks('/nonexistent/plan.md'),
        err => {
          assert.ok(err instanceof Error);
          return true;
        }
      );
    });
  });

  describe('validateCoverage', () => {
    it('returns score 0 for plan with no verify fields', () => {
      const content = `
- [ ] Task A
- [ ] Task B
`.trim();
      const { planPath, tmpDir } = writePlan(content);
      try {
        const result = validateCoverage(planPath);
        assert.strictEqual(result.coverageScore, 0);
        assert.strictEqual(result.uncoveredTasks.length, 2);
        assert.ok(result.totalTasks === 2);
        assert.ok(result.coveredTasks === 0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('returns score 1 for fully covered plan', () => {
      const content = `
- [ ] Task A
  - verify: check A
- [ ] Task B
  - verify: check B
`.trim();
      const { planPath, tmpDir } = writePlan(content);
      try {
        const result = validateCoverage(planPath);
        assert.strictEqual(result.coverageScore, 1);
        assert.strictEqual(result.uncoveredTasks.length, 0);
        assert.strictEqual(result.totalTasks, 2);
        assert.strictEqual(result.coveredTasks, 2);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('returns fractional score for partial coverage', () => {
      const content = `
- [ ] Task A
  - verify: check A
- [ ] Task B
- [ ] Task C
`.trim();
      const { planPath, tmpDir } = writePlan(content);
      try {
        const result = validateCoverage(planPath);
        // 1 covered out of 3 = 0.333...
        assert.ok(Math.abs(result.coverageScore - 1 / 3) < 0.001);
        assert.strictEqual(result.uncoveredTasks.length, 2);
        assert.strictEqual(result.coveredTasks, 1);
        assert.strictEqual(result.totalTasks, 3);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('returns score 1 and empty uncoveredTasks for empty plan', () => {
      const content = '';
      const { planPath, tmpDir } = writePlan(content);
      try {
        const result = validateCoverage(planPath);
        assert.strictEqual(result.coverageScore, COVERAGE_SCORE_PERFECT);
        assert.deepStrictEqual(result.uncoveredTasks, []);
        assert.strictEqual(result.totalTasks, 0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('result shape includes all required fields', () => {
      const content = `- [ ] Task A\n  - verify: check A\n`;
      const { planPath, tmpDir } = writePlan(content);
      try {
        const result = validateCoverage(planPath);
        assert.ok('coverageScore' in result, 'missing coverageScore');
        assert.ok('uncoveredTasks' in result, 'missing uncoveredTasks');
        assert.ok('totalTasks' in result, 'missing totalTasks');
        assert.ok('coveredTasks' in result, 'missing coveredTasks');
        assert.ok(Array.isArray(result.uncoveredTasks), 'uncoveredTasks not array');
        assert.ok(typeof result.coverageScore === 'number', 'coverageScore not number');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('uncoveredTasks contains task descriptions for uncovered tasks', () => {
      const content = `
- [ ] Implement authentication
  - verify: JWT token returned on login
- [ ] Write migration script
- [ ] Update API docs
`.trim();
      const { planPath, tmpDir } = writePlan(content);
      try {
        const result = validateCoverage(planPath);
        assert.strictEqual(result.uncoveredTasks.length, 2);
        assert.ok(
          result.uncoveredTasks.some(t => t.includes('migration')),
          `Expected "migration" in uncovered: ${JSON.stringify(result.uncoveredTasks)}`
        );
        assert.ok(
          result.uncoveredTasks.some(t => t.includes('docs') || t.includes('API')),
          `Expected docs in uncovered: ${JSON.stringify(result.uncoveredTasks)}`
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('COVERAGE_SCORE_PERFECT', () => {
    it('is 1', () => {
      assert.strictEqual(COVERAGE_SCORE_PERFECT, 1);
    });
  });
});
