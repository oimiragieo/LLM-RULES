'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCronLine,
  buildWindowsTaskCommand,
  setupUnix,
  setupWindows,
} = require('../../../.claude/tools/cli/setup-persistent-schedule.cjs');

describe('setup-persistent-schedule command construction', () => {
  it('builds Windows schtasks args without joining into a shell command string', () => {
    const args = buildWindowsTaskCommand({
      taskName: 'AgentStudio-EnvBackup',
      nodeCmd: 'C:\\Program Files\\nodejs\\node.exe',
      scriptPath: 'C:\\repo\\.claude\\tools\\cli\\env-backup.cjs',
    });

    assert.equal(args[0], '/Create');
    assert.equal(args[args.indexOf('/TN') + 1], 'AgentStudio-EnvBackup');
    assert.equal(
      args[args.indexOf('/TR') + 1],
      '"C:\\Program Files\\nodejs\\node.exe" "C:\\repo\\.claude\\tools\\cli\\env-backup.cjs"'
    );
    assert.ok(!args.includes('schtasks'), 'binary must stay separate from argv');
  });

  it('setupWindows calls schtasks with argv arrays and shell:false', () => {
    const calls = [];
    const execFileSync = (cmd, args, options) => {
      calls.push({ cmd, args, options });
      if (args.includes('/Query')) {
        throw new Error('task missing');
      }
      return '';
    };

    setupWindows({ execFileSync });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].args.slice(0, 4), ['/Query', '/TN', 'AgentStudio-EnvBackup', '/FO']);
    assert.equal(calls[1].cmd, 'schtasks');
    assert.equal(calls[1].options.shell, false);
    assert.ok(Array.isArray(calls[1].args));
    assert.ok(calls[1].args.includes('/Create'));
  });

  it('builds a cron line with the expected marker', () => {
    const line = buildCronLine({
      projectRoot: '/repo',
      nodeCmd: '/usr/bin/node',
      scriptPath: '/repo/.claude/tools/cli/env-backup.cjs',
    });

    assert.equal(
      line,
      '17 8 * * * cd "/repo" && "/usr/bin/node" "/repo/.claude/tools/cli/env-backup.cjs" # AgentStudio-EnvBackup'
    );
  });

  it('setupUnix reads and writes crontab with argv calls', () => {
    const execCalls = [];
    const spawnCalls = [];
    const execFileSync = (cmd, args, options) => {
      execCalls.push({ cmd, args, options });
      return Buffer.from('');
    };
    const spawnSync = (cmd, args, options) => {
      spawnCalls.push({ cmd, args, options });
      return { status: 0 };
    };

    setupUnix({ execFileSync, spawnSync });

    assert.deepEqual(execCalls[0].args, ['-l']);
    assert.equal(execCalls[0].options.shell, false);
    assert.equal(spawnCalls[0].cmd, 'crontab');
    assert.deepEqual(spawnCalls[0].args, ['-']);
    assert.equal(spawnCalls[0].options.shell, false);
    assert.match(spawnCalls[0].options.input, /# AgentStudio-EnvBackup/);
  });
});
