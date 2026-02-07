#!/usr/bin/env node
'use strict';

const { addTask, listTasks, removeTask } = require('../../lib/scheduler/scheduler-store.cjs');

function parseArgs(args) {
  const result = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i += 1;
      } else {
        result[key] = true;
      }
    } else {
      result._.push(arg);
    }
  }
  return result;
}

function printUsage() {
  process.stdout.write(
    [
      'Usage:',
      '  schedule-task.cjs add --name "Daily" --type once --run-at "2026-02-03T12:00:00Z" --payload "{\\"command\\":\\"node .claude/lib/memory/memory-scheduler.cjs daily\\"}"',
      '  schedule-task.cjs add "Daily" once "2026-02-03T12:00:00Z" "{\\"command\\":\\"node .claude/lib/memory/memory-scheduler.cjs daily\\"}"',
      '  schedule-task.cjs list',
      '  schedule-task.cjs remove <id>',
    ].join('\n') + '\n'
  );
}

function parsePayload(payloadArg) {
  if (!payloadArg) return {};
  try {
    return JSON.parse(payloadArg);
  } catch (_e) {
    return { command: payloadArg };
  }
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (!cmd || cmd === 'help' || args.help) {
    printUsage();
    process.exit(0);
  }

  if (cmd === 'list') {
    const tasks = listTasks();
    process.stdout.write(JSON.stringify({ tasks }, null, 2) + '\n');
    process.exit(0);
  }

  if (cmd === 'remove') {
    const id = args._[1];
    if (!id) {
      process.stderr.write('Missing id for remove.\n');
      process.exit(1);
    }
    const removed = removeTask(id);
    process.stdout.write(removed ? `Removed ${id}\n` : `Not found: ${id}\n`);
    process.exit(removed ? 0 : 1);
  }

  if (cmd === 'add') {
    const name = args.name || args._[1];
    const type = args.type || args._[2] || 'once';
    const runAt = args['run-at'] || args.runAt || args._[3] || null;
    const payloadArg = args.payload || args._[4] || null;
    if (!name) {
      process.stderr.write('Missing name for add.\n');
      process.exit(1);
    }
    const payload = parsePayload(payloadArg);
    const id = addTask({
      name,
      type,
      nextRunAt: runAt,
      cronExpr: args.cron || null,
      payload,
    });
    process.stdout.write(`Added task ${id}\n`);
    process.exit(0);
  }

  process.stderr.write(`Unknown command: ${cmd}\n`);
  printUsage();
  process.exit(1);
}

run();
