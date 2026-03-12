#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PROJECT_ROOT } = require('../lib/utils/project-root.cjs');

const LOCK_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'evolution-processor.lock'
);
const DISPATCH_PLAN_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'evolution-dispatch-plan.json'
);
const POLL_INTERVAL_MS = 60000;

/**
 * Acquire an exclusive lock to prevent concurrent processor instances.
 * Returns true if lock acquired, false if already locked by another process.
 */
function acquireLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const stats = fs.statSync(LOCK_FILE);
      if (Date.now() - stats.mtimeMs > 5 * 60 * 1000) {
        // Stale lock older than 5 minutes — remove and acquire
        fs.unlinkSync(LOCK_FILE);
      } else {
        return false;
      }
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Release the lock file.
 */
function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch (_e) {
    // ignore lock release errors
  }
}

/**
 * Sort priority strings: high < medium < low (ascending = process high first).
 */
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

/**
 * Clear the dispatch plan file after processing to avoid re-processing stale actions.
 */
function clearDispatchPlan() {
  try {
    fs.mkdirSync(path.dirname(DISPATCH_PLAN_PATH), { recursive: true });
    fs.writeFileSync(
      DISPATCH_PLAN_PATH,
      JSON.stringify({ actions: [], processedAt: new Date().toISOString() }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('[Evolution Processor] Failed to clear dispatch plan:', err.message);
  }
}

/**
 * Core queue processor. Calls generateAndPersistDispatchPlan() from the
 * intelligent router, reads the resulting dispatch plan, and logs each
 * action's executorSkill + trigger. Clears the plan after processing.
 */
async function processQueue() {
  if (!acquireLock()) {
    console.error('[Evolution Processor] Another instance is running or locked.');
    return;
  }

  try {
    // Require inside function to allow mocking in tests
    const {
      generateAndPersistDispatchPlan,
    } = require('../lib/evolution/evolution-request-router.cjs');

    let plan;
    try {
      plan = generateAndPersistDispatchPlan();
    } catch (routerErr) {
      console.error('[Evolution Processor] Router error:', routerErr.message);
      return;
    }

    if (!plan || !Array.isArray(plan.actions) || plan.actions.length === 0) {
      console.error(
        '[Evolution Processor] No actions in dispatch plan. Queue empty or all filtered.'
      );
      return;
    }

    // Sort by priority: high > medium > low
    const sorted = plan.actions.slice().sort((a, b) => {
      const aPriority = PRIORITY_ORDER[a.priority] != null ? PRIORITY_ORDER[a.priority] : 2;
      const bPriority = PRIORITY_ORDER[b.priority] != null ? PRIORITY_ORDER[b.priority] : 2;
      return aPriority - bPriority;
    });

    console.error(`[Evolution Processor] Processing ${sorted.length} evolution dispatch actions`);

    for (const action of sorted) {
      const skill = action.executorSkill || 'recommend-evolution';
      const trigger = action.trigger || action.intent || 'unknown';

      console.error(`[Evolution Processor] Dispatching ${skill} for trigger: ${trigger}`);

      // Emit structured JSON dispatch intent to stdout for downstream router consumption
      process.stdout.write(
        JSON.stringify({
          type: 'evolution-dispatch',
          skill,
          trigger,
          args: action.args || {},
          priority: action.priority || 'medium',
          requestId: action.requestId || null,
          timestamp: new Date().toISOString(),
        }) + '\n'
      );
    }

    // Clear processed actions from the plan file
    clearDispatchPlan();

    console.error(`[Evolution Processor] Processed ${sorted.length} actions, plan cleared.`);
  } catch (err) {
    console.error('[Evolution Processor] Unexpected error:', err.message);
  } finally {
    releaseLock();
  }
}

async function main() {
  const isRunOnce = process.argv.includes('--run-once');

  if (isRunOnce) {
    await processQueue();
    process.exit(0);
  } else {
    console.error('[Evolution Processor] Starting daemon mode...');
    await processQueue(); // Run immediately once
    setInterval(async () => {
      try {
        await processQueue();
      } catch (err) {
        console.error('[Evolution Processor] Daemon iteration error:', err.message);
      }
    }, POLL_INTERVAL_MS);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[Evolution Processor] Fatal error:', err.message);
    process.exit(2);
  });
}

module.exports = {
  processQueue,
  acquireLock,
  releaseLock,
  clearDispatchPlan,
};
