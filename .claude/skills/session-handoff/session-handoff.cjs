#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getOrCreateSessionId } = require('../../lib/context/session-id-manager.cjs');

// Path resolution
const projectRoot = process.cwd();
const runtimeDir = path.join(projectRoot, '.claude/context/runtime');
const memoryDir = path.join(projectRoot, '.claude/context/memory');
const tasksFile = path.join(runtimeDir, 'tasks.json');

console.log('[session-handoff] Initiating programmatic session handoff...');
const args = process.argv.slice(2);
const autoSuspend = args.includes('--auto-suspend');

// MT-B: Drain-complete gate via tasks database reading
let tasks = [];
if (fs.existsSync(tasksFile)) {
  try {
    tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
  } catch (e) {
    console.error(`[session-handoff] Failed to read tasks database: ${e.message}`);
    process.exit(1);
  }
}

const activeTasks = tasks.filter(t => t.status === 'in_progress' || t.status === 'blocked');
if (activeTasks.length > 0) {
  if (autoSuspend) {
    console.log(
      `[session-handoff] --auto-suspend flag detected. Suspending ${activeTasks.length} active tasks...`
    );
    let modified = false;
    tasks.forEach(t => {
      if (t.status === 'in_progress' || t.status === 'blocked') {
        t.status = 'suspended';
        t.metrics = t.metrics || {};
        t.metrics.suspended_at = new Date().toISOString();
        t.metrics.suspend_reason = 'Auto-suspended during session handoff via --auto-suspend flag';
        modified = true;
      }
    });
    if (modified) {
      try {
        fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2), 'utf8');
        console.log(`[session-handoff] Tasks successfully suspended.`);
      } catch (e) {
        console.error(
          `[session-handoff] Failed to write tasks database during suspend: ${e.message}`
        );
        process.exit(1);
      }
    }
  } else {
    console.error(`\n[session-handoff] ABORT: Cannot handoff session while tasks are active.`);
    console.error(`Active tasks found:`);
    activeTasks.forEach(t => console.error(`  - [${t.id}] ${t.description} (${t.status})`));
    console.error(
      `\nPlease instruct the model to finish or formally suspend these tasks before handing off, or pass the --auto-suspend flag.`
    );
    process.exit(1);
  }
}

// Ensure runtime dir exists
if (!fs.existsSync(runtimeDir)) {
  fs.mkdirSync(runtimeDir, { recursive: true });
}

const sessionId = getOrCreateSessionId(runtimeDir);

// Read context summary from active_context if available
let contextSummary = 'Context transferred via session-handoff skill.';
const activeContextPath = path.join(memoryDir, 'active_context.md');
if (fs.existsSync(activeContextPath)) {
  // Option 1 Fix: Eliminated the blind 1000-character length truncation to prevent 'brevity bias' context collapse.
  // We use a high 100,000 threshold (~25k tokens) strictly to prevent memory crash exceptions but allow full transfer.
  contextSummary = fs.readFileSync(activeContextPath, 'utf8').substring(0, 100000);
}

// Build the M7.1 Log directly
const handoverData = {
  schemaVersion: '1.0.0',
  generation: 1, // simplified
  sessionId: sessionId,
  status: 'READY',
  resumeInstructions: 'Resume previous objective.',
  fallbackInstruction: 'Run TaskList() to discover pending work, check active_context.md',
  contextSummary: contextSummary,
  timestamp: new Date().toISOString(),
};

const tmpPath = path.join(runtimeDir, `shift-change-log.tmp-${Date.now()}.json`);
const finalPath = path.join(runtimeDir, 'shift-change-log.json');

try {
  // Write atomic
  fs.writeFileSync(tmpPath, JSON.stringify(handoverData, null, 2), 'utf8');
  fs.renameSync(tmpPath, finalPath);
  console.log(`[session-handoff] Wrote READY handover log atomically.`);
} catch (e) {
  console.error(`[session-handoff] Failed to write handover log: ${e.message}`);
  process.exit(1);
}

// M7.1 Spawn directly
console.log(`[session-handoff] Spawning new terminal session...`);
const spawnScript = path.join(projectRoot, 'scripts/spawn-new-session.cjs');
if (!fs.existsSync(spawnScript)) {
  console.error(`[session-handoff] Fatal: Cannot find spawn script at ${spawnScript}`);
  process.exit(1);
}

try {
  // Execute the spawn script synchronously, passing --skip-drain since we already checked tasks
  execFileSync('node', [spawnScript, '--skip-drain'], { stdio: 'inherit' });
  console.log(`[session-handoff] Handoff execution completed successfully.`);
} catch (e) {
  console.error(`[session-handoff] Spawn script failure: ${e.message}`);
  process.exit(1);
}
