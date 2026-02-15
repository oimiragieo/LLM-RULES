'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validateCommand, getRegisteredCommands, hasValidator } = require('../../.claude/hooks/safety/validators/registry.cjs');

describe('bash-command-validator allowlist coverage', () => {
  it('hasValidator returns true for critical known commands', () => {
    ['rm', 'git', 'sudo', 'curl'].forEach(cmd => {
      assert.equal(hasValidator(cmd), true, `Expected validator for ${cmd}`);
    });
  });

  it('hasValidator returns false for unknown command', () => {
    assert.equal(hasValidator('unknown_command_xyz'), false);
  });

  it('getRegisteredCommands returns array with security-critical commands', () => {
    const commands = getRegisteredCommands();
    assert.equal(Array.isArray(commands), true);
    ['rm', 'sudo', 'ssh', 'nc', 'curl', 'git'].forEach(cmd => {
      assert.equal(commands.includes(cmd), true, `Expected command list to include ${cmd}`);
    });
  });

  it('allows benign system info commands', () => {
    [
      'du -sh ./node_modules',
      'time npm test',
      'sleep 5',
    ].forEach(command => {
      const result = validateCommand(command);
      assert.equal(result.valid, true, `Expected allowed command: ${command}`);
    });
  });

  it('blocks powershell shell-bypass attempts', () => {
    const result = validateCommand('powershell -Command "Get-Process"');
    assert.equal(result.valid, false);
    assert.match(result.error || '', /Unregistered command/);
  });
});
