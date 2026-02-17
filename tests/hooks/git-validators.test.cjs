#!/usr/bin/env node
/**
 * Git Validators Test Suite
 * ==========================
 *
 * TDD tests for git-validators.cjs.
 * Tests cover git config, push, and inline config validation.
 *
 * Exit codes: All validators return {valid: boolean, error: string}
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

// Import the module under test
const gitValidators = require('../../.claude/hooks/safety/validators/git-validators.cjs');

describe('git-validators', () => {
  describe('module exports', () => {
    it('should export BLOCKED_GIT_CONFIG_KEYS constant', () => {
      assert.ok(gitValidators.BLOCKED_GIT_CONFIG_KEYS instanceof Set);
      assert.ok(gitValidators.BLOCKED_GIT_CONFIG_KEYS.has('user.name'));
      assert.ok(gitValidators.BLOCKED_GIT_CONFIG_KEYS.has('user.email'));
    });

    it('should export PROTECTED_BRANCHES constant', () => {
      assert.ok(gitValidators.PROTECTED_BRANCHES instanceof Set);
      assert.ok(gitValidators.PROTECTED_BRANCHES.has('main'));
      assert.ok(gitValidators.PROTECTED_BRANCHES.has('master'));
    });

    it('should export validateGitConfig function', () => {
      assert.strictEqual(typeof gitValidators.validateGitConfig, 'function');
    });

    it('should export validateGitInlineConfig function', () => {
      assert.strictEqual(typeof gitValidators.validateGitInlineConfig, 'function');
    });

    it('should export validateGitPush function', () => {
      assert.strictEqual(typeof gitValidators.validateGitPush, 'function');
    });

    it('should export validateGitCommand function', () => {
      assert.strictEqual(typeof gitValidators.validateGitCommand, 'function');
    });
  });

  describe('validateGitConfig', () => {
    describe('blocked identity changes', () => {
      it('should block user.name config', () => {
        const result = gitValidators.validateGitConfig('git config user.name "Test User"');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('BLOCKED'));
        assert.ok(result.error.includes('user.name'));
      });

      it('should block user.email config', () => {
        const result = gitValidators.validateGitConfig('git config user.email test@test.com');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('user.email'));
      });

      it('should block author.name config', () => {
        const result = gitValidators.validateGitConfig('git config author.name "Author"');
        assert.strictEqual(result.valid, false);
      });

      it('should block committer.email config', () => {
        const result = gitValidators.validateGitConfig(
          'git config committer.email test@example.com'
        );
        assert.strictEqual(result.valid, false);
      });

      it('should block --global user.name', () => {
        const result = gitValidators.validateGitConfig('git config --global user.name "Test"');
        assert.strictEqual(result.valid, false);
      });

      it('should block --local user.email', () => {
        const result = gitValidators.validateGitConfig(
          'git config --local user.email test@test.com'
        );
        assert.strictEqual(result.valid, false);
      });
    });

    describe('allowed operations', () => {
      it('should allow reading config with --get', () => {
        const result = gitValidators.validateGitConfig('git config --get user.name');
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.error, '');
      });

      it('should allow reading config with --list', () => {
        const result = gitValidators.validateGitConfig('git config --list');
        assert.strictEqual(result.valid, true);
      });

      it('should allow reading config with -l', () => {
        const result = gitValidators.validateGitConfig('git config -l');
        assert.strictEqual(result.valid, true);
      });

      it('should allow setting non-identity config', () => {
        const result = gitValidators.validateGitConfig('git config core.autocrlf true');
        assert.strictEqual(result.valid, true);
      });

      it('should allow setting push.default', () => {
        const result = gitValidators.validateGitConfig('git config push.default current');
        assert.strictEqual(result.valid, true);
      });

      it('should allow non-config git commands', () => {
        const result = gitValidators.validateGitConfig('git status');
        assert.strictEqual(result.valid, true);
      });
    });

    describe('edge cases', () => {
      it('should handle quoted values', () => {
        const result = gitValidators.validateGitConfig('git config user.name "John Doe"');
        assert.strictEqual(result.valid, false);
      });

      it('should handle unclosed quotes', () => {
        const result = gitValidators.validateGitConfig('git config user.name "John');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('Could not parse'));
      });

      it('should handle case insensitivity', () => {
        const result = gitValidators.validateGitConfig('git config USER.NAME "Test"');
        assert.strictEqual(result.valid, false);
      });
    });
  });

  describe('validateGitInlineConfig', () => {
    it('should block -c user.name inline config', () => {
      const tokens = ['git', '-c', 'user.name=Test', 'commit', '-m', 'msg'];
      const result = gitValidators.validateGitInlineConfig(tokens);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('-c flag'));
    });

    it('should block -cuser.email=test format', () => {
      const tokens = ['git', '-cuser.email=test@test.com', 'commit', '-m', 'msg'];
      const result = gitValidators.validateGitInlineConfig(tokens);
      assert.strictEqual(result.valid, false);
    });

    it('should allow non-identity -c flags', () => {
      const tokens = ['git', '-c', 'core.autocrlf=true', 'clone', 'url'];
      const result = gitValidators.validateGitInlineConfig(tokens);
      assert.strictEqual(result.valid, true);
    });

    it('should allow commands without -c', () => {
      const tokens = ['git', 'status'];
      const result = gitValidators.validateGitInlineConfig(tokens);
      assert.strictEqual(result.valid, true);
    });
  });

  describe('validateGitPush', () => {
    describe('force push blocking', () => {
      it('should block force push to main', () => {
        const result = gitValidators.validateGitPush('git push -f origin main');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('main'));
      });

      it('should block --force push to master', () => {
        const result = gitValidators.validateGitPush('git push --force origin master');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('master'));
      });

      it('should block force-with-lease to develop', () => {
        const result = gitValidators.validateGitPush('git push --force-with-lease origin develop');
        assert.strictEqual(result.valid, false);
      });

      it('should block force push to production', () => {
        const result = gitValidators.validateGitPush('git push -f origin production');
        assert.strictEqual(result.valid, false);
      });

      it('should block force push to staging', () => {
        const result = gitValidators.validateGitPush('git push -f origin staging');
        assert.strictEqual(result.valid, false);
      });

      it('should block force push to release', () => {
        const result = gitValidators.validateGitPush('git push -f origin release');
        assert.strictEqual(result.valid, false);
      });
    });

    describe('allowed operations', () => {
      it('should allow normal push to main', () => {
        const result = gitValidators.validateGitPush('git push origin main');
        assert.strictEqual(result.valid, true);
      });

      it('should allow force push to feature branch', () => {
        const result = gitValidators.validateGitPush('git push -f origin feature/my-feature');
        assert.strictEqual(result.valid, true);
      });

      it('should allow force push to personal branch', () => {
        const result = gitValidators.validateGitPush('git push --force origin my-branch');
        assert.strictEqual(result.valid, true);
      });

      it('should allow normal push without branch', () => {
        const result = gitValidators.validateGitPush('git push');
        assert.strictEqual(result.valid, true);
      });

      it('should allow push with upstream tracking', () => {
        const result = gitValidators.validateGitPush('git push -u origin feature');
        assert.strictEqual(result.valid, true);
      });
    });

    describe('edge cases', () => {
      it('should handle non-push commands', () => {
        const result = gitValidators.validateGitPush('git pull origin main');
        assert.strictEqual(result.valid, true);
      });

      it('should handle malformed commands', () => {
        const result = gitValidators.validateGitPush('git push "unclosed');
        // parseCommand returns null for unclosed quotes, which causes "Could not parse git command"
        assert.strictEqual(result.valid, false);
        assert.ok(
          result.error.includes('Could not parse'),
          `Expected error to contain 'Could not parse', got: ${result.error}`
        );
      });
    });
  });

  describe('validateGitCommand (unified)', () => {
    it('should validate git config commands', () => {
      const result = gitValidators.validateGitCommand('git config user.name "Test"');
      assert.strictEqual(result.valid, false);
    });

    it('should validate git push commands', () => {
      const result = gitValidators.validateGitCommand('git push -f origin main');
      assert.strictEqual(result.valid, false);
    });

    it('should validate -c inline config on any command', () => {
      const result = gitValidators.validateGitCommand(
        'git -c user.email=test@test.com commit -m "test"'
      );
      assert.strictEqual(result.valid, false);
    });

    it('should allow safe git commands', () => {
      const result = gitValidators.validateGitCommand('git status');
      assert.strictEqual(result.valid, true);
    });

    it('should allow git log', () => {
      const result = gitValidators.validateGitCommand('git log --oneline -10');
      assert.strictEqual(result.valid, true);
    });

    it('should allow git diff', () => {
      const result = gitValidators.validateGitCommand('git diff HEAD~1');
      assert.strictEqual(result.valid, true);
    });

    it('should allow git add', () => {
      const result = gitValidators.validateGitCommand('git add .');
      assert.strictEqual(result.valid, true);
    });

    it('should allow git commit', () => {
      const result = gitValidators.validateGitCommand('git commit -m "message"');
      assert.strictEqual(result.valid, true);
    });

    it('should handle non-git commands', () => {
      const result = gitValidators.validateGitCommand('npm install');
      assert.strictEqual(result.valid, true);
    });

    it('should handle empty git command', () => {
      const result = gitValidators.validateGitCommand('git');
      assert.strictEqual(result.valid, true);
    });

    it('should block destructive checkout reset of fixtures directory', () => {
      const result = gitValidators.validateGitCommand('git checkout HEAD -- tests/fixtures/');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('BLOCKED'));
      assert.ok(result.error.includes('tests/fixtures'));
    });

    it('should block destructive checkout reset of runtime context memory files', () => {
      const result = gitValidators.validateGitCommand(
        'git checkout HEAD -- .claude/context/memory/delegations.json .claude/context/memory/codebase_map.json'
      );
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('BLOCKED'));
      assert.ok(result.error.includes('.claude/context/memory'));
    });

    it('should allow checkout of regular source file', () => {
      const result = gitValidators.validateGitCommand(
        'git checkout HEAD -- .claude/hooks/safety/bash-pretool-bundle.cjs'
      );
      assert.strictEqual(result.valid, true);
    });
  });
});
