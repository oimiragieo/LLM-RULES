#!/usr/bin/env node
/**
 * Filesystem Validators Test Suite
 * =================================
 *
 * TDD tests for filesystem-validators.cjs.
 * Tests cover chmod, rm, and init script validation.
 *
 * Exit codes: All validators return {valid: boolean, error: string}
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

// Import the module under test
const fsValidators = require('../../.claude/hooks/safety/validators/filesystem-validators.cjs');

describe('filesystem-validators', () => {
  describe('module exports', () => {
    it('should export SAFE_CHMOD_MODES constant', () => {
      assert.ok(fsValidators.SAFE_CHMOD_MODES instanceof Set);
      assert.ok(fsValidators.SAFE_CHMOD_MODES.has('755'));
      assert.ok(fsValidators.SAFE_CHMOD_MODES.has('644'));
      assert.ok(fsValidators.SAFE_CHMOD_MODES.has('+x'));
    });

    it('should export DANGEROUS_RM_PATTERNS constant', () => {
      assert.ok(Array.isArray(fsValidators.DANGEROUS_RM_PATTERNS));
      assert.ok(fsValidators.DANGEROUS_RM_PATTERNS.length > 0);
    });

    it('should export containsPathTraversal function', () => {
      assert.strictEqual(typeof fsValidators.containsPathTraversal, 'function');
    });

    it('should export validateChmodCommand function', () => {
      assert.strictEqual(typeof fsValidators.validateChmodCommand, 'function');
    });

    it('should export validateRmCommand function', () => {
      assert.strictEqual(typeof fsValidators.validateRmCommand, 'function');
    });

    it('should export validateInitScript function', () => {
      assert.strictEqual(typeof fsValidators.validateInitScript, 'function');
    });
  });

  describe('containsPathTraversal', () => {
    it('should detect ../ pattern', () => {
      assert.strictEqual(fsValidators.containsPathTraversal('../etc/passwd'), true);
    });

    it('should detect ..\\ pattern', () => {
      assert.strictEqual(fsValidators.containsPathTraversal('..\\Windows\\System32'), true);
    });

    it('should detect .. alone', () => {
      assert.strictEqual(fsValidators.containsPathTraversal('..'), true);
    });

    it('should allow normal paths', () => {
      assert.strictEqual(fsValidators.containsPathTraversal('src/index.js'), false);
    });

    it('should allow paths with dots in filenames', () => {
      assert.strictEqual(fsValidators.containsPathTraversal('file.test.js'), false);
    });
  });

  describe('validateChmodCommand', () => {
    describe('safe modes', () => {
      it('should allow chmod +x', () => {
        const result = fsValidators.validateChmodCommand('chmod +x script.sh');
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.error, '');
      });

      it('should allow chmod 755', () => {
        const result = fsValidators.validateChmodCommand('chmod 755 script.sh');
        assert.strictEqual(result.valid, true);
      });

      it('should allow chmod 644', () => {
        const result = fsValidators.validateChmodCommand('chmod 644 file.txt');
        assert.strictEqual(result.valid, true);
      });

      it('should allow chmod 700', () => {
        const result = fsValidators.validateChmodCommand('chmod 700 script.sh');
        assert.strictEqual(result.valid, true);
      });

      it('should allow chmod u+x', () => {
        const result = fsValidators.validateChmodCommand('chmod u+x script.sh');
        assert.strictEqual(result.valid, true);
      });

      it('should allow chmod a+x', () => {
        const result = fsValidators.validateChmodCommand('chmod a+x script.sh');
        assert.strictEqual(result.valid, true);
      });

      it('should allow chmod -R +x', () => {
        const result = fsValidators.validateChmodCommand('chmod -R +x scripts/');
        assert.strictEqual(result.valid, true);
      });

      it('should allow chmod --recursive 755', () => {
        const result = fsValidators.validateChmodCommand('chmod --recursive 755 bin/');
        assert.strictEqual(result.valid, true);
      });
    });

    describe('unsafe modes', () => {
      it('should block chmod 777', () => {
        const result = fsValidators.validateChmodCommand('chmod 777 file.txt');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('executable modes'));
      });

      it('should block chmod 000', () => {
        const result = fsValidators.validateChmodCommand('chmod 000 file.txt');
        assert.strictEqual(result.valid, false);
      });

      it('should block chmod -w', () => {
        const result = fsValidators.validateChmodCommand('chmod -w file.txt');
        assert.strictEqual(result.valid, false);
      });

      it('should block chmod o+w', () => {
        const result = fsValidators.validateChmodCommand('chmod o+w file.txt');
        assert.strictEqual(result.valid, false);
      });
    });

    describe('edge cases', () => {
      it('should reject non-chmod commands', () => {
        const result = fsValidators.validateChmodCommand('chown user file.txt');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('Not a chmod'));
      });

      it('should require a mode', () => {
        const result = fsValidators.validateChmodCommand('chmod');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('requires a mode'));
      });

      it('should require at least one file', () => {
        const result = fsValidators.validateChmodCommand('chmod 755');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('requires at least one file'));
      });

      it('should handle multiple files', () => {
        const result = fsValidators.validateChmodCommand('chmod 755 file1.sh file2.sh');
        assert.strictEqual(result.valid, true);
      });

      it('should handle unclosed quotes', () => {
        const result = fsValidators.validateChmodCommand('chmod 755 "file');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('Could not parse'));
      });

      it('should block unknown flags', () => {
        const result = fsValidators.validateChmodCommand('chmod --verbose 755 file.txt');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('flag'));
      });
    });
  });

  describe('validateRmCommand', () => {
    describe('dangerous targets', () => {
      it('should block rm /', () => {
        const result = fsValidators.validateRmCommand('rm -rf /');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('not allowed'));
      });

      it('should block rm /*', () => {
        const result = fsValidators.validateRmCommand('rm -rf /*');
        assert.strictEqual(result.valid, false);
      });

      it('should block rm ..', () => {
        const result = fsValidators.validateRmCommand('rm -rf ..');
        assert.strictEqual(result.valid, false);
      });

      it('should block rm ~', () => {
        const result = fsValidators.validateRmCommand('rm -rf ~');
        assert.strictEqual(result.valid, false);
      });

      it('should block rm *', () => {
        const result = fsValidators.validateRmCommand('rm -rf *');
        assert.strictEqual(result.valid, false);
      });

      it('should block rm /home', () => {
        const result = fsValidators.validateRmCommand('rm -rf /home');
        assert.strictEqual(result.valid, false);
      });

      it('should block rm /etc', () => {
        const result = fsValidators.validateRmCommand('rm -rf /etc');
        assert.strictEqual(result.valid, false);
      });

      it('should block rm /usr', () => {
        const result = fsValidators.validateRmCommand('rm -rf /usr');
        assert.strictEqual(result.valid, false);
      });

      it('should block rm C:\\Windows', () => {
        // The regex /^C:\\Windows/i works because \W is a regex metacharacter
        // matching any non-word character, and backslash is a non-word char
        const result = fsValidators.validateRmCommand('rm -rf C:\\Windows');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('not allowed'));
      });

      it('should block rm C:\\Windows\\System32', () => {
        // Verify paths starting with C:\Windows are blocked
        const result = fsValidators.validateRmCommand('rm -rf C:\\Windows\\System32');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('not allowed'));
      });

      it('should block rm C:\\Program Files', () => {
        // Quoted path with space
        const result = fsValidators.validateRmCommand('rm -rf "C:\\Program Files"');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('not allowed'));
      });

      it('should block rm C:\\Users', () => {
        // Exact match for C:\Users
        const result = fsValidators.validateRmCommand('rm -rf C:\\Users');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('not allowed'));
      });

      it('should block rm C:\\System32', () => {
        // Direct System32 path
        const result = fsValidators.validateRmCommand('rm -rf C:\\System32');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('not allowed'));
      });

      it('should block rm C:\\ProgramData', () => {
        // ProgramData directory
        const result = fsValidators.validateRmCommand('rm -rf C:\\ProgramData');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('not allowed'));
      });

      it('should be case-insensitive for Windows paths', () => {
        // Windows paths should be blocked regardless of case
        const result1 = fsValidators.validateRmCommand('rm -rf c:\\windows');
        const result2 = fsValidators.validateRmCommand('rm -rf C:\\WINDOWS');
        const result3 = fsValidators.validateRmCommand('rm -rf c:\\Windows');
        assert.strictEqual(result1.valid, false);
        assert.strictEqual(result2.valid, false);
        assert.strictEqual(result3.valid, false);
      });

      it('should block path traversal with ../../../', () => {
        // Path traversal pattern checks for ../ in the path
        // The DANGEROUS_RM_PATTERNS checks for /^\.\.\//, which matches paths STARTING with ../
        // Let's use a path that starts with ../
        const result = fsValidators.validateRmCommand('rm -rf ../secret');
        assert.strictEqual(result.valid, false);
        // The error says "not allowed" for dangerous patterns
        assert.ok(
          result.error.includes('not allowed'),
          `Expected error to include 'not allowed', got: ${result.error}`
        );
      });
    });

    describe('allowed operations', () => {
      it('should allow rm on normal files', () => {
        const result = fsValidators.validateRmCommand('rm file.txt');
        assert.strictEqual(result.valid, true);
      });

      it('should allow rm -rf on project directories', () => {
        const result = fsValidators.validateRmCommand('rm -rf node_modules/');
        assert.strictEqual(result.valid, true);
      });

      it('should allow rm with -f flag', () => {
        const result = fsValidators.validateRmCommand('rm -f file.txt');
        assert.strictEqual(result.valid, true);
      });

      it('should allow rm with -rf flags', () => {
        const result = fsValidators.validateRmCommand('rm -rf build/');
        assert.strictEqual(result.valid, true);
      });

      it('should allow rm with -i flag', () => {
        const result = fsValidators.validateRmCommand('rm -i file.txt');
        assert.strictEqual(result.valid, true);
      });

      it('should allow rm with -v flag', () => {
        const result = fsValidators.validateRmCommand('rm -v file.txt');
        assert.strictEqual(result.valid, true);
      });
    });

    describe('edge cases', () => {
      it('should handle empty command', () => {
        const result = fsValidators.validateRmCommand('');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('Empty'));
      });

      it('should handle quoted paths', () => {
        const result = fsValidators.validateRmCommand('rm -rf "path with spaces/"');
        assert.strictEqual(result.valid, true);
      });

      it('should handle unclosed quotes', () => {
        const result = fsValidators.validateRmCommand('rm -rf "path');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('Could not parse'));
      });
    });
  });

  describe('validateInitScript', () => {
    describe('allowed scripts', () => {
      it('should allow ./init.sh', () => {
        const result = fsValidators.validateInitScript('./init.sh');
        assert.strictEqual(result.valid, true);
      });

      it('should allow path/to/init.sh', () => {
        const result = fsValidators.validateInitScript('scripts/init.sh');
        assert.strictEqual(result.valid, true);
      });
    });

    describe('blocked scripts', () => {
      it('should block other scripts', () => {
        const result = fsValidators.validateInitScript('./setup.sh');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('Only ./init.sh'));
      });

      it('should block arbitrary bash commands', () => {
        const result = fsValidators.validateInitScript('rm -rf /');
        assert.strictEqual(result.valid, false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty command', () => {
        const result = fsValidators.validateInitScript('');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('Empty'));
      });

      it('should handle unclosed quotes', () => {
        const result = fsValidators.validateInitScript('"./init.sh');
        assert.strictEqual(result.valid, false);
      });
    });
  });
});
