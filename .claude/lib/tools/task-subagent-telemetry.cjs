'use strict';

const eventBus = require('../events/event-bus.cjs');
const { EventTypes } = require('../events/event-types.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

async function main() {
  const inputRaw = process.argv[2] || '{}';
  const input = safeParseJSON(inputRaw, null, null, {});
  const startedAt = Date.now();

  await eventBus.emit(EventTypes.TOOL_COMPLETED, {
    type: EventTypes.TOOL_COMPLETED,
    timestamp: new Date().toISOString(),
    toolName: 'task-subagent-telemetry',
    duration: 0,
    output: {
      subagentType: input.subagentType,
      taskId: input.taskId,
      description: input.description,
      promptLength: input.promptLength,
    },
    taskId: input.taskId,
  });

  const output = {
    ok: true,
    frameworkLoaded: true,
    agent: input.subagentType,
    task_id: input.taskId,
    promptLength: input.promptLength,
    description: input.description,
    durationMs: Date.now() - startedAt,
  };
  process.stdout.write(JSON.stringify(output));
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(String(error?.message || error));
    process.exitCode = 1;
  });
}

module.exports = { main };
