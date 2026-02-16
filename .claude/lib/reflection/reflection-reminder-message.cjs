'use strict';

function buildStep0ReminderMessage(pendingCount) {
  return (
    `STEP 0: You have ${pendingCount} pending reflection spawn request(s). ` +
    'Read .claude/context/runtime/reflection-spawn-request.json and spawn reflection-agent ' +
    'for each request (or the first batch). After spawning, clear/trim the spawn request file ' +
    'and delete this reminder. Then announce "Step 0 complete" before TaskList().\n'
  );
}

module.exports = {
  buildStep0ReminderMessage,
};
