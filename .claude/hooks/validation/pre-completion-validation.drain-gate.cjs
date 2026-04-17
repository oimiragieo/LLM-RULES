'use strict';

const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

function enforceDrainGate({
  currentTaskId,
  isPipelineCompletion,
  getEnforcementMode,
  formatHookResult,
}) {
  const drainGateMode = getEnforcementMode('DRAIN_GATE_ENFORCEMENT', 'warn');
  if (drainGateMode === 'off' || !isPipelineCompletion) return;

  try {
    const taskStatusFile = path.join(PROJECT_ROOT, '.claude/context/runtime/task-status.json');
    if (!fs.existsSync(taskStatusFile)) return;

    const { safeParseJSON: parseJSON } = require('../../lib/utils/safe-json.cjs');
    const taskStates = parseJSON(fs.readFileSync(taskStatusFile, 'utf8'));
    const openTasks = [];
    for (const [taskId, status] of Object.entries(taskStates || {})) {
      if (status === 'pending' || status === 'in_progress') {
        openTasks.push(`${taskId}:${status}`);
      }
    }

    const otherOpenTasks = openTasks.filter(task => !task.startsWith(`${currentTaskId}:`));
    if (otherOpenTasks.length === 0) return;

    const drainMsg =
      `DRAIN GATE FAILED: Pipeline completion claimed but ${otherOpenTasks.length} task(s) still open: ` +
      `${otherOpenTasks.slice(0, 5).join(', ')}${otherOpenTasks.length > 5 ? '...' : ''}. ` +
      'Close all tasks before claiming pipeline complete. Set DRAIN_GATE_ENFORCEMENT=off to disable.';

    if (drainGateMode === 'block') {
      console.log(formatHookResult('block', drainMsg));
      process.exit(2);
    }

    process.stderr.write(`[pre-completion-validation] WARNING: ${drainMsg}\n`);
  } catch (_error) {
    // Best effort only.
  }
}

module.exports = { enforceDrainGate };
