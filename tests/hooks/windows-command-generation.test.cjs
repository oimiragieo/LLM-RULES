/**
 * Tests for Windows-safe command generation guardrails
 *
 * RED: Failing tests for Windows path and heredoc detection
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Windows Command Generation', () => {
  it('should detect and block /c/ style path prefixes in bash commands', () => {
    // RED: This test should fail because the detection logic exists but we need to verify it works
    const {
      isWindowsIncompatibleBashCommand,
    } = require('../../.claude/hooks/routing/pre-tool-unified.guardrails.cjs');

    const testCases = [
      {
        command: 'cd /c/dev/projects && pnpm test',
        expected: true,
        reason: '/c/ prefix with cd command',
      },
      {
        command: 'cat /c/dev/projects/file.txt',
        expected: true,
        reason: '/c/ prefix in file path',
      },
      {
        command: 'cd "C:\\dev\\projects" && pnpm test',
        expected: false,
        reason: 'Windows-safe path format',
      },
      {
        command: 'cd /dev/projects && pnpm test',
        expected: false,
        reason: 'Unix-style path without drive prefix',
      },
    ];

    for (const { command, expected, reason } of testCases) {
      const result = isWindowsIncompatibleBashCommand(command);
      assert.strictEqual(result, expected, `Failed for: ${reason} - Command: "${command}"`);
    }
  });

  it('should block heredoc patterns flagged by guard before dispatch', () => {
    // RED: Verify that heredoc detection works on Windows platform
    const {
      isWindowsIncompatibleBashCommand,
    } = require('../../.claude/hooks/routing/pre-tool-unified.guardrails.cjs');

    const testCases = [
      {
        command: 'cat << EOF\nHello\nEOF',
        expectedOnWindows: true,
        reason: 'Heredoc syntax',
      },
      {
        command: 'cat > /tmp/file.txt << EOF\nContent\nEOF',
        expectedOnWindows: true,
        reason: 'Heredoc with tmp write',
      },
      {
        command: 'echo "Hello" > file.txt',
        expectedOnWindows: false,
        reason: 'Simple redirection without heredoc',
      },
    ];

    const isWindows = process.platform === 'win32';

    for (const { command, expectedOnWindows, reason } of testCases) {
      const result = isWindowsIncompatibleBashCommand(command);
      const expected = isWindows ? expectedOnWindows : false;
      assert.strictEqual(
        result,
        expected,
        `Failed for: ${reason} (platform: ${process.platform}) - Command: "${command}"`
      );
    }
  });

  it('should provide workspace-relative or Windows-safe alternatives', () => {
    // RED: This test checks that paths are normalized correctly
    const {
      evaluateWindowsBashGuard,
    } = require('../../.claude/hooks/routing/pre-tool-unified.guardrails.cjs');

    const command = 'cd /c/dev/projects/agent-studio && pnpm test';
    const hookInput = {
      agent_type: 'developer',
      session_id: 'test-session',
      permission_mode: 'bypassPermissions', // Required for rewrite attempt
    };

    const result = evaluateWindowsBashGuard(command, hookInput);

    // Should either block or rewrite
    assert.ok(
      result.action === 'block' || result.action === 'rewrite',
      'Should block or rewrite /c/ style paths'
    );

    if (result.action === 'rewrite') {
      assert.ok(result.rewrittenCommand, 'Should provide rewritten command');
      assert.ok(
        !result.rewrittenCommand.includes('/c/'),
        'Rewritten command should not contain /c/ prefix'
      );
    }
  });
});
