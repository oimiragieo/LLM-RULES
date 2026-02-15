'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateCommand } = require('../../.claude/hooks/safety/validators/registry.cjs');

describe('bash-command-validator misc command coverage', () => {
  it('applies chmod restrictions correctly', () => {
    const cases = [
      ['chmod +x script.sh', true],
      ['chmod 755 script.sh', true],
      ['chmod 644 file.txt', true],
      ['chmod 777 /etc/passwd', false],
      ['chmod 000 file', false],
    ];
    cases.forEach(([command, expected]) => {
      const result = validateCommand(command);
      assert.equal(result.valid, expected, `Unexpected chmod policy for "${command}"`);
    });
  });

  it('blocks remote rsync and allows local rsync', () => {
    const allowed = validateCommand('rsync -av ./src ./dest');
    assert.equal(allowed.valid, true);

    const blockedPush = validateCommand('rsync -av ./src user@host:/path');
    assert.equal(blockedPush.valid, false);

    const blockedPull = validateCommand('rsync -av user@host:/path ./dest');
    assert.equal(blockedPull.valid, false);
  });

  it('handles invalid/empty command input safely', () => {
    [null, undefined, ''].forEach(command => {
      const result = validateCommand(command);
      assert.equal(result.valid, false);
    });

    const whitespace = validateCommand('   ');
    assert.equal(Object.hasOwn(whitespace, 'valid'), true);
  });

  it('handles full-path command variants', () => {
    const safePath = validateCommand('/usr/bin/git status');
    assert.equal(safePath.valid, true);

    const windowsPath = validateCommand('C:\\Windows\\System32\\cmd.exe /c dir');
    assert.equal(Object.hasOwn(windowsPath, 'valid'), true);

    const blockedPath = validateCommand('/usr/local/bin/rm -rf /');
    assert.equal(blockedPath.valid, false);
  });
});
