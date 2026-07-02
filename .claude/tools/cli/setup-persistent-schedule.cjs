#!/usr/bin/env node
// .claude/tools/cli/setup-persistent-schedule.cjs
// Sets up OS-level scheduling for the env-backup daily task.
//
// Usage:
//   PERSISTENT_SCHEDULE=true node .claude/tools/cli/setup-persistent-schedule.cjs
//
// Requires PERSISTENT_SCHEDULE=true to run. Safe to call repeatedly (idempotent).

'use strict';

const { execFileSync, spawnSync } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT_PATH = path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'env-backup.cjs');
const NODE_CMD = process.execPath;

function buildWindowsTaskCommand({ taskName, nodeCmd, scriptPath }) {
  const scriptWin = scriptPath.replace(/\//g, '\\');
  const nodeWin = nodeCmd.replace(/\//g, '\\');
  const taskRunValue = `"${nodeWin}" "${scriptWin}"`;

  return ['/Create', '/TN', taskName, '/TR', taskRunValue, '/SC', 'DAILY', '/ST', '08:17', '/F'];
}

function buildCronLine({ projectRoot, nodeCmd, scriptPath }) {
  const cronEntry = `17 8 * * * cd "${projectRoot}" && "${nodeCmd}" "${scriptPath}"`;
  const marker = '# AgentStudio-EnvBackup';
  return `${cronEntry} ${marker}`;
}

// ── Windows: Task Scheduler ──────────────────────────────────────────────────
function setupWindows(options = {}) {
  const execFileSyncImpl = options.execFileSync || execFileSync;
  const taskName = 'AgentStudio-EnvBackup';

  // Check if task already exists
  let exists = false;
  try {
    execFileSyncImpl('schtasks', ['/Query', '/TN', taskName, '/FO', 'LIST'], {
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
  // Build the /TR value as one argv entry; no shell is used.
  const args = buildWindowsTaskCommand({
    taskName,
    nodeCmd: NODE_CMD,
    scriptPath: SCRIPT_PATH,
  });

  try {
    execFileSyncImpl('schtasks', args, { stdio: 'inherit', shell: false });
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
function setupUnix(options = {}) {
  const execFileSyncImpl = options.execFileSync || execFileSync;
  const spawnSyncImpl = options.spawnSync || spawnSync;
  const marker = '# AgentStudio-EnvBackup';
  const fullLine = buildCronLine({
    projectRoot: PROJECT_ROOT,
    nodeCmd: NODE_CMD,
    scriptPath: SCRIPT_PATH,
  });

  // Read existing crontab
  let existing = '';
  try {
    existing = execFileSyncImpl('crontab', ['-l'], { stdio: 'pipe', shell: false }).toString();
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
    const result = spawnSyncImpl('crontab', ['-'], {
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

function main() {
  // ── Gate: only run if PERSISTENT_SCHEDULE=true ──────────────────────────────
  const enabled = process.env.PERSISTENT_SCHEDULE;
  if (enabled !== 'true') {
    console.log(
      '[setup-persistent-schedule] PERSISTENT_SCHEDULE is not "true" — skipping OS-level scheduling.'
    );
    console.log(
      '  Set PERSISTENT_SCHEDULE=true in your .env (or shell) and re-run to register the schedule.'
    );
    return;
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
}

module.exports = {
  buildCronLine,
  buildWindowsTaskCommand,
  main,
  setupUnix,
  setupWindows,
};

if (require.main === module) {
  main();
}
