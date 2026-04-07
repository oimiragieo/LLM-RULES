#!/usr/bin/env node
/**
 * Heartbeat Orchestrator — Register all 8 cron loops
 *
 * This script registers the complete heartbeat ecosystem:
 * - Loop 0: auto-reschedule (2 days)
 * - Loop 1: reflection (2 hours)
 * - Loop 2: evolution (24h at 3am)
 * - Loop 3: briefing (8am weekdays)
 * - Loop 4: indexing (4h)
 * - Loop 5: drain (30m)
 * - Loop 6: telegram (5m) — skipped if TELEGRAM_BOT_TOKEN not set
 * - Loop 7: research (7am)
 */

'use strict';

const LOOPS_TO_REGISTER = [
  {
    name: 'reflection-2h',
    schedule: '0 */2 * * *',
    task: 'Run: node .claude/tools/cli/reflection-check.cjs\nParse stdout. If HEARTBEAT_OK, reply HEARTBEAT_OK and exit.',
  },
  {
    name: 'evolution-24h',
    schedule: '0 3 * * *',
    task: 'Run: node .claude/tools/cli/evolution-check.cjs\nParse stdout. If HEARTBEAT_OK, reply HEARTBEAT_OK and exit.',
  },
  {
    name: 'briefing-8am',
    schedule: '0 8 * * 1-5',
    task: 'Morning briefing: Spawn researcher via Task() to read issues.md, learnings.md, git log, and generate morning briefing report. Do NOT wait for sub-agent. Reply HEARTBEAT_OK and exit.',
  },
  {
    name: 'indexing-4h',
    schedule: '0 */4 * * *',
    task: 'Index freshness check: Check mtime of .claude/context/data/bm25-index.json via Bash. If older than 4 hours/missing: run pnpm code:index:reindex. Reply HEARTBEAT_OK and exit.',
  },
  {
    name: 'drain-30m',
    schedule: '*/30 * * * *',
    task: 'Run: node .claude/tools/cli/context-drain.cjs\nReply exactly with the stdout output, then exit.',
  },
  {
    name: 'telegram-5m',
    schedule: '*/5 * * * *',
    task: 'Run: node .claude/tools/cli/telegram-poll.cjs\nParse stdout. Reply HEARTBEAT_OK and exit.',
    requiresEnv: 'TELEGRAM_BOT_TOKEN',
  },
  {
    name: 'research-7am',
    schedule: '0 7 * * *',
    task: 'Research digest: Spawn researcher via Task() to invoke arxiv-monitor and exa-monitor skills. Do NOT wait for sub-agent. Reply HEARTBEAT_OK and exit.',
  },
  {
    name: 'reschedule-2d',
    schedule: '0 0 */2 * *',
    task: 'Self-maintenance: CronList() to inventory active tasks. Identify missing heartbeat loops from the expected set (reflection-2h, evolution-24h, briefing-8am, indexing-4h, drain-30m, telegram-5m, research-7am, reschedule-2d). Recreate any missing tasks. Report recreated task IDs.',
  },
];

async function main() {
  console.log('Heartbeat Orchestrator — Session Re-Registration\n');

  // Step 1: Check current loops
  console.log('Step 1: Checking current cron loop status...');
  let currentLoops = [];
  try {
    currentLoops = await CronList();
    console.log(`Found ${currentLoops.length} currently scheduled tasks\n`);
  } catch (err) {
    console.error(`CronList failed: ${err.message}`);
    console.log('Proceeding with registration...\n');
  }

  // Step 2: Register missing loops (CRITICAL ORDER: new BEFORE delete)
  console.log('Step 2: Registering heartbeat loops...');
  const registeredIds = [];

  for (const loop of LOOPS_TO_REGISTER) {
    // Skip telegram if env var not set
    if (loop.requiresEnv) {
      if (!process.env[loop.requiresEnv]) {
        console.log(`  ⊘ Skipping ${loop.name} — ${loop.requiresEnv} not configured`);
        continue;
      }
    }

    try {
      const result = await CronCreate({
        schedule: loop.schedule,
        task: loop.task,
      });
      registeredIds.push({
        id: result.id || 'unknown',
        name: loop.name,
        schedule: loop.schedule,
        registered_at: new Date().toISOString(),
      });
      console.log(`  ✓ ${loop.name} (${loop.schedule}) → ${result.id || 'registered'}`);
    } catch (err) {
      console.error(`  ✗ ${loop.name} failed: ${err.message}`);
    }
  }

  // Step 3: Verify all loops
  console.log('\nStep 3: Verifying loop registration...');
  let finalLoops = [];
  try {
    finalLoops = await CronList();
    console.log(`Active loops: ${finalLoops.length}`);

    // Report each loop
    for (const loop of finalLoops) {
      const isHeartbeat = LOOPS_TO_REGISTER.some(
        l => l.name && loop.task?.includes(l.task?.substring(0, 20))
      );
      const marker = isHeartbeat ? '♥' : '·';
      console.log(`  ${marker} ${loop.id} (${loop.schedule || 'custom'})`);
    }
  } catch (err) {
    console.error(`CronList verification failed: ${err.message}`);
  }

  // Step 4: Write sentinel file
  console.log('\nStep 4: Writing heartbeat sentinel...');
  const { writeSentinel, writeSessionPing } = require('../../lib/heartbeat/heartbeat-sentinel.cjs');

  try {
    const sentinelPath = writeSentinel(registeredIds);
    console.log(`✓ Sentinel written: ${sentinelPath}`);
    console.log(`  Expires: ${new Date(Date.now() + 46 * 60 * 60 * 1000).toISOString()}`);
  } catch (err) {
    console.error(`Sentinel write failed: ${err.message}`);
  }

  try {
    const pingPath = writeSessionPing(registeredIds);
    console.log(`✓ Session ping written: ${pingPath}`);
    console.log(`  Expires in: 15 minutes`);
  } catch (err) {
    console.error(`Session ping write failed: ${err.message}`);
  }

  // Final report
  console.log('\nHeartbeat Re-Registration Complete');
  console.log(`Registered: ${registeredIds.length} loops`);
  console.log(`Active: ${finalLoops.length} total tasks`);
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
