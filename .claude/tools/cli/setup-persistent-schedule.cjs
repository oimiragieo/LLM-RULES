#!/usr/bin/env node
// .claude/tools/cli/setup-persistent-schedule.cjs
// Sets up OS-level scheduling for the env-backup daily task.
//
// Usage:
//   PERSISTENT_SCHEDULE=true node .claude/tools/cli/setup-persistent-schedule.cjs
//
// Requires PERSISTENT_SCHEDULE=true to run. Safe to call repeatedly (idempotent).

'use strict';

const { execSync } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT_PATH = path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'env-backup.cjs');
const NODE_CMD = process.execPath;

// ── Gate: only run if PERSISTENT_SCHEDULE=true ──────────────────────────────
const enabled = process.env.PERSISTENT_SCHEDULE;
if (enabled !== 'true') {
  console.log(
    '[setup-persistent-schedule] PERSISTENT_SCHEDULE is not "true" — skipping OS-level scheduling.'
  );
  console.log(
    '  Set PERSISTENT_SCHEDULE=true in your .env (or shell) and re-run to register the schedule.'
  );
  process.exit(0);
}

console.log(
  '[setup-persistent-schedule] PERSISTENT_SCHEDULE=true — registering OS-level schedule...'
);
console.log(`  Script: ${SCRIPT_PATH}`);
console.log(`  Schedule: daily at 08:17`);
console.log('');

if (process.platform === 'win32') {
  setupWindows();
} else {
  setupUnix();
}

// ── Windows: Task Scheduler ──────────────────────────────────────────────────
function setupWindows() {
  const taskName = 'AgentStudio-EnvBackup';
  const scriptWin = SCRIPT_PATH.replace(/\//g, '\\');
  const nodeWin = NODE_CMD.replace(/\//g, '\\');

  // Check if task already exists
  let exists = false;
  try {
    execSync(['schtasks', '/Query', '/TN', taskName, '/FO', 'LIST'].join(' '), {
      stdio: 'pipe',
      shell: false,
    });
    exists = true;
  } catch (_e) {
    // Task does not exist — that's fine
  }

  if (exists) {
    console.log(
      `[setup-persistent-schedule] Windows Task "${taskName}" already exists — skipping registration.`
    );
    console.log('  To update it, delete the existing task first:');
    console.log(`    schtasks /Delete /TN "${taskName}" /F`);
    console.log('  Then re-run this script.');
    return;
  }

  // Register the task: daily at 08:17, run as current user
  // Build the /TR value: schtasks requires a single quoted string for the command
  const trValue = '"' + nodeWin + '" "' + scriptWin + '"';
  const cmd = [
    'schtasks',
    '/Create',
    '/TN',
    taskName,
    '/TR',
    trValue,
    '/SC',
    'DAILY',
    '/ST',
    '08:17',
    '/F',
  ];

  try {
    execSync(cmd.join(' '), { stdio: 'inherit', shell: false });
    console.log('');
    console.log(`[setup-persistent-schedule] SUCCESS — Windows Task "${taskName}" registered.`);
    console.log('  The env-backup script will run daily at 08:17.');
    console.log('  To view it: Task Scheduler > Task Scheduler Library > AgentStudio-EnvBackup');
    console.log(`  To remove it: schtasks /Delete /TN "${taskName}" /F`);
  } catch (err) {
    console.error('[setup-persistent-schedule] ERROR registering Windows task:', err.message);
    console.error('  Try running this script as Administrator.');
    process.exit(1);
  }
}

// ── Linux / macOS: crontab ───────────────────────────────────────────────────
function setupUnix() {
  const cronEntry = `17 8 * * * cd "${PROJECT_ROOT}" && "${NODE_CMD}" "${SCRIPT_PATH}"`;
  const marker = '# AgentStudio-EnvBackup';
  const fullLine = `${cronEntry} ${marker}`;

  // Read existing crontab
  let existing = '';
  try {
    existing = execSync('crontab -l', { stdio: 'pipe', shell: false }).toString();
  } catch (_e) {
    // No crontab yet — start fresh
  }

  if (existing.includes(marker)) {
    console.log('[setup-persistent-schedule] Crontab entry already exists — skipping.');
    console.log('  Current entry:');
    existing
      .split('\n')
      .filter(l => l.includes(marker))
      .forEach(l => console.log(`    ${l}`));
    console.log('  To update it, remove the existing line and re-run this script.');
    return;
  }

  // Append the new line
  const newCrontab = existing.trimEnd() + (existing.trim() ? '\n' : '') + fullLine + '\n';

  try {
    // Write new crontab via stdin
    const { spawnSync } = require('child_process');
    const result = spawnSync('crontab', ['-'], {
      input: newCrontab,
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: false,
      windowsHide: true,
    });

    if (result.status !== 0) {
      throw new Error(`crontab exited with status ${result.status}`);
    }

    console.log('[setup-persistent-schedule] SUCCESS — crontab entry added.');
    console.log('  The env-backup script will run daily at 08:17.');
    console.log('  To view your crontab: crontab -l');
    console.log(`  To remove the entry: crontab -l | grep -v "${marker}" | crontab -`);
  } catch (err) {
    console.error('[setup-persistent-schedule] ERROR writing crontab:', err.message);
    process.exit(1);
  }
}
