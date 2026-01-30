/**
 * Test Suite: Git Notes Audit Hook
 *
 * Tests the git notes audit trail functionality for tamper-proof commit metadata.
 * Follows TDD methodology: write tests FIRST, then implement hook.
 *
 * Coverage:
 * - Note attachment to commits
 * - Metadata extraction (task ID, agent name, timestamp, decision)
 * - Verification hash generation and validation
 * - CLI tool verification and reporting
 * - Integration with Bash hook trigger
 * - Edge cases (multiline messages, special chars, credentials)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Mock hook module (will be implemented)
let gitNotesAudit;

describe('Git Notes Audit Hook', () => {
  let tempDir;
  let originalCwd;

  before(() => {
    // Create temp git repo for testing
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'git-notes-test-'));
    process.chdir(tempDir);

    // Initialize git repo
    execSync('git init', { stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { stdio: 'ignore' });
    execSync('git config user.name "Test User"', { stdio: 'ignore' });

    // Create initial commit
    fs.writeFileSync('test.txt', 'initial');
    execSync('git add test.txt', { stdio: 'ignore' });
    execSync('git commit -m "Initial commit"', { stdio: 'ignore' });

    // Load hook (will fail initially until we implement it)
    try {
      gitNotesAudit = require('../.claude/hooks/audit/git-notes-audit.cjs');
    } catch (e) {
      // Expected to fail on first run (RED phase)
      gitNotesAudit = null;
    }
  });

  after(() => {
    // Cleanup
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Note Attachment', () => {
    it('attaches note to git commit', () => {
      if (!gitNotesAudit) {
        assert.fail('Hook module not loaded - implement git-notes-audit.cjs first');
      }

      // Make a commit
      fs.writeFileSync('test.txt', 'change 1');
      execSync('git add test.txt', { stdio: 'ignore' });
      execSync('git commit -m "feat: test feature"', { stdio: 'ignore' });

      const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

      // Simulate hook execution
      const context = {
        taskId: 'test-123',
        agentName: 'developer',
        timestamp: new Date().toISOString(),
        workSummary: 'Test feature implementation'
      };

      gitNotesAudit.execute(
        { command: 'git commit -m "feat: test feature"', output: `[main ${commitHash}] feat: test feature` },
        context
      );

      // Verify note exists
      const note = execSync(`git notes show ${commitHash}`, { encoding: 'utf-8' });
      assert.ok(note.includes('[TASK-test-123]'), 'Note should include task ID');
      assert.ok(note.includes('developer'), 'Note should include agent name');
    });

    it('includes task ID in note', () => {
      if (!gitNotesAudit) {
        assert.fail('Hook module not loaded');
      }

      fs.writeFileSync('test.txt', 'change 2');
      execSync('git add test.txt', { stdio: 'ignore' });
      execSync('git commit -m "fix: bug fix"', { stdio: 'ignore' });

      const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

      const context = {
        taskId: 'bug-456',
        agentName: 'developer',
        timestamp: new Date().toISOString(),
        workSummary: 'Fixed critical bug'
      };

      gitNotesAudit.execute(
        { command: 'git commit -m "fix: bug fix"', output: `[main ${commitHash}] fix: bug fix` },
        context
      );

      const note = execSync(`git notes show ${commitHash}`, { encoding: 'utf-8' });
      assert.match(note, /\[TASK-bug-456\]/, 'Note must include exact task ID');
    });

    it('includes agent name in note', () => {
      if (!gitNotesAudit) {
        assert.fail('Hook module not loaded');
      }

      fs.writeFileSync('test.txt', 'change 3');
      execSync('git add test.txt', { stdio: 'ignore' });
      execSync('git commit -m "docs: update readme"', { stdio: 'ignore' });

      const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

      const context = {
        taskId: 'doc-789',
        agentName: 'technical-writer',
        timestamp: new Date().toISOString(),
        workSummary: 'Updated documentation'
      };

      gitNotesAudit.execute(
        { command: 'git commit -m "docs: update readme"', output: `[main ${commitHash}] docs: update readme` },
        context
      );

      const note = execSync(`git notes show ${commitHash}`, { encoding: 'utf-8' });
      assert.ok(note.includes('technical-writer'), 'Note must include agent name');
    });

    it('includes timestamp in note', () => {
      if (!gitNotesAudit) {
        assert.fail('Hook module not loaded');
      }

      fs.writeFileSync('test.txt', 'change 4');
      execSync('git add test.txt', { stdio: 'ignore' });
      execSync('git commit -m "chore: cleanup"', { stdio: 'ignore' });

      const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

      const timestamp = '2026-01-29T10:30:00Z';
      const context = {
        taskId: 'chore-111',
        agentName: 'developer',
        timestamp: timestamp,
        workSummary: 'Code cleanup'
      };

      gitNotesAudit.execute(
        { command: 'git commit -m "chore: cleanup"', output: `[main ${commitHash}] chore: cleanup` },
        context
      );

      const note = execSync(`git notes show ${commitHash}`, { encoding: 'utf-8' });
      assert.match(note, /Timestamp: 2026-01-29T10:30:00Z/, 'Note must include ISO timestamp');
    });

    it('includes verification hash in note', () => {
      if (!gitNotesAudit) {
        assert.fail('Hook module not loaded');
      }

      fs.writeFileSync('test.txt', 'change 5');
      execSync('git add test.txt', { stdio: 'ignore' });
      execSync('git commit -m "test: add tests"', { stdio: 'ignore' });

      const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

      const context = {
        taskId: 'test-222',
        agentName: 'qa',
        timestamp: new Date().toISOString(),
        workSummary: 'Added test coverage'
      };

      gitNotesAudit.execute(
        { command: 'git commit -m "test: add tests"', output: `[main ${commitHash}] test: add tests` },
        context
      );

      const note = execSync(`git notes show ${commitHash}`, { encoding: 'utf-8' });
      assert.match(note, /Hash: [a-f0-9]{64}/, 'Note must include SHA-256 verification hash');
    });
  });

  describe('Verification', () => {
    it('verifies note signature', () => {
      if (!gitNotesAudit) {
        assert.fail('Hook module not loaded');
      }

      const taskId = 'verify-333';
      const commitHash = 'abc123def456';
      const timestamp = '2026-01-29T11:00:00Z';
      const agentName = 'developer';

      const expectedHash = crypto.createHash('sha256')
        .update(taskId + commitHash + timestamp + agentName)
        .digest('hex');

      const actualHash = gitNotesAudit.computeVerificationHash(taskId, commitHash, timestamp, agentName);

      assert.strictEqual(actualHash, expectedHash, 'Verification hash must match SHA-256(taskId+commitHash+timestamp+agentName)');
    });

    it('detects tampered notes', () => {
      if (!gitNotesAudit) {
        assert.fail('Hook module not loaded');
      }

      // Create a note with incorrect hash
      const note = `[TASK-tamper-444] developer
Decision: Tampered note
Timestamp: 2026-01-29T12:00:00Z
Hash: 0000000000000000000000000000000000000000000000000000000000000000`;

      const result = gitNotesAudit.verifyNote(note, 'commitHashHere');
      assert.strictEqual(result.verified, false, 'Tampered note should fail verification');
      assert.ok(result.error, 'Should include error message');
    });

    it('validates timestamp format', () => {
      if (!gitNotesAudit) {
        assert.fail('Hook module not loaded');
      }

      const validTimestamp = '2026-01-29T12:00:00Z';
      const invalidTimestamp = '29/01/2026 12:00:00';

      assert.ok(gitNotesAudit.validateTimestamp(validTimestamp), 'Should accept ISO 8601 format');
      assert.ok(!gitNotesAudit.validateTimestamp(invalidTimestamp), 'Should reject non-ISO format');
    });
  });

  describe('CLI Tool (git-notes-verify)', () => {
    it('lists all notes in commit range', () => {
      // This will be tested once CLI tool is implemented
      assert.ok(true, 'Placeholder for CLI tool test');
    });

    it('detects missing notes', () => {
      // This will be tested once CLI tool is implemented
      assert.ok(true, 'Placeholder for CLI tool test');
    });

    it('generates report', () => {
      // This will be tested once CLI tool is implemented
      assert.ok(true, 'Placeholder for CLI tool test');
    });
  });

  describe('Integration', () => {
    it('hook ignores non-commit bash commands', () => {
      if (!gitNotesAudit) {
        assert.fail('Hook module not loaded');
      }

      const result = gitNotesAudit.execute(
        { command: 'git status', output: 'On branch main' },
        { taskId: 'ignore-555', agentName: 'developer' }
      );

      // Should return result unchanged (no note attached)
      assert.deepStrictEqual(result, { command: 'git status', output: 'On branch main' });
    });

    it('hook handles commit failures gracefully', () => {
      if (!gitNotesAudit) {
        assert.fail('Hook module not loaded');
      }

      // Simulate failed commit (no hash in output)
      const result = gitNotesAudit.execute(
        { command: 'git commit -m "fail"', output: 'error: pathspec did not match any files' },
        { taskId: 'fail-666', agentName: 'developer' }
      );

      // Should return result unchanged (no crash)
      assert.ok(result, 'Hook should handle failures gracefully');
      assert.ok(!result.error, 'Should not throw errors');
    });

    it('performance <50ms per commit', async () => {
      if (!gitNotesAudit) {
        assert.fail('Hook module not loaded');
      }

      const iterations = 100;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        const context = {
          taskId: `perf-${i}`,
          agentName: 'developer',
          timestamp: new Date().toISOString(),
          workSummary: 'Performance test'
        };

        gitNotesAudit.buildAuditNote(context, 'abc123');
      }

      const elapsed = Date.now() - start;
      const avgTime = elapsed / iterations;

      assert.ok(avgTime < 50, `Average execution time ${avgTime.toFixed(2)}ms should be <50ms`);
    });
  });

  describe('Edge Cases', () => {
    it('handles commits with multiline messages', () => {
      if (!gitNotesAudit) {
        assert.fail('Hook module not loaded');
      }

      const multilineOutput = `[main abc123def] feat: multiline feature

This is a detailed commit message
with multiple lines of explanation

- bullet point 1
- bullet point 2

Co-authored-by: Someone <someone@example.com>`;

      const commitHash = gitNotesAudit.extractCommitHash(multilineOutput);
      assert.strictEqual(commitHash, 'abc123def', 'Should extract hash from multiline output');
    });

    it('handles special characters in decision text', () => {
      if (!gitNotesAudit) {
        assert.fail('Hook module not loaded');
      }

      const context = {
        taskId: 'special-777',
        agentName: 'developer',
        timestamp: new Date().toISOString(),
        workSummary: 'Fixed "quotes" and \'apostrophes\' and $pecial ch@rs'
      };

      const note = gitNotesAudit.buildAuditNote(context, 'abc123');

      // Should escape or handle special chars safely
      assert.ok(note.includes('Fixed'), 'Should preserve text content');
      assert.ok(!note.includes('\n\n'), 'Should not create malformed note structure');
    });

    it('doesn\'t leak credentials in notes', () => {
      if (!gitNotesAudit) {
        assert.fail('Hook module not loaded');
      }

      const context = {
        taskId: 'creds-888',
        agentName: 'developer',
        timestamp: new Date().toISOString(),
        workSummary: 'Updated API_KEY=sk-abc123 and PASSWORD=secret123'
      };

      const note = gitNotesAudit.buildAuditNote(context, 'abc123');

      assert.ok(!note.includes('sk-abc123'), 'Should not leak API keys');
      assert.ok(!note.includes('secret123'), 'Should not leak passwords');
      assert.ok(note.includes('[REDACTED]') || note.includes('***'), 'Should mask credentials');
    });
  });
});
