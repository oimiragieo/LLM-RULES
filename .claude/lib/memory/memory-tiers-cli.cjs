#!/usr/bin/env node
'use strict';

async function runMemoryTiersCli(api, args = process.argv.slice(2)) {
  const command = args[0];
  const { getTierHealth, consolidateSession, summarizeOldSessions, promoteToLTM, getMTMSessions } =
    api;

  switch (command) {
    case 'health':
      console.log(JSON.stringify(getTierHealth(), null, 2));
      break;
    case 'consolidate': {
      const sessionId = args[1] || 'current';
      try {
        const result = await consolidateSession(sessionId);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        console.error(JSON.stringify({ success: false, error: err.message }, null, 2));
        process.exit(1);
      }
      break;
    }
    case 'summarize':
      try {
        const summaryResult = await summarizeOldSessions();
        console.log(JSON.stringify(summaryResult, null, 2));
      } catch (err) {
        console.error(JSON.stringify({ success: false, error: err.message }, null, 2));
        process.exit(1);
      }
      break;
    case 'promote':
      if (!args[1]) {
        console.error('Usage: memory-tiers.cjs promote <session-id>');
        process.exit(1);
      }
      try {
        const promoteResult = await promoteToLTM(args[1]);
        console.log(JSON.stringify(promoteResult, null, 2));
      } catch (err) {
        console.error(JSON.stringify({ success: false, error: err.message }, null, 2));
        process.exit(1);
      }
      break;
    case 'mtm-list': {
      const sessions = getMTMSessions();
      console.log(
        JSON.stringify(
          sessions.map(s => ({
            session_id: s.session_id,
            timestamp: s.timestamp,
            summary: s.summary,
          })),
          null,
          2
        )
      );
      break;
    }
    default:
      console.log(`Memory Tiers - STM/MTM/LTM Implementation

Commands:
  health          Check health of all memory tiers
  consolidate     Consolidate current session from STM to MTM
  summarize       Summarize old MTM sessions to LTM
  promote <id>    Promote a session from MTM to LTM
  mtm-list        List all sessions in MTM

Examples:
  node memory-tiers.cjs health
  node memory-tiers.cjs consolidate
  node memory-tiers.cjs summarize
  node memory-tiers.cjs promote session-001
  node memory-tiers.cjs mtm-list`);
  }
}

module.exports = {
  runMemoryTiersCli,
};
