#!/usr/bin/env node
'use strict';

const { runWatchdogOnce } = require('../../lib/workflow/workflow-watchdog.cjs');
const { createLogger } = require('../../lib/utils/logger.cjs');

const logger = createLogger('workflow-watchdog');

async function main() {
  const args = process.argv.slice(2);
  let slaMs = 300000; // 5 min

  const slaArg = args.find(a => a.startsWith('--sla='));
  if (slaArg) {
    const val = parseInt(slaArg.split('=')[1], 10);
    if (Number.isFinite(val)) slaMs = val;
  }

  logger.info(`Running Workflow Watchdog DLQ Sweep with SLA ${slaMs}ms`);

  try {
    const result = await runWatchdogOnce(undefined, undefined, slaMs);
    logger.info(`Watchdog run complete. Swept ${result.swept} timed out phases to DLQ.`);
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (err) {
    logger.error('Watchdog sweep failed', err);
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
